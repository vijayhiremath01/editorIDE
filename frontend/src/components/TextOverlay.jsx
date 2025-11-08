import { useState, useRef, useEffect } from 'react'
import { X, Move, Type } from 'lucide-react'

const TextOverlay = ({ clip, onUpdate, onDelete, isSelected, onSelect }) => {
  const [isEditing, setIsEditing] = useState(false)
  const [content, setContent] = useState(clip.content || '')
  const [position, setPosition] = useState(clip.position || { x: 50, y: 50 })
  const [isDragging, setIsDragging] = useState(false)
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 })
  const overlayRef = useRef(null)
  const textRef = useRef(null)

  useEffect(() => {
    setContent(clip.content || '')
    setPosition(clip.position || { x: 50, y: 50 })
  }, [clip])

  const handleMouseDown = (e) => {
    if (e.target === textRef.current || textRef.current?.contains(e.target)) {
      return // Don't drag when clicking on text
    }
    
    setIsDragging(true)
    const rect = overlayRef.current.getBoundingClientRect()
    setDragOffset({
      x: e.clientX - rect.left,
      y: e.clientY - rect.top
    })
    onSelect(clip)
  }

  const handleMouseMove = (e) => {
    if (!isDragging) return
    
    const container = overlayRef.current?.parentElement
    if (!container) return
    
    const containerRect = container.getBoundingClientRect()
    const newX = ((e.clientX - containerRect.left - dragOffset.x) / containerRect.width) * 100
    const newY = ((e.clientY - containerRect.top - dragOffset.y) / containerRect.height) * 100
    
    const clampedX = Math.max(0, Math.min(100, newX))
    const clampedY = Math.max(0, Math.min(100, newY))
    
    setPosition({ x: clampedX, y: clampedY })
  }

  const handleMouseUp = () => {
    if (isDragging) {
      setIsDragging(false)
      onUpdate({
        ...clip,
        position
      })
    }
  }

  useEffect(() => {
    if (isDragging) {
      document.addEventListener('mousemove', handleMouseMove)
      document.addEventListener('mouseup', handleMouseUp)
      return () => {
        document.removeEventListener('mousemove', handleMouseMove)
        document.removeEventListener('mouseup', handleMouseUp)
      }
    }
  }, [isDragging, dragOffset])

  const handleTextChange = (e) => {
    const newContent = e.target.textContent
    setContent(newContent)
  }

  const handleTextBlur = () => {
    setIsEditing(false)
    onUpdate({
      ...clip,
      content,
      position
    })
  }

  const handleTextFocus = () => {
    setIsEditing(true)
    onSelect(clip)
  }

  const handleDoubleClick = () => {
    setIsEditing(true)
    // Focus the editable text element on double click
    if (textRef.current) {
      const el = textRef.current
      // Move caret to end
      const range = document.createRange()
      range.selectNodeContents(el)
      range.collapse(false)
      const sel = window.getSelection()
      sel.removeAllRanges()
      sel.addRange(range)
      el.focus()
    }
  }

  const fontSize = clip.font?.size || 24
  const fontFamily = clip.font?.family || 'Arial'
  const color = clip.font?.color || '#ffffff'
  const fontWeight = clip.font?.weight || 'bold'

  return (
    <div
      ref={overlayRef}
      className={`absolute text-overlay ${isSelected ? 'ring-2 ring-sky-blue' : ''} ${isDragging ? 'cursor-move' : ''}`}
      style={{
        left: `${position.x}%`,
        top: `${position.y}%`,
        transform: 'translate(-50%, -50%)',
        zIndex: isSelected ? 100 : 10
      }}
      onMouseDown={handleMouseDown}
      onClick={() => onSelect(clip)}
    >
      <div
        ref={textRef}
        contentEditable
        suppressContentEditableWarning
        onInput={handleTextChange}
        onBlur={handleTextBlur}
        onFocus={handleTextFocus}
        onDoubleClick={handleDoubleClick}
        className="outline-none cursor-text pointer-events-auto"
        style={{
          fontSize: `${fontSize}px`,
          fontFamily,
          color,
          fontWeight,
          textShadow: '2px 2px 4px rgba(0,0,0,0.8), -1px -1px 2px rgba(0,0,0,0.8)',
          whiteSpace: 'pre-wrap',
          minWidth: '100px',
          minHeight: '30px',
          padding: '4px 8px',
          background: isSelected ? 'rgba(135, 206, 235, 0.1)' : 'transparent',
          borderRadius: '4px'
        }}
      >
        {content || 'Double click to edit'}
      </div>
      
      {isSelected && (
        <div className="absolute -top-8 left-1/2 transform -translate-x-1/2 flex gap-1 bg-dark-gray rounded p-1">
          <button
            onClick={(e) => {
              e.stopPropagation()
              onDelete(clip.id)
            }}
            className="p-1 hover:bg-red-500/20 rounded"
            title="Delete text"
          >
            <X className="w-3 h-3 text-red-400" />
          </button>
          <div className="p-1" title="Drag to move">
            <Move className="w-3 h-3 text-gray-400" />
          </div>
        </div>
      )}
    </div>
  )
}

export default TextOverlay

