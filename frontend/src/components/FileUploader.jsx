import { useState, useRef } from 'react'
import { Upload, X, File } from 'lucide-react'
import { api } from '../api/client'

const FileUploader = ({ onUpload, onClose }) => {
  const [dragActive, setDragActive] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [progress, setProgress] = useState(0)
  const fileInputRef = useRef(null)

  const handleDrag = (e) => {
    e.preventDefault()
    e.stopPropagation()
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true)
    } else if (e.type === 'dragleave') {
      setDragActive(false)
    }
  }

  const handleDrop = async (e) => {
    e.preventDefault()
    e.stopPropagation()
    setDragActive(false)

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      await uploadFile(e.dataTransfer.files[0])
    }
  }

  const handleChange = async (e) => {
    if (e.target.files && e.target.files[0]) {
      await uploadFile(e.target.files[0])
    }
  }

  const uploadFile = async (file) => {
    setUploading(true)
    setProgress(0)

    try {
      const formData = new FormData()
      formData.append('file', file)

      const response = await api.post('/upload', formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
        onUploadProgress: (progressEvent) => {
          const percentCompleted = Math.round(
            (progressEvent.loaded * 100) / progressEvent.total
          )
          setProgress(percentCompleted)
        },
      })

      if (response.data.success) {
        setProgress(100)
        setTimeout(() => {
          onUpload()
          onClose()
          setUploading(false)
          setProgress(0)
        }, 500)
      }
    } catch (error) {
      alert(`Upload failed: ${error.response?.data?.detail || error.message}`)
      setUploading(false)
      setProgress(0)
    }
  }

  return (
    <div className="mt-2">
      <div
        className={`border-2 border-dashed rounded-lg p-4 transition-colors ${
          dragActive
            ? 'border-sky-blue bg-sky-blue/10'
            : 'border-gray-600 hover:border-gray-500'
        }`}
        onDragEnter={handleDrag}
        onDragLeave={handleDrag}
        onDragOver={handleDrag}
        onDrop={handleDrop}
      >
        {uploading ? (
          <div className="text-center">
            <div className="text-sm text-gray-300 mb-2">Uploading...</div>
            <div className="w-full bg-gray-700 rounded-full h-2">
              <div
                className="bg-sky-blue h-2 rounded-full transition-all"
                style={{ width: `${progress}%` }}
              />
            </div>
            <div className="text-xs text-gray-400 mt-1">{progress}%</div>
          </div>
        ) : (
          <div className="text-center">
            <Upload className="w-8 h-8 mx-auto text-gray-400 mb-2" />
            <div className="text-sm text-gray-300 mb-2">
              Drag and drop files here
            </div>
            <div className="text-xs text-gray-400 mb-2">or</div>
            <button
              onClick={() => fileInputRef.current?.click()}
              className="text-sm text-sky-blue hover:underline"
            >
              Browse files
            </button>
            <input
              ref={fileInputRef}
              type="file"
              onChange={handleChange}
              className="hidden"
              accept="video/*,audio/*,image/*"
              multiple
            />
          </div>
        )}
      </div>
    </div>
  )
}

export default FileUploader

