import AISuggestions from './AISuggestions'
import AIChat from './AIChat'

const RightSidebar = ({ chatMessages, onSendMessage, onNewMessage, onSelectSuggestion, chatContext }) => {
  return (
    <div className="w-80 bg-dark-gray border-l border-light-gray flex flex-col h-full">
      <AISuggestions onSelectSuggestion={onSelectSuggestion} />
      <AIChat 
        messages={chatMessages} 
        onSendMessage={onSendMessage}
        onNewMessage={onNewMessage}
        chatContext={chatContext}
      />
    </div>
  )
}

export default RightSidebar

