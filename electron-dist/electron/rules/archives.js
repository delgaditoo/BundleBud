import { getRuleTargets } from '../../shared/ruleTargets.js';
const ARCHIVE_EXTENSIONS = new Set(['.zip', '.rar', '.7z']);
export const id = 'archives-v1';
export const title = 'Move archives to Documents/Archives';
export const enabled = true;
export const priority = 30;
export function match(fileInfo) {
    return ARCHIVE_EXTENSIONS.has(fileInfo?.ext);
}
export function plan(fileInfo) {
    const targets = getRuleTargets();
    return {
        action: 'move',
        from: fileInfo.path,
        toDir: targets.archives,
        filename: fileInfo.name,
        reason: 'Archive detected'
    };
}
