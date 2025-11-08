import { useRef } from 'react'
import { useDrop } from 'react-dnd'
import Clip from './Clip'
import useTimelineStore from '../../store/timelineStore'
import { api } from '../../api/client'

const Track = ({ track, scale, timelineRef, onTimelineClick, onClipDrop, currentTime }) => {
  const { updateClip, selectClip, selectedClip, moveClip, setCurrentTime, snapGrid, projectId, toggleTrackMute, toggleTrackHidden } = useTimelineStore()
  const trackRef = useRef(null)

  const [{ isOver }, drop] = useDrop({
    accept: ['media-file', 'clip'],
    drop: async (item, monitor) => {
      if (!trackRef.current) return
      const rect = trackRef.current.getBoundingClientRect()
      const offset = monitor.getClientOffset()
      if (!offset) return
      const x = offset.x - rect.left - 64 // account for track label
      const time = x / scale
      const snappedTime = Math.round(time / snapGrid) * snapGrid

      // Handle dropping imported media to create a new clip
      if (item && item.type === 'media-file') {
        onClipDrop(item, track.id, x)
        setCurrentTime(Math.max(0, snappedTime))
        return
      }

      // Handle repositioning/moving an existing clip
      if (item && item.id) {
        const originalDuration = (item.end ?? (item.start + (item.duration || 10))) - item.start
        const newStart = Math.max(0, snappedTime)
        const newEnd = newStart + originalDuration
        if (item.trackId && item.trackId !== track.id) {
          // Move across tracks locally
          moveClip(item.id, item.trackId, track.id, newStart, newEnd)
          // Sync with backend: remove from old, add to new
          api.post('/timeline/remove-clip', {
            project_id: projectId || 'default',
            track_id: item.trackId,
            clip_id: item.id
          })
          .then(() => api.post('/timeline/add-clip', {
            project_id: projectId || 'default',
            track_id: track.id,
            clip: { ...item, start: newStart, end: newEnd, trackId: track.id }
          }))
          .catch((err) => {
            console.error('Error syncing move across tracks:', err)
          })
        } else {
          // Reposition within same track
          updateClip(track.id, item.id, { start: newStart, end: newEnd })
          // Sync with backend update
          api.post('/timeline/update-clip', {
            project_id: projectId || 'default',
            track_id: track.id,
            clip_id: item.id,
            updates: { start: newStart, end: newEnd }
          })
          .catch((err) => {
            console.error('Error syncing clip update:', err)
          })
        }
        setCurrentTime(newStart)
      }
    },
    collect: (monitor) => ({
      isOver: monitor.isOver()
    })
  })

  return (
    <div
      ref={(node) => {
        trackRef.current = node
        drop(node)
      }}
      className={`h-16 border-b border-light-gray relative ${
        isOver ? 'bg-sky-blue/10' : ''
      }`}
    >
      <div className="absolute inset-0 flex items-center">
        <div className="w-16 px-2 text-xs text-gray-400 border-r border-light-gray h-full flex items-center justify-between capitalize">
          <span>
            {track.type} {track.id.split('-')[1]}
          </span>
          <span className="flex gap-1">
            {/* Minimal mute/hide toggles */}
            <button
              className="text-gray-400 hover:text-white"
              title={track.muted ? 'Unmute' : 'Mute'}
              onClick={(e) => { e.stopPropagation(); toggleTrackMute(track.id) }}
            >
              {track.muted ? 'M' : 'm'}
            </button>
            <button
              className="text-gray-400 hover:text-white"
              title={track.hidden ? 'Show' : 'Hide'}
              onClick={(e) => { e.stopPropagation(); toggleTrackHidden(track.id) }}
            >
              {track.hidden ? 'H' : 'h'}
            </button>
          </span>
        </div>
        <div 
          className="flex-1 h-full relative"
          onClick={onTimelineClick}
          style={{ cursor: 'pointer' }}
        >
          {!track.hidden && track.clips.map(clip => (
            <Clip
              key={clip.id}
              clip={clip}
              scale={scale}
              trackType={track.type}
              trackId={track.id}
              onUpdate={(updates) => updateClip(track.id, clip.id, updates)}
              isSelected={selectedClip?.id === clip.id}
              onSelect={() => selectClip(clip, track.id)}
            />
          ))}
        </div>
      </div>
    </div>
  )
}

export default Track

