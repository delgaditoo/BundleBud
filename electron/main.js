import { app, BrowserWindow, ipcMain, dialog, shell } from 'electron'
import path from 'path'
import { fileURLToPath } from 'url'
import fs from 'fs/promises'
import { scanFiles, analyzeDuplicates, executePlan } from './fs.js'
import { appendEntry, clearAll, readRecent } from './agent/ledger.js'
import { randomUUID } from 'crypto'
import chokidar from 'chokidar'
import { applyScreenshotRules } from './rules/screenshots.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

let mainWindow
let desktopWatcher = null
let downloadsWatcher = null
const downloadsInflight = new Map()
const downloadsRecentLogs = new Map()

function isDesktopWatcherRunning() {
  return Boolean(desktopWatcher)
}

function shouldIgnoreDesktopFile(targetPath) {
  const base = path.basename(targetPath)
  if (base === '.DS_Store') return true
  return base.startsWith('.')
}

function shouldIgnoreDownloadsFile(targetPath) {
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

async function waitUntilStable(filePath, { timeoutMs = 5000, intervalMs = 300 } = {}) {
  const start = Date.now()
  let previousSize = null
  while (Date.now() - start < timeoutMs) {
    let firstSize
    try {
      const stat = await fs.stat(filePath)
      if (!stat.isFile()) return { stable: false, size: 0 }
      firstSize = stat.size
    } catch {
      return { stable: false, size: 0 }
    }
    if (previousSize !== null && firstSize === previousSize) {
      return { stable: true, size: firstSize }
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs))
    let secondSize
    try {
      const stat = await fs.stat(filePath)
      if (!stat.isFile()) return { stable: false, size: 0 }
      secondSize = stat.size
    } catch {
      return { stable: false, size: 0 }
    }
    if (firstSize === secondSize) {
      return { stable: true, size: secondSize }
    }
    previousSize = secondSize
  }
  return { stable: false, size: 0 }
}

async function isFileStable(filePath, timeoutMs = 15000, intervalMs = 800) {
  const start = Date.now()
  let previousSize = null
  while (Date.now() - start < timeoutMs) {
    let firstSize
    try {
      const stat = await fs.stat(filePath)
      if (!stat.isFile()) return false
      firstSize = stat.size
    } catch {
      return false
    }
    if (previousSize !== null && firstSize === previousSize) {
      return true
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs))
    let secondSize
    try {
      const stat = await fs.stat(filePath)
      if (!stat.isFile()) return false
      secondSize = stat.size
    } catch {
      return false
    }
    if (firstSize === secondSize) {
      return true
    }
    previousSize = secondSize
  }
  return false
}

function shouldLogDownload(filePath) {
  const now = Date.now()
  const lastLogged = downloadsRecentLogs.get(filePath) || 0
  if (now - lastLogged < 5000) return false
  downloadsRecentLogs.set(filePath, now)
  return true
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

  const handleCandidate = async (filePath) => {
    if (shouldIgnoreDownloadsFile(filePath)) return
    if (downloadsInflight.has(filePath)) return
    downloadsInflight.set(filePath, true)
    try {
      const stable = await isFileStable(filePath)
      if (!stable) return
      if (!shouldLogDownload(filePath)) return
      await applyScreenshotRules(filePath, { source: 'downloads-watcher' })
      const entry = {
        id: randomUUID(),
        ts: Date.now(),
        kind: 'event',
        title: 'Download completed',
        path: filePath,
        status: 'info',
        meta: { source: 'downloads-watcher', eventType: 'stable' }
      }
      await appendEntry(entry)
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
  downloadsRecentLogs.clear()
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

  const handleDesktopCandidate = async (filePath, eventType) => {
    if (shouldIgnoreDesktopFile(filePath)) return
    try {
      if (eventType === 'add') {
        await appendEntry({
          id: randomUUID(),
          ts: Date.now(),
          kind: 'event',
          title: 'File detected',
          path: filePath,
          status: 'info',
          meta: { source: 'desktop-watcher', eventType: 'add' }
        })
      }
      const result = await waitUntilStable(filePath)
      if (!result.stable) return
      await appendEntry({
        id: randomUUID(),
        ts: Date.now(),
        kind: 'event',
        title: 'File stable',
        path: filePath,
        status: 'info',
        meta: {
          name: path.basename(filePath),
          size: result.size
        }
      })
      await applyScreenshotRules(filePath, { source: 'desktop-watcher' })
    } catch (err) {
      console.error('Failed to append desktop watcher entry', err)
    }
  }

  desktopWatcher.on('add', (filePath) => handleDesktopCandidate(filePath, 'add'))
  desktopWatcher.on('change', (filePath) => handleDesktopCandidate(filePath, 'change'))

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

async function ensureUniqueDestination(destPath) {
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
  const result = await dialog.showOpenDialog(mainWindow, {
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
    errorMessage = err?.message || String(err)
  }

  const undoEntry = {
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
