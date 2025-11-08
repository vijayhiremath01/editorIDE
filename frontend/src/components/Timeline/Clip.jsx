import { useState, useRef } from 'react'
import { useDrag } from 'react-dnd'
import { motion } from 'framer-motion'
import { timelineAPI } from '../../api/editing'
import useTimelineStore from '../../store/timelineStore'

const Clip = ({ clip, scale, trackType, trackId, onUpdate, isSelected, onSelect }) => {
  const [isDragging, setIsDragging] = useState(false)
  const [isResizing, setIsResizing] = useState(null)
  const clipRef = useRef(null)
  const { projectId } = useTimelineStore()

  const [{ isDragging: isDragActive }, drag] = useDrag({
    type: 'clip',
    item: () => {
      setIsDragging(true)
      // Include trackId so drop targets can move across tracks accurately
      return { ...clip, trackId }
    },
    end: () => {
      setIsDragging(false)
    },
    collect: (monitor) => ({
      isDragging: monitor.isDragging()
    })
  })

  const handleResize = (side, e) => {
    e.stopPropagation()
    if (!clipRef.current) return
    
    setIsResizing(side)
    const startX = e.clientX
    const startWidth = clipRef.current.offsetWidth
    const startStart = clip.start
    const startEnd = clip.end

    const handleMouseMove = async (e) => {
      const deltaX = e.clientX - startX
      const deltaTime = deltaX / scale
      
      if (side === 'left') {
        const newStart = Math.max(0, startStart + deltaTime)
        const newEnd = clip.end
        if (newEnd - newStart > 0.5) {
          const updates = { start: newStart, end: newEnd }
          onUpdate(updates)
        }
      } else if (side === 'right') {
        const newEnd = startEnd + deltaTime
        if (newEnd - clip.start > 0.5) {
          const updates = { end: newEnd }
          onUpdate(updates)
        }
      }
    }

    const handleMouseUp = async () => {
      setIsResizing(null)
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
      
      // Sync with backend
      try {
        await timelineAPI.updateClip(projectId, trackId, clip.id, { start: clip.start, end: clip.end })
      } catch (error) {
        console.error('Error updating clip:', error)
      }
    }

    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)
  }
  
  const handleClick = (e) => {
    e.stopPropagation()
    onSelect()
  }

  const clipWidth = ((clip.end || clip.start + (clip.duration || 10)) - clip.start) * scale
  const clipLeft = clip.start * scale

  const bgColor = trackType === 'video' ? 'bg-sky-blue' : 'bg-sky-blue/70'

  return (
    <motion.div
      ref={(node) => {
        clipRef.current = node
        drag(node)
      }}
      className={`absolute h-12 rounded mx-1 cursor-move hover:ring-2 hover:ring-white transition-all ${
        bgColor
      } ${isDragActive ? 'opacity-50' : ''} ${isSelected ? 'ring-2 ring-sky-blue' : ''}`}
      style={{
        left: `${clipLeft}px`,
        width: `${clipWidth}px`,
      }}
      onClick={handleClick}
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      whileHover={{ scale: 1.02 }}
      whileDrag={{ scale: 1.05, zIndex: 50 }}
    >
      <div className="text-xs text-white px-2 py-1 truncate h-full flex items-center pointer-events-none">
        {clip.name || clip.content || clip.file?.name || 'Clip'}
      </div>
      
      {/* Resize handles */}
      <div
        className="absolute left-0 top-0 bottom-0 w-1 bg-white/50 cursor-ew-resize hover:bg-white"
        onMouseDown={(e) => handleResize('left', e)}
      />
      <div
        className="absolute right-0 top-0 bottom-0 w-1 bg-white/50 cursor-ew-resize hover:bg-white"
        onMouseDown={(e) => handleResize('right', e)}
      />
    </motion.div>
  )
}

export default Clip

