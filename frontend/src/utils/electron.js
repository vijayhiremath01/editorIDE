// Electron API wrapper for renderer process

export const electronAPI = window.electronAPI || null

export const isElectron = () => {
  return !!electronAPI
}

export const openFileDialog = async () => {
  if (electronAPI) {
    return await electronAPI.openFile()
  }
  return []
}

export const openDirectoryDialog = async () => {
  if (electronAPI) {
    return await electronAPI.openDirectory()
  }
  return null
}

export const saveFileDialog = async (defaultPath) => {
  if (electronAPI) {
    return await electronAPI.saveFile(defaultPath)
  }
  return null
}

export const readLocalFile = async (filePath) => {
  if (electronAPI) {
    return await electronAPI.readFile(filePath)
  }
  return null
}

export const readLocalDirectory = async (dirPath) => {
  if (electronAPI) {
    return await electronAPI.readDir(dirPath)
  }
  return null
}

export const getFileStats = async (filePath) => {
  if (electronAPI) {
    return await electronAPI.getStats(filePath)
  }
  return null
}

export const getPlatform = () => {
  if (electronAPI) {
    return electronAPI.platform
  }
  return 'web'
}

