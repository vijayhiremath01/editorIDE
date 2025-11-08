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

// Get audio metadata
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

      const audioStream = metadata.streams.find(s => s.codec_type === 'audio');

      res.json({
        success: true,
        metadata: {
          duration: metadata.format.duration,
          size: metadata.format.size,
          format: metadata.format.format_name,
          audio: audioStream ? {
            codec: audioStream.codec_name,
            sampleRate: audioStream.sample_rate,
            channels: audioStream.channels,
            bitrate: audioStream.bit_rate,
            channelLayout: audioStream.channel_layout
          } : null
        }
      });
    });
  } catch (error) {
    console.error('Metadata error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Adjust audio volume
router.post('/volume', async (req, res) => {
  try {
    const { filePath, volumeDb } = req.body;
    
    if (!filePath || !await fs.pathExists(filePath)) {
      return res.status(400).json({ error: 'File not found' });
    }

    const outputDir = process.env.TEMP_DIR || './media/temp';
    const fileName = path.basename(filePath, path.extname(filePath));
    const ext = path.extname(filePath);
    const outputPath = path.join(outputDir, `${fileName}_volume_${volumeDb}dB_${uuidv4()}${ext}`);

    // Convert dB to linear scale for FFmpeg
    const volumeLinear = Math.pow(10, volumeDb / 20);

    ffmpeg(filePath)
      .outputOptions([
        `-filter:a volume=${volumeLinear}`,
        '-c:a aac'
      ])
      .output(outputPath)
      .on('start', (commandLine) => {
        console.log('FFmpeg command:', commandLine);
      })
      .on('progress', (progress) => {
        console.log(`Processing: ${progress.percent}% done`);
        req.app.get('io').emit('progress', {
          type: 'volume',
          percent: progress.percent
        });
      })
      .on('end', () => {
        console.log('Volume adjustment completed successfully');
        res.json({
          success: true,
          outputPath,
          volumeDb,
          volumeLinear
        });
      })
      .on('error', (err) => {
        console.error('FFmpeg error:', err);
        res.status(500).json({ error: 'Volume adjustment failed', details: err.message });
      })
      .run();

  } catch (error) {
    console.error('Volume error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Trim audio
router.post('/trim', async (req, res) => {
  try {
    const { filePath, startTime, endTime } = req.body;
    
    if (!filePath || !await fs.pathExists(filePath)) {
      return res.status(400).json({ error: 'File not found' });
    }

    const outputDir = process.env.TEMP_DIR || './media/temp';
    const fileName = path.basename(filePath, path.extname(filePath));
    const ext = path.extname(filePath);
    const outputPath = path.join(outputDir, `${fileName}_trimmed_${uuidv4()}${ext}`);

    let command = ffmpeg(filePath)
      .setStartTime(startTime);

    if (endTime) {
      command = command.setDuration(endTime - startTime);
    }

    command
      .output(outputPath)
      .outputOptions([
        '-c:a copy'
      ])
      .on('start', (commandLine) => {
        console.log('FFmpeg command:', commandLine);
      })
      .on('progress', (progress) => {
        console.log(`Processing: ${progress.percent}% done`);
        req.app.get('io').emit('progress', {
          type: 'trim',
          percent: progress.percent
        });
      })
      .on('end', () => {
        console.log('Trim completed successfully');
        res.json({
          success: true,
          outputPath,
          startTime,
          endTime
        });
      })
      .on('error', (err) => {
        console.error('FFmpeg error:', err);
        res.status(500).json({ error: 'Trim failed', details: err.message });
      })
      .run();

  } catch (error) {
    console.error('Trim error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Generate waveform data for visualization
router.post('/waveform', async (req, res) => {
  try {
    const { filePath, width = 800, height = 200 } = req.body;
    
    if (!filePath || !await fs.pathExists(filePath)) {
      return res.status(400).json({ error: 'File not found' });
    }

    const outputDir = process.env.TEMP_DIR || './media/temp';
    const fileName = path.basename(filePath, path.extname(filePath));
    const waveformPath = path.join(outputDir, `${fileName}_waveform_${uuidv4()}.png`);

    ffmpeg(filePath)
      .outputOptions([
        '-filter_complex showwavespic=s=${width}x${height}:colors=blue',
        '-frames:v 1'
      ])
      .output(waveformPath)
      .on('start', (commandLine) => {
        console.log('FFmpeg command:', commandLine);
      })
      .on('end', () => {
        console.log('Waveform generation completed successfully');
        res.json({
          success: true,
          waveformPath,
          width,
          height
        });
      })
      .on('error', (err) => {
        console.error('FFmpeg error:', err);
        res.status(500).json({ error: 'Waveform generation failed', details: err.message });
      })
      .run();

  } catch (error) {
    console.error('Waveform error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Extract audio from video
router.post('/extract', async (req, res) => {
  try {
    const { filePath, format = 'wav' } = req.body;
    
    if (!filePath || !await fs.pathExists(filePath)) {
      return res.status(400).json({ error: 'File not found' });
    }

    const outputDir = process.env.TEMP_DIR || './media/temp';
    const fileName = path.basename(filePath, path.extname(filePath));
    const outputPath = path.join(outputDir, `${fileName}_audio_${uuidv4()}.${format}`);

    ffmpeg(filePath)
      .noVideo()
      .outputOptions([
        '-c:a pcm_s16le' // Use PCM for WAV, will be overridden by format
      ])
      .format(format)
      .output(outputPath)
      .on('start', (commandLine) => {
        console.log('FFmpeg command:', commandLine);
      })
      .on('progress', (progress) => {
        console.log(`Processing: ${progress.percent}% done`);
        req.app.get('io').emit('progress', {
          type: 'extract',
          percent: progress.percent
        });
      })
      .on('end', () => {
        console.log('Audio extraction completed successfully');
        res.json({
          success: true,
          outputPath,
          format
        });
      })
      .on('error', (err) => {
        console.error('FFmpeg error:', err);
        res.status(500).json({ error: 'Audio extraction failed', details: err.message });
      })
      .run();

  } catch (error) {
    console.error('Extract error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Fade in/out audio
router.post('/fade', async (req, res) => {
  try {
    const { filePath, fadeIn = 0, fadeOut = 0 } = req.body;
    
    if (!filePath || !await fs.pathExists(filePath)) {
      return res.status(400).json({ error: 'File not found' });
    }

    const outputDir = process.env.TEMP_DIR || './media/temp';
    const fileName = path.basename(filePath, path.extname(filePath));
    const ext = path.extname(filePath);
    const outputPath = path.join(outputDir, `${fileName}_fade_${uuidv4()}${ext}`);

    let filter = '';
    if (fadeIn > 0) {
      filter += `afade=t=in:st=0:d=${fadeIn}`;
    }
    if (fadeOut > 0) {
      if (filter) filter += ',';
      filter += `afade=t=out:st=0:d=${fadeOut}`; // Will need duration for proper fade out
    }

    ffmpeg(filePath)
      .outputOptions([
        `-filter:a ${filter}`,
        '-c:a aac'
      ])
      .output(outputPath)
      .on('start', (commandLine) => {
        console.log('FFmpeg command:', commandLine);
      })
      .on('progress', (progress) => {
        console.log(`Processing: ${progress.percent}% done`);
        req.app.get('io').emit('progress', {
          type: 'fade',
          percent: progress.percent
        });
      })
      .on('end', () => {
        console.log('Audio fade completed successfully');
        res.json({
          success: true,
          outputPath,
          fadeIn,
          fadeOut
        });
      })
      .on('error', (err) => {
        console.error('FFmpeg error:', err);
        res.status(500).json({ error: 'Audio fade failed', details: err.message });
      })
      .run();

  } catch (error) {
    console.error('Fade error:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;