import fs from 'fs/promises';
import path from 'path';
import { app } from 'electron';
const STORE_FILENAME = 'automation.json';
const DEFAULT_STORE = {
    automationMode: 'review',
    reviewQueue: []
};
function getStorePath() {
    return path.join(app.getPath('userData'), STORE_FILENAME);
}
function normalizeStore(data) {
    const store = { ...DEFAULT_STORE, ...data };
    if (store.automationMode !== 'auto' && store.automationMode !== 'review') {
        store.automationMode = DEFAULT_STORE.automationMode;
    }
    if (!Array.isArray(store.reviewQueue)) {
        store.reviewQueue = [];
    }
    return store;
}
async function readStore() {
    const storePath = getStorePath();
    try {
        const raw = await fs.readFile(storePath, 'utf8');
        if (!raw.trim())
            return { ...DEFAULT_STORE };
        const parsed = JSON.parse(raw);
        return normalizeStore(parsed);
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
export async function getAutomationMode() {
    const store = await readStore();
    return store.automationMode;
}
export async function setAutomationMode(mode) {
    const store = await readStore();
    store.automationMode = mode === 'auto' ? 'auto' : 'review';
    await writeStore(store);
    return store.automationMode;
}
export async function listReviewQueue() {
    const store = await readStore();
    return store.reviewQueue;
}
export async function enqueueProposedAction(action) {
    const store = await readStore();
    store.reviewQueue.push(action);
    await writeStore(store);
    return action;
}
export async function updateProposedAction(actionId, updates) {
    const store = await readStore();
    const index = store.reviewQueue.findIndex((item) => item.id === actionId);
    if (index === -1)
        return null;
    store.reviewQueue[index] = { ...store.reviewQueue[index], ...updates };
    await writeStore(store);
    return store.reviewQueue[index];
}
export async function getQueuedReviewCount() {
    const store = await readStore();
    return store.reviewQueue.filter((item) => item.status === 'queued').length;
}
