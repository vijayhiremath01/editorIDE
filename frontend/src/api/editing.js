import { api } from './client'

// Video editing API service
export const videoAPI = {
  // Get video metadata
  async getMetadata(filePath) {
    const response = await api.post('/api/video/metadata', { filePath })
    return response.data
  },

  // Split video at specific time
  async split(filePath, startTime, endTime = null) {
    const response = await api.post('/api/video/split', { 
      filePath, 
      startTime, 
      endTime 
    })
    return response.data
  },

  // Change video speed
  async changeSpeed(filePath, speed) {
    const response = await api.post('/api/video/speed', { 
      filePath, 
      speed 
    })
    return response.data
  },

  // Crop video
  async crop(filePath, x, y, width, height) {
    const response = await api.post('/api/video/crop', { 
      filePath, 
      x, 
      y, 
      width, 
      height 
    })
    return response.data
  },

  // Add text overlay
  async addText(filePath, text, options = {}) {
    const response = await api.post('/api/video/text', { 
      filePath, 
      text,
      x: options.x || 50,
      y: options.y || 50,
      fontSize: options.fontSize || 24,
      fontColor: options.fontColor || 'white',
      fontfile: options.fontfile || null
    })
    return response.data
  },

  // Picture-in-Picture
  async addPiP(baseFilePath, overlayFilePath, options = {}) {
    const response = await api.post('/api/video/pip', { 
      baseFilePath,
      overlayFilePath,
      x: options.x || 50,
      y: options.y || 50,
      width: options.width || 320,
      height: options.height || 240
    })
    return response.data
  },

  // Rotate video
  async rotate(filePath, angle) {
    const response = await api.post('/api/video/rotate', { 
      filePath, 
      angle 
    })
    return response.data
  }
}

// Audio editing API service
export const audioAPI = {
  // Get audio metadata
  async getMetadata(filePath) {
    const response = await api.post('/api/audio/metadata', { filePath })
    return response.data
  },

  // Adjust volume
  async adjustVolume(filePath, volumeDb) {
    const response = await api.post('/api/audio/volume', { 
      filePath, 
      volumeDb 
    })
    return response.data
  },

  // Trim audio
  async trim(filePath, startTime, endTime = null) {
    const response = await api.post('/api/audio/trim', { 
      filePath, 
      startTime, 
      endTime 
    })
    return response.data
  },

  // Generate waveform
  async generateWaveform(filePath, options = {}) {
    const response = await api.post('/api/audio/waveform', { 
      filePath,
      width: options.width || 800,
      height: options.height || 200
    })
    return response.data
  },

  // Extract audio from video
  async extract(filePath, format = 'wav') {
    const response = await api.post('/api/audio/extract', { 
      filePath, 
      format 
    })
    return response.data
  },

  // Fade in/out
  async fade(filePath, fadeIn = 0, fadeOut = 0) {
    const response = await api.post('/api/audio/fade', { 
      filePath, 
      fadeIn, 
      fadeOut 
    })
    return response.data
  }
}

// AI API service
export const aiAPI = {
  // Parse natural language command
  async parseCommand(message, filePath = null, context = {}) {
    const response = await api.post('/api/ai/parse-command', { 
      message, 
      filePath, 
      context 
    })
    return response.data
  },

  // Execute AI command
  async executeCommand(command) {
    const response = await api.post('/api/ai/execute-command', { 
      command 
    })
    return response.data
  },

  // Chat with AI assistant
  async chat(message, context = {}) {
    const response = await api.post('/api/ai/chat', { 
      message, 
      context 
    })
    return response.data
  },

  // Analyze video content
  async analyze(filePath, analysisType = 'general') {
    const response = await api.post('/api/ai/analyze', { 
      filePath, 
      analysisType 
    })
    return response.data
  }
}

// Media API service
export const mediaAPI = {
  // List all media files
  async list() {
    const response = await api.get('/api/media/list')
    return response.data
  },

  // Get file info with metadata
  async getInfo(filePath) {
    const response = await api.post('/api/media/info', { filePath })
    return response.data
  },

  // Delete file
  async delete(filePath) {
    const response = await api.delete('/api/media/delete', { 
      data: { filePath } 
    })
    return response.data
  },

  // Upload file
  async upload(file) {
    const formData = new FormData()
    formData.append('file', file)
    
    const response = await api.post('/api/upload', formData, {
      headers: {
        'Content-Type': 'multipart/form-data'
      }
    })
    return response.data
  }
}

// Timeline API service
export const timelineAPI = {
  // Create project
  async createProject(projectId) {
    const response = await api.post('/api/timeline/create-project', { 
      project_id: projectId 
    })
    return response.data
  },

  // Get project timeline
  async getProject(projectId) {
    const response = await api.get(`/api/timeline/project/${projectId}`)
    return response.data
  },

  // Add clip to timeline
  async addClip(projectId, trackId, clip) {
    const response = await api.post('/api/timeline/add-clip', { 
      project_id: projectId,
      track_id: trackId,
      clip
    })
    return response.data
  },

  // Remove clip from timeline
  async removeClip(projectId, trackId, clipId) {
    const response = await api.post('/api/timeline/remove-clip', { 
      project_id: projectId,
      track_id: trackId,
      clip_id: clipId
    })
    return response.data
  },

  // Update clip
  async updateClip(projectId, trackId, clipId, updates) {
    const response = await api.post('/api/timeline/update-clip', { 
      project_id: projectId,
      track_id: trackId,
      clip_id: clipId,
      updates
    })
    return response.data
  },

  // Export timeline
  async export(projectId, format = 'mp4', quality = 'high') {
    const response = await api.post('/api/timeline/export', { 
      project_id: projectId,
      format,
      quality
    })
    return response.data
  },

  // List all projects
  async listProjects() {
    const response = await api.get('/api/timeline/projects')
    return response.data
  }
}

// Task API service
export const taskAPI = {
  // Get task status by ID
  async getStatus(taskId) {
    const response = await api.get(`/task/${taskId}`)
    return response.data
  }
}

export default {
  video: videoAPI,
  audio: audioAPI,
  ai: aiAPI,
  media: mediaAPI,
  timeline: timelineAPI,
  task: taskAPI
}