export type RuleMatchMode = 'all' | 'any' | 'none'

export type RuleCondition = {
  id: string
  attribute: 'name' | 'extension' | 'kind' | 'path' | 'size' | 'date-modified'
  operator:
    | 'contains'
    | 'is'
    | 'starts-with'
    | 'ends-with'
    | 'matches'
    | 'greater-than'
    | 'less-than'
    | 'before'
    | 'after'
  value: string
  unit?: 'bytes' | 'kb' | 'mb' | 'gb'
}

export type RuleAction =
  | { id: string; type: 'move'; targetPath: string }
  | { id: string; type: 'rename'; pattern: string }
  | { id: string; type: 'archive' }

export type RuleDefinition = {
  id: string
  name: string
  enabled: boolean
  matchMode: RuleMatchMode
  conditions: RuleCondition[]
  actions: RuleAction[]
}

export type RuleFileInfo = {
  path: string
  name: string
  ext: string
  sizeBytes?: number
  mtimeMs?: number
}

const FILE_KIND_MAP: Record<string, string[]> = {
  image: ['.jpg', '.jpeg', '.png', '.gif', '.heic', '.tif', '.tiff', '.webp', '.bmp'],
  video: ['.mp4', '.mov', '.m4v', '.avi', '.mkv', '.webm'],
  archive: ['.zip', '.rar', '.7z', '.tar', '.gz', '.bz2'],
  code: [
    '.js', '.jsx', '.ts', '.tsx', '.py', '.rb', '.java', '.go', '.rs', '.cpp', '.c', '.h', '.cs', '.php', '.html', '.css', '.scss'
  ],
  audio: ['.mp3', '.wav', '.m4a', '.flac', '.aac', '.ogg'],
  pdf: ['.pdf'],
  document: ['.doc', '.docx', '.pages', '.rtf', '.odt'],
  spreadsheet: ['.xls', '.xlsx', '.csv', '.numbers'],
  presentation: ['.ppt', '.pptx', '.key'],
  text: ['.txt', '.md', '.log']
}

export function getFileKind(ext: string) {
  const normalized = ext?.toLowerCase() || ''
  for (const [kind, list] of Object.entries(FILE_KIND_MAP)) {
    if (list.includes(normalized)) return kind
  }
  return 'other'
}

function normalizeExtension(value: string) {
  if (!value) return ''
  return value.startsWith('.') ? value.toLowerCase() : `.${value.toLowerCase()}`
}

function parseSizeValue(value: string, unit: RuleCondition['unit']) {
  const numeric = Number(value)
  if (!Number.isFinite(numeric)) return null
  const unitKey = unit || 'bytes'
  if (unitKey === 'kb') return numeric * 1024
  if (unitKey === 'mb') return numeric * 1024 * 1024
  if (unitKey === 'gb') return numeric * 1024 * 1024 * 1024
  return numeric
}

function parseDateValue(value: string) {
  if (!value) return null
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return null
  return date.getTime()
}

export function describeCondition(condition: RuleCondition) {
  const attributeLabel: Record<RuleCondition['attribute'], string> = {
    name: 'Name',
    extension: 'Extension',
    kind: 'Kind',
    path: 'Path',
    size: 'Size',
    'date-modified': 'Date modified'
  }
  const operatorLabel: Record<RuleCondition['operator'], string> = {
    contains: 'contains',
    is: 'is',
    'starts-with': 'starts with',
    'ends-with': 'ends with',
    matches: 'matches',
    'greater-than': 'greater than',
    'less-than': 'less than',
    before: 'before',
    after: 'after'
  }
  if (condition.attribute === 'size') {
    const unit = condition.unit ? condition.unit.toUpperCase() : 'bytes'
    return `${attributeLabel[condition.attribute]} ${operatorLabel[condition.operator]} ${condition.value} ${unit}`
  }
  return `${attributeLabel[condition.attribute]} ${operatorLabel[condition.operator]} ${condition.value}`
}

export function evaluateCondition(condition: RuleCondition, fileInfo: RuleFileInfo) {
  const attribute = condition.attribute
  const operator = condition.operator
  const value = condition.value

  if (attribute === 'size') {
    const targetSize = parseSizeValue(value, condition.unit)
    if (targetSize === null) return false
    const actual = fileInfo.sizeBytes || 0
    if (operator === 'greater-than') return actual > targetSize
    if (operator === 'less-than') return actual < targetSize
    return false
  }

  if (attribute === 'date-modified') {
    const targetDate = parseDateValue(value)
    if (targetDate === null || !fileInfo.mtimeMs) return false
    if (operator === 'before') return fileInfo.mtimeMs < targetDate
    if (operator === 'after') return fileInfo.mtimeMs > targetDate
    return false
  }

  if (!value) return false

  let actual = ''
  if (attribute === 'name') actual = fileInfo.name || ''
  if (attribute === 'extension') actual = fileInfo.ext || ''
  if (attribute === 'path') actual = fileInfo.path || ''
  if (attribute === 'kind') actual = getFileKind(fileInfo.ext)

  if (attribute === 'extension') {
    actual = actual.toLowerCase()
  }

  const normalizedValue = attribute === 'extension' ? normalizeExtension(value) : value

  if (operator === 'contains') return actual.toLowerCase().includes(normalizedValue.toLowerCase())
  if (operator === 'is') return actual.toLowerCase() === normalizedValue.toLowerCase()
  if (operator === 'starts-with') return actual.toLowerCase().startsWith(normalizedValue.toLowerCase())
  if (operator === 'ends-with') return actual.toLowerCase().endsWith(normalizedValue.toLowerCase())
  if (operator === 'matches') {
    try {
      const regex = new RegExp(normalizedValue, 'i')
      return regex.test(actual)
    } catch {
      return false
    }
  }

  return false
}

export function evaluateRule(rule: RuleDefinition, fileInfo: RuleFileInfo) {
  if (!rule.enabled) {
    return { matches: false, reasons: [], conditions: [] as { condition: RuleCondition; matched: boolean }[] }
  }
  if (!rule.conditions || rule.conditions.length === 0) {
    return { matches: false, reasons: [], conditions: [] as { condition: RuleCondition; matched: boolean }[] }
  }

  const results = rule.conditions.map((condition) => ({
    condition,
    matched: evaluateCondition(condition, fileInfo)
  }))

  const matchedCount = results.filter((result) => result.matched).length
  const mode = rule.matchMode || 'all'

  let matches = false
  if (mode === 'all') matches = matchedCount === results.length
  if (mode === 'any') matches = matchedCount > 0
  if (mode === 'none') matches = matchedCount === 0

  const reasons: string[] = []
  if (matches) {
    if (mode === 'none') {
      reasons.push('None of the conditions matched')
    } else {
      results
        .filter((result) => result.matched)
        .forEach((result) => reasons.push(describeCondition(result.condition)))
    }
  }

  return { matches, reasons, conditions: results }
}

export function summarizeRule(rule: RuleDefinition) {
  if (!rule.conditions || rule.conditions.length === 0) return 'No conditions'
  const modeLabel = rule.matchMode === 'any' ? 'Any' : rule.matchMode === 'none' ? 'None' : 'All'
  const description = rule.conditions
    .map((condition) => describeCondition(condition))
    .slice(0, 2)
    .join(' · ')
  const suffix = rule.conditions.length > 2 ? ` +${rule.conditions.length - 2} more` : ''
  return `${modeLabel} of: ${description}${suffix}`
}
