// Socket.IO-based real-time client for Node backend events (progress, timeline, media)
import { io } from 'socket.io-client'

const NODE_BASE = (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.VITE_API_URL) || 'http://localhost:3001'

class WebSocketClient {
  constructor(url = NODE_BASE) {
    this.url = url
    this.socket = null
    this.listeners = new Map()
    this.isConnected = false
  }

  connect() {
    this.socket = io(this.url, { transports: ['websocket'], withCredentials: true })

    this.socket.on('connect', () => {
      this.isConnected = true
      this.emit('connected', {})
    })

    this.socket.on('disconnect', () => {
      this.isConnected = false
      this.emit('disconnected', {})
    })

    // Bridge server events to local listeners
    ;['progress', 'timeline_updated', 'file_added', 'file_deleted'].forEach((evt) => {
      this.socket.on(evt, (data) => this.emit(evt, data))
    })
  }

  on(event, callback) {
    if (!this.listeners.has(event)) this.listeners.set(event, [])
    this.listeners.get(event).push(callback)
    return () => {
      const arr = this.listeners.get(event) || []
      const idx = arr.indexOf(callback)
      if (idx > -1) arr.splice(idx, 1)
    }
  }

  emit(event, data) {
    const arr = this.listeners.get(event) || []
    for (const cb of arr) {
      try { cb(data) } catch (e) { console.error(`Listener error for ${event}:`, e) }
    }
  }

  disconnect() {
    if (this.socket) {
      this.socket.disconnect()
      this.socket = null
    }
    this.isConnected = false
    this.listeners.clear()
  }
}

let wsClient = null
export const getWebSocketClient = () => {
  if (!wsClient) wsClient = new WebSocketClient()
  return wsClient
}

export default WebSocketClient

