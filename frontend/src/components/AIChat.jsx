import { useState, useRef, useEffect } from 'react'
import { Send, Sparkles, Loader } from 'lucide-react'
import { aiAPI } from '../api/editing'

const AIChat = ({ messages, onSendMessage, onNewMessage, chatContext }) => {
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [suggesting, setSuggesting] = useState(false)
  const chatEndRef = useRef(null)
  const messagesContainerRef = useRef(null)

  const scrollToBottom = () => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  useEffect(() => {
    scrollToBottom()
  }, [messages])

  const sendChat = async (text) => {
    if (!text || sending) return
    setSending(true)
    // Add user message immediately
    onNewMessage && onNewMessage({ role: 'user', content: text, timestamp: new Date() })

    // Try SSE streaming first
    const supportsSSE = typeof window !== 'undefined' && 'EventSource' in window
    if (supportsSSE) {
      try {
        const ctx = encodeURIComponent(JSON.stringify(chatContext || {}))
        const url = `${location.origin.replace(/\/$/, '')}/api/ai/stream-chat?message=${encodeURIComponent(text)}&context=${ctx}`
        let aggregated = ''
        await new Promise((resolve, reject) => {
          const es = new EventSource(url)
          const onMessage = (ev) => {
            try {
              const data = JSON.parse(ev.data || '{}')
              if (data.delta) {
                aggregated += data.delta
                // Render a local streaming bubble (not persisted in parent)
                setStreamingText(aggregated)
                setStreaming(true)
              }
            } catch (_) {}
          }
          const onDone = () => {
            es.close()
            setStreaming(false)
            setStreamingText('')
            onNewMessage && onNewMessage({ role: 'assistant', content: aggregated, timestamp: new Date() })
            resolve()
          }
          const onError = (err) => {
            es.close()
            reject(err)
          }
          es.addEventListener('message', onMessage)
          es.addEventListener('done', onDone)
          es.onerror = onError
        })
        setSending(false)
        return
      } catch (_e) {
        // fallback to non-streaming
      }
    }

    // Fallback to non-streaming HTTP call
    try {
      const response = await aiAPI.chat(text, chatContext || {})
      const assistantText = response.message ?? response.response ?? response.text ?? ''
      onNewMessage && onNewMessage({ role: 'assistant', content: assistantText, timestamp: new Date() })
      if (response.commands) response.commands.forEach(cmd => onSendMessage && onSendMessage(cmd))
    } catch (error) {
      const errorMsg = error.response?.data?.error || error.detail || error.message || 'Unknown error'
      onNewMessage && onNewMessage({ role: 'assistant', content: `Error: ${errorMsg}`, timestamp: new Date() })
    } finally {
      setSending(false)
    }
  }

  const [streaming, setStreaming] = useState(false)
  const [streamingText, setStreamingText] = useState('')

  const handleSend = async (e) => {
    e.preventDefault()
    const userMessage = input.trim()
    if (!userMessage) return
    setInput('')
    await sendChat(userMessage)
  }

  const quickPrompts = [
    'Hello, how are you?',
    'How do I split at 5 seconds?',
    'Trim the first 3 seconds',
    'Add text "Intro" at 5 seconds',
    'Suggest background music for an upbeat montage'
  ]

  const handleSuggest = async () => {
    if (suggesting) return
    setSuggesting(true)
    const ctx = chatContext || {}
    const filePart = ctx?.selectedFile ? `The current file is ${ctx.selectedFile.name} (${ctx.selectedFile.type}).` : 'No file is selected.'
    const timePart = typeof ctx?.currentTime === 'number' ? `The playhead is at ${ctx.currentTime.toFixed(2)} seconds.` : ''
    const tlPart = ctx?.timeline ? `There are ${ctx.timeline.tracks?.length || 0} tracks and duration is ${ctx.timeline.duration || 0} seconds.` : ''
    const prompt = `Given this context, suggest one concrete next edit (split, trim, crop, speed, volume, text, rotate, fade) with a short explanation I can follow in this app. ${filePart} ${timePart} ${tlPart}`
    await sendChat(prompt)
    setSuggesting(false)
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
        {/* Quick prompts */}
        <div className="flex flex-wrap gap-2 mb-2">
          {quickPrompts.map((qp, idx) => (
            <button
              key={idx}
              className="px-2 py-1 text-xs bg-light-gray hover:bg-gray-500 rounded"
              onClick={() => sendChat(qp)}
              disabled={sending}
            >
              {qp}
            </button>
          ))}
        </div>
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
        {streaming && (
          <div className="flex justify-start">
            <div className="bg-light-gray rounded-lg px-3 py-2">
              <p className="text-sm whitespace-pre-wrap break-words">{streamingText || '...'}</p>
            </div>
          </div>
        )}
        {sending && !streaming && (
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
          <button
            type="button"
            onClick={handleSuggest}
            disabled={sending || suggesting}
            className="p-2 bg-light-gray hover:bg-gray-500 rounded disabled:opacity-50"
            title="Suggest next edit"
          >
            {suggesting ? (
              <Loader className="w-4 h-4 animate-spin text-sky-blue" />
            ) : (
              <Sparkles className="w-4 h-4 text-sky-blue" />
            )}
          </button>
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

