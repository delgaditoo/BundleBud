export type ScanFile = {
  name: string
  path: string
  relPath?: string
  size?: number
  mtimeMs?: number
  ext?: string
  rootPath?: string
}

export type SmartGroup = {
  id: string
  title: string
  reason: string[]
  files: ScanFile[]
  rule: string
}

const TYPE_LABELS: Record<string, string> = {
  pdf: 'PDFs',
  image: 'Images',
  video: 'Videos',
  archive: 'Archives',
  code: 'Code files',
  audio: 'Audio',
  document: 'Documents',
  spreadsheet: 'Spreadsheets',
  presentation: 'Presentations',
  text: 'Text files',
  other: 'Other files'
}

const TYPE_MAP: Record<string, string[]> = {
  pdf: ['.pdf'],
  image: ['.jpg', '.jpeg', '.png', '.gif', '.heic', '.tif', '.tiff', '.webp', '.bmp'],
  video: ['.mp4', '.mov', '.m4v', '.avi', '.mkv', '.webm'],
  archive: ['.zip', '.rar', '.7z', '.tar', '.gz', '.bz2'],
  code: [
    '.js', '.jsx', '.ts', '.tsx', '.py', '.rb', '.java', '.go', '.rs', '.cpp', '.c', '.h', '.cs', '.php', '.html', '.css', '.scss'
  ],
  audio: ['.mp3', '.wav', '.m4a', '.flac', '.aac', '.ogg'],
  document: ['.doc', '.docx', '.pages', '.rtf', '.odt', '.pdf'],
  spreadsheet: ['.xls', '.xlsx', '.csv', '.numbers'],
  presentation: ['.ppt', '.pptx', '.key'],
  text: ['.txt', '.md', '.log']
}

const STOPWORDS = new Set(['file', 'document', 'scan', 'copy', 'final'])
const KEYWORDS = ['invoice', 'receipt', 'statement', 'report', 'screenshot', 'screen shot', 'contract', 'meeting', 'project']
const SCREENSHOT_REGEX = /(screen[\s_-]?shot|screenshot)/i

const TIME_WINDOW_MS = 2 * 60 * 60 * 1000

function normalizeStem(name: string) {
  return name.replace(/\.[^.]+$/, '').toLowerCase()
}

function splitTokens(value: string) {
  return value.split(/[^a-z0-9]+/i).filter(Boolean)
}

function toTitleCase(value: string) {
  return value
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part[0]?.toUpperCase() + part.slice(1))
    .join(' ')
}

function getParentPath(file: ScanFile) {
  const source = file.relPath || file.path || ''
  const parts = source.split(/[/\\]/).filter(Boolean)
  if (parts.length <= 1) return { parentPath: '', parentName: 'Root' }
  const parentPath = parts.slice(0, -1).join('/')
  const parentName = parts[parts.length - 2] || 'Root'
  return { parentPath, parentName }
}

function getType(ext: string | undefined) {
  if (!ext) return 'other'
  const lower = ext.toLowerCase()
  for (const [key, list] of Object.entries(TYPE_MAP)) {
    if (list.includes(lower)) return key
  }
  return 'other'
}

function extractDateToken(stem: string) {
  const matchFull = stem.match(/(\d{4})[\s._-]?(\d{2})[\s._-]?(\d{2})/)
  if (matchFull) {
    const [, year, month] = matchFull
    return { year, month }
  }
  const matchShort = stem.match(/(\d{4})[\s._-]?(\d{2})/)
  if (matchShort) {
    const [, year, month] = matchShort
    return { year, month }
  }
  return null
}

function formatMonthYear(year: string, month: string) {
  const monthNumber = Number(month)
  if (!Number.isFinite(monthNumber)) return `${year}-${month}`
  const date = new Date(Number(year), Math.max(0, monthNumber - 1), 1)
  return date.toLocaleString(undefined, { month: 'long', year: 'numeric' })
}

function extractKeyword(stem: string) {
  for (const keyword of KEYWORDS) {
    if (stem.includes(keyword)) return keyword
  }
  return ''
}

function buildGroupId(prefix: string, key: string) {
  return `${prefix}-${key}`.replace(/\s+/g, '-').toLowerCase()
}

function sortGroups(groups: SmartGroup[]) {
  return groups.sort((a, b) => {
    if (b.files.length !== a.files.length) return b.files.length - a.files.length
    return a.title.localeCompare(b.title)
  })
}

