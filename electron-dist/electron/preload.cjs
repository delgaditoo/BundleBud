"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
const electron = __importStar(require("electron"));
const electronModule = electron.default ?? electron;
const { contextBridge, ipcRenderer } = electronModule;
contextBridge.exposeInMainWorld('api', {
    selectFolder: () => ipcRenderer.invoke('select-folder'),
    scanFiles: (folderPath, options) => ipcRenderer.invoke('scan-files', folderPath, options),
    analyzeDuplicates: (files, options) => ipcRenderer.invoke('analyze-duplicates', files, options),
    executePlan: (plan) => ipcRenderer.invoke('execute-plan', plan),
    revealInFinder: (targetPath) => ipcRenderer.invoke('reveal-in-finder', targetPath),
    openExternal: (url) => ipcRenderer.invoke('open-external', url),
    openReportFolder: (reportPath) => ipcRenderer.invoke('open-report-folder', reportPath),
    getActivity: (limit) => ipcRenderer.invoke('activity:getRecent', limit),
    clearActivity: () => ipcRenderer.invoke('activity:clear'),
    addTestActivity: () => ipcRenderer.invoke('activity:addTestEntry'),
    restoreToHistory: (operationId) => ipcRenderer.invoke('activity:restoreTo', operationId),
    canUndo: () => ipcRenderer.invoke('activity:canUndo'),
    undoLastMove: () => ipcRenderer.invoke('activity:undoLastMove'),
    getDashboardStats: () => ipcRenderer.invoke('dashboard:getStats'),
    getAutomationMode: () => ipcRenderer.invoke('automation:getMode'),
    setAutomationMode: (mode) => ipcRenderer.invoke('automation:setMode', mode),
    listReviewQueue: () => ipcRenderer.invoke('automation:listQueue'),
    enqueueProposedActions: (actions) => ipcRenderer.invoke('automation:enqueueProposedActions', actions),
    listRules: () => ipcRenderer.invoke('automation:listRules'),
    saveRules: (rules) => ipcRenderer.invoke('automation:saveRules', rules),
    getSettings: () => ipcRenderer.invoke('automation:getSettings'),
    saveSettings: (settings) => ipcRenderer.invoke('automation:saveSettings', settings),
    listArchiveItems: () => ipcRenderer.invoke('archive:list'),
    restoreArchiveItem: (itemId) => ipcRenderer.invoke('archive:restore', itemId),
    resolveFolderTarget: (basePath, folderName) => ipcRenderer.invoke('folders:resolveTarget', basePath, folderName),
    listCreatedFolders: () => ipcRenderer.invoke('folders:listCreated'),
    updateCreatedFolder: (itemId, updates) => ipcRenderer.invoke('folders:updateMeta', itemId, updates),
    renameCreatedFolder: (itemId, nextName) => ipcRenderer.invoke('folders:rename', itemId, nextName),
    openPath: (targetPath) => ipcRenderer.invoke('files:open', targetPath),
    selectFile: () => ipcRenderer.invoke('files:select'),
    applyProposedAction: (actionId) => ipcRenderer.invoke('automation:apply', actionId),
    rejectProposedAction: (actionId) => ipcRenderer.invoke('automation:reject', actionId),
    startDesktopWatcher: () => ipcRenderer.invoke('desktop-watcher:start'),
    stopDesktopWatcher: () => ipcRenderer.invoke('desktop-watcher:stop'),
    getDesktopWatcherStatus: () => ipcRenderer.invoke('desktop-watcher:status'),
    startDownloadsWatcher: () => ipcRenderer.invoke('downloads-watcher:start'),
    stopDownloadsWatcher: () => ipcRenderer.invoke('downloads-watcher:stop'),
    getDownloadsWatcherStatus: () => ipcRenderer.invoke('downloads-watcher:status'),
    getSystemInfo: () => ipcRenderer.invoke('system:getInfo'),
    getScanConfig: () => ipcRenderer.invoke('scan:getConfig'),
    createSandbox: () => ipcRenderer.invoke('sandbox:create'),
    resetSandbox: () => ipcRenderer.invoke('sandbox:reset'),
    openSandboxFolder: () => ipcRenderer.invoke('sandbox:open')
});
