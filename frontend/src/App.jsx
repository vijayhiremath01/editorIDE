import { useState, useEffect, useCallback } from 'react'
import { DndProvider } from 'react-dnd'
import { HTML5Backend } from 'react-dnd-html5-backend'
import Sidebar from './components/Sidebar'
import VideoCanvas from './components/VideoCanvas'
import Timeline from './components/Timeline/Timeline'
import Toolbar from './components/Toolbar'
import RightSidebar from './components/RightSidebar'
import { api } from './api/client'
import { videoAPI, audioAPI, aiAPI, mediaAPI, timelineAPI } from './api/editing'
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
  
  const { currentTime, setCurrentTime, timeline, setTimeline, projectId, setProjectId, addClip } = useTimelineStore()
  const wsClient = getWebSocketClient()

  // Initialize WebSocket connection
  useEffect(() => {
    wsClient.connect()
    
    // Set up event listeners
    const unsubscribeConnected = wsClient.on('connected', () => {
      console.log('WebSocket connected')
    })
    
    const unsubscribeFileAdded = wsClient.on('file_added', async (data) => {
      await loadMediaFiles()
      addChatMessage('assistant', `New file detected: ${data.path}`)
      // Auto-add newly uploaded videos to the end of the first video track
      try {
        if (data?.type === 'video') {
          const filesResp = await mediaAPI.list()
          const files = filesResp.files || []
          const match = files.find(f => f.name === data.name) || files.find(f => (f.path || '').endsWith(data.name))
          if (match) {
            let duration = 10
            try {
              const meta = await videoAPI.getMetadata(match.fullPath)
              duration = (meta.metadata && meta.metadata.duration) || meta.duration || 10
            } catch (_) {}
            const videoTrack = (timeline?.tracks || []).find(t => t.type === 'video')
            const startAt = Math.max(0, (timeline?.duration || 0))
            if (videoTrack) {
              addClip(videoTrack.id, {
                id: `${match.name}-${Date.now()}`,
                name: match.name,
                start: startAt,
                end: startAt + duration,
                type: 'video',
                fullPath: match.fullPath
              })
            }
          }
        }
      } catch (e) {
        console.warn('Auto-add to timeline failed:', e)
      }
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
      let response = await timelineAPI.getProject(currentProjectId)
      
      if (response.timeline) {
        setTimeline(response.timeline)
      }
    } catch (error) {
      // Project doesn't exist, create it
      try {
        const response = await timelineAPI.createProject(projectId || 'default')
        if (response.timeline) {
          setTimeline(response.timeline)
          setProjectId(projectId || 'default')
        }
      } catch (createError) {
        console.error('Error creating project:', createError)
      }
    }
  }

  const loadMediaFiles = useCallback(async () => {
    try {
      const response = await mediaAPI.list()
      setMediaFiles(response.files || [])
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
        await handleAICommand(message.content, selectedFile.fullPath)
      }
    }
  }

  const handleClassifySFX = async (filePath) => {
    try {
      addChatMessage('user', `Classify SFX: ${getFileName(filePath)}`)
      // Use AI API for classification
      const response = await aiAPI.analyze(filePath, 'sfx-classification')
      addChatMessage('assistant', response.message || 'Audio classification completed!')
    } catch (error) {
      const errorMsg = error.response?.data?.detail || error.message || 'Unknown error'
      addChatMessage('assistant', `Error: ${errorMsg}`)
    }
  }

  const handleAutoCaption = async (filePath) => {
    try {
      addChatMessage('user', `Auto Caption: ${getFileName(filePath)}`)
      // Use AI API for transcription
      const response = await aiAPI.analyze(filePath, 'transcription')
      addChatMessage('assistant', response.message || 'Transcription completed!')
    } catch (error) {
      const errorMsg = error.response?.data?.detail || error.message || 'Unknown error'
      addChatMessage('assistant', `Error: ${errorMsg}`)
    }
  }

  const handleBuildRoughCut = async (filePath) => {
    try {
      addChatMessage('user', `Build Rough Cut: ${getFileName(filePath)}`)
      // Use AI API for rough cut generation
      const response = await aiAPI.analyze(filePath, 'rough-cut')
      addChatMessage('assistant', response.message || 'Rough cut generation completed!')
    } catch (error) {
      const errorMsg = error.response?.data?.detail || error.message || 'Unknown error'
      addChatMessage('assistant', `Error: ${errorMsg}`)
    }
  }

  const handleActionComplete = async (outputFullPath) => {
    await loadMediaFiles()
    if (outputFullPath) {
      // Try to select the new output file in media list
      const found = mediaFiles.find(f => f.fullPath === outputFullPath)
      if (found) {
        setSelectedFile(found)
      } else {
        // If not found yet, fetch again and then select
        try {
          const response = await mediaAPI.list()
          const files = response.files || []
          setMediaFiles(files)
          const match = files.find(f => f.fullPath === outputFullPath)
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
        handleClassifySFX(selectedFile.fullPath)
        break
      case 'auto-caption':
        handleAutoCaption(selectedFile.fullPath)
        break
      case 'build-roughcut':
        handleBuildRoughCut(selectedFile.fullPath)
        break
      default:
        // Try to execute as AI command
        if (selectedFile) {
          await handleAICommand(action, selectedFile.fullPath)
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
      // Parse the command using AI API
      const parsedCommand = await aiAPI.parseCommand(command, filePath)
      
      if (parsedCommand.success) {
        // Execute the parsed command
        const response = await aiAPI.executeCommand(parsedCommand.command)
        addChatMessage('assistant', response.message || 'Done! Edit applied successfully.')
        
        // Reload media files if a new file was created
        if (response.outputPath) {
          await loadMediaFiles()
        }
      } else {
        addChatMessage('assistant', parsedCommand.message || 'I could not apply that edit.')
      }
    } catch (error) {
      const errorMsg = error.response?.data?.detail || error.message || 'Unknown error'
      addChatMessage('assistant', `Error: ${errorMsg}`)
    }
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
          chatContext={{
            selectedFile: selectedFile ? { name: selectedFile.name, fullPath: selectedFile.fullPath, type: selectedFile.type } : null,
            currentTime,
            timeline: {
              duration: timeline?.duration || 0,
              tracks: (timeline?.tracks || []).map(t => ({ id: t.id, type: t.type, clipCount: (t.clips || []).length }))
            }
          }}
        />
      </div>
    </DndProvider>
  )
}

export default App
