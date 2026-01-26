import { app, BrowserWindow, ipcMain, dialog, shell } from 'electron'
import path from 'path'
import { fileURLToPath } from 'url'
import fs from 'fs/promises'
import { scanFiles, analyzeDuplicates, executePlan } from './fs.js'
import { appendEntry, clearAll, readRecent } from './agent/ledger.js'
import { randomUUID } from 'crypto'
import chokidar from 'chokidar'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

let mainWindow
let desktopWatcher = null

function isDesktopWatcherRunning() {
  return Boolean(desktopWatcher)
}

function shouldIgnoreDesktopFile(targetPath) {
  const base = path.basename(targetPath)
  if (base === '.DS_Store') return true
  return base.startsWith('.')
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

  desktopWatcher.on('add', async (filePath) => {
    if (shouldIgnoreDesktopFile(filePath)) return
    const entry = {
      id: randomUUID(),
      ts: Date.now(),
      kind: 'event',
      title: 'File detected',
      path: filePath,
      status: 'info',
      meta: { source: 'desktop-watcher', eventType: 'add' }
    }
    try {
      await appendEntry(entry)
    } catch (err) {
      console.error('Failed to append desktop watcher entry', err)
    }
  })

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
