import { app } from 'electron'
import fs from 'fs/promises'
import path from 'path'

const LEDGER_FILENAME = 'activity.jsonl'

function getLedgerPath() {
  return path.join(app.getPath('userData'), LEDGER_FILENAME)
}

export async function appendEntry(entry: any) {
  const ledgerPath = getLedgerPath()
  await fs.mkdir(path.dirname(ledgerPath), { recursive: true })
  const line = `${JSON.stringify(entry)}\n`
  await fs.appendFile(ledgerPath, line, 'utf8')
}

export async function readRecent(limit = 50) {
  const ledgerPath = getLedgerPath()
  try {
    const raw = await fs.readFile(ledgerPath, 'utf8')
    if (!raw.trim()) return []
    const lines = raw.split('\n').filter(Boolean)
    const slice = lines.slice(-Math.max(0, limit))
    const entries: any[] = []
    for (const line of slice) {
      try {
        entries.push(JSON.parse(line))
      } catch {
        // Skip malformed lines to keep the ledger readable.
      }
    }
    return entries
  } catch (err: any) {
    if (err?.code === 'ENOENT') return []
    throw err
  }
}

export async function clearAll() {
  const ledgerPath = getLedgerPath()
  await fs.mkdir(path.dirname(ledgerPath), { recursive: true })
  await fs.writeFile(ledgerPath, '', 'utf8')
}
