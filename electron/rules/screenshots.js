import path from 'path'
import { getRuleTargets } from '../../shared/ruleTargets.js'

const VALID_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg'])
const SCREENSHOT_REGEX = /(screenshot|screen\s*shot)/i

export const id = 'screenshots-v1'
export const title = 'Move screenshots to Pictures/Screenshots'
export const enabled = true
export const priority = 10

export function match(fileInfo) {
  if (!fileInfo?.name || !fileInfo?.ext) return false
  if (!VALID_EXTENSIONS.has(fileInfo.ext)) return false
  return SCREENSHOT_REGEX.test(fileInfo.name)
}

export function plan(fileInfo) {
  const targets = getRuleTargets()
  return {
    action: 'move',
    from: fileInfo.path,
    toDir: targets.screenshots,
    filename: fileInfo.name,
    reason: 'Screenshot detected'
  }
}
