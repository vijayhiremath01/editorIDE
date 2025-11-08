import { useState, useRef, useEffect } from 'react'
import { Send, Sparkles, Loader } from 'lucide-react'
import { api } from '../api/client'

const AIChat = ({ messages, onSendMessage, onNewMessage }) => {
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const chatEndRef = useRef(null)
  const messagesContainerRef = useRef(null)

  const scrollToBottom = () => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  useEffect(() => {
    scrollToBottom()
  }, [messages])

  const handleSend = async (e) => {
    e.preventDefault()
    if (!input.trim() || sending) return 

    const userMessage = input.trim()
    setInput('')
    setSending(true)

    // Add user message immediately
    if (onNewMessage) {
      onNewMessage({ role: 'user', content: userMessage, timestamp: new Date() })
    }

    try {
      const response = await api.post('/chat', { message: userMessage, context: {} })
      
      if (onNewMessage) {
        onNewMessage({ 
          role: 'assistant', 
          content: response.data.message, 
          timestamp: new Date() 
        })
      }

      // Check if response has commands
      if (response.data.commands) {
        response.data.commands.forEach(cmd => {
          if (onSendMessage) {
            onSendMessage(cmd)
          }
        })
      }
    } catch (error) {
      const errorMsg = error.response?.data?.detail || error.message || 'Unknown error'
      if (onNewMessage) {
        onNewMessage({ 
          role: 'assistant', 
          content: `Error: ${errorMsg}`, 
          timestamp: new Date() 
        })
      }
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <div className="p-4 border-b border-light-gray">
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-sky-blue" />
          <h2 className="text-sm font-semibold text-gray-300">AI Assistant</h2>
        </div>
      </div>

      <div 
        ref={messagesContainerRef}
        className="flex-1 overflow-y-auto p-4 space-y-4 min-h-0"
        style={{ scrollBehavior: 'smooth' }}
      >
        {messages.map((message, index) => (
          <div
            key={index}
            className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <div
              className={`max-w-[80%] rounded-lg px-3 py-2 ${
                message.role === 'user'
                  ? 'bg-sky-blue text-charcoal'
                  : 'bg-light-gray text-white'
              }`}
            >
              <p className="text-sm whitespace-pre-wrap break-words">{message.content}</p>
              {message.timestamp && (
                <p className="text-xs opacity-70 mt-1">
                  {new Date(message.timestamp).toLocaleTimeString()}
                </p>
              )}
            </div>
          </div>
        ))}
        {sending && (
          <div className="flex justify-start">
            <div className="bg-light-gray rounded-lg px-3 py-2">
              <Loader className="w-4 h-4 animate-spin text-sky-blue" />
            </div>
          </div>
        )}
        <div ref={chatEndRef} />
      </div>

      {/* Input Bar */}
      <form onSubmit={handleSend} className="p-4 border-t border-light-gray">
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask AI assistant..."
            disabled={sending}
            className="flex-1 bg-light-gray border border-gray-600 rounded px-3 py-2 text-sm focus:outline-none focus:border-sky-blue disabled:opacity-50"
          />
          <button
            type="submit"
            disabled={sending || !input.trim()}
            className="p-2 bg-sky-blue hover:bg-sky-blue/80 rounded disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            title="Send"
          >
            {sending ? (
              <Loader className="w-4 h-4 text-charcoal animate-spin" />
            ) : (
              <Send className="w-4 h-4 text-charcoal" />
            )}
          </button>
        </div>
      </form>
    </div>
  )
}

export default AIChat

