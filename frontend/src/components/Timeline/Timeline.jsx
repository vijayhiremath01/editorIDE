import { useState, useRef, useEffect } from 'react'
import { DndProvider } from 'react-dnd'
import { HTML5Backend } from 'react-dnd-html5-backend'
import Track from './Track'
import useTimelineStore from '../../store/timelineStore'
import { videoAPI, audioAPI, timelineAPI } from '../../api/editing'

const Timeline = ({ onTimeUpdate, currentTime }) => {
  const timelineRef = useRef(null)
  const {
    timeline,
    scale,
    snapGrid,
    setScale,
    setSnapGrid,
    setCurrentTime,
    projectId,
    addClip
  } = useTimelineStore()
  
  const tracks = timeline.tracks || []
  const clips = tracks.flatMap(track => track.clips || [])

  const handleTimelineClick = (e) => {
    if (!timelineRef.current) return
    const rect = timelineRef.current.getBoundingClientRect()
    const x = e.clientX - rect.left - 64 // Account for track label width
    const time = (x / scale)
    const snappedTime = Math.round(time / snapGrid) * snapGrid
    if (onTimeUpdate) {
      onTimeUpdate(Math.max(0, snappedTime))
    }
  }

  const handleClipDrop = async (item, trackId, position) => {
    const time = position / scale
    const snappedTime = Math.round(time / snapGrid) * snapGrid
    
    // Get video metadata to determine actual duration
    let actualDuration = item.duration || 10
    try {
      if (item.type === 'video') {
        const metadata = await videoAPI.getMetadata(item.full_path)
        actualDuration = metadata.duration || 10
      } else if (item.type === 'audio') {
        const metadata = await audioAPI.getMetadata(item.full_path)
        actualDuration = metadata.duration || 10
      }
    } catch (e) {
      console.warn('Could not get metadata, using default duration:', e)
    }
    
    const newClip = {
      ...item,
      id: `${item.id}-${Date.now()}`,
      start: snappedTime,
      end: snappedTime + actualDuration,
      trackId: trackId
    }
    
    // Add to local timeline store so it renders immediately
    addClip(trackId, newClip)

    // If dropping a video onto video track, also add a linked audio clip on the audio track
    try {
      const videoTrack = tracks.find(t => t.id === trackId)
      const audioTrack = tracks.find(t => t.type === 'audio')
      if (videoTrack?.type === 'video' && audioTrack && item.type === 'video') {
        const audioClip = {
          ...item,
          id: `${item.id}-audio-${Date.now()}`,
          start: snappedTime,
          end: snappedTime + actualDuration,
          trackId: audioTrack.id,
          type: 'audio',
          name: `${item.name} (audio)`,
          linkedId: newClip.id
        }
        // Link back from video to audio
        newClip.linkedId = audioClip.id
        addClip(audioTrack.id, audioClip)
        // Sync audio clip as well
        await timelineAPI.addClip(projectId || 'default', audioTrack.id, audioClip)
      }
    } catch (e) {
      console.error('Error adding linked audio clip:', e)
    }
    
    // Sync with backend timeline
    try {
      await timelineAPI.addClip(projectId || 'default', trackId, newClip)
    } catch (err) {
      console.error('Error syncing clip to backend:', err)
    }
  }

  const maxDuration = Math.max(
    ...clips.map(c => c.end || 0),
    (timeline && typeof timeline.duration === 'number' ? timeline.duration : 30),
    30
  )
  const timelineWidth = maxDuration * scale

  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60)
    const secs = Math.floor(seconds % 60)
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  return (
    <DndProvider backend={HTML5Backend}>
      <div className="h-64 border-t border-light-gray bg-dark-gray flex flex-col">
      <div className="p-4 border-b border-light-gray">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-medium text-gray-300">Timeline</h3>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setScale(Math.max(50, scale - 50))}
              className="px-2 py-1 text-xs bg-light-gray hover:bg-gray-500 rounded"
            >
              -
            </button>
            <span className="text-xs text-gray-400">{scale}px/s</span>
            <button
              onClick={() => setScale(Math.min(500, scale + 50))}
              className="px-2 py-1 text-xs bg-light-gray hover:bg-gray-500 rounded"
            >
              +
            </button>
            {/* Zoom slider for fine control */}
            <input
              type="range"
              min={50}
              max={500}
              step={10}
              value={scale}
              onChange={(e) => setScale(Number(e.target.value))}
              className="ml-2 w-32"
              title="Timeline zoom"
            />
            <div className="ml-4 flex items-center gap-2">
              <span className="text-xs text-gray-400">Snap:</span>
              <button
                onClick={() => setSnapGrid(snapGrid === 1 ? 0.5 : snapGrid === 0.5 ? 0.1 : 1)}
                className="px-2 py-1 text-xs bg-light-gray hover:bg-gray-500 rounded"
              >
                {snapGrid}s
              </button>
            </div>
          </div>
        </div>
      </div>
        
        <div className="flex-1 overflow-x-auto overflow-y-hidden">
          <div className="relative h-full min-w-full" style={{ minWidth: `${timelineWidth + 64}px` }}>
            {/* Time ruler */}
            <div className="h-6 border-b border-light-gray flex items-center px-2 bg-charcoal sticky top-0 z-20" style={{ paddingLeft: '64px' }}>
              {Array.from({ length: Math.ceil(maxDuration / 5) + 1 }, (_, i) => i * 5).map(time => (
                <div
                  key={time}
                  className="absolute text-xs text-gray-400"
                  style={{ left: `${64 + time * scale}px` }}
                >
                  {formatTime(time)}
                </div>
              ))}
            </div>
            
            {/* Tracks */}
            <div className="absolute top-6 left-0 right-0 bottom-0">
              {tracks.map((track) => (
                <Track
                  key={track.id}
                  track={track}
                  scale={scale}
                  timelineRef={timelineRef}
                  onTimelineClick={handleTimelineClick}
                  onClipDrop={handleClipDrop}
                  currentTime={currentTime}
                />
              ))}
              
              {/* Playhead */}
              {currentTime !== undefined && (
                <div
                  className="absolute top-0 bottom-0 w-0.5 bg-white z-30 pointer-events-none"
                  style={{ left: `${64 + currentTime * scale}px` }}
                >
                  <div className="absolute -top-1 left-1/2 transform -translate-x-1/2 w-0 h-0 border-l-4 border-r-4 border-t-4 border-transparent border-t-white" />
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </DndProvider>
  )
}

export default Timeline

