import path from 'path';
import { getRuleTargets } from '../../shared/ruleTargets.js';
import { evaluateRule } from '../../shared/rules.js';
function buildFilename(fileInfo, pattern) {
    const ext = fileInfo.ext || '';
    const base = fileInfo.name?.replace(new RegExp(`${ext}$`, 'i'), '') || fileInfo.name || '';
    const safeBase = base || 'file';
    return pattern
        .replace(/\{name\}/gi, safeBase)
        .replace(/\{ext\}/gi, ext.replace(/^\./, ''))
        .replace(/\{date\}/gi, new Date().toISOString().slice(0, 10));
}
export function applyUserRule(rule, fileInfo) {
    if (!rule.actions || rule.actions.length === 0)
        return null;
    const evaluation = evaluateRule(rule, fileInfo);
    if (!evaluation.matches)
        return null;
    const targets = getRuleTargets();
    let destinationDir = path.dirname(fileInfo.path);
    let filename = fileInfo.name;
    for (const action of rule.actions || []) {
        if (action.type === 'move' && action.targetPath) {
            destinationDir = action.targetPath;
        }
        if (action.type === 'rename' && action.pattern) {
            const nextName = buildFilename(fileInfo, action.pattern);
            if (nextName) {
                filename = nextName;
                if (fileInfo.ext && !nextName.endsWith(fileInfo.ext)) {
                    filename = `${nextName}${fileInfo.ext}`;
                }
            }
        }
        if (action.type === 'archive') {
            destinationDir = targets.archives;
        }
    }
    const reasonParts = evaluation.reasons.length ? evaluation.reasons : [];
    const reason = reasonParts.length ? reasonParts.join('; ') : `Rule matched: ${rule.name}`;
    const plan = {
        action: 'move',
        from: fileInfo.path,
        toDir: destinationDir,
        filename,
        reason
    };
    if (path.join(destinationDir, filename) === fileInfo.path) {
        return null;
    }
    return { rule, plan };
}
