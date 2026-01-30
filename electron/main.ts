import { app, BrowserWindow, ipcMain, dialog, shell } from 'electron'
import path from 'path'
import { fileURLToPath } from 'url'
import fs from 'fs/promises'
import os from 'os'
import { execFile } from 'child_process'
import { promisify } from 'util'
import { scanFiles, analyzeDuplicates, executePlan } from './fs.js'
import { appendEntry, clearAll, readRecent } from './agent/ledger.js'
import { randomUUID } from 'crypto'
import chokidar from 'chokidar'
import { processFile, executeMoveAction } from './agent/processFile.js'
import { getDashboardStats } from './agent/stats.js'
import { listArchiveItems, updateArchiveItem } from './agent/archiveStore.js'
import {
  getAutomationMode,
  setAutomationMode,
  listReviewQueue,
  updateProposedAction,
  listRules,
  saveRules
} from './agent/automationStore.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

let mainWindow: BrowserWindow | null
let desktopWatcher: chokidar.FSWatcher | null = null
let downloadsWatcher: chokidar.FSWatcher | null = null
const downloadsInflight = new Map<string, boolean>()
const execFileAsync = promisify(execFile)

async function ensureUniqueDestination(destPath: string) {
  const ext = path.extname(destPath)
  const base = path.basename(destPath, ext)
  const dir = path.dirname(destPath)
  let candidate = destPath
  let counter = 2

  while (true) {
    try {
      await fs.access(candidate)
      candidate = path.join(dir, `${base} (${counter})${ext}`)
      counter += 1
    } catch {
      return candidate
    }
  }
}

async function moveFileSafe(source: string, destination: string) {
  await fs.mkdir(path.dirname(destination), { recursive: true })
  try {
    await fs.rename(source, destination)
  } catch (error: any) {
    if (error.code === 'EXDEV') {
      await fs.copyFile(source, destination)
      await fs.unlink(source)
    } else {
      throw error
    }
  }
}

async function listExternalVolumes() {
  if (process.platform !== 'darwin') return []
  try {
    const entries = await fs.readdir('/Volumes', { withFileTypes: true })
    return entries
      .filter((entry) => entry.isDirectory() && !entry.name.startsWith('.'))
      .map((entry) => path.join('/Volumes', entry.name))
  } catch {
    return []
  }
}

function isDesktopWatcherRunning() {
  return Boolean(desktopWatcher)
}

function shouldIgnoreDesktopFile(targetPath: string) {
  const base = path.basename(targetPath)
  if (base === '.DS_Store') return true
  return base.startsWith('.')
}

function shouldIgnoreDownloadsFile(targetPath: string) {
  const base = path.basename(targetPath)
  if (base === '.DS_Store') return true
  if (base.startsWith('.')) return true
  const lower = base.toLowerCase()
  return (
    lower.endsWith('.crdownload') ||
    lower.endsWith('.download') ||
    lower.endsWith('.tmp') ||
    lower.endsWith('.part')
  )
}

function isDownloadsWatcherRunning() {
  return Boolean(downloadsWatcher)
}

async function startDownloadsWatcher() {
  if (downloadsWatcher) return { running: true }
  if (process.platform !== 'darwin') return { running: false }

  const downloadsPath = app.getPath('downloads')
  downloadsWatcher = chokidar.watch(downloadsPath, {
    ignoreInitial: true,
    depth: 0,
    ignored: (targetPath) => shouldIgnoreDownloadsFile(targetPath)
  })

  const handleCandidate = async (filePath: string) => {
    if (shouldIgnoreDownloadsFile(filePath)) return
    if (downloadsInflight.has(filePath)) return
    downloadsInflight.set(filePath, true)
    try {
      await processFile(filePath, 'downloads')
    } catch (err) {
      console.error('Failed to append downloads watcher entry', err)
    } finally {
      downloadsInflight.delete(filePath)
    }
  }

  downloadsWatcher.on('add', handleCandidate)
  downloadsWatcher.on('change', handleCandidate)
  downloadsWatcher.on('error', (err) => {
    console.error('Downloads watcher error', err)
  })

  return { running: true }
}

