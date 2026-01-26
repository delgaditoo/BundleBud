import { app, BrowserWindow, ipcMain, dialog, shell } from 'electron'
import path from 'path'
import { fileURLToPath } from 'url'
import fs from 'fs/promises'
import { scanFiles, analyzeDuplicates, executePlan } from './fs.js'
import { appendEntry, clearAll, readRecent } from './agent/ledger.js'
import { randomUUID } from 'crypto'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

let mainWindow

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
