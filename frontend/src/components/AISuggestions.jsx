import { useState, useEffect } from 'react'
import { Sparkles, Image as ImageIcon, Video, Music } from 'lucide-react'
import { api } from '../api/client'

const AISuggestions = ({ onSelectSuggestion }) => {
  const [suggestions, setSuggestions] = useState([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    // Load AI suggestions from recent media files
    loadSuggestions()
  }, [])

  const loadSuggestions = async () => {
    try {
      setLoading(true)
      const response = await api.get('/media/list')
      const files = response.data.files || []
      
      // Show recent video/audio files as suggestions
      const recentFiles = files
        .filter(f => f.type === 'video' || f.type === 'audio' || f.type === 'image')
        .slice(0, 6)
      
      setSuggestions(recentFiles)
    } catch (error) {
      console.error('Error loading suggestions:', error)
    } finally {
      setLoading(false)
    }
  }

  const getFileIcon = (type) => {
    switch (type) {
      case 'video':
        return <Video className="w-6 h-6 text-sky-blue" />
      case 'audio':
        return <Music className="w-6 h-6 text-green-400" />
      case 'image':
        return <ImageIcon className="w-6 h-6 text-purple-400" />
      default:
        return <ImageIcon className="w-6 h-6 text-gray-400" />
    }
  }

  const handleSuggestionClick = (suggestion) => {
    if (onSelectSuggestion) {
      onSelectSuggestion(suggestion)
    }
  }

  return (
    <div className="h-64 border-b border-light-gray overflow-y-auto flex flex-col">
      <div className="p-4 border-b border-light-gray">
        <div className="flex items-center gap-2 mb-2">
          <Sparkles className="w-4 h-4 text-sky-blue" />
          <h2 className="text-sm font-semibold text-gray-300">AI Suggestions</h2>
        </div>
      </div>
      <div className="flex-1 p-4">
        {loading ? (
          <div className="text-sm text-gray-400 text-center py-8">
            Loading suggestions...
          </div>
        ) : suggestions.length === 0 ? (
          <div className="text-sm text-gray-400 text-center py-8">
            <ImageIcon className="w-8 h-8 mx-auto mb-2 opacity-50" />
            <p>AI-suggested clips will appear here</p>
            <p className="text-xs mt-2">Add media files to get suggestions</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            {suggestions.map((suggestion, index) => (
              <div
                key={index}
                onClick={() => handleSuggestionClick(suggestion)}
                className="bg-light-gray rounded cursor-pointer hover:bg-gray-500 transition-colors p-2 group"
              >
                <div className="aspect-video bg-charcoal rounded mb-2 flex items-center justify-center">
                  {suggestion.type === 'image' ? (
                    <img
                      src={`/api/media/${suggestion.path}`}
                      alt={suggestion.name}
                      className="w-full h-full object-cover rounded"
                    />
                  ) : (
                    getFileIcon(suggestion.type)
                  )}
                </div>
                <div className="text-xs truncate" title={suggestion.name}>
                  {suggestion.name}
                </div>
                <div className="text-xs text-gray-400 mt-1">
                  {suggestion.type}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

export default AISuggestions

