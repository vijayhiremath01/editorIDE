const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs-extra');
const { v4: uuidv4 } = require('uuid');

// In-memory timeline storage (persisted to disk under backend/node/projects)
const timelines = new Map();
const projectsDir = process.env.PROJECTS_DIR || path.join(__dirname, '..', 'projects');
fs.ensureDirSync(projectsDir);
const projectPath = (id) => path.join(projectsDir, `${id}.json`);
const loadProject = async (id) => {
  const p = projectPath(id);
  if (await fs.pathExists(p)) {
    const data = await fs.readJson(p);
    timelines.set(id, data);
    return data;
  }
  return null;
};
const saveProject = async (id, data) => {
  const p = projectPath(id);
  await fs.writeJson(p, data, { spaces: 2 });
};

// Create or get timeline
router.post('/create-project', async (req, res) => {
  try {
    const { project_id } = req.body;
    
    if (!project_id) {
      return res.status(400).json({ error: 'Project ID is required' });
    }
    
    // Load existing project if present
    let timeline = timelines.get(project_id) || await loadProject(project_id);
    
    if (!timeline) {
      timeline = {
        id: project_id,
        name: `Project ${project_id}`,
        duration: 300, // 5 minutes default
        tracks: [
          { id: 'video-1', name: 'Video 1', type: 'video', clips: [] },
          { id: 'audio-1', name: 'Audio 1', type: 'audio', clips: [] },
          { id: 'text-1', name: 'Text 1', type: 'text', clips: [] }
        ],
        created: new Date().toISOString(),
        modified: new Date().toISOString()
      };
    }
    
    timelines.set(project_id, timeline);
    await saveProject(project_id, timeline);
    
    res.json({ success: true, timeline });
    
  } catch (error) {
    console.error('Create project error:', error);
    res.status(500).json({ 
      error: 'Failed to create project',
      details: error.message 
    });
  }
});

// Get timeline
router.get('/project/:project_id', async (req, res) => {
  try {
    const { project_id } = req.params;
    
    let timeline = timelines.get(project_id);
    if (!timeline) {
      timeline = await loadProject(project_id);
    }
    
    if (!timeline) {
      return res.status(404).json({ error: 'Project not found' });
    }
    
    res.json({ success: true, timeline });
    
  } catch (error) {
    console.error('Get project error:', error);
    res.status(500).json({ 
      error: 'Failed to get project',
      details: error.message 
    });
  }
});

// Add clip to timeline
router.post('/add-clip', async (req, res) => {
  try {
    const { project_id, track_id, clip } = req.body;
    
    if (!project_id || !track_id || !clip) {
      return res.status(400).json({ error: 'Missing required parameters' });
    }
    
    const timeline = timelines.get(project_id);
    
    if (!timeline) {
      return res.status(404).json({ error: 'Project not found' });
    }
    
    const track = timeline.tracks.find(t => t.id === track_id);
    
    if (!track) {
      return res.status(404).json({ error: 'Track not found' });
    }
    
    // Add clip to track
    track.clips.push({
      id: clip.id || uuidv4(),
      name: clip.name,
      type: clip.type,
      start: clip.start || 0,
      end: clip.end || 10,
      duration: (clip.end || 10) - (clip.start || 0),
      filePath: clip.filePath,
      linkedId: clip.linkedId,
      ...clip
    });
    
    timeline.modified = new Date().toISOString();
    await saveProject(project_id, timeline);
    
    // Emit timeline update
    req.app.get('io').emit('timeline_updated', { project_id, timeline });
    
    res.json({ success: true, timeline });
    
  } catch (error) {
    console.error('Add clip error:', error);
    res.status(500).json({ 
      error: 'Failed to add clip',
      details: error.message 
    });
  }
});