async function stopDownloadsWatcher() {
  if (!downloadsWatcher) return { running: false }
  await downloadsWatcher.close()
  downloadsWatcher = null
  downloadsInflight.clear()
  return { running: false }
}
async function startDesktopWatcher() {
  if (desktopWatcher) return { running: true }
  if (process.platform !== 'darwin') return { running: false }

  const desktopPath = app.getPath('desktop')
  desktopWatcher = chokidar.watch(desktopPath, {
    ignoreInitial: true,
    depth: 0,
    ignored: (targetPath) => shouldIgnoreDesktopFile(targetPath)
  })

  const handleDesktopCandidate = async (filePath: string) => {
    if (shouldIgnoreDesktopFile(filePath)) return
    try {
      await processFile(filePath, 'desktop')
    } catch (err) {
      console.error('Failed to append desktop watcher entry', err)
    }
  }

  desktopWatcher.on('add', (filePath) => handleDesktopCandidate(filePath))
  desktopWatcher.on('change', (filePath) => handleDesktopCandidate(filePath))

  desktopWatcher.on('error', (err) => {
    console.error('Desktop watcher error', err)
  })

  return { running: true }
}

async function stopDesktopWatcher() {
  if (!desktopWatcher) return { running: false }
  await desktopWatcher.close()
  desktopWatcher = null
  return { running: false }
}

async function getLastMoveAction(limit = 300) {
  const entries = await readRecent(limit)
  for (let i = entries.length - 1; i >= 0; i -= 1) {
    const entry = entries[i]
    if (entry?.kind !== 'action') continue
    if (entry?.meta?.from && entry?.meta?.to) {
      return entry
    }
  }
  return null
}

async function ensureUniqueDestination(destPath: string) {
  const ext = path.extname(destPath)
  const base = path.basename(destPath, ext)
  const dir = path.dirname(destPath)
  let candidate = destPath
  let counter = 1
  while (true) {
    try {
      await fs.access(candidate)
      candidate = path.join(dir, `${base} (${counter})${ext}`)
      counter += 1
    } catch {
      return candidate
    }
  }
}

async function findQueuedAction(actionId: string) {
  const queue = await listReviewQueue()
  return queue.find((item) => item.id === actionId) || null
}

function getDevServerUrl() {
  return process.env.VITE_DEV_SERVER_URL || 'http://localhost:5173'
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1100,
    height: 760,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, 'preload.cjs')
    }
  })

  if (!app.isPackaged) {
    const devUrl = getDevServerUrl()
    console.log(`Loading dev server: ${devUrl}`)
    mainWindow.loadURL(devUrl)
  } else {
    const indexPath = path.join(__dirname, '../dist/index.html')
    mainWindow.loadFile(indexPath)
  }
}

