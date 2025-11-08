const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs-extra');
const ffmpeg = require('fluent-ffmpeg');

// Configure FFmpeg path if specified
if (process.env.FFMPEG_PATH) {
  ffmpeg.setFfmpegPath(process.env.FFMPEG_PATH);
}

// List all media files
router.get('/list', async (req, res) => {
  try {
    const uploadDir = process.env.UPLOAD_DIR || './media/uploads';
    const tempDir = process.env.TEMP_DIR || './media/temp';
    const outputDir = process.env.OUTPUT_DIR || './media/output';
    
    const mediaFiles = [];
    
    // Scan upload directory
    if (await fs.pathExists(uploadDir)) {
      const uploadFiles = await scanDirectory(uploadDir);
      mediaFiles.push(...uploadFiles);
    }
    
    // Scan temp directory
    if (await fs.pathExists(tempDir)) {
      const tempFiles = await scanDirectory(tempDir);
      mediaFiles.push(...tempFiles);
    }
    
    // Scan output directory
    if (await fs.pathExists(outputDir)) {
      const outputFiles = await scanDirectory(outputDir);
      mediaFiles.push(...outputFiles);
    }
    
    res.json({
      success: true,
      files: mediaFiles,
      count: mediaFiles.length
    });
    
  } catch (error) {
    console.error('Media list error:', error);
    res.status(500).json({ 
      error: 'Failed to list media files',
      details: error.message 
    });
  }
});

// Get file info with metadata
router.post('/info', async (req, res) => {
  try {
    const { filePath } = req.body;
    
    if (!filePath || !await fs.pathExists(filePath)) {
      return res.status(400).json({ error: 'File not found' });
    }

    const stats = await fs.stat(filePath);
    const ext = path.extname(filePath).toLowerCase();
    
    // Determine file type
    let type = 'unknown';
    if (['.mp4', '.avi', '.mov', '.mkv', '.webm', '.flv'].includes(ext)) {
      type = 'video';
    } else if (['.mp3', '.wav', '.aac', '.flac', '.m4a', '.ogg'].includes(ext)) {
      type = 'audio';
    } else if (['.jpg', '.jpeg', '.png', '.gif', '.bmp'].includes(ext)) {
      type = 'image';
    }
    
    const fileInfo = {
      name: path.basename(filePath),
      path: filePath,
      size: stats.size,
      type,
      extension: ext.slice(1),
      created: stats.birthtime,
      modified: stats.mtime
    };
    
    // Get media metadata if video/audio
    if (type === 'video' || type === 'audio') {
      try {
        const metadata = await getMediaMetadata(filePath);
        fileInfo.metadata = metadata;
      } catch (metadataError) {
        console.warn('Failed to get metadata for', filePath, metadataError.message);
      }
    }
    
    res.json({
      success: true,
      file: fileInfo
    });
    
  } catch (error) {
    console.error('File info error:', error);
    res.status(500).json({ 
      error: 'Failed to get file info',
      details: error.message 
    });
  }
});

// Delete media file
router.delete('/delete', async (req, res) => {
  try {
    const { filePath } = req.body;
    
    if (!filePath) {
      return res.status(400).json({ error: 'File path is required' });
    }
    
    if (!await fs.pathExists(filePath)) {
      return res.status(404).json({ error: 'File not found' });
    }
    
    // Security check - ensure file is in allowed directories
    const allowedDirs = [
      process.env.UPLOAD_DIR || './media/uploads',
      process.env.TEMP_DIR || './media/temp',
      process.env.OUTPUT_DIR || './media/output'
    ];
    
    const isInAllowedDir = allowedDirs.some(dir => 
      path.resolve(filePath).startsWith(path.resolve(dir))
    );
    
    if (!isInAllowedDir) {
      return res.status(403).json({ error: 'Cannot delete files outside media directories' });
    }
    
    await fs.remove(filePath);
    
    // Emit file deleted event
    req.app.get('io').emit('file_deleted', { filePath });
    
    res.json({
      success: true,
      message: 'File deleted successfully'
    });
    
  } catch (error) {
    console.error('Delete error:', error);
    res.status(500).json({ 
      error: 'Failed to delete file',
      details: error.message 
    });
  }
});

