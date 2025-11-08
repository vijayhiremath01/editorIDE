const express = require('express');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs-extra');
const { v4: uuidv4 } = require('uuid');
const http = require('http');
const socketIo = require('socket.io');
require('dotenv').config();

const videoRoutes = require('./routes/video');
const audioRoutes = require('./routes/audio');
const aiRoutes = require('./routes/ai');
const mediaRoutes = require('./routes/media');
const timelineRoutes = require('./routes/timeline');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: process.env.FRONTEND_URL || "http://localhost:5173",
    methods: ["GET", "POST"]
  }
});

const PORT = process.env.PORT || 3001;

// Create necessary directories
const dirs = [
  process.env.UPLOAD_DIR || './media/uploads',
  process.env.TEMP_DIR || './media/temp',
  process.env.OUTPUT_DIR || './media/output'
];

dirs.forEach(dir => {
  fs.ensureDirSync(dir);
});

// Middleware
app.use(cors({
  origin: process.env.FRONTEND_URL || "http://localhost:5173",
  credentials: true
}));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Serve media statically for preview
app.use('/media', express.static(path.join(__dirname, 'media')));

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = process.env.UPLOAD_DIR || './media/uploads';
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueName = `${uuidv4()}_${file.originalname}`;
    cb(null, uniqueName);
  }
});

const fileFilter = (req, file, cb) => {
  const allowedVideoTypes = (process.env.ALLOWED_VIDEO_TYPES || 'mp4,avi,mov,mkv,webm').split(',');
  const allowedAudioTypes = (process.env.ALLOWED_AUDIO_TYPES || 'mp3,wav,aac,flac,m4a').split(',');
  
  const ext = path.extname(file.originalname).toLowerCase().slice(1);
  
  if (allowedVideoTypes.includes(ext) || allowedAudioTypes.includes(ext)) {
    cb(null, true);
  } else {
    cb(new Error('File type not allowed'), false);
  }
};

const upload = multer({ 
  storage, 
  fileFilter,
  limits: { 
    fileSize: parseSize(process.env.MAX_FILE_SIZE || '500MB') 
  } 
});

// Parse file size string (e.g., "500MB" -> bytes)
function parseSize(sizeStr) {
  const units = { B: 1, KB: 1024, MB: 1024**2, GB: 1024**3 };
  const match = sizeStr.match(/^(\d+)(B|KB|MB|GB)$/i);
  if (match) {
    return parseInt(match[1]) * units[match[2].toUpperCase()];
  }
  return 500 * 1024 * 1024; // Default 500MB
}

// Socket.IO connection handling
io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);
  
  socket.on('join-room', (roomId) => {
    socket.join(roomId);
    console.log(`Socket ${socket.id} joined room ${roomId}`);
  });
  
  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
  });
});

// Make io available to routes
app.set('io', io);

// Routes
app.use('/api/video', videoRoutes);
app.use('/api/audio', audioRoutes);
app.use('/api/ai', aiRoutes);
app.use('/api/media', mediaRoutes);
app.use('/api/timeline', timelineRoutes);

// File upload endpoint
app.post('/api/upload', upload.single('file'), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }
    
    const fileInfo = {
      id: uuidv4(),
      name: req.file.originalname,
      path: req.file.path,
      size: req.file.size,
      type: req.file.mimetype.startsWith('video/') ? 'video' : 'audio',
      uploadTime: new Date().toISOString()
    };
    
    // Emit file added event
    io.emit('file_added', fileInfo);
    
    res.json({
      success: true,
      file: fileInfo
    });
  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({ error: 'Upload failed' });
  }
});

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    ffmpeg: process.env.FFMPEG_PATH || 'ffmpeg'
  });
});

// Error handling middleware
app.use((error, req, res, next) => {
  console.error('Server error:', error);
  
  if (error instanceof multer.MulterError) {
    if (error.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ error: 'File too large' });
    }
  }
  
  res.status(500).json({ 
    error: error.message || 'Internal server error',
    timestamp: new Date().toISOString()
  });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

server.listen(PORT, () => {
  console.log(`🚀 AI Video Editor Backend running on port ${PORT}`);
  console.log(`📁 Upload directory: ${process.env.UPLOAD_DIR || './media/uploads'}`);
  console.log(`🔧 FFmpeg path: ${process.env.FFMPEG_PATH || 'ffmpeg'}`);
});

module.exports = { app, io };