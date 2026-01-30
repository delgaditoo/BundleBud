import fs from 'fs/promises';
import path from 'path';
import { randomUUID } from 'crypto';
import { appendEntry } from './ledger.js';
import { appendArchiveItem, isArchivePath } from './archiveStore.js';
import { applyRules } from '../rules/index.js';
import { getAutomationMode, enqueueProposedAction } from './automationStore.js';
const inflight = new Set();
const recentProcessed = new Map();
const DEDUP_WINDOW_MS = 2000;
const STABILITY_BY_SOURCE = {
    desktop: { timeoutMs: 5000, intervalMs: 300 },
    downloads: { timeoutMs: 15000, intervalMs: 800 }
};
async function waitUntilStable(filePath, { timeoutMs, intervalMs }) {
    const start = Date.now();
    let previousSize = null;
    while (Date.now() - start < timeoutMs) {
        let firstSize;
        try {
            const stat = await fs.stat(filePath);
            if (!stat.isFile())
                return { stable: false, size: 0 };
            firstSize = stat.size;
        }
        catch {
            return { stable: false, size: 0 };
        }
        if (previousSize !== null && firstSize === previousSize) {
            return { stable: true, size: firstSize };
        }
        await new Promise((resolve) => setTimeout(resolve, intervalMs));
        let secondSize;
        try {
            const stat = await fs.stat(filePath);
            if (!stat.isFile())
                return { stable: false, size: 0 };
            secondSize = stat.size;
        }
        catch {
            return { stable: false, size: 0 };
        }
        if (firstSize === secondSize) {
            return { stable: true, size: secondSize };
        }
        previousSize = secondSize;
    }
    return { stable: false, size: 0 };
}
async function ensureUniqueDestination(destPath) {
    const ext = path.extname(destPath);
    const base = path.basename(destPath, ext);
    const dir = path.dirname(destPath);
    let candidate = destPath;
    let counter = 2;
    while (true) {
        try {
            await fs.access(candidate);
            candidate = path.join(dir, `${base} (${counter})${ext}`);
            counter += 1;
        }
        catch {
            return candidate;
        }
    }
}
function shouldDedup(filePath) {
    const last = recentProcessed.get(filePath);
    if (!last)
        return false;
    return Date.now() - last < DEDUP_WINDOW_MS;
}
function markProcessed(filePath) {
    recentProcessed.set(filePath, Date.now());
}
function buildProposedAction({ fileInfo, rule, plan }) {
    const filename = plan.filename || fileInfo.name;
    return {
        id: randomUUID(),
        createdAt: Date.now(),
        ruleId: rule.id,
        source: fileInfo.source,
        fromPath: fileInfo.path,
        toPath: path.join(plan.toDir, filename),
        reason: plan.reason || '',
        sizeBytes: fileInfo.sizeBytes,
        status: 'queued'
    };
}
export async function executeMoveAction(proposedAction) {
    const targetDir = path.dirname(proposedAction.toPath);
    let finalDestination = proposedAction.toPath;
    let status = 'success';
    let errorMessage = '';
    try {
        await fs.mkdir(targetDir, { recursive: true });
        finalDestination = await ensureUniqueDestination(proposedAction.toPath);
        await fs.rename(proposedAction.fromPath, finalDestination);
    }
    catch (err) {
        status = 'error';
        errorMessage = err?.message || String(err);
    }
    const actionEntry = {
        id: randomUUID(),
        ts: Date.now(),
        kind: 'action',
        title: 'Moved file',
        path: proposedAction.fromPath,
        status,
        meta: {
            action: 'move',
            ruleId: proposedAction.ruleId,
            source: proposedAction.source,
            from: proposedAction.fromPath,
            to: finalDestination,
            sizeBytes: proposedAction.sizeBytes,
            reason: proposedAction.reason
        }
    };
    if (status === 'error') {
        actionEntry.meta.error = errorMessage;
    }
    await appendEntry(actionEntry);
    if (status === 'success' && isArchivePath(finalDestination)) {
        try {
            await appendArchiveItem({
                id: randomUUID(),
                fileName: path.basename(proposedAction.fromPath),
                fromPath: proposedAction.fromPath,
                toPath: finalDestination,
                archivedAt: Date.now(),
                ruleId: proposedAction.ruleId || 'rule',
                status: 'archived'
            });
        }
        catch {
            // Ignore archive index errors.
        }
    }
    return { status, finalDestination, errorMessage };
}
export async function processFile(filePath, source) {
    if (!filePath || !source)
        return { ok: false, reason: 'missing-args' };
    if (inflight.has(filePath))
        return { ok: false, reason: 'inflight' };
    if (shouldDedup(filePath))
        return { ok: false, reason: 'dedup' };
    inflight.add(filePath);
    const detectedAt = Date.now();
    const stabilityConfig = STABILITY_BY_SOURCE[source] || STABILITY_BY_SOURCE.desktop;
    try {
        const stability = await waitUntilStable(filePath, stabilityConfig);
        if (!stability.stable) {
            return { ok: false, reason: 'unstable' };
        }
        const stat = await fs.stat(filePath);
        if (!stat.isFile())
            return { ok: false, reason: 'not-file' };
        const fileInfo = {
            path: filePath,
            name: path.basename(filePath),
            ext: path.extname(filePath).toLowerCase(),
            sizeBytes: stat.size,
            mtimeMs: stat.mtimeMs,
            source,
            detectedAt
        };
        const match = (await applyRules(fileInfo));
        if (!match) {
            await appendEntry({
                id: randomUUID(),
                ts: Date.now(),
                kind: 'event',
                title: 'No rule matched',
                path: fileInfo.path,
                status: 'info',
                meta: {
                    name: fileInfo.name,
                    ext: fileInfo.ext,
                    source: fileInfo.source
                }
            });
            markProcessed(filePath);
            return { ok: true, action: 'none' };
        }
        const { rule, plan } = match;
        if (!plan || plan.action !== 'move' || !plan.toDir) {
            await appendEntry({
                id: randomUUID(),
                ts: Date.now(),
                kind: 'action',
                title: 'Moved file',
                path: fileInfo.path,
                status: 'error',
                meta: {
                    action: 'move',
                    ruleId: rule.id,
                    source: fileInfo.source,
                    from: fileInfo.path,
                    to: plan?.toDir || null,
                    sizeBytes: fileInfo.sizeBytes,
                    reason: plan?.reason || 'Rule plan missing',
                    error: 'Invalid plan'
                }
            });
            markProcessed(filePath);
            return { ok: false, reason: 'invalid-plan' };
        }
        const proposedAction = buildProposedAction({ fileInfo, rule, plan });
        const mode = await getAutomationMode();
        if (mode === 'review') {
            await enqueueProposedAction(proposedAction);
            await appendEntry({
                id: randomUUID(),
                ts: Date.now(),
                kind: 'event',
                title: 'Action queued',
                path: fileInfo.path,
                status: 'info',
                meta: {
                    ruleId: proposedAction.ruleId,
                    source: proposedAction.source,
                    from: proposedAction.fromPath,
                    to: proposedAction.toPath,
                    sizeBytes: proposedAction.sizeBytes,
                    reason: proposedAction.reason,
                    actionId: proposedAction.id
                }
            });
            markProcessed(filePath);
            return { ok: true, action: 'queued', id: proposedAction.id };
        }
        const result = await executeMoveAction(proposedAction);
        markProcessed(filePath);
        return { ok: result.status === 'success', action: 'move', to: result.finalDestination };
    }
    finally {
        inflight.delete(filePath);
    }
}
