import { getRuleTargets } from '../../shared/ruleTargets.js';
export const id = 'pdfs-v1';
export const title = 'Move PDFs to Documents/PDF';
export const enabled = true;
export const priority = 20;
export function match(fileInfo) {
    return fileInfo?.ext === '.pdf';
}
export function plan(fileInfo) {
    const targets = getRuleTargets();
    return {
        action: 'move',
        from: fileInfo.path,
        toDir: targets.pdfs,
        filename: fileInfo.name,
        reason: 'PDF detected'
    };
}
