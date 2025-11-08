import { 
  Square, Music, Type, Image as ImageIcon, Scissors, 
  Volume2, Gauge, Sparkles, Crop, Eye, Copy, RotateCw, 
  RotateCcw, Trash2
} from 'lucide-react'
import { api } from '../api/client'
import { useState } from 'react'
import useTimelineStore from '../store/timelineStore'

const Toolbar = ({ selectedFile, onActionComplete, onChatMessage }) => {
  const [loading, setLoading] = useState(null)
  const { currentTime, addClip, timeline, projectId, selectedClip, selectedTrack, splitSelectedClipAt, removeClip } = useTimelineStore()

  const handleAction = async (action, params = {}) => {
    if (!selectedFile) {
      alert('Please select a file first')
      return
    }

    setLoading(action)
    
    try {
      let response
      
      switch (action) {
        case 'split': {
          // Frontend timeline split at current playhead; also sync backend timeline state
          const playhead = typeof params.startTime === 'number' ? params.startTime : currentTime || 0
          if (!selectedClip || !selectedTrack) {
            alert('Select a clip on the timeline to split')
            setLoading(null)
            return
          }
          splitSelectedClipAt(playhead)
          onChatMessage('assistant', `Split applied at ${playhead.toFixed(2)}s.`)
          // Fire-and-forget backend sync via timeline_updated broadcast will keep UI consistent
          response = { data: { message: 'Split applied' } }
          break
        }
          
        case 'speed':
          response = await api.post('/speed', {
            file_path: selectedFile.full_path,
            speed: params.speed || 1.5
          })
          onChatMessage('assistant', `Changing playback speed to ${params.speed}x...`)
          break
          
        case 'volume':
          response = await api.post('/volume', {
            file_path: selectedFile.full_path,
            volume_db: params.volumeDb || 0
          })
          onChatMessage('assistant', `Adjusting volume by ${params.volumeDb}dB...`)
          break
          
        case 'ai-cut':
          response = await api.post('/build-roughcut', {
            file_path: selectedFile.full_path
          })
          onChatMessage('assistant', 'Building rough cut with AI scene detection...')
          break
          
        case 'crop':
          response = await api.post('/apply-edit', {
            file_path: selectedFile.full_path,
            operation: 'crop',
            parameters: {
              x: params.x || 0,
              y: params.y || 0,
              width: params.width || 640,
              height: params.height || 480
            }
          })
          onChatMessage('assistant', 'Cropping video...')
          break
          
        case 'rotate':
          response = await api.post('/apply-edit', {
            file_path: selectedFile.full_path,
            operation: 'rotate',
            parameters: {
              angle: params.angle || 90
            }
          })
          onChatMessage('assistant', `Rotating video ${params.angle}°...`)
          break
          
        case 'reverse':
          response = await api.post('/apply-edit', {
            file_path: selectedFile.full_path,
            operation: 'reverse',
            parameters: {}
          })
          onChatMessage('assistant', 'Reversing video...')
          break
          
        case 'classify-sfx':
          response = await api.post('/classify-sfx', {
            file_path: selectedFile.full_path
          })
          onChatMessage('assistant', 'Classifying audio files...')
          break
          
        case 'auto-caption':
          response = await api.post('/auto-caption', {
            file_path: selectedFile.full_path
          })
          onChatMessage('assistant', 'Generating captions...')
          break
          
        default:
          alert(`Action ${action} not implemented yet`)
          setLoading(null)
          return
      }
      
      if (response.data.task_id) {
        // Poll for task completion
        pollTaskStatus(response.data.task_id, action)
      } else {
        onActionComplete()
        setLoading(null)
      }
    } catch (error) {
      const errorMsg = error.response?.data?.detail || error.message || 'Unknown error'
      onChatMessage('assistant', `Error: ${errorMsg}`)
      setLoading(null)
    }
  }

  const pollTaskStatus = async (taskId, action) => {
    const maxAttempts = 60
    let attempts = 0
    
    const poll = async () => {
      try {
        const response = await api.get(`/task/${taskId}`)
        const task = response.data
        
        if (task.status === 'completed') {
          onChatMessage('assistant', task.message || `${action} completed!`)
          const outputPath = task.result?.output_path
          onActionComplete(outputPath)
          setLoading(null)
        } else if (task.status === 'failed') {
          onChatMessage('assistant', `Error: ${task.error || 'Task failed'}`)
          setLoading(null)
        } else if (attempts < maxAttempts) {
          attempts++
          setTimeout(poll, 1000)
        } else {
          onChatMessage('assistant', 'Task is taking longer than expected...')
          setLoading(null)
        }
      } catch (error) {
        onChatMessage('assistant', `Error checking task status: ${error.message}`)
        setLoading(null)
      }
    }
    
    poll()
  }

  const handleAddText = async () => {
    // Find text track
    const textTrack = timeline.tracks.find(t => t.type === 'text')
    if (!textTrack) {
      alert('Text track not found')
      return
    }
    
    // Create text clip
    const textClip = {
      id: `text-${Date.now()}`,
      start: currentTime || 0,
      end: (currentTime || 0) + 5, // 5 seconds default
      content: 'Double click to edit',
      position: { x: 50, y: 50 },
      font: { size: 24, family: 'Arial', color: '#ffffff', weight: 'bold' }
    }
    
    addClip(textTrack.id, textClip)
    onChatMessage('assistant', 'Text overlay added. Double click to edit.')
    
    // Sync with backend
    try {
      await api.post('/timeline/add-clip', {
        project_id: projectId || 'default',
        track_id: textTrack.id,
        clip: textClip
      })
    } catch (err) {
      console.error('Error adding text clip:', err)
    }
  }

  const tools = [
    { id: 'canvas', icon: Square, label: 'Canvas', action: () => alert('Canvas mode: drag/resize overlays on preview') },
    { id: 'audio', icon: Music, label: 'Audio', action: async () => {
      if (!selectedFile || selectedFile.type !== 'video') {
        alert('Select a video file to add/replace audio')
        return
      }
      const mode = prompt('Audio: type "add" to mix background or "replace" to swap track', 'add')
      if (!mode) return
      // Use native file picker instead of prompt
      const input = document.createElement('input')
      input.type = 'file'
      input.accept = 'audio/*'
      input.onchange = async (e) => {
        const file = e.target.files[0]
        if (!file) return
        const audioPath = file.name // or full path if available
        if (mode === 'add') {
          const volStr = prompt('Background audio volume (e.g., 1.0)', '1.0')
          const audio_volume = volStr ? parseFloat(volStr) : 1.0
          const response = await api.post('/audio/add', {
            video_file_path: selectedFile.full_path,
            audio_file_path: audioPath,
            audio_volume
          })
          if (response.data.task_id) pollTaskStatus(response.data.task_id, 'audio-add')
        } else {
          const response = await api.post('/audio/replace', {
            video_file_path: selectedFile.full_path,
            audio_file_path: audioPath
          })
          if (response.data.task_id) pollTaskStatus(response.data.task_id, 'audio-replace')
        }
      }
      input.click()
    } },
    { id: 'text', icon: Type, label: 'Text', action: handleAddText },
    { id: 'pip', icon: ImageIcon, label: 'Pip', action: async () => {
      if (!selectedFile || selectedFile.type !== 'video') {
        alert('Select a base video for PIP')
        return
        }
      const overlayPath = prompt('Enter overlay file full path (image/video)', '')
      if (!overlayPath) return
      const x = parseInt(prompt('Overlay X position', '50') || '50', 10)
      const y = parseInt(prompt('Overlay Y position', '50') || '50', 10)
      const width = parseInt(prompt('Overlay width (optional)', '') || '0', 10)
      const height = parseInt(prompt('Overlay height (optional)', '') || '0', 10)
      const response = await api.post('/pip', {
        base_file_path: selectedFile.full_path,
        overlay_file_path: overlayPath,
        x, y,
        width: width || undefined,
        height: height || undefined
      })
      if (response.data.task_id) pollTaskStatus(response.data.task_id, 'pip')
    } },
    { id: 'split', icon: Scissors, label: 'Split', action: () => handleAction('split') },
    { id: 'delete', icon: Trash2, label: 'Delete', action: async () => {
      if (!selectedClip || !selectedTrack) {
        alert('Select a clip to delete')
        return
      }
      // Remove from store and backend
      removeClip(selectedTrack, selectedClip.id || selectedClip)
      try {
        await api.post('/timeline/remove-clip', {
          project_id: projectId || 'default',
          track_id: selectedTrack,
          clip_id: selectedClip.id || selectedClip
        })
      } catch (err) {
        console.error('Error syncing clip removal:', err)
      }
      onChatMessage('assistant', 'Clip deleted.')
    } },
    { id: 'volume', icon: Volume2, label: 'Volume', action: () => {
      const volume = prompt('Volume adjustment (dB):', '0')
      if (volume !== null) {
        handleAction('volume', { volumeDb: parseFloat(volume) })
      }
    }},
    { id: 'background', icon: ImageIcon, label: 'Background', action: () => {
      alert('Background color/image for preview is handled as a visual layer for now.')
    } },
    { id: 'speed', icon: Gauge, label: 'Speed', action: () => {
      const speed = prompt('Playback speed (e.g., 1.5 for 1.5x):', '1.5')
      if (speed !== null) {
        handleAction('speed', { speed: parseFloat(speed) })
      }
    }},
    { id: 'prompt-cut', icon: Sparkles, label: 'Prompt Cut', action: async () => {
      if (!selectedFile || selectedFile.type !== 'video') {
        alert('Select a video file first')
        return
      }
      const command = prompt('Enter edit command (e.g., "cut the first 3 seconds")', 'cut the first 3 seconds')
      if (!command) return
      try {
        setLoading('prompt-cut')
        const response = await api.post('/ai/execute-command', {
          command,
          context: { selected_file: selectedFile.full_path }
        })
        onChatMessage('assistant', response.data.message || 'Executing command...')
        if (response.data.task_id) {
          pollTaskStatus(response.data.task_id, 'prompt-cut')
        } else {
          setLoading(null)
          onActionComplete(response.data.result?.output_path)
        }
      } catch (err) {
        onChatMessage('assistant', `Error: ${err.response?.data?.detail || err.message}`)
        setLoading(null)
      }
    }, highlight: true },
    { id: 'crop', icon: Crop, label: 'Crop', action: () => handleAction('crop') },
    { id: 'opacity', icon: Eye, label: 'Opacity', action: async () => {
      const alphaStr = prompt('Opacity (0.0 transparent to 1.0 opaque):', '0.7')
      if (alphaStr === null) return
      const alpha = parseFloat(alphaStr)
      const response = await api.post('/opacity', { file_path: selectedFile.full_path, alpha })
      if (response.data.task_id) pollTaskStatus(response.data.task_id, 'opacity')
    } },
    { id: 'duplicate', icon: Copy, label: 'Duplicate', action: async () => {
      const response = await api.post('/duplicate', { file_path: selectedFile.full_path })
      if (response.data.task_id) pollTaskStatus(response.data.task_id, 'duplicate')
    } },
    { id: 'rotate', icon: RotateCw, label: 'Rotate', action: () => handleAction('rotate', { angle: 90 }) },
    { id: 'reverse', icon: RotateCcw, label: 'Reverse', action: () => handleAction('reverse') },
  ]

  const actionButtons = [
    { 
      id: 'classify-sfx', 
      label: 'Arrange SFX', 
      action: () => handleAction('classify-sfx'),
      disabled: !selectedFile || selectedFile.type !== 'audio'
    },
    { 
      id: 'auto-caption', 
      label: 'Auto Caption', 
      action: () => handleAction('auto-caption'),
      disabled: !selectedFile || (selectedFile.type !== 'video' && selectedFile.type !== 'audio')
    },
    { 
      id: 'build-roughcut', 
      label: 'Build Rough Cut', 
      action: () => handleAction('ai-cut'),
      disabled: !selectedFile || selectedFile.type !== 'video'
    },
  ]

  return (
    <div className="h-20 bg-dark-gray border-t border-light-gray">
      <div className="flex items-center h-full px-4 gap-2 overflow-x-auto">
        {tools.map(tool => {
          const Icon = tool.icon
          const isDisabled = Boolean(tool.disabled || (!selectedFile && tool.action))
          const isLoading = loading === tool.id
          const isHighlighted = tool.highlight
          
          const requiresSelection = ['split', 'delete'].includes(tool.id)
          const selectionMissing = requiresSelection && (!selectedClip || !selectedTrack)
          return (
            <button
              key={tool.id}
              onClick={tool.action}
              disabled={Boolean(isDisabled || isLoading || selectionMissing)}
              className={`flex flex-col items-center justify-center gap-1 p-3 hover:bg-light-gray rounded min-w-[80px] transition-colors ${
                (isDisabled || selectionMissing) ? 'opacity-50 cursor-not-allowed' : ''
              } ${isHighlighted ? 'ring-2 ring-sky-blue/50' : ''} ${isLoading ? 'animate-pulse' : ''}`}
              title={tool.label}
            >
              <Icon className="w-5 h-5" />
              <span className="text-xs">{tool.label}</span>
            </button>
          )
        })}
        
        {/* Action buttons */}
        <div className="ml-4 pl-4 border-l border-light-gray flex gap-2">
          {actionButtons.map(button => (
            <button
              key={button.id}
              onClick={button.action}
              disabled={Boolean(button.disabled || (loading === button.id))}
              className={`px-4 py-2 bg-sky-blue hover:bg-sky-blue/80 disabled:bg-gray-600 disabled:cursor-not-allowed rounded text-sm font-medium transition-colors ${
                loading === button.id ? 'animate-pulse' : ''
              }`}
            >
              {loading === button.id ? 'Processing...' : button.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

export default Toolbar