app.whenReady().then(() => {
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('before-quit', async () => {
  await stopDesktopWatcher()
  await stopDownloadsWatcher()
})

ipcMain.handle('select-folder', async () => {
  const result = await dialog.showOpenDialog(mainWindow!, {
    properties: ['openDirectory']
  })
  if (result.canceled) return null
  return result.filePaths[0]
})

ipcMain.handle('scan-files', async (_event, folderPath, options = {}) => {
  if (!folderPath) return { files: [], totalSize: 0 }
  const scan = await scanFiles(folderPath, options)
  const totalSize = scan.files.reduce((sum, file) => sum + file.size, 0)
  return { files: scan.files, totalSize, truncated: scan.truncated, maxFiles: scan.maxFiles }
})

ipcMain.handle('analyze-duplicates', async (_event, files, options = {}) => {
  const analysis = await analyzeDuplicates(files, options)
  return analysis
})

ipcMain.handle('execute-plan', async (_event, plan) => {
  const result = await executePlan(plan)
  return result
})

ipcMain.handle('reveal-in-finder', async (_event, targetPath) => {
  if (!targetPath) return false
  return shell.showItemInFolder(targetPath)
})

ipcMain.handle('open-external', async (_event, url) => {
  if (!url) return false
  await shell.openExternal(url)
  return true
})

ipcMain.handle('open-report-folder', async (_event, reportPath) => {
  if (!reportPath) return false
  const dir = path.dirname(reportPath)
  await fs.mkdir(dir, { recursive: true })
  return shell.openPath(dir)
})

ipcMain.handle('activity:getRecent', async (_event, limit = 50) => {
  return readRecent(limit)
})

ipcMain.handle('activity:clear', async () => {
  await clearAll()
  return true
})

ipcMain.handle('activity:addTestEntry', async () => {
  const entry = {
    id: randomUUID(),
    ts: Date.now(),
    kind: 'event',
    title: 'Test activity event',
    path: '/tmp/example.txt',
    status: 'info',
    meta: { source: 'manual' }
  }
  await appendEntry(entry)
  return entry
})

ipcMain.handle('desktop-watcher:start', async () => {
  return startDesktopWatcher()
})

ipcMain.handle('desktop-watcher:stop', async () => {
  return stopDesktopWatcher()
})

ipcMain.handle('desktop-watcher:status', async () => {
  return { running: isDesktopWatcherRunning() }
})

ipcMain.handle('downloads-watcher:start', async () => {
  return startDownloadsWatcher()
})

ipcMain.handle('downloads-watcher:stop', async () => {
  return stopDownloadsWatcher()
})

ipcMain.handle('downloads-watcher:status', async () => {
  return { running: isDownloadsWatcherRunning() }
})

ipcMain.handle('scan:getConfig', async () => {
  const sets = [
    { id: 'desktop', label: 'Desktop', path: app.getPath('desktop') },
    { id: 'downloads', label: 'Downloads', path: app.getPath('downloads') },
    { id: 'documents', label: 'Documents', path: app.getPath('documents') },
    { id: 'pictures', label: 'Pictures', path: app.getPath('pictures') },
    { id: 'external', label: 'External drives', path: null }
  ]

  return {
    sets,
    excludeNames: ['node_modules', '.git', 'Library', 'System'],
    excludeHiddenDefault: true,
    excludePaths: [app.getPath('userData')],
    externalVolumes: await listExternalVolumes()
  }
})

ipcMain.handle('system:getInfo', async () => {
  const cpu = os.cpus()
  const totalMem = os.totalmem()
  const hostname = os.hostname()
  const platform = os.platform()
  const release = os.release()

  let model = ''
  try {
    if (process.platform === 'darwin') {
      const { stdout } = await execFileAsync('sysctl', ['-n', 'hw.model'])
      model = String(stdout).trim()
    }
  } catch {
    model = ''
  }

  let storage = { total: 0, free: 0 }
  try {
    const stats = await fs.statfs('/')
    storage = {
      total: stats.bsize * stats.blocks,
      free: stats.bsize * stats.bavail
    }
  } catch {
    storage = { total: 0, free: 0 }
  }

  return {
    hardware: {
      model,
      hostname,
      platform,
      release
    },
    cpu: {
      model: cpu[0]?.model || '',
      cores: cpu.length
    },
    memory: {
      totalBytes: totalMem
    },
    storage
  }
})

ipcMain.handle('activity:canUndo', async () => {
  const lastMove = await getLastMoveAction()
  if (!lastMove) return { canUndo: false }
  return { canUndo: true, lastTitle: lastMove.title }
})

ipcMain.handle('activity:undoLastMove', async () => {
  const lastMove = await getLastMoveAction()
  if (!lastMove) return { ok: false, error: 'No move action found.' }

  const fromPath = lastMove.meta?.from
  const toPath = lastMove.meta?.to
  const ruleId = lastMove.meta?.ruleId
  const source = lastMove.meta?.source

  if (!fromPath || !toPath) {
    return { ok: false, error: 'Move metadata missing.' }
  }

  let finalDestination = fromPath
  let status = 'success'
  let errorMessage = ''

  try {
    await fs.mkdir(path.dirname(fromPath), { recursive: true })
    finalDestination = await ensureUniqueDestination(fromPath)
    await fs.rename(toPath, finalDestination)
  } catch (err) {
    status = 'error'
    errorMessage = (err as Error)?.message || String(err)
  }

  const undoEntry: any = {
    id: randomUUID(),
    ts: Date.now(),
    kind: 'action',
    title: 'Undo performed',
    path: fromPath,
    status,
    meta: {
      from: toPath,
      to: finalDestination,
      ruleId,
      source
    }
  }

  if (status === 'error') {
    undoEntry.meta.error = errorMessage
  }

  await appendEntry(undoEntry)
  return { ok: status === 'success', error: errorMessage || null }
})

ipcMain.handle('dashboard:getStats', async () => {
  const stats = await getDashboardStats()
  return {
    ...stats,
    watcherStatus: {
      desktop: isDesktopWatcherRunning(),
      downloads: isDownloadsWatcherRunning()
    }
  }
})

ipcMain.handle('automation:getMode', async () => {
  const mode = await getAutomationMode()
  return { mode }
})

ipcMain.handle('automation:setMode', async (_event, mode) => {
  const next = await setAutomationMode(mode)
  return { mode: next }
})

ipcMain.handle('automation:listQueue', async () => {
  return listReviewQueue()
})

ipcMain.handle('automation:listRules', async () => {
  return listRules()
})

ipcMain.handle('automation:saveRules', async (_event, rules) => {
  return saveRules(rules)
})

ipcMain.handle('archive:list', async () => {
  return listArchiveItems()
})

ipcMain.handle('archive:restore', async (_event, itemId) => {
  const items = await listArchiveItems()
  const item = items.find((entry: any) => entry.id === itemId)
  if (!item) return { ok: false, error: 'Archive item not found.' }
  if (item.status !== 'archived') return { ok: false, error: 'Item is not archived.' }

  let finalDestination = item.fromPath
  let status: 'success' | 'error' = 'success'
  let errorMessage = ''

  try {
    finalDestination = await ensureUniqueDestination(item.fromPath)
    await moveFileSafe(item.toPath, finalDestination)
  } catch (err: any) {
    status = 'error'
    errorMessage = err?.message || String(err)
  }

  const updated = await updateArchiveItem(itemId, {
    status: status === 'success' ? 'restored' : 'error',
    restoredAt: Date.now(),
    restoredPath: status === 'success' ? finalDestination : null,
    error: errorMessage
  })

  await appendEntry({
    id: randomUUID(),
    ts: Date.now(),
    kind: 'action',
    title: 'Restored file',
    path: item.fromPath,
    status: status === 'success' ? 'success' : 'error',
    meta: {
      action: 'restore',
      ruleId: item.ruleId || null,
      from: item.toPath,
      to: finalDestination,
      error: errorMessage || null
    }
  })

  return { ok: status === 'success', action: updated, error: errorMessage || null }
})

ipcMain.handle('automation:apply', async (_event, actionId) => {
  const item = await findQueuedAction(actionId)
  if (!item) return { ok: false, error: 'Action not found.' }
  if (item.status !== 'queued') return { ok: false, error: 'Action not queued.' }

  const result = await executeMoveAction(item)
  const nextStatus = result.status === 'success' ? 'applied' : 'error'
  const updated = await updateProposedAction(actionId, {
    status: nextStatus,
    appliedAt: Date.now(),
    toPath: result.finalDestination,
    error: result.errorMessage || ''
  })

  return { ok: result.status === 'success', action: updated }
})

ipcMain.handle('automation:reject', async (_event, actionId) => {
  const item = await findQueuedAction(actionId)
  if (!item) return { ok: false, error: 'Action not found.' }
  if (item.status !== 'queued') return { ok: false, error: 'Action not queued.' }

  const updated = await updateProposedAction(actionId, {
    status: 'rejected',
    rejectedAt: Date.now()
  })

  return { ok: true, action: updated }
})
