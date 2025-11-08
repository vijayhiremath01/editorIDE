import { useState, useRef, useEffect } from 'react'

const Timeline = ({ selectedFile, currentTime, onTimeUpdate, duration }) => {
  const [clips, setClips] = useState([])
  const timelineRef = useRef(null)
  const [scale, setScale] = useState(100) // pixels per second
  const [selectedClip, setSelectedClip] = useState(null)

  useEffect(() => {
    if (selectedFile && selectedFile.type === 'video') {
      // Add a clip for the selected video
      const newClip = {
        id: selectedFile.full_path,
        name: selectedFile.name,
        start: 0,
        end: duration || 10,
        type: 'video',
        file: selectedFile
      }
      setClips([newClip])
      setSelectedClip(newClip.id)
    } else {
      setClips([])
      setSelectedClip(null)
    }
  }, [selectedFile, duration])

  const handleTimelineClick = (e) => {
    if (!timelineRef.current) return
    const rect = timelineRef.current.getBoundingClientRect()
    const x = e.clientX - rect.left
    const time = (x / scale)
    if (onTimeUpdate) {
      onTimeUpdate(Math.max(0, time))
    }
  }

  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60)
    const secs = Math.floor(seconds % 60)
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  const maxDuration = Math.max(...clips.map(c => c.end), duration || 10, 30)
  const timelineWidth = maxDuration * scale

  return (
    <div className="h-48 border-t border-light-gray bg-dark-gray flex flex-col">
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
          </div>
        </div>
      </div>
      
      <div className="flex-1 overflow-x-auto overflow-y-hidden">
        <div className="relative h-full min-w-full" style={{ minWidth: `${timelineWidth}px` }}>
          {/* Time ruler */}
          <div className="h-6 border-b border-light-gray flex items-center px-2 bg-charcoal sticky top-0 z-10">
            {Array.from({ length: Math.ceil(maxDuration / 5) + 1 }, (_, i) => i * 5).map(time => (
              <div
                key={time}
                className="absolute text-xs text-gray-400"
                style={{ left: `${time * scale}px` }}
              >
                {formatTime(time)}
              </div>
            ))}
          </div>
          
          {/* Video track */}
          <div className="h-16 border-b border-light-gray relative">
            <div className="absolute inset-0 flex items-center px-2">
              <div className="text-xs text-gray-400 w-16">Video</div>
            </div>
            <div 
              className="absolute top-6 left-16 right-0 h-10"
              ref={timelineRef}
              onClick={handleTimelineClick}
              style={{ cursor: 'pointer' }}
            >
              {clips.filter(c => c.type === 'video').map(clip => (
                <div
                  key={clip.id}
                  className={`absolute h-8 bg-sky-blue rounded mx-1 cursor-move hover:bg-sky-blue/80 transition-colors ${
                    selectedClip === clip.id ? 'ring-2 ring-white' : ''
                  }`}
                  style={{
                    left: `${clip.start * scale}px`,
                    width: `${(clip.end - clip.start) * scale}px`,
                  }}
                  onClick={(e) => {
                    e.stopPropagation()
                    setSelectedClip(clip.id)
                  }}
                  title={clip.name}
                >
                  <div className="text-xs text-white px-2 py-1 truncate">{clip.name}</div>
                </div>
              ))}
              
              {/* Playhead */}
              {currentTime !== undefined && (
                <div
                  className="absolute top-0 bottom-0 w-0.5 bg-white z-20 pointer-events-none"
                  style={{ left: `${currentTime * scale}px` }}
                >
                  <div className="absolute -top-1 left-1/2 transform -translate-x-1/2 w-0 h-0 border-l-4 border-r-4 border-t-4 border-transparent border-t-white" />
                </div>
              )}
            </div>
          </div>
          
          {/* Audio track */}
          <div className="h-16 relative">
            <div className="absolute inset-0 flex items-center px-2">
              <div className="text-xs text-gray-400 w-16">Audio</div>
            </div>
            <div className="absolute top-6 left-16 right-0 h-10">
              {clips.filter(c => c.type === 'audio' || c.type === 'video').map(clip => (
                <div
                  key={`${clip.id}-audio`}
                  className="absolute h-8 bg-sky-blue/70 rounded mx-1"
                  style={{
                    left: `${clip.start * scale}px`,
                    width: `${(clip.end - clip.start) * scale}px`,
                  }}
                  title={`${clip.name} (audio)`}
                />
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default Timeline

