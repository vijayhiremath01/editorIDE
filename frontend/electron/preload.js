const { contextBridge, ipcRenderer } = require('electron')

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('electronAPI', {
  openFile: () => ipcRenderer.invoke('dialog:openFile'),
  openDirectory: () => ipcRenderer.invoke('dialog:openDirectory'),
  saveFile: (defaultPath) => ipcRenderer.invoke('dialog:saveFile', defaultPath),
  readFile: (filePath) => ipcRenderer.invoke('fs:readFile', filePath),
  readDir: (dirPath) => ipcRenderer.invoke('fs:readDir', dirPath),
  getStats: (filePath) => ipcRenderer.invoke('fs:getStats', filePath),
  platform: process.platform
})

