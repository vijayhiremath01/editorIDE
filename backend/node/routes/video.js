const express = require('express');
const router = express.Router();
const ffmpeg = require('fluent-ffmpeg');
const path = require('path');
const fs = require('fs-extra');
const { v4: uuidv4 } = require('uuid');

// Configure FFmpeg path if specified
if (process.env.FFMPEG_PATH) {
  ffmpeg.setFfmpegPath(process.env.FFMPEG_PATH);
}
if (process.env.FFPROBE_PATH) {
  ffmpeg.setFfprobePath(process.env.FFPROBE_PATH);
}

// Get video metadata
router.post('/metadata', async (req, res) => {
  try {
    const { filePath } = req.body;
    
    if (!filePath || !await fs.pathExists(filePath)) {
      return res.status(400).json({ error: 'File not found' });
    }

    ffmpeg.ffprobe(filePath, (err, metadata) => {
      if (err) {
        console.error('FFprobe error:', err);
        return res.status(500).json({ error: 'Failed to get metadata' });
      }

      const videoStream = metadata.streams.find(s => s.codec_type === 'video');
      const audioStream = metadata.streams.find(s => s.codec_type === 'audio');

      res.json({
        success: true,
        metadata: {
          duration: metadata.format.duration,
          size: metadata.format.size,
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
        }
      });
    });
  } catch (error) {
    console.error('Metadata error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Split video at specific time
router.post('/split', async (req, res) => {
  try {
    const { filePath, startTime, endTime } = req.body;
    
    if (!filePath || !await fs.pathExists(filePath)) {
      return res.status(400).json({ error: 'File not found' });
    }

    const outputDir = process.env.TEMP_DIR || './media/temp';
    const fileName = path.basename(filePath, path.extname(filePath));
    const ext = path.extname(filePath);
    const outputPath = path.join(outputDir, `${fileName}_split_${uuidv4()}${ext}`);

    let command = ffmpeg(filePath)
      .setStartTime(startTime);

    if (endTime) {
      command = command.setDuration(endTime - startTime);
    }

    command
      .output(outputPath)
      .outputOptions([
        '-c:v copy',
        '-c:a copy'
      ])
      .on('start', (commandLine) => {
        console.log('FFmpeg command:', commandLine);
      })
      .on('progress', (progress) => {
        console.log(`Processing: ${progress.percent}% done`);
        req.app.get('io').emit('progress', {
          type: 'split',
          percent: progress.percent
        });
      })
      .on('end', () => {
        console.log('Split completed successfully');
        res.json({
          success: true,
          outputPath,
          startTime,
          endTime
        });
      })
      .on('error', (err) => {
        console.error('FFmpeg error:', err);
        res.status(500).json({ error: 'Split failed', details: err.message });
      })
      .run();

  } catch (error) {
    console.error('Split error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Change video speed
router.post('/speed', async (req, res) => {
  try {
    const { filePath, speed } = req.body;
    
    if (!filePath || !await fs.pathExists(filePath)) {
      return res.status(400).json({ error: 'File not found' });
    }

    const outputDir = process.env.TEMP_DIR || './media/temp';
    const fileName = path.basename(filePath, path.extname(filePath));
    const ext = path.extname(filePath);
    const outputPath = path.join(outputDir, `${fileName}_speed_${speed}x_${uuidv4()}${ext}`);

    // For audio, we need to adjust both video and audio speed
    const videoFilter = `setpts=${1/speed}*PTS`;
    const audioFilter = `atempo=${speed}`;

    ffmpeg(filePath)
      .outputOptions([
        `-filter:v ${videoFilter}`,
        `-filter:a ${audioFilter}`,
        '-c:v libx264',
        '-c:a aac'
      ])
      .output(outputPath)
      .on('start', (commandLine) => {
        console.log('FFmpeg command:', commandLine);
      })
      .on('progress', (progress) => {
        console.log(`Processing: ${progress.percent}% done`);
        req.app.get('io').emit('progress', {
          type: 'speed',
          percent: progress.percent
        });
      })
      .on('end', () => {
        console.log('Speed change completed successfully');
        res.json({
          success: true,
          outputPath,
          speed
        });
      })
      .on('error', (err) => {
        console.error('FFmpeg error:', err);
        res.status(500).json({ error: 'Speed change failed', details: err.message });
      })
      .run();

  } catch (error) {
    console.error('Speed error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Crop video
router.post('/crop', async (req, res) => {
  try {
    const { filePath, x, y, width, height } = req.body;
    
    if (!filePath || !await fs.pathExists(filePath)) {
      return res.status(400).json({ error: 'File not found' });
    }

    const outputDir = process.env.TEMP_DIR || './media/temp';
    const fileName = path.basename(filePath, path.extname(filePath));
    const ext = path.extname(filePath);
    const outputPath = path.join(outputDir, `${fileName}_cropped_${uuidv4()}${ext}`);

    const cropFilter = `crop=${width}:${height}:${x}:${y}`;

    ffmpeg(filePath)
      .outputOptions([
        `-filter:v ${cropFilter}`,
        '-c:v libx264',
        '-c:a copy'
      ])
      .output(outputPath)
      .on('start', (commandLine) => {
        console.log('FFmpeg command:', commandLine);
      })
      .on('progress', (progress) => {
        console.log(`Processing: ${progress.percent}% done`);
        req.app.get('io').emit('progress', {
          type: 'crop',
          percent: progress.percent
        });
      })
      .on('end', () => {
        console.log('Crop completed successfully');
        res.json({
          success: true,
          outputPath,
          crop: { x, y, width, height }
        });
      })
      .on('error', (err) => {
        console.error('FFmpeg error:', err);
        res.status(500).json({ error: 'Crop failed', details: err.message });
      })
      .run();

  } catch (error) {
    console.error('Crop error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Add text overlay
router.post('/text', async (req, res) => {
  try {
    const { filePath, text, x = 50, y = 50, fontSize = 24, fontColor = 'white', fontfile } = req.body;
    
    if (!filePath || !await fs.pathExists(filePath)) {
      return res.status(400).json({ error: 'File not found' });
    }

    const outputDir = process.env.TEMP_DIR || './media/temp';
    const fileName = path.basename(filePath, path.extname(filePath));
    const ext = path.extname(filePath);
    const outputPath = path.join(outputDir, `${fileName}_text_${uuidv4()}${ext}`);

    let textFilter = `drawtext=text='${text}':x=${x}:y=${y}:fontsize=${fontSize}:fontcolor=${fontColor}`;
    
    if (fontfile && await fs.pathExists(fontfile)) {
      textFilter += `:fontfile=${fontfile}`;
    }

    ffmpeg(filePath)
      .outputOptions([
        `-filter:v ${textFilter}`,
        '-c:v libx264',
        '-c:a copy'
      ])
      .output(outputPath)
      .on('start', (commandLine) => {
        console.log('FFmpeg command:', commandLine);
      })
      .on('progress', (progress) => {
        console.log(`Processing: ${progress.percent}% done`);
        req.app.get('io').emit('progress', {
          type: 'text',
          percent: progress.percent
        });
      })
      .on('end', () => {
        console.log('Text overlay completed successfully');
        res.json({
          success: true,
          outputPath,
          text: { text, x, y, fontSize, fontColor }
        });
      })
      .on('error', (err) => {
        console.error('FFmpeg error:', err);
        res.status(500).json({ error: 'Text overlay failed', details: err.message });
      })
      .run();

  } catch (error) {
    console.error('Text overlay error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Picture-in-Picture (overlay video)
router.post('/pip', async (req, res) => {
  try {
    const { baseFilePath, overlayFilePath, x = 50, y = 50, width, height } = req.body;
    
    if (!baseFilePath || !overlayFilePath) {
      return res.status(400).json({ error: 'Both base and overlay files are required' });
    }

    if (!await fs.pathExists(baseFilePath) || !await fs.pathExists(overlayFilePath)) {
      return res.status(400).json({ error: 'One or both files not found' });
    }

    const outputDir = process.env.TEMP_DIR || './media/temp';
    const baseFileName = path.basename(baseFilePath, path.extname(baseFilePath));
    const ext = path.extname(baseFilePath);
    const outputPath = path.join(outputDir, `${baseFileName}_pip_${uuidv4()}${ext}`);

    let overlayFilter = `[1:v]scale=${width || 320}:${height || 240}[ovrl];[0:v][ovrl]overlay=${x}:${y}`;

    ffmpeg()
      .input(baseFilePath)
      .input(overlayFilePath)
      .complexFilter([overlayFilter])
      .outputOptions([
        '-c:v libx264',
        '-c:a copy'
      ])
      .output(outputPath)
      .on('start', (commandLine) => {
        console.log('FFmpeg command:', commandLine);
      })
      .on('progress', (progress) => {
        console.log(`Processing: ${progress.percent}% done`);
        req.app.get('io').emit('progress', {
          type: 'pip',
          percent: progress.percent
        });
      })
      .on('end', () => {
        console.log('Picture-in-Picture completed successfully');
        res.json({
          success: true,
          outputPath,
          pip: { x, y, width, height }
        });
      })
      .on('error', (err) => {
        console.error('FFmpeg error:', err);
        res.status(500).json({ error: 'Picture-in-Picture failed', details: err.message });
      })
      .run();

  } catch (error) {
    console.error('PIP error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Rotate video
router.post('/rotate', async (req, res) => {
  try {
    const { filePath, angle } = req.body;
    
    if (!filePath || !await fs.pathExists(filePath)) {
      return res.status(400).json({ error: 'File not found' });
    }

    const outputDir = process.env.TEMP_DIR || './media/temp';
    const fileName = path.basename(filePath, path.extname(filePath));
    const ext = path.extname(filePath);
    const outputPath = path.join(outputDir, `${fileName}_rotated_${angle}_${uuidv4()}${ext}`);

    const rotateFilter = `rotate=${angle * Math.PI / 180}`;

    ffmpeg(filePath)
      .outputOptions([
        `-filter:v ${rotateFilter}`,
        '-c:v libx264',
        '-c:a copy'
      ])
      .output(outputPath)
      .on('start', (commandLine) => {
        console.log('FFmpeg command:', commandLine);
      })
      .on('progress', (progress) => {
        console.log(`Processing: ${progress.percent}% done`);
        req.app.get('io').emit('progress', {
          type: 'rotate',
          percent: progress.percent
        });
      })
      .on('end', () => {
        console.log('Rotation completed successfully');
        res.json({
          success: true,
          outputPath,
          angle
        });
      })
      .on('error', (err) => {
        console.error('FFmpeg error:', err);
        res.status(500).json({ error: 'Rotation failed', details: err.message });
      })
      .run();

  } catch (error) {
    console.error('Rotate error:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;