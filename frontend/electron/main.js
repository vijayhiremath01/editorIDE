const { app, BrowserWindow, ipcMain, dialog } = require('electron')
const path = require('path')
const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged

let mainWindow

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1920,
    height: 1080,
    minWidth: 1366,
    minHeight: 768,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      enableRemoteModule: false,
      preload: path.join(__dirname, 'preload.js'),
      webSecurity: false // Allow local file access
    },
    backgroundColor: '#1c1c1c',
    titleBarStyle: 'hiddenInset',
    frame: true
  })

  if (isDev) {
    mainWindow.loadURL('http://localhost:5173')
    mainWindow.webContents.openDevTools()
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'))
  }

  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

app.whenReady().then(() => {
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

// IPC handlers for system-level operations
ipcMain.handle('dialog:openFile', async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile', 'multiSelections'],
    filters: [
      { name: 'Media Files', extensions: ['mp4', 'mov', 'avi', 'mkv', 'webm', 'mp3', 'wav', 'aac', 'jpg', 'png', 'gif'] },
      { name: 'Video', extensions: ['mp4', 'mov', 'avi', 'mkv', 'webm'] },
      { name: 'Audio', extensions: ['mp3', 'wav', 'aac', 'm4a'] },
      { name: 'Images', extensions: ['jpg', 'jpeg', 'png', 'gif', 'webp'] },
      { name: 'All Files', extensions: ['*'] }
    ]
  })
  
  if (!canceled) {
    return filePaths
  }
  return []
})

ipcMain.handle('dialog:openDirectory', async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory']
  })
  
  if (!canceled && filePaths.length > 0) {
    return filePaths[0]
  }
  return null
})

ipcMain.handle('dialog:saveFile', async (event, defaultPath) => {
  const { canceled, filePath } = await dialog.showSaveDialog(mainWindow, {
    defaultPath: defaultPath || 'output.mp4',
    filters: [
      { name: 'Video', extensions: ['mp4'] },
      { name: 'All Files', extensions: ['*'] }
    ]
  })
  
  if (!canceled) {
    return filePath
  }
  return null
})

// File system access
const fs = require('fs').promises

ipcMain.handle('fs:readFile', async (event, filePath) => {
  try {
    const data = await fs.readFile(filePath)
    return { success: true, data: data.toString() }
  } catch (error) {
    return { success: false, error: error.message }
  }
})

ipcMain.handle('fs:readDir', async (event, dirPath) => {
  try {
    const files = await fs.readdir(dirPath, { withFileTypes: true })
    return { success: true, files: files.map(f => ({ name: f.name, isDirectory: f.isDirectory() })) }
  } catch (error) {
    return { success: false, error: error.message }
  }
})

ipcMain.handle('fs:getStats', async (event, filePath) => {
  try {
    const stats = await fs.stat(filePath)
    return { success: true, stats: { size: stats.size, mtime: stats.mtime } }
  } catch (error) {
    return { success: false, error: error.message }
  }
})

