import { useState, useRef, useEffect } from 'react'
import ReactPlayer from 'react-player'
import { ZoomIn, ZoomOut, Play, Pause } from 'lucide-react'
import TextOverlay from './TextOverlay'
import useTimelineStore from '../store/timelineStore'
import { api } from '../api/client'

const VideoCanvas = ({ selectedFile, onTimeUpdate, currentTime }) => {
  const [zoomLevel, setZoomLevel] = useState(100)
  const [playing, setPlaying] = useState(false)
  const playerRef = useRef(null)
  const canvasRef = useRef(null)
  
  const { timeline, selectedClip, selectClip, updateClip, removeClip } = useTimelineStore()
  
  // Get text clips active at current time
  const activeTextClips = timeline.tracks
    .filter(track => track.type === 'text')
    .flatMap(track => track.clips.filter(clip => 
      clip.start <= currentTime && clip.end >= currentTime
    ))

  const handleZoomChange = (level) => {
    setZoomLevel(Math.max(50, Math.min(200, level)))
  }

  const getFileUrl = (file) => {
    if (!file) return null
    return `/api/media/${file.path}`
  }

  const handleProgress = (state) => {
    if (onTimeUpdate) {
      onTimeUpdate(state.playedSeconds)
    }
  }

  const handleSeek = (seconds) => {
    if (playerRef.current) {
      playerRef.current.seekTo(seconds, 'seconds')
    }
  }

  useEffect(() => {
    if (currentTime !== undefined && playerRef.current) {
      const currentPlayerTime = playerRef.current.getCurrentTime()
      if (Math.abs(currentPlayerTime - currentTime) > 0.5) {
        handleSeek(currentTime)
      }
    }
  }, [currentTime])

  return (
    <div className="flex-1 flex flex-col bg-charcoal p-4">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-medium text-gray-300">Preview</h3>
        <div className="flex items-center gap-2">
          <button
            onClick={() => handleZoomChange(zoomLevel - 25)}
            className="p-2 hover:bg-light-gray rounded transition-colors"
            title="Zoom Out"
          >
            <ZoomOut className="w-4 h-4" />
          </button>
          <span className="text-xs text-gray-400 min-w-[50px] text-center">{zoomLevel}%</span>
          <button
            onClick={() => handleZoomChange(zoomLevel + 25)}
            className="p-2 hover:bg-light-gray rounded transition-colors"
            title="Zoom In"
          >
            <ZoomIn className="w-4 h-4" />
          </button>
          <button
            onClick={() => setZoomLevel(100)}
            className="px-3 py-1 text-xs bg-light-gray hover:bg-gray-500 rounded transition-colors"
          >
            Fit
          </button>
          <button
            onClick={() => setPlaying(!playing)}
            className="p-2 hover:bg-light-gray rounded transition-colors"
            title={playing ? "Pause" : "Play"}
          >
            {playing ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
          </button>
        </div>
      </div>
      
      <div className="flex-1 bg-black rounded-lg overflow-hidden flex items-center justify-center relative" ref={canvasRef}>
        {selectedFile && selectedFile.type === 'video' ? (
          <div 
            style={{ 
              transform: `scale(${zoomLevel / 100})`, 
              transformOrigin: 'center',
              width: '100%',
              height: '100%',
              position: 'relative'
            }}
            className="flex items-center justify-center"
          >
            <ReactPlayer
              ref={playerRef}
              url={getFileUrl(selectedFile)}
              playing={playing}
              controls
              width="100%"
              height="100%"
              onProgress={handleProgress}
              onPlay={() => setPlaying(true)}
              onPause={() => setPlaying(false)}
              config={{
                file: {
                  attributes: {
                    controlsList: 'nodownload'
                  }
                }
              }}
            />
            
            {/* Text Overlays */}
            <div className="absolute inset-0 pointer-events-none" style={{ pointerEvents: selectedClip ? 'auto' : 'none' }}>
              {activeTextClips.map(clip => (
                <TextOverlay
                  key={clip.id}
                  clip={clip}
                  onUpdate={(updated) => {
                    const track = timeline.tracks.find(t => t.clips.some(c => c.id === clip.id))
                    if (track) {
                      updateClip(track.id, clip.id, updated)
                    }
                  }}
                  onDelete={(clipId) => {
                    const track = timeline.tracks.find(t => t.clips.some(c => c.id === clipId))
                    if (track) {
                      removeClip(track.id, clipId)
                    }
                  }}
                  isSelected={selectedClip?.id === clip.id}
                  onSelect={selectClip}
                />
              ))}
            </div>
          </div>
        ) : selectedFile && selectedFile.type === 'audio' ? (
          <div className="w-full max-w-md p-8">
            <ReactPlayer
              ref={playerRef}
              url={getFileUrl(selectedFile)}
              playing={playing}
              controls
              width="100%"
              height="54px"
              onPlay={() => setPlaying(true)}
              onPause={() => setPlaying(false)}
            />
            <div className="text-center mt-4">
              <p className="text-gray-300">{selectedFile.name}</p>
              <p className="text-sm text-gray-400 mt-2">Audio file</p>
            </div>
          </div>
        ) : selectedFile ? (
          <div className="text-gray-400 text-center p-8">
            <p>Preview not available for this file type</p>
            <p className="text-sm mt-2">{selectedFile.name}</p>
          </div>
        ) : (
          <div className="text-gray-400 text-center">
            <p>Select a file to preview</p>
            <p className="text-sm mt-2 text-gray-500">Video and audio files are supported</p>
          </div>
        )}
      </div>
    </div>
  )
}

export default VideoCanvas
