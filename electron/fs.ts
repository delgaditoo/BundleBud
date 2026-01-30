import fs from 'fs/promises'
import { createReadStream } from 'fs'
import path from 'path'
import crypto from 'crypto'
import { app, shell } from 'electron'

const DEFAULT_EXCLUDES = new Set([
  'node_modules',
  '.git',
  'dist',
  'build',
  '.next',
  '.cache',
  'Library',
  'System'
])

function toTimestamp(value = new Date()) {
  const date = new Date(value)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}_${pad(date.getHours())}-${pad(date.getMinutes())}-${pad(date.getSeconds())}`
}

export async function scanFiles(root: string, options: any = {}) {
  const excludes = new Set(DEFAULT_EXCLUDES)
  for (const extra of options.excludes || []) {
    excludes.add(extra)
  }
  const maxFiles = Number.isFinite(options.maxFiles) ? options.maxFiles : 5000

  const results: any[] = []
  let truncated = false
  const stack = [root]

  while (stack.length) {
    const current = stack.pop() as string
    let entries: any

    try {
      entries = await fs.readdir(current, { withFileTypes: true })
    } catch (error) {
      continue
    }

    for (const entry of entries) {
      const fullPath = path.join(current, entry.name)
      if (entry.isDirectory()) {
        if (excludes.has(entry.name)) continue
        stack.push(fullPath)
        continue
      }

      if (!entry.isFile()) continue

      let stat
      try {
        stat = await fs.stat(fullPath)
      } catch (error) {
        continue
      }

      results.push({
        name: entry.name,
        path: fullPath,
        relPath: path.relative(root, fullPath),
        size: stat.size,
        mtimeMs: stat.mtimeMs,
        ext: path.extname(entry.name).toLowerCase()
      })

      if (results.length >= maxFiles) {
        truncated = true
        stack.length = 0
        break
      }
    }
  }

  return { files: results, truncated, maxFiles }
}

async function hashFile(filePath: string) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256')
    const stream = createReadStream(filePath)

    stream.on('data', (chunk) => hash.update(chunk))
    stream.on('error', (error) => reject(error))
    stream.on('end', () => resolve(hash.digest('hex')))
  })
}

export async function analyzeDuplicates(files: any[] = [], options: any = {}) {
  const maxSizeMB = Number.isFinite(options.maxSizeMB) ? options.maxSizeMB : 250
  const maxSizeBytes = maxSizeMB * 1024 * 1024
  const runId = options.runId || toTimestamp()

  const hashBuckets = new Map<string, any[]>()
  const suggestions: any[] = []

  for (const file of files) {
    if (file.size > maxSizeBytes) {
      suggestions.push({
        file: file.name,
        path: file.path,
        relPath: file.relPath,
        action: 'keep',
        reason: `Too large to hash in MVP (>${maxSizeMB} MB)`
      })
      continue
    }

    try {
      const digest = (await hashFile(file.path)) as string
      if (!hashBuckets.has(digest)) {
        hashBuckets.set(digest, [])
      }
      hashBuckets.get(digest)!.push(file)
    } catch (error) {
      suggestions.push({
        file: file.name,
        path: file.path,
        relPath: file.relPath,
        action: 'keep',
        reason: 'Hashing failed'
      })
    }
  }

  for (const [, group] of hashBuckets.entries()) {
    if (group.length < 2) continue

    const sorted = [...group].sort((a, b) => b.mtimeMs - a.mtimeMs)
    const [keepFile, ...duplicates] = sorted

    suggestions.push({
      file: keepFile.name,
      path: keepFile.path,
      relPath: keepFile.relPath,
      action: 'keep',
      reason: 'Newest file in duplicate group'
    })

    for (const duplicate of duplicates) {
      suggestions.push({
        file: duplicate.name,
        path: duplicate.path,
        relPath: duplicate.relPath,
        action: 'move-to-archive',
        reason: 'Duplicate (older version)',
        targetPath: path.join('_Archive_AI_Organizer', runId, duplicate.relPath)
      })
    }
  }

  return {
    runId,
    maxSizeMB,
    suggestions
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

export async function executePlan(plan: any = {}) {
  const { folderPath, runId = toTimestamp(), items = [] } = plan
  const archiveRoot = folderPath
    ? path.join(folderPath, '_Archive_AI_Organizer', runId)
    : null

  const results: any[] = []

  for (const item of items) {
    if (!item || !item.path) continue

    try {
      if (item.action === 'keep') {
        results.push({ file: item.file, action: 'keep', success: true })
        continue
      }

      if (item.action === 'move-to-trash') {
        try {
          await shell.trashItem(item.path)
          results.push({ file: item.file, action: 'move-to-trash', success: true })
          continue
        } catch (error) {
          if (!archiveRoot) throw error
          const fallbackPath = path.join(archiveRoot, item.relPath || path.basename(item.path))
          await moveFileSafe(item.path, fallbackPath)
          results.push({
            file: item.file,
            action: 'move-to-archive',
            success: true,
            fallback: 'trash_failed'
          })
          continue
        }
      }

      if (item.action === 'move-to-archive') {
        if (!archiveRoot) throw new Error('Archive root missing')
        const destination = item.targetPath
          ? path.join(folderPath, item.targetPath)
          : path.join(archiveRoot, item.relPath || path.basename(item.path))
        await moveFileSafe(item.path, destination)
        results.push({ file: item.file, action: 'move-to-archive', success: true })
      }
    } catch (error: any) {
      results.push({ file: item.file, action: item.action, success: false, error: error.message })
    }
  }

  const summary = results.reduce(
    (acc, result) => {
      if (result.success && result.action === 'move-to-archive') acc.archived += 1
      if (result.success && result.action === 'move-to-trash') acc.trashed += 1
      if (result.success && result.action === 'keep') acc.kept += 1
      if (!result.success) acc.failed += 1
      return acc
    },
    { archived: 0, trashed: 0, kept: 0, failed: 0 }
  )

  const report = {
    runId,
    folderPath,
    archiveRoot: archiveRoot || null,
    executedAt: new Date().toISOString(),
    planItems: items,
    summary,
    results
  }

  const reportDir = path.join(app.getPath('userData'), 'reports')
  await fs.mkdir(reportDir, { recursive: true })
  const reportPath = path.join(reportDir, `run-${runId}.json`)
  await fs.writeFile(reportPath, JSON.stringify(report, null, 2))

  return {
    reportPath,
    archiveRoot,
    summary,
    results
  }
}
