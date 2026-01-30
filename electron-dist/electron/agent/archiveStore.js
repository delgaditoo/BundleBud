import { app } from 'electron';
import fs from 'fs/promises';
import path from 'path';
import { getRuleTargets } from '../../shared/ruleTargets.js';
const ARCHIVE_FILENAME = 'archive-index.json';
const DEFAULT_STORE = { items: [] };
function getStorePath() {
    return path.join(app.getPath('userData'), ARCHIVE_FILENAME);
}
function normalizeStore(data) {
    const store = { ...DEFAULT_STORE, ...data };
    if (!Array.isArray(store.items))
        store.items = [];
    return store;
}
async function readStore() {
    const storePath = getStorePath();
    try {
        const raw = await fs.readFile(storePath, 'utf8');
        if (!raw.trim())
            return { ...DEFAULT_STORE };
        return normalizeStore(JSON.parse(raw));
    }
    catch (err) {
        if (err?.code === 'ENOENT')
            return { ...DEFAULT_STORE };
        return { ...DEFAULT_STORE };
    }
}
async function writeStore(store) {
    const storePath = getStorePath();
    await fs.mkdir(path.dirname(storePath), { recursive: true });
    await fs.writeFile(storePath, JSON.stringify(store, null, 2), 'utf8');
}
export function getArchiveRoots() {
    const documents = app.getPath('documents');
    const targets = getRuleTargets();
    return [targets.archives, path.join(documents, 'BundleBud', 'Archive')];
}
export function isArchivePath(targetPath) {
    if (!targetPath)
        return false;
    const normalized = targetPath.toLowerCase();
    if (normalized.includes(`${path.sep}_archive_ai_organizer${path.sep}`))
        return true;
    return getArchiveRoots().some((root) => normalized.startsWith(root.toLowerCase()));
}
export async function listArchiveItems() {
    const store = await readStore();
    return store.items;
}
export async function appendArchiveItem(item) {
    const store = await readStore();
    store.items.unshift(item);
    await writeStore(store);
    return item;
}
export async function updateArchiveItem(itemId, updates) {
    const store = await readStore();
    const index = store.items.findIndex((item) => item.id === itemId);
    if (index === -1)
        return null;
    store.items[index] = { ...store.items[index], ...updates };
    await writeStore(store);
    return store.items[index];
}
