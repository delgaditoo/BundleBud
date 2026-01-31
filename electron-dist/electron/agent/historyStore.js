import fs from 'fs/promises';
import path from 'path';
import * as electron from 'electron';
const electronModule = electron.default ?? electron;
const { app } = electronModule;
const STORE_FILENAME = 'history.json';
const DEFAULT_STORE = { operations: [] };
function getStorePath() {
    return path.join(app.getPath('userData'), STORE_FILENAME);
}
function normalizeStore(data) {
    const store = { ...DEFAULT_STORE, ...data };
    if (!Array.isArray(store.operations))
        store.operations = [];
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
export async function appendOperation(operation) {
    const store = await readStore();
    store.operations.push(operation);
    await writeStore(store);
    return operation;
}
export async function listOperations(limit) {
    const store = await readStore();
    if (!Number.isFinite(limit))
        return store.operations;
    return store.operations.slice(-Math.max(0, limit));
}
export async function clearOperations() {
    const store = await readStore();
    store.operations = [];
    await writeStore(store);
    return true;
}
