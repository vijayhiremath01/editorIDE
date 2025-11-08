import { useState, useEffect } from 'react'
import { File, Folder, Video, Music, Image, Trash2, Upload, ChevronRight, ChevronDown } from 'lucide-react'
import { useDrag } from 'react-dnd'
import { api } from '../api/client'
import FileUploader from './FileUploader'
import { openFileDialog, isElectron } from '../utils/electron'

const formatSize = (bytes) => {
  if (!bytes) return '0 B'
  if (bytes < 1024) return bytes + ' B'
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
}

const formatDuration = (seconds) => {
  if (!seconds) return ''
  const mins = Math.floor(seconds / 60)
  const secs = Math.floor(seconds % 60)
  return `${mins}:${secs.toString().padStart(2, '0')}`
}

const MediaFileItem = ({ file, onSelect, selectedFile, onDelete }) => {
  const [{ isDragging }, drag] = useDrag({
    type: 'media-file',
    item: { ...file, duration: file.duration || 10 },
    collect: (monitor) => ({
      isDragging: monitor.isDragging()
    })
  })

  const getFileIcon = (fileType) => {
    switch (fileType) {
      case 'video':
        return <Video className="w-4 h-4 text-sky-blue" />
      case 'audio':
        return <Music className="w-4 h-4 text-green-400" />
      case 'image':
        return <Image className="w-4 h-4 text-purple-400" />
      default:
        return <File className="w-4 h-4" />
    }
  }

  const isSelected = selectedFile?.full_path === file.full_path

  return (
    <div
      ref={drag}
      className={`group flex items-center gap-2 px-3 py-2 hover:bg-light-gray cursor-move rounded transition-colors ${
        isSelected ? 'bg-sky-blue/20 border border-sky-blue/50' : ''
      } ${isDragging ? 'opacity-50' : ''}`}
      onClick={() => onSelect(file)}
    >
      {getFileIcon(file.type)}
      <div className="flex-1 min-w-0">
        <div className="text-sm truncate">{file.name}</div>
        <div className="text-xs text-gray-400 flex gap-2">
          <span>{formatSize(file.size)}</span>
          {file.duration && <span>• {formatDuration(file.duration)}</span>}
        </div>
      </div>
      <button
        onClick={(e) => {
          e.stopPropagation()
          onDelete(file)
        }}
        className="opacity-0 group-hover:opacity-100 p-1 hover:bg-red-500/20 rounded transition-opacity"
        title="Delete file"
      >
        <Trash2 className="w-3 h-3 text-red-400" />
      </button>
    </div>
  )
}

const Sidebar = ({ files, onFileSelect, selectedFile, onFilesUpdate }) => {
  const [expandedFolders, setExpandedFolders] = useState({})
  const [showUploader, setShowUploader] = useState(false)

  const organizeFiles = (files) => {
    const structure = {}
    
    files.forEach(file => {
      const path = file.path.split('/')
      let current = structure
      
      path.forEach((segment, index) => {
        if (index === path.length - 1) {
          current[segment] = file
        } else {
          if (!current[segment]) {
            current[segment] = { type: 'folder', children: {} }
          }
          current = current[segment].children
        }
      })
    })
    
    return structure
  }

  const structure = organizeFiles(files)

  const toggleFolder = (path) => {
    setExpandedFolders(prev => ({
      ...prev,
      [path]: !prev[path]
    }))
  }

  const handleDelete = async (file) => {
    if (!confirm(`Delete ${file.name}?`)) return
    
    try {
      await api.delete(`/media/${file.path}`)
      onFilesUpdate()
    } catch (error) {
      alert(`Error deleting file: ${error.response?.data?.detail || error.message}`)
    }
  }

  const handleOpenFile = async () => {
    if (isElectron()) {
      const filePaths = await openFileDialog()
      // Handle file paths from Electron
      console.log('Selected files:', filePaths)
    } else {
      setShowUploader(true)
    }
  }


  const renderStructure = (obj, path = '') => {
    return Object.entries(obj).map(([name, item]) => {
      const fullPath = path ? `${path}/${name}` : name
      
      if (item.type === 'folder') {
        const isExpanded = expandedFolders[fullPath]
        return (
          <div key={fullPath}>
            <div
              className="flex items-center gap-2 px-3 py-2 hover:bg-light-gray cursor-pointer rounded transition-colors"
              onClick={() => toggleFolder(fullPath)}
            >
              {isExpanded ? (
                <ChevronDown className="w-4 h-4 text-gray-400" />
              ) : (
                <ChevronRight className="w-4 h-4 text-gray-400" />
              )}
              <Folder className="w-4 h-4 text-sky-blue" />
              <span className="text-sm flex-1">{name}</span>
            </div>
            {isExpanded && (
              <div className="ml-4">
                {renderStructure(item.children, fullPath)}
              </div>
            )}
          </div>
        )
      } else {
        return (
          <MediaFileItem
            key={fullPath}
            file={item}
            onSelect={onFileSelect}
            selectedFile={selectedFile}
            onDelete={handleDelete}
          />
        )
      }
    })
  }

  return (
    <div className="w-64 bg-dark-gray border-r border-light-gray flex flex-col h-full">
      <div className="p-4 border-b border-light-gray">
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-sm font-semibold text-gray-300">Media Files</h2>
          <button
            onClick={handleOpenFile}
            className="p-1.5 hover:bg-light-gray rounded transition-colors"
            title={isElectron() ? "Open files" : "Upload file"}
          >
            <Upload className="w-4 h-4" />
          </button>
        </div>
        {showUploader && !isElectron() && (
          <FileUploader onUpload={onFilesUpdate} onClose={() => setShowUploader(false)} />
        )}
      </div>
      <div className="flex-1 overflow-y-auto p-2">
        {files.length === 0 ? (
          <div className="text-sm text-gray-400 p-4 text-center">
            No media files found
            <br />
            <button
              onClick={handleOpenFile}
              className="text-sky-blue hover:underline mt-2"
            >
              {isElectron() ? 'Open files' : 'Upload a file'}
            </button>
          </div>
        ) : (
          renderStructure(structure)
        )}
      </div>
    </div>
  )
}

export default Sidebar
