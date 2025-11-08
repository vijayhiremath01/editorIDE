import axios from 'axios'

const getBackendURL = () => {
  if (import.meta.env?.VITE_API_URL) {
    return import.meta.env.VITE_API_URL
  }
  
  if (typeof window !== 'undefined') {
    const hostname = window.location.hostname
    if (hostname.includes('replit.dev')) {
      const protocol = window.location.protocol
      return `${protocol}//${hostname}:3001`
    }
  }
  
  return 'http://localhost:3001'
}

export const API_BASE_URL = getBackendURL()

export const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
  timeout: 300000, // 5 minutes for video processing
})

// Request interceptor
api.interceptors.request.use(
  (config) => {
    return config
  },
  (error) => {
    return Promise.reject(error)
  }
)

// Response interceptor
api.interceptors.response.use(
  (response) => {
    return response
  },
  (error) => {
    console.error('API Error:', error)
    return Promise.reject(error)
  }
)

export default api

