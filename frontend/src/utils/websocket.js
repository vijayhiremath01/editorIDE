/**
 * WebSocket Client - Real-time communication with backend
 */

const DEFAULT_HTTP_BASE = (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.VITE_API_URL) || 'http://localhost:8000'
const DEFAULT_WS_URL = (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.VITE_WS_URL) || DEFAULT_HTTP_BASE.replace('http', 'ws') + '/ws'

class WebSocketClient {
  constructor(url = DEFAULT_WS_URL) {
    this.url = url
    this.altUrl = this.url.includes('localhost') ? this.url.replace('localhost', '127.0.0.1') : null
    this.ws = null
    this.reconnectAttempts = 0
    this.maxReconnectAttempts = 5
    this.reconnectDelay = 1000
    this.listeners = new Map()
    this.isConnected = false
  }

  connect() {
    try {
      this.ws = new WebSocket(this.url)
      
      this.ws.onopen = () => {
        console.log('WebSocket connected')
        this.isConnected = true
        this.reconnectAttempts = 0
        this.emit('connected', {})
      }
      
      this.ws.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data)
          this.handleMessage(message)
        } catch (error) {
          console.error('Error parsing WebSocket message:', error)
        }
      }
      
      this.ws.onerror = (error) => {
        console.error('WebSocket error:', error)
        this.emit('error', { error })
      }
      
      this.ws.onclose = (event) => {
        const { code, reason } = event || {}
        console.log('WebSocket disconnected', code ? `(code: ${code}, reason: ${reason || 'none'})` : '')
        this.isConnected = false
        this.emit('disconnected', {})
        this.attemptReconnect()
      }
    } catch (error) {
      console.error('WebSocket connection error:', error)
      this.attemptReconnect()
    }
  }

  handleMessage(message) {
    const { type, data } = message
    
    // Emit to specific listeners
    if (this.listeners.has(type)) {
      this.listeners.get(type).forEach(callback => {
        try {
          callback(data)
        } catch (error) {
          console.error(`Error in listener for ${type}:`, error)
        }
      })
    }
    
    // Emit to general message listener
    this.emit('message', { type, data })
  }

  on(event, callback) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, [])
    }
    this.listeners.get(event).push(callback)
    
    // Return unsubscribe function
    return () => {
      const callbacks = this.listeners.get(event)
      const index = callbacks.indexOf(callback)
      if (index > -1) {
        callbacks.splice(index, 1)
      }
    }
  }

  emit(event, data) {
    if (this.listeners.has(event)) {
      this.listeners.get(event).forEach(callback => {
        try {
          callback(data)
        } catch (error) {
          console.error(`Error in emit for ${event}:`, error)
        }
      })
    }
  }

  send(message) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message))
    } else {
      console.warn('WebSocket is not connected')
    }
  }

  attemptReconnect() {
    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      this.reconnectAttempts++
      setTimeout(() => {
        console.log(`Attempting to reconnect (${this.reconnectAttempts}/${this.maxReconnectAttempts})...`)
        // On first reconnect attempt, try alternate URL if available
        if (this.reconnectAttempts === 1 && this.altUrl) {
          console.log(`Switching WebSocket URL to ${this.altUrl}`)
          this.url = this.altUrl
        }
        this.connect()
      }, this.reconnectDelay * this.reconnectAttempts)
    } else {
      console.error('Max reconnection attempts reached')
      this.emit('reconnect_failed', {})
    }
  }

  disconnect() {
    if (this.ws) {
      this.ws.close()
      this.ws = null
    }
    this.isConnected = false
    this.listeners.clear()
  }

  ping() {
    this.send({ type: 'ping' })
  }
}

// Singleton instance
let wsClient = null

export const getWebSocketClient = () => {
  if (!wsClient) {
    wsClient = new WebSocketClient()
  }
  return wsClient
}

export default WebSocketClient

