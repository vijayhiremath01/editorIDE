import { useState, useEffect, useCallback } from 'react'
import { DndProvider } from 'react-dnd'
import { HTML5Backend } from 'react-dnd-html5-backend'
import Sidebar from './components/Sidebar'
import VideoCanvas from './components/VideoCanvas'
import Timeline from './components/Timeline/Timeline'
import Toolbar from './components/Toolbar'
import RightSidebar from './components/RightSidebar'
import { api } from './api/client'
import { getWebSocketClient } from './utils/websocket'
import useTimelineStore from './store/timelineStore'
import { getFeatureInfo } from './assistant/knowledge/features'
import { callGemini } from './api/gemini'

function App() {
  const [mediaFiles, setMediaFiles] = useState([])
  const [selectedFile, setSelectedFile] = useState(null)
  const [chatMessages, setChatMessages] = useState([
    {
      role: 'assistant',
      content: 'Hello! I\'m your AI video editing assistant. You can drag files to the timeline, use commands like "cut at 5 seconds", or ask me to help with edits. What would you like to do?',
      timestamp: new Date()
    }
  ])
  const [activeTasks, setActiveTasks] = useState(new Set())
  
  const { currentTime, setCurrentTime, timeline, setTimeline, projectId, setProjectId } = useTimelineStore()
  const wsClient = getWebSocketClient()

  // Initialize WebSocket connection
  useEffect(() => {
    wsClient.connect()
    
    // Set up event listeners
    const unsubscribeConnected = wsClient.on('connected', () => {
      console.log('WebSocket connected')
    })
    
    const unsubscribeFileAdded = wsClient.on('file_added', (data) => {
      loadMediaFiles()
      addChatMessage('assistant', `New file detected: ${data.path}`)
    })
    
    const unsubscribeTaskUpdate = wsClient.on('task_update', (data) => {
      if (data.status === 'completed') {
        addChatMessage('assistant', data.message || 'Task completed!')
        loadMediaFiles()
      } else if (data.status === 'failed') {
        addChatMessage('assistant', `Error: ${data.error || 'Task failed'}`)
      } else {
        addChatMessage('assistant', data.message || 'Processing...')
      }
    })
    
    const unsubscribeTimelineUpdate = wsClient.on('timeline_updated', (data) => {
      if (data.timeline) {
        setTimeline(data.timeline)
      }
    })
    
    // Initialize project
    initializeProject()
    
    // Load media files once
    loadMediaFiles()
    
    return () => {
      unsubscribeConnected()
      unsubscribeFileAdded()
      unsubscribeTaskUpdate()
      unsubscribeTimelineUpdate()
      wsClient.disconnect()
    }
  }, [])

  const initializeProject = async () => {
    try {
      const currentProjectId = projectId || 'default'
      let response = await api.get(`/timeline/project/${currentProjectId}`)
      
      if (response.data.success) {
        setTimeline(response.data.timeline)
      }
    } catch (error) {
      // Project doesn't exist, create it
      try {
        const response = await api.post('/timeline/create-project', {
          project_id: projectId || 'default'
        })
        if (response.data.success) {
          setTimeline(response.data.timeline)
          setProjectId(projectId || 'default')
        }
      } catch (createError) {
        console.error('Error creating project:', createError)
      }
    }
  }

  const loadMediaFiles = useCallback(async () => {
    try {
      const response = await api.get('/media/list')
      setMediaFiles(response.data.files || [])
    } catch (error) {
      console.error('Error loading media files:', error)
    }
  }, [])

  const addChatMessage = (role, content) => {
    const newMessage = { role, content, timestamp: new Date() }
    setChatMessages(prev => {
      // Avoid duplicate messages
      const lastMessage = prev[prev.length - 1]
      if (lastMessage?.content === content && lastMessage?.role === role) {
        return prev
      }
      return [...prev, newMessage]
    })
  }

  const handleNewChatMessage = async (message) => {
    addChatMessage(message.role, message.content)
    
    // If it's a user message, try to execute as command
    if (message.role === 'user' && selectedFile) {
      // Check if it looks like a command
      const commandKeywords = ['cut', 'crop', 'speed', 'reverse', 'rotate', 'add', 'trim', 'split']
      const isCommand = commandKeywords.some(keyword => 
        message.content.toLowerCase().includes(keyword)
      )
      
      if (isCommand) {
        await handleAICommand(message.content, selectedFile.full_path)
      }
    }
  }

  const handleClassifySFX = async (filePath) => {
    try {
      addChatMessage('user', `Classify SFX: ${getFileName(filePath)}`)
      const response = await api.post('/classify-sfx', { file_path: filePath })
      if (response.data.task_id) {
        setActiveTasks(prev => new Set([...prev, response.data.task_id]))
      }
      addChatMessage('assistant', 'Starting audio classification...')
    } catch (error) {
      const errorMsg = error.response?.data?.detail || error.message || 'Unknown error'
      addChatMessage('assistant', `Error: ${errorMsg}`)
    }
  }

  const handleAutoCaption = async (filePath) => {
    try {
      addChatMessage('user', `Auto Caption: ${getFileName(filePath)}`)
      const response = await api.post('/auto-caption', { file_path: filePath })
      if (response.data.task_id) {
        setActiveTasks(prev => new Set([...prev, response.data.task_id]))
      }
      addChatMessage('assistant', 'Starting transcription...')
    } catch (error) {
      const errorMsg = error.response?.data?.detail || error.message || 'Unknown error'
      addChatMessage('assistant', `Error: ${errorMsg}`)
    }
  }

  const handleBuildRoughCut = async (filePath) => {
    try {
      addChatMessage('user', `Build Rough Cut: ${getFileName(filePath)}`)
      const response = await api.post('/build-roughcut', { file_path: filePath })
      if (response.data.task_id) {
        setActiveTasks(prev => new Set([...prev, response.data.task_id]))
      }
      addChatMessage('assistant', 'Starting rough cut generation...')
    } catch (error) {
      const errorMsg = error.response?.data?.detail || error.message || 'Unknown error'
      addChatMessage('assistant', `Error: ${errorMsg}`)
    }
  }

  const handleActionComplete = async (outputFullPath) => {
    await loadMediaFiles()
    if (outputFullPath) {
      // Try to select the new output file in media list
      const found = mediaFiles.find(f => f.full_path === outputFullPath)
      if (found) {
        setSelectedFile(found)
      } else {
        // If not found yet, fetch again and then select
        try {
          const response = await api.get('/media/list')
          const files = response.data.files || []
          setMediaFiles(files)
          const match = files.find(f => f.full_path === outputFullPath)
          if (match) setSelectedFile(match)
        } catch (e) {
          console.warn('Could not select output file automatically:', e)
        }
      }
    }
  }

  const handleChatAction = async (action) => {
    if (!selectedFile && action !== 'help') {
      addChatMessage('assistant', 'Please select a file first, or specify the file in your command.')
      return
    }

    switch (action) {
      case 'classify-sfx':
        handleClassifySFX(selectedFile.full_path)
        break
      case 'auto-caption':
        handleAutoCaption(selectedFile.full_path)
        break
      case 'build-roughcut':
        handleBuildRoughCut(selectedFile.full_path)
        break
      default:
        // Try to execute as AI command
        if (selectedFile) {
          await handleAICommand(action, selectedFile.full_path)
        }
    }
  }

  const handleAICommand = async (command, filePath) => {
    try {
      // Friendly progress message and local knowledge reference
      addChatMessage('assistant', "I'm analyzing your request…")
      const info = getFeatureInfo(command.split(' ')[0])
      if (info) {
        addChatMessage('assistant', `${info.description}`)
      }
      // Optional Gemini parsing demo (non-blocking)
      callGemini(command).then(result => {
        if (result.intent !== 'unknown') {
          addChatMessage('assistant', `${result.message} (confidence ${Math.round(result.confidence*100)}%)`)
        }
      }).catch(() => {})

      addChatMessage('user', command)
      const response = await api.post('/ai/execute-command', {
        command: command,
        context: { selected_file: filePath }
      })
      
      if (response.data.success) {
        if (response.data.task_id) {
          setActiveTasks(prev => new Set([...prev, response.data.task_id]))
          pollTaskStatus(response.data.task_id)
        }
        addChatMessage('assistant', response.data.message || 'Done! Edit applied successfully.')
      } else {
        addChatMessage('assistant', response.data.message || 'I could not apply that edit.')
      }
    } catch (error) {
      const errorMsg = error.response?.data?.detail || error.message || 'Unknown error'
      addChatMessage('assistant', `Error: ${errorMsg}`)
    }
  }

  const pollTaskStatus = async (taskId) => {
    const maxAttempts = 60
    let attempts = 0
    
    const poll = async () => {
      try {
        const response = await api.get(`/task/${taskId}`)
        const task = response.data
        
        if (task.status === 'completed') {
          addChatMessage('assistant', task.message || 'Task completed!')
          loadMediaFiles()
          setActiveTasks(prev => {
            const newSet = new Set(prev)
            newSet.delete(taskId)
            return newSet
          })
        } else if (task.status === 'failed') {
          addChatMessage('assistant', `Error: ${task.error || 'Task failed'}`)
          setActiveTasks(prev => {
            const newSet = new Set(prev)
            newSet.delete(taskId)
            return newSet
          })
        } else if (attempts < maxAttempts) {
          attempts++
          setTimeout(poll, 1000)
        } else {
          addChatMessage('assistant', 'Task is taking longer than expected...')
          setActiveTasks(prev => {
            const newSet = new Set(prev)
            newSet.delete(taskId)
            return newSet
          })
        }
      } catch (error) {
        addChatMessage('assistant', `Error checking task status: ${error.message}`)
        setActiveTasks(prev => {
          const newSet = new Set(prev)
          newSet.delete(taskId)
          return newSet
        })
      }
    }
    
    poll()
  }


  const handleSelectSuggestion = (suggestion) => {
    setSelectedFile(suggestion)
    addChatMessage('assistant', `Selected: ${suggestion.name}`)
  }

  const handleTimeUpdate = (time) => {
    setCurrentTime(time)
  }

  const getFileName = (path) => {
    if (!path) return ''
    return path.split('/').pop() || path.split('\\').pop() || path
  }


  return (
    <DndProvider backend={HTML5Backend}>
      <div className="flex h-screen bg-charcoal text-white overflow-hidden">
        <Sidebar 
          files={mediaFiles} 
          onFileSelect={setSelectedFile}
          selectedFile={selectedFile}
          onFilesUpdate={loadMediaFiles}
        />
        <div className="flex-1 flex flex-col min-w-0">
          <VideoCanvas 
            selectedFile={selectedFile}
            currentTime={currentTime}
            onTimeUpdate={handleTimeUpdate}
          />
          <Timeline
            currentTime={currentTime}
            onTimeUpdate={handleTimeUpdate}
          />
          <Toolbar
            selectedFile={selectedFile}
            onActionComplete={handleActionComplete}
            onChatMessage={handleNewChatMessage}
          />
        </div>
        <RightSidebar
          chatMessages={chatMessages}
          onSendMessage={handleChatAction}
          onNewMessage={handleNewChatMessage}
          onSelectSuggestion={handleSelectSuggestion}
        />
      </div>
    </DndProvider>
  )
}

export default App