// Remove clip from timeline
router.post('/remove-clip', async (req, res) => {
  try {
    const { project_id, track_id, clip_id } = req.body;
    
    if (!project_id || !track_id || !clip_id) {
      return res.status(400).json({ error: 'Missing required parameters' });
    }
    
    const timeline = timelines.get(project_id);
    
    if (!timeline) {
      return res.status(404).json({ error: 'Project not found' });
    }
    
    const track = timeline.tracks.find(t => t.id === track_id);
    
    if (!track) {
      return res.status(404).json({ error: 'Track not found' });
    }
    
    // Remove clip from track
    track.clips = track.clips.filter(clip => clip.id !== clip_id);
    
    timeline.modified = new Date().toISOString();
    await saveProject(project_id, timeline);
    
    // Emit timeline update
    req.app.get('io').emit('timeline_updated', { project_id, timeline });
    
    res.json({ success: true, timeline });
    
  } catch (error) {
    console.error('Remove clip error:', error);
    res.status(500).json({ 
      error: 'Failed to remove clip',
      details: error.message 
    });
  }
});

// Update clip
router.post('/update-clip', async (req, res) => {
  try {
    const { project_id, track_id, clip_id, updates } = req.body;
    
    if (!project_id || !track_id || !clip_id || !updates) {
      return res.status(400).json({ error: 'Missing required parameters' });
    }
    
    const timeline = timelines.get(project_id);
    
    if (!timeline) {
      return res.status(404).json({ error: 'Project not found' });
    }
    
    const track = timeline.tracks.find(t => t.id === track_id);
    
    if (!track) {
      return res.status(404).json({ error: 'Track not found' });
    }
    
    // Find and update clip
    const clipIndex = track.clips.findIndex(clip => clip.id === clip_id);
    
    if (clipIndex === -1) {
      return res.status(404).json({ error: 'Clip not found' });
    }
    
    track.clips[clipIndex] = {
      ...track.clips[clipIndex],
      ...updates,
      modified: new Date().toISOString()
    };
    
    timeline.modified = new Date().toISOString();
    await saveProject(project_id, timeline);
    
    // Emit timeline update
    req.app.get('io').emit('timeline_updated', { project_id, timeline });
    
    res.json({ success: true, timeline });
    
  } catch (error) {
    console.error('Update clip error:', error);
    res.status(500).json({ 
      error: 'Failed to update clip',
      details: error.message 
    });
  }
});

// Export timeline (generate final video)
router.post('/export', async (req, res) => {
  try {
    const { project_id, format = 'mp4', quality = 'high' } = req.body;
    
    if (!project_id) {
      return res.status(400).json({ error: 'Project ID is required' });
    }
    
    const timeline = timelines.get(project_id);
    
    if (!timeline) {
      return res.status(404).json({ error: 'Project not found' });
    }
    
    // This is a placeholder for timeline export
    // In a real implementation, you would:
    // 1. Process all clips in order
    // 2. Apply effects and transitions
    // 3. Combine audio tracks
    // 4. Generate final output
    
    const outputDir = process.env.OUTPUT_DIR || './media/output';
    const outputPath = path.join(outputDir, `export_${project_id}_${Date.now()}.${format}`);
    
    // For now, just return a placeholder
    res.json({
      success: true,
      message: 'Timeline export started',
      outputPath,
      timeline: timeline
    });
    
  } catch (error) {
    console.error('Export error:', error);
    res.status(500).json({ 
      error: 'Failed to export timeline',
      details: error.message 
    });
  }
});

// Get all projects
router.get('/projects', async (req, res) => {
  try {
    const projectList = Array.from(timelines.values()).map(timeline => ({
      id: timeline.id,
      name: timeline.name,
      duration: timeline.duration,
      trackCount: timeline.tracks.length,
      clipCount: timeline.tracks.reduce((sum, track) => sum + track.clips.length, 0),
      created: timeline.created,
      modified: timeline.modified
    }));
    
    res.json({
      success: true,
      projects: projectList
    });
    
  } catch (error) {
    console.error('Projects list error:', error);
    res.status(500).json({ 
      error: 'Failed to list projects',
      details: error.message 
    });
  }
});

module.exports = router;