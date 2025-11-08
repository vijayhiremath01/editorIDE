import axios from 'axios'

const REPLIT_DEV_DOMAIN = typeof process !== 'undefined' && process.env?.REPLIT_DEV_DOMAIN
const backendPort = 3001
const backendURL = REPLIT_DEV_DOMAIN 
  ? `https://${REPLIT_DEV_DOMAIN.split('-00-')[0]}-00-${REPLIT_DEV_DOMAIN.split('-00-')[1]}:${backendPort}`
  : `http://localhost:${backendPort}`

export const API_BASE_URL = import.meta.env?.VITE_API_URL || backendURL

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

