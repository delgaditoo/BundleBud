import { app } from 'electron';
import fs from 'fs/promises';
import path from 'path';
const STORE_FILENAME = 'created-folders.json';
const DEFAULT_STORE = { items: [] };
function getStorePath() {
    return path.join(app.getPath('userData'), STORE_FILENAME);
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
export async function listCreatedFolders() {
    const store = await readStore();
    return store.items;
}
export async function appendCreatedFolder(item) {
    const store = await readStore();
    store.items.unshift(item);
    await writeStore(store);
    return item;
}
export async function updateCreatedFolder(itemId, updates) {
    const store = await readStore();
    const index = store.items.findIndex((item) => item.id === itemId);
    if (index === -1)
        return null;
    store.items[index] = { ...store.items[index], ...updates };
    await writeStore(store);
    return store.items[index];
}
