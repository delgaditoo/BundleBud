import fs from 'fs/promises';
import path from 'path';
import { app } from 'electron';
const STORE_FILENAME = 'automation.json';
const DEFAULT_STORE = {
    automationMode: 'review',
    reviewQueue: [],
    rules: [],
    settings: {
        scanScope: 'recommended',
        includeHidden: false,
        maxSizeMB: 250,
        scanSetEnabled: {}
    }
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
    if (!Array.isArray(store.rules)) {
        store.rules = [];
    }
    if (!store.settings || typeof store.settings !== 'object') {
        store.settings = { ...DEFAULT_STORE.settings };
    }
    if (!store.settings.scanScope) {
        store.settings.scanScope = DEFAULT_STORE.settings.scanScope;
    }
    if (typeof store.settings.includeHidden !== 'boolean') {
        store.settings.includeHidden = DEFAULT_STORE.settings.includeHidden;
    }
    if (!Number.isFinite(store.settings.maxSizeMB)) {
        store.settings.maxSizeMB = DEFAULT_STORE.settings.maxSizeMB;
    }
    if (!store.settings.scanSetEnabled || typeof store.settings.scanSetEnabled !== 'object') {
        store.settings.scanSetEnabled = {};
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
export async function getSettings() {
    const store = await readStore();
    return store.settings;
}
export async function saveSettings(settings) {
    const store = await readStore();
    store.settings = { ...store.settings, ...(settings || {}) };
    await writeStore(store);
    return store.settings;
}
export async function listRules() {
    const store = await readStore();
    return store.rules;
}
export async function saveRules(rules) {
    const store = await readStore();
    store.rules = Array.isArray(rules) ? rules : [];
    await writeStore(store);
    return store.rules;
}
export async function enqueueProposedAction(action) {
    const store = await readStore();
    store.reviewQueue.push(action);
    await writeStore(store);
    return action;
}
export async function enqueueProposedActions(actions = []) {
    const store = await readStore();
    const items = Array.isArray(actions) ? actions : [];
    store.reviewQueue.push(...items);
    await writeStore(store);
    return items;
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