export function buildSmartGroups(files: ScanFile[] = []): SmartGroup[] {
  if (!Array.isArray(files) || !files.length) return []

  const remaining = new Map(files.map((file) => [file.path, file]))
  const output: SmartGroup[] = []

  const takeGroup = (group: SmartGroup) => {
    group.files.forEach((file) => remaining.delete(file.path))
    output.push(group)
  }

  const remainingFiles = () => Array.from(remaining.values())

  const screenshotFiles = remainingFiles().filter((file) => SCREENSHOT_REGEX.test(file.name))
  if (screenshotFiles.length >= 2) {
    takeGroup({
      id: 'screenshots',
      title: 'Screenshots',
      reason: ['Filename includes “screenshot”'],
      files: screenshotFiles,
      rule: 'filename'
    })
  }

  const dateGroups = new Map<string, { files: ScanFile[]; label: string; monthYear: string }>()
  for (const file of remainingFiles()) {
    const stem = normalizeStem(file.name)
    const dateToken = extractDateToken(stem)
    if (!dateToken) continue
    const keyword = extractKeyword(stem)
    const monthYear = formatMonthYear(dateToken.year, dateToken.month)
    const label = keyword ? toTitleCase(keyword) : 'Files'
    const key = `${keyword || 'files'}-${dateToken.year}-${dateToken.month}`
    if (!dateGroups.has(key)) {
      dateGroups.set(key, { files: [], label, monthYear })
    }
    dateGroups.get(key)!.files.push(file)
  }
  for (const [key, group] of dateGroups.entries()) {
    if (group.files.length < 2) continue
    takeGroup({
      id: buildGroupId('date', key),
      title: `${group.label} – ${group.monthYear}`,
      reason: [`Shared date in filename (${group.monthYear})`].concat(
        group.label !== 'Files' ? [`Shared keyword “${group.label.toLowerCase()}”`] : []
      ),
      files: group.files,
      rule: 'filename'
    })
  }

  const sequenceGroups = new Map<string, ScanFile[]>()
  for (const file of remainingFiles()) {
    const stem = normalizeStem(file.name)
    const base = stem.replace(/[\s._-]*\d+$/, '').trim()
    if (!base || base.length < 3 || STOPWORDS.has(base)) continue
    if (!sequenceGroups.has(base)) sequenceGroups.set(base, [])
    sequenceGroups.get(base)!.push(file)
  }
  for (const [base, groupFiles] of sequenceGroups.entries()) {
    if (groupFiles.length < 2) continue
    takeGroup({
      id: buildGroupId('series', base),
      title: `${toTitleCase(base)} series`,
      reason: [`Shared filename base “${base}”`, 'Sequential numbering'],
      files: groupFiles,
      rule: 'filename'
    })
  }

  const folderGroups = new Map<string, { files: ScanFile[]; parentPath: string; parentName: string }>()
  for (const file of remainingFiles()) {
    const { parentPath, parentName } = getParentPath(file)
    if (!parentPath) continue
    if (!folderGroups.has(parentPath)) folderGroups.set(parentPath, { files: [], parentPath, parentName })
    folderGroups.get(parentPath)!.files.push(file)
  }
  for (const group of folderGroups.values()) {
    if (group.files.length < 2) continue
    takeGroup({
      id: buildGroupId('folder', group.parentPath),
      title: `Folder: ${group.parentName}`,
      reason: [`Same folder: ${group.parentPath}`],
      files: group.files,
      rule: 'folder'
    })
  }

  const timeSorted = remainingFiles()
    .filter((file) => typeof file.mtimeMs === 'number')
    .sort((a, b) => (a.mtimeMs || 0) - (b.mtimeMs || 0))

  let timeBucket: ScanFile[] = []
  let bucketStart = 0
  const flushBucket = () => {
    if (timeBucket.length < 2) {
      timeBucket = []
      return
    }
    const first = timeBucket[0]
    const dateLabel = new Date(first.mtimeMs || 0).toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    })
    takeGroup({
      id: buildGroupId('time', String(first.mtimeMs || 0)),
      title: `Batch from ${dateLabel}`,
      reason: ['Modified within 2 hours of each other'],
      files: timeBucket,
      rule: 'time'
    })
    timeBucket = []
  }

  for (const file of timeSorted) {
    if (!timeBucket.length) {
      timeBucket = [file]
      bucketStart = file.mtimeMs || 0
      continue
    }
    const diff = Math.abs((file.mtimeMs || 0) - bucketStart)
    if (diff <= TIME_WINDOW_MS) {
      timeBucket.push(file)
      continue
    }
    flushBucket()
    timeBucket = [file]
    bucketStart = file.mtimeMs || 0
  }
  flushBucket()

  const typeGroups = new Map<string, ScanFile[]>()
  for (const file of remainingFiles()) {
    const typeKey = getType(file.ext)
    if (!typeGroups.has(typeKey)) typeGroups.set(typeKey, [])
    typeGroups.get(typeKey)!.push(file)
  }
  for (const [typeKey, groupFiles] of typeGroups.entries()) {
    if (groupFiles.length < 2) continue
    takeGroup({
      id: buildGroupId('type', typeKey),
      title: TYPE_LABELS[typeKey] || 'Files',
      reason: [`Shared file type: ${TYPE_LABELS[typeKey] || 'Files'}`],
      files: groupFiles,
      rule: 'type'
    })
  }

  return sortGroups(output)
}
