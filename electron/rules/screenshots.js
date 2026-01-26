import fs from 'fs/promises'
import path from 'path'
import { appendEntry } from '../agent/ledger.js'
import { randomUUID } from 'crypto'
import { app } from 'electron'

const SCREENSHOT_FOLDER_NAME = 'Screenshots'
const VALID_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg'])
const SCREENSHOT_REGEX = /(screenshot|screen\s*shot)/i

function isScreenshotFilename(filePath) {
  const base = path.basename(filePath)
  return SCREENSHOT_REGEX.test(base)
}

function isSupportedExtension(filePath) {
  const ext = path.extname(filePath).toLowerCase()
  return VALID_EXTENSIONS.has(ext)
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

async function logMoveResult({ originalPath, destinationPath, status, error, source }) {
  const entry = {
    id: randomUUID(),
    ts: Date.now(),
    kind: 'action',
    title: 'Moved screenshot',
    path: originalPath,
    status,
    meta: {
      from: originalPath,
      to: destinationPath,
      ruleId: 'screenshots-v1',
      source
    }
  }

  if (status === 'error') {
    entry.meta.error = error || 'Unknown error'
  }

  await appendEntry(entry)
}

export async function applyScreenshotRules(filePath, { source = 'unknown' } = {}) {
  if (process.platform !== 'darwin') return false
  if (!filePath) return false
  if (!isScreenshotFilename(filePath)) return false
  if (!isSupportedExtension(filePath)) return false

  const picturesDir = app.getPath('pictures')
  const destinationDir = path.join(picturesDir, SCREENSHOT_FOLDER_NAME)

  try {
    const stat = await fs.stat(filePath)
    if (!stat.isFile()) return false
    await fs.mkdir(destinationDir, { recursive: true })
    const targetPath = path.join(destinationDir, path.basename(filePath))
    const finalDestination = await ensureUniqueDestination(targetPath)
    await fs.rename(filePath, finalDestination)
    await logMoveResult({
      originalPath: filePath,
      destinationPath: finalDestination,
      status: 'success',
      source
    })
    return true
  } catch (err) {
    if (err?.code === 'ENOENT') return false
    await logMoveResult({
      originalPath: filePath,
      destinationPath: path.join(destinationDir, path.basename(filePath)),
      status: 'error',
      error: err?.message || String(err),
      source
    })
    return false
  }
}