// Get media file (serve file)
router.get('/file/:filename', async (req, res) => {
  try {
    const { filename } = req.params;
    
    // Search for file in all media directories
    const searchDirs = [
      process.env.UPLOAD_DIR || './media/uploads',
      process.env.TEMP_DIR || './media/temp',
      process.env.OUTPUT_DIR || './media/output'
    ];
    
    let filePath = null;
    for (const dir of searchDirs) {
      const potentialPath = path.join(dir, filename);
      if (await fs.pathExists(potentialPath)) {
        filePath = potentialPath;
        break;
      }
    }
    
    if (!filePath) {
      return res.status(404).json({ error: 'File not found' });
    }
    
    // Security check
    const isInAllowedDir = searchDirs.some(dir => 
      path.resolve(filePath).startsWith(path.resolve(dir))
    );
    
    if (!isInAllowedDir) {
      return res.status(403).json({ error: 'Access denied' });
    }
    
    res.sendFile(path.resolve(filePath));
    
  } catch (error) {
    console.error('File serve error:', error);
    res.status(500).json({ 
      error: 'Failed to serve file',
      details: error.message 
    });
  }
});

// Helper function to scan directory recursively
async function scanDirectory(dir) {
  const files = [];
  
  async function scan(dir, relativePath = '') {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      const relPath = path.join(relativePath, entry.name);
      
      if (entry.isDirectory()) {
        await scan(fullPath, relPath);
      } else {
        // Check if it's a media file
        const ext = path.extname(entry.name).toLowerCase();
        const allowedExts = [
          '.mp4', '.avi', '.mov', '.mkv', '.webm', '.flv',
          '.mp3', '.wav', '.aac', '.flac', '.m4a', '.ogg',
          '.jpg', '.jpeg', '.png', '.gif', '.bmp'
        ];
        
        if (allowedExts.includes(ext)) {
          const stats = await fs.stat(fullPath);
          files.push({
            name: entry.name,
            path: relPath,
            fullPath,
            size: stats.size,
            type: getFileType(ext),
            created: stats.birthtime,
            modified: stats.mtime
          });
        }
      }
    }
  }
  
  await scan(dir);
  return files;
}

// Helper function to get file type
function getFileType(ext) {
  const videoExts = ['.mp4', '.avi', '.mov', '.mkv', '.webm', '.flv'];
  const audioExts = ['.mp3', '.wav', '.aac', '.flac', '.m4a', '.ogg'];
  const imageExts = ['.jpg', '.jpeg', '.png', '.gif', '.bmp'];
  
  if (videoExts.includes(ext)) return 'video';
  if (audioExts.includes(ext)) return 'audio';
  if (imageExts.includes(ext)) return 'image';
  return 'unknown';
}

// Helper function to get media metadata
function getMediaMetadata(filePath) {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(filePath, (err, metadata) => {
      if (err) {
        reject(err);
        return;
      }
      
      const videoStream = metadata.streams.find(s => s.codec_type === 'video');
      const audioStream = metadata.streams.find(s => s.codec_type === 'audio');
      
      resolve({
        duration: metadata.format.duration,
        format: metadata.format.format_name,
        video: videoStream ? {
          codec: videoStream.codec_name,
          width: videoStream.width,
          height: videoStream.height,
          fps: eval(videoStream.r_frame_rate),
          bitrate: videoStream.bit_rate
        } : null,
        audio: audioStream ? {
          codec: audioStream.codec_name,
          sampleRate: audioStream.sample_rate,
          channels: audioStream.channels,
          bitrate: audioStream.bit_rate
        } : null
      });
    });
  });
}

module.exports = router;