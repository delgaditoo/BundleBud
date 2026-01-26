const { contextBridge, ipcRenderer } = require('electron')

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
  canUndo: () => ipcRenderer.invoke('activity:canUndo'),
  undoLastMove: () => ipcRenderer.invoke('activity:undoLastMove'),
  startDesktopWatcher: () => ipcRenderer.invoke('desktop-watcher:start'),
  stopDesktopWatcher: () => ipcRenderer.invoke('desktop-watcher:stop'),
  getDesktopWatcherStatus: () => ipcRenderer.invoke('desktop-watcher:status'),
  startDownloadsWatcher: () => ipcRenderer.invoke('downloads-watcher:start'),
  stopDownloadsWatcher: () => ipcRenderer.invoke('downloads-watcher:stop'),
  getDownloadsWatcherStatus: () => ipcRenderer.invoke('downloads-watcher:status')
})
