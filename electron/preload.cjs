const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('api', {
  selectFolder: () => ipcRenderer.invoke('select-folder'),
  scanFiles: (folderPath, options) => ipcRenderer.invoke('scan-files', folderPath, options),
  analyzeDuplicates: (files, options) => ipcRenderer.invoke('analyze-duplicates', files, options),
  executePlan: (plan) => ipcRenderer.invoke('execute-plan', plan),
  revealInFinder: (targetPath) => ipcRenderer.invoke('reveal-in-finder', targetPath),
  openExternal: (url) => ipcRenderer.invoke('open-external', url),
  openReportFolder: (reportPath) => ipcRenderer.invoke('open-report-folder', reportPath)
})
