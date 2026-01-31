import * as electron from 'electron';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs/promises';
import os from 'os';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { scanFiles, analyzeDuplicates, executePlan } from './fs.js';
import { appendEntry, clearAll } from './agent/ledger.js';
import { appendOperation, listOperations, clearOperations } from './agent/historyStore.js';
import { randomUUID } from 'crypto';
import chokidar from 'chokidar';
import { processFile, executeMoveAction } from './agent/processFile.js';
import { getDashboardStats } from './agent/stats.js';
import { listArchiveItems, updateArchiveItem } from './agent/archiveStore.js';
import { listCreatedFolders, updateCreatedFolder } from './agent/createdFoldersStore.js';
import { getAutomationMode, setAutomationMode, listReviewQueue, updateProposedAction, enqueueProposedActions, listRules, saveRules, getSettings, saveSettings } from './agent/automationStore.js';
const electronModule = electron.default ?? electron;
const { app, BrowserWindow, ipcMain, dialog, shell } = electronModule;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
let mainWindow;
let desktopWatcher = null;
let downloadsWatcher = null;
const downloadsInflight = new Map();
const execFileAsync = promisify(execFile);
function getSandboxRoot() {
    return path.join(app.getPath('documents'), 'BundleBud', 'Sandbox');
}
async function sandboxExists() {
    try {
        const stats = await fs.stat(getSandboxRoot());
        return stats.isDirectory();
    }
    catch {
        return false;
    }
}
async function createSandboxLibrary() {
    const root = getSandboxRoot();
    await fs.mkdir(root, { recursive: true });
    const folders = [
        'Downloads',
        path.join('Projects', 'Uni'),
        'Screenshots',
        'Invoices',
        'Archives',
        'Mixed'
    ];
    for (const folder of folders) {
        await fs.mkdir(path.join(root, folder), { recursive: true });
    }
    const now = Date.now();
    const days = (count) => now - count * 24 * 60 * 60 * 1000;
    const files = [
        { rel: 'Invoices/invoice_2025-03-01.pdf', content: 'Invoice March 2025', mtime: days(15) },
        { rel: 'Invoices/receipt_2025-02-18.pdf', content: 'Receipt Feb 2025', mtime: days(30) },
        { rel: 'Screenshots/screenshot_2025-03-02_12-31-10.png', content: 'PNG', mtime: days(1) },
        { rel: 'Screenshots/screenshot_2025-02-20_09-14-02.png', content: 'PNG', mtime: days(25) },
        { rel: 'Downloads/project_backup_2025-01-10.zip', content: '', mtime: days(60) },
        { rel: 'Projects/Uni/notes_project_alpha.txt', content: 'Project alpha notes', mtime: days(5) },
        { rel: 'Projects/Uni/meeting_2025-03-02.md', content: '# Meeting notes', mtime: days(2) },
        { rel: 'Mixed/invoice_2025-03-01 (2).pdf', content: 'Invoice March 2025 duplicate', mtime: days(14) },
        { rel: 'Mixed/receipt_2025-02-18 (2).pdf', content: 'Receipt Feb 2025 duplicate', mtime: days(29) },
        { rel: 'Mixed/screenshot_2025-03-02_12-31-10 (2).png', content: 'PNG duplicate', mtime: days(1) },
        { rel: 'Mixed/readme.txt', content: 'Mixed folder readme', mtime: days(7) },
        { rel: 'Downloads/notes_project_alpha.txt', content: 'Project alpha notes copy', mtime: days(4) },
        { rel: 'Downloads/meeting_2025-03-02 (2).md', content: '# Meeting notes duplicate', mtime: days(2) }
    ];
    for (const file of files) {
        const fullPath = path.join(root, file.rel);
        await fs.mkdir(path.dirname(fullPath), { recursive: true });
        await fs.writeFile(fullPath, file.content, 'utf8');
        const time = file.mtime || now;
        await fs.utimes(fullPath, time / 1000, time / 1000);
    }
    return root;
}
async function resetSandboxLibrary() {
    const root = getSandboxRoot();
    await fs.rm(root, { recursive: true, force: true });
    return root;
}
async function moveFileSafe(source, destination) {
    await fs.mkdir(path.dirname(destination), { recursive: true });
    try {
        await fs.rename(source, destination);
    }
    catch (error) {
        if (error.code === 'EXDEV') {
            await fs.copyFile(source, destination);
            await fs.unlink(source);
        }
        else {
            throw error;
        }
    }
}
async function ensureUniqueFolderPath(targetPath) {
    let candidate = targetPath;
    let counter = 2;
    while (true) {
        try {
            const stats = await fs.stat(candidate);
            if (!stats.isDirectory()) {
                candidate = `${targetPath} (${counter})`;
                counter += 1;
                continue;
            }
            candidate = `${targetPath} (${counter})`;
            counter += 1;
        }
        catch {
            return candidate;
        }
    }
}
async function reverseOperation(operation) {
    const type = operation?.type;
    if (type === 'create-folder') {
        const target = operation?.afterPath;
        if (!target)
            return { ok: false, reason: 'missing-path' };
        try {
            const entries = await fs.readdir(target);
            if (entries.length)
                return { ok: false, reason: 'not-empty' };
            await fs.rmdir(target);
            return { ok: true, action: 'delete-folder', path: target };
        }
        catch (err) {
            return { ok: false, reason: err?.message || 'delete-failed' };
        }
    }
    if (type === 'trash') {
        return { ok: false, reason: 'trash-not-reversible' };
    }
    const fromPath = operation?.afterPath;
    const toPath = operation?.beforePath;
    if (!fromPath || !toPath)
        return { ok: false, reason: 'missing-path' };
    try {
        const finalDestination = await ensureUniqueDestination(toPath);
        await moveFileSafe(fromPath, finalDestination);
        await appendOperation({
            id: randomUUID(),
            ts: Date.now(),
            type: 'restore',
            beforePath: fromPath,
            afterPath: finalDestination,
            meta: {
                restoredFrom: operation?.id || null,
                originalType: type || null
            }
        });
        return { ok: true, action: 'move', from: fromPath, to: finalDestination };
    }
    catch (err) {
        return { ok: false, reason: err?.message || 'move-failed' };
    }
}
async function listExternalVolumes() {
    if (process.platform !== 'darwin')
        return [];
    try {
        const entries = await fs.readdir('/Volumes', { withFileTypes: true });
        return entries
            .filter((entry) => entry.isDirectory() && !entry.name.startsWith('.'))
            .map((entry) => path.join('/Volumes', entry.name));
    }
    catch {
        return [];
    }
}
function isDesktopWatcherRunning() {
    return Boolean(desktopWatcher);
}
function shouldIgnoreDesktopFile(targetPath) {
    const base = path.basename(targetPath);
    if (base === '.DS_Store')
        return true;
    return base.startsWith('.');
}
function shouldIgnoreDownloadsFile(targetPath) {
    const base = path.basename(targetPath);
    if (base === '.DS_Store')
        return true;
    if (base.startsWith('.'))
        return true;
    const lower = base.toLowerCase();
    return (lower.endsWith('.crdownload') ||
        lower.endsWith('.download') ||
        lower.endsWith('.tmp') ||
        lower.endsWith('.part'));
}
function isDownloadsWatcherRunning() {
    return Boolean(downloadsWatcher);
}
async function startDownloadsWatcher() {
    if (downloadsWatcher)
        return { running: true };
    if (process.platform !== 'darwin')
        return { running: false };
    const downloadsPath = app.getPath('downloads');
    downloadsWatcher = chokidar.watch(downloadsPath, {
        ignoreInitial: true,
        depth: 0,
        ignored: (targetPath) => shouldIgnoreDownloadsFile(targetPath)
    });
    const handleCandidate = async (filePath) => {
        if (shouldIgnoreDownloadsFile(filePath))
            return;
        if (downloadsInflight.has(filePath))
            return;
        downloadsInflight.set(filePath, true);
        try {
            await processFile(filePath, 'downloads');
        }
        catch (err) {
            console.error('Failed to append downloads watcher entry', err);
        }
        finally {
            downloadsInflight.delete(filePath);
        }
    };
    downloadsWatcher.on('add', handleCandidate);
    downloadsWatcher.on('change', handleCandidate);
    downloadsWatcher.on('error', (err) => {
        console.error('Downloads watcher error', err);
    });
    return { running: true };
}
async function stopDownloadsWatcher() {
    if (!downloadsWatcher)
        return { running: false };
    await downloadsWatcher.close();
    downloadsWatcher = null;
    downloadsInflight.clear();
    return { running: false };
}
async function startDesktopWatcher() {
    if (desktopWatcher)
        return { running: true };
    if (process.platform !== 'darwin')
        return { running: false };
    const desktopPath = app.getPath('desktop');
    desktopWatcher = chokidar.watch(desktopPath, {
        ignoreInitial: true,
        depth: 0,
        ignored: (targetPath) => shouldIgnoreDesktopFile(targetPath)
    });
    const handleDesktopCandidate = async (filePath) => {
        if (shouldIgnoreDesktopFile(filePath))
            return;
        try {
            await processFile(filePath, 'desktop');
        }
        catch (err) {
            console.error('Failed to append desktop watcher entry', err);
        }
    };
    desktopWatcher.on('add', (filePath) => handleDesktopCandidate(filePath));
    desktopWatcher.on('change', (filePath) => handleDesktopCandidate(filePath));
    desktopWatcher.on('error', (err) => {
        console.error('Desktop watcher error', err);
    });
    return { running: true };
}
async function stopDesktopWatcher() {
    if (!desktopWatcher)
        return { running: false };
    await desktopWatcher.close();
    desktopWatcher = null;
    return { running: false };
}
function formatOperationTitle(operation) {
    const type = operation?.type;
    if (type === 'move')
        return 'Moved file';
    if (type === 'archive')
        return 'Archived file';
    if (type === 'rename')
        return 'Renamed item';
    if (type === 'create-folder')
        return 'Created folder';
    if (type === 'restore')
        return 'Restored file';
    if (type === 'trash')
        return 'Trashed file';
    if (type === 'test')
        return 'Test entry';
    return 'Operation';
}
async function getLastMoveAction(limit = 300) {
    const entries = await listOperations(limit);
    for (let i = entries.length - 1; i >= 0; i -= 1) {
        const entry = entries[i];
        if (!entry)
            continue;
        if (entry?.type === 'move' || entry?.type === 'archive' || entry?.type === 'rename') {
            return entry;
        }
    }
    return null;
}
async function ensureUniqueDestination(destPath) {
    const ext = path.extname(destPath);
    const base = path.basename(destPath, ext);
    const dir = path.dirname(destPath);
    let candidate = destPath;
    let counter = 1;
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
async function findQueuedAction(actionId) {
    const queue = await listReviewQueue();
    return queue.find((item) => item.id === actionId) || null;
}
function getDevServerUrl() {
    return process.env.VITE_DEV_SERVER_URL || 'http://localhost:5173';
}
function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1100,
        height: 760,
        webPreferences: {
            contextIsolation: true,
            nodeIntegration: false,
            preload: path.join(__dirname, 'preload.cjs')
        }
    });
    if (!app.isPackaged) {
        const devUrl = getDevServerUrl();
        console.log(`Loading dev server: ${devUrl}`);
        mainWindow.loadURL(devUrl);
    }
    else {
        const indexPath = path.join(__dirname, '../dist/index.html');
        mainWindow.loadFile(indexPath);
    }
}
app.whenReady().then(() => {
    createWindow();
    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0)
            createWindow();
    });
});
app.on('window-all-closed', () => {
    if (process.platform !== 'darwin')
        app.quit();
});
app.on('before-quit', async () => {
    await stopDesktopWatcher();
    await stopDownloadsWatcher();
});
ipcMain.handle('select-folder', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
        properties: ['openDirectory']
    });
    if (result.canceled)
        return null;
    return result.filePaths[0];
});
ipcMain.handle('scan-files', async (_event, folderPath, options = {}) => {
    if (!folderPath)
        return { files: [], totalSize: 0 };
    const scan = await scanFiles(folderPath, options);
    const totalSize = scan.files.reduce((sum, file) => sum + file.size, 0);
    return { files: scan.files, totalSize, truncated: scan.truncated, maxFiles: scan.maxFiles };
});
ipcMain.handle('analyze-duplicates', async (_event, files, options = {}) => {
    const analysis = await analyzeDuplicates(files, options);
    return analysis;
});
ipcMain.handle('execute-plan', async (_event, plan) => {
    const result = await executePlan(plan);
    return result;
});
ipcMain.handle('reveal-in-finder', async (_event, targetPath) => {
    if (!targetPath)
        return false;
    return shell.showItemInFolder(targetPath);
});
ipcMain.handle('open-external', async (_event, url) => {
    if (!url)
        return false;
    await shell.openExternal(url);
    return true;
});
ipcMain.handle('open-report-folder', async (_event, reportPath) => {
    if (!reportPath)
        return false;
    const dir = path.dirname(reportPath);
    await fs.mkdir(dir, { recursive: true });
    return shell.openPath(dir);
});
ipcMain.handle('activity:getRecent', async (_event, limit = 50) => {
    return listOperations(limit);
});
ipcMain.handle('activity:clear', async () => {
    await clearOperations();
    await clearAll();
    return true;
});
ipcMain.handle('activity:addTestEntry', async () => {
    const entry = {
        id: randomUUID(),
        ts: Date.now(),
        type: 'test',
        beforePath: '/tmp/example.txt',
        afterPath: '/tmp/example.txt',
        meta: { source: 'manual' }
    };
    await appendOperation(entry);
    return entry;
});
ipcMain.handle('activity:restoreTo', async (_event, operationId) => {
    if (!operationId)
        return { ok: false, error: 'Missing operation id.' };
    const operations = await listOperations();
    const index = operations.findIndex((entry) => entry?.id === operationId);
    if (index === -1)
        return { ok: false, error: 'Operation not found.' };
    const toUndo = operations.slice(index + 1);
    const results = [];
    for (const entry of toUndo.slice().reverse()) {
        const result = await reverseOperation(entry);
        results.push({
            id: entry?.id,
            type: entry?.type,
            ok: result.ok,
            reason: result.ok ? null : result.reason || 'failed'
        });
    }
    const summary = {
        total: toUndo.length,
        undone: results.filter((item) => item.ok).length,
        skipped: results.filter((item) => !item.ok).length
    };
    return { ok: true, summary, results };
});
ipcMain.handle('desktop-watcher:start', async () => {
    return startDesktopWatcher();
});
ipcMain.handle('desktop-watcher:stop', async () => {
    return stopDesktopWatcher();
});
ipcMain.handle('desktop-watcher:status', async () => {
    return { running: isDesktopWatcherRunning() };
});
ipcMain.handle('downloads-watcher:start', async () => {
    return startDownloadsWatcher();
});
ipcMain.handle('downloads-watcher:stop', async () => {
    return stopDownloadsWatcher();
});
ipcMain.handle('downloads-watcher:status', async () => {
    return { running: isDownloadsWatcherRunning() };
});
ipcMain.handle('scan:getConfig', async () => {
    const sandboxRoot = getSandboxRoot();
    const hasSandbox = await sandboxExists();
    const sets = [
        { id: 'desktop', label: 'Desktop', path: app.getPath('desktop') },
        { id: 'downloads', label: 'Downloads', path: app.getPath('downloads') },
        { id: 'documents', label: 'Documents', path: app.getPath('documents') },
        { id: 'pictures', label: 'Pictures', path: app.getPath('pictures') },
        { id: 'sandbox', label: 'Sandbox', path: sandboxRoot },
        { id: 'external', label: 'External drives', path: null }
    ];
    return {
        sets,
        excludeNames: ['node_modules', '.git', 'Library', 'System'],
        excludeHiddenDefault: true,
        excludePaths: [app.getPath('userData')],
        externalVolumes: await listExternalVolumes(),
        sandboxRoot,
        sandboxExists: hasSandbox
    };
});
ipcMain.handle('system:getInfo', async () => {
    const cpu = os.cpus();
    const totalMem = os.totalmem();
    const hostname = os.hostname();
    const platform = os.platform();
    const release = os.release();
    let model = '';
    try {
        if (process.platform === 'darwin') {
            const { stdout } = await execFileAsync('sysctl', ['-n', 'hw.model']);
            model = String(stdout).trim();
        }
    }
    catch {
        model = '';
    }
    let storage = { total: 0, free: 0 };
    try {
        const stats = await fs.statfs('/');
        storage = {
            total: stats.bsize * stats.blocks,
            free: stats.bsize * stats.bavail
        };
    }
    catch {
        storage = { total: 0, free: 0 };
    }
    return {
        hardware: {
            model,
            hostname,
            platform,
            release
        },
        cpu: {
            model: cpu[0]?.model || '',
            cores: cpu.length
        },
        memory: {
            totalBytes: totalMem
        },
        storage
    };
});
ipcMain.handle('activity:canUndo', async () => {
    const lastMove = await getLastMoveAction();
    if (!lastMove)
        return { canUndo: false };
    return { canUndo: true, lastTitle: formatOperationTitle(lastMove) };
});
ipcMain.handle('activity:undoLastMove', async () => {
    const lastMove = await getLastMoveAction();
    if (!lastMove)
        return { ok: false, error: 'No move action found.' };
    const result = await reverseOperation(lastMove);
    const status = result.ok ? 'success' : 'error';
    await appendEntry({
        id: randomUUID(),
        ts: Date.now(),
        kind: 'action',
        title: 'Undo performed',
        path: lastMove?.beforePath || lastMove?.afterPath || '',
        status,
        meta: {
            from: lastMove?.afterPath || null,
            to: lastMove?.beforePath || null,
            action: 'undo',
            error: result.ok ? null : result.reason || 'Undo failed'
        }
    });
    return { ok: result.ok, error: result.ok ? null : result.reason || 'Undo failed' };
});
ipcMain.handle('dashboard:getStats', async () => {
    const stats = await getDashboardStats();
    return {
        ...stats,
        watcherStatus: {
            desktop: isDesktopWatcherRunning(),
            downloads: isDownloadsWatcherRunning()
        }
    };
});
ipcMain.handle('automation:getMode', async () => {
    const mode = await getAutomationMode();
    return { mode };
});
ipcMain.handle('automation:setMode', async (_event, mode) => {
    const next = await setAutomationMode(mode);
    return { mode: next };
});
ipcMain.handle('automation:listQueue', async () => {
    return listReviewQueue();
});
ipcMain.handle('automation:enqueueProposedActions', async (_event, actions) => {
    return enqueueProposedActions(actions);
});
ipcMain.handle('automation:listRules', async () => {
    return listRules();
});
ipcMain.handle('automation:saveRules', async (_event, rules) => {
    return saveRules(rules);
});
ipcMain.handle('automation:getSettings', async () => {
    return getSettings();
});
ipcMain.handle('automation:saveSettings', async (_event, settings) => {
    return saveSettings(settings);
});
ipcMain.handle('folders:resolveTarget', async (_event, basePath, folderName) => {
    if (!basePath || !folderName)
        return { ok: false, error: 'Missing folder info.' };
    const proposed = path.join(basePath, folderName);
    const resolved = await ensureUniqueFolderPath(proposed);
    return { ok: true, path: resolved };
});
ipcMain.handle('folders:listCreated', async () => {
    return listCreatedFolders();
});
ipcMain.handle('folders:updateMeta', async (_event, itemId, updates) => {
    return updateCreatedFolder(itemId, updates);
});
ipcMain.handle('folders:rename', async (_event, itemId, nextName) => {
    const items = await listCreatedFolders();
    const item = items.find((entry) => entry.id === itemId);
    if (!item)
        return { ok: false, error: 'Folder not found.' };
    if (!nextName)
        return { ok: false, error: 'Name is required.' };
    const parent = path.dirname(item.path);
    const target = await ensureUniqueDestination(path.join(parent, nextName));
    let status = 'success';
    let errorMessage = '';
    try {
        await fs.rename(item.path, target);
    }
    catch (err) {
        status = 'error';
        errorMessage = err?.message || String(err);
    }
    const updated = await updateCreatedFolder(itemId, {
        path: status === 'success' ? target : item.path,
        displayName: status === 'success' ? nextName : item.displayName,
        renamedAt: Date.now(),
        error: errorMessage || null
    });
    await appendEntry({
        id: randomUUID(),
        ts: Date.now(),
        kind: 'action',
        title: 'Renamed folder',
        path: item.path,
        status: status === 'success' ? 'success' : 'error',
        meta: {
            action: 'rename-folder',
            from: item.path,
            to: target,
            error: errorMessage || null
        }
    });
    if (status === 'success') {
        await appendOperation({
            id: randomUUID(),
            ts: Date.now(),
            type: 'rename',
            beforePath: item.path,
            afterPath: target,
            meta: {
                source: 'created-folders',
                displayName: nextName
            }
        });
    }
    return { ok: status === 'success', action: updated, error: errorMessage || null };
});
ipcMain.handle('files:open', async (_event, targetPath) => {
    if (!targetPath)
        return { ok: false, error: 'Missing path.' };
    const result = await shell.openPath(targetPath);
    return { ok: !result, error: result || null };
});
ipcMain.handle('files:select', async () => {
    const result = await dialog.showOpenDialog({
        properties: ['openFile']
    });
    if (result.canceled || !result.filePaths.length)
        return { canceled: true };
    return { canceled: false, path: result.filePaths[0] };
});
ipcMain.handle('archive:list', async () => {
    return listArchiveItems();
});
ipcMain.handle('archive:restore', async (_event, itemId) => {
    const items = await listArchiveItems();
    const item = items.find((entry) => entry.id === itemId);
    if (!item)
        return { ok: false, error: 'Archive item not found.' };
    if (item.status !== 'archived')
        return { ok: false, error: 'Item is not archived.' };
    let finalDestination = item.fromPath;
    let status = 'success';
    let errorMessage = '';
    try {
        finalDestination = await ensureUniqueDestination(item.fromPath);
        await moveFileSafe(item.toPath, finalDestination);
    }
    catch (err) {
        status = 'error';
        errorMessage = err?.message || String(err);
    }
    const updated = await updateArchiveItem(itemId, {
        status: status === 'success' ? 'restored' : 'error',
        restoredAt: Date.now(),
        restoredPath: status === 'success' ? finalDestination : null,
        error: errorMessage
    });
    await appendEntry({
        id: randomUUID(),
        ts: Date.now(),
        kind: 'action',
        title: 'Restored file',
        path: item.fromPath,
        status: status === 'success' ? 'success' : 'error',
        meta: {
            action: 'restore',
            ruleId: item.ruleId || null,
            from: item.toPath,
            to: finalDestination,
            error: errorMessage || null
        }
    });
    if (status === 'success') {
        await appendOperation({
            id: randomUUID(),
            ts: Date.now(),
            type: 'restore',
            beforePath: item.toPath,
            afterPath: finalDestination,
            meta: {
                ruleId: item.ruleId || null,
                source: 'archive'
            }
        });
    }
    return { ok: status === 'success', action: updated, error: errorMessage || null };
});
ipcMain.handle('sandbox:create', async () => {
    const root = await createSandboxLibrary();
    await appendEntry({
        id: randomUUID(),
        ts: Date.now(),
        kind: 'event',
        title: 'Sandbox created',
        path: root,
        status: 'info'
    });
    return { ok: true, root };
});
ipcMain.handle('sandbox:reset', async () => {
    const root = await resetSandboxLibrary();
    await appendEntry({
        id: randomUUID(),
        ts: Date.now(),
        kind: 'event',
        title: 'Sandbox reset',
        path: root,
        status: 'info'
    });
    return { ok: true, root };
});
ipcMain.handle('sandbox:open', async () => {
    const root = getSandboxRoot();
    await fs.mkdir(root, { recursive: true });
    const result = await shell.openPath(root);
    return { ok: !result, error: result || null, root };
});
ipcMain.handle('automation:apply', async (_event, actionId) => {
    const item = await findQueuedAction(actionId);
    if (!item)
        return { ok: false, error: 'Action not found.' };
    if (item.status !== 'queued')
        return { ok: false, error: 'Action not queued.' };
    const result = await executeMoveAction(item);
    const nextStatus = result.status === 'success' ? 'applied' : 'error';
    const updated = await updateProposedAction(actionId, {
        status: nextStatus,
        appliedAt: Date.now(),
        toPath: result.finalDestination,
        error: result.errorMessage || ''
    });
    return { ok: result.status === 'success', action: updated };
});
ipcMain.handle('automation:reject', async (_event, actionId) => {
    const item = await findQueuedAction(actionId);
    if (!item)
        return { ok: false, error: 'Action not found.' };
    if (item.status !== 'queued')
        return { ok: false, error: 'Action not queued.' };
    const updated = await updateProposedAction(actionId, {
        status: 'rejected',
        rejectedAt: Date.now()
    });
    return { ok: true, action: updated };
});
