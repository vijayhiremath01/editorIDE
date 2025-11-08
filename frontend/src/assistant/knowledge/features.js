// Simple knowledge base for AI Assistant. Used to explain how features work.
// This is static and can be extended with more detailed docs or markdown.

export const featureKnowledge = {
  split: {
    description: 'Split cuts a clip at the playhead into two segments.',
    implementation: 'Frontend updates the timeline store and backend timeline via remove/add or update calls as needed.',
    backend: 'Use /timeline/update-clip or split logic; video splitting can also be done via /apply-edit trim or /split.',
  },
  delete: {
    description: 'Delete removes the selected clip from the timeline.',
    implementation: 'Frontend removes from store and calls /timeline/remove-clip.',
    backend: 'Use /timeline/remove-clip with project_id, track_id, clip_id.',
  },
  text: {
    description: 'Text overlay adds a styled text clip at the playhead.',
    implementation: 'Frontend creates a text clip on the text track; VideoCanvas renders overlays when active.',
    backend: 'Sync via /timeline/add-clip to persist overlays.',
  },
  pip: {
    description: 'Picture-in-Picture overlays one video over another as a small window.',
    implementation: 'Triggered via toolbar, backend processes /pip; frontend can also render overlay clips.',
    backend: 'Use /pip with base and overlay paths, and optional position/size.',
  },
  crop: {
    description: 'Crop selects a region and outputs a cropped video.',
    implementation: 'Frontend triggers crop via toolbar; visual selection can be layered on the preview.',
    backend: 'Use /apply-edit with operation="crop" and parameters x,y,width,height.',
  }
}

export function getFeatureInfo(keyword) {
  const key = (keyword || '').toLowerCase()
  return featureKnowledge[key] || null
}