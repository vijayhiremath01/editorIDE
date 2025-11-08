import os

# Try to import OpenAI client directly (preferred method)
openai_available = False
try:
    from openai import OpenAI
    openai_available = True
except ImportError:
    try:
        import openai
        openai_available = True
    except ImportError:
        pass

# Try LangChain as fallback
ChatOpenAI = None
HumanMessage = None
SystemMessage = None
langchain_available = False

if not openai_available:
    try:
        from langchain_openai import ChatOpenAI
        from langchain_core.messages import HumanMessage, SystemMessage
        langchain_available = True
    except ImportError:
        try:
            from langchain_openai import ChatOpenAI
            from langchain_core.messages import HumanMessage, SystemMessage
            langchain_available = True
        except ImportError:
            pass

class AIChatService:
    """AI chat service for status updates and assistance"""
    
    def __init__(self):
        """Initialize AI chat service"""
        self.api_key = os.getenv("OPENAI_API_KEY")
        self.client = None
        self.llm = None
        self.use_openai_direct = False
        
        if self.api_key:
            # Try OpenAI client directly first (newer, more reliable)
            if openai_available:
                try:
                    try:
                        # Try new OpenAI client format
                        self.client = OpenAI(api_key=self.api_key)
                        self.use_openai_direct = True
                        print("Using OpenAI client directly (new format)")
                    except (TypeError, AttributeError):
                        # Fallback to older format
                        import openai as openai_module
                        openai_module.api_key = self.api_key
                        self.client = openai_module
                        self.use_openai_direct = True
                        print("Using OpenAI client directly (old format)")
                except Exception as e:
                    print(f"Warning: Could not initialize OpenAI client: {e}")
            
            # Fallback to LangChain if OpenAI client didn't work
            if not self.client and langchain_available and ChatOpenAI:
                try:
                    self.llm = ChatOpenAI(
                        model="gpt-3.5-turbo",
                        temperature=0.7,
                        openai_api_key=self.api_key
                    )
                    print("Using LangChain OpenAI")
                except Exception as e:
                    print(f"Warning: Could not initialize LangChain: {e}")
                    self.llm = None
        
        if not self.client and not self.llm:
            print("Warning: OPENAI_API_KEY not set or OpenAI/LangChain not available, using fallback responses")
    
    def get_response(self, user_message: str, context: dict = {}) -> str:
        """Get AI response to user message"""
        # Build system prompt
        system_prompt = """You are an AI assistant for a video editing application. 
        You help users understand what's happening in the editing process, provide status updates, 
        and assist with video editing tasks. Be conversational, helpful, and concise.
        
        Recent context: {context}
        """
        
        # Format context
        context_str = self.format_context(context)
        
        # Try OpenAI client directly first
        if self.client and self.use_openai_direct:
            try:
                if hasattr(self.client, 'chat') and hasattr(self.client.chat, 'completions'):
                    # New OpenAI API format
                    response = self.client.chat.completions.create(
                        model="gpt-3.5-turbo",
                        messages=[
                            {"role": "system", "content": system_prompt.format(context=context_str)},
                            {"role": "user", "content": user_message}
                        ],
                        temperature=0.7
                    )
                    return response.choices[0].message.content
                else:
                    # Older OpenAI API format
                    import openai
                    response = openai.ChatCompletion.create(
                        model="gpt-3.5-turbo",
                        messages=[
                            {"role": "system", "content": system_prompt.format(context=context_str)},
                            {"role": "user", "content": user_message}
                        ],
                        temperature=0.7
                    )
                    return response.choices[0].message.content
            except Exception as e:
                print(f"Error with OpenAI client: {e}")
                return self.get_fallback_response(user_message, context)
        
        # Try LangChain if available
        elif self.llm and HumanMessage and SystemMessage:
            try:
                messages = [
                    SystemMessage(content=system_prompt.format(context=context_str)),
                    HumanMessage(content=user_message)
                ]
                
                # Try invoke method (newer LangChain)
                try:
                    response = self.llm.invoke(messages)
                except AttributeError:
                    # Fallback to call method (older LangChain)
                    response = self.llm(messages)
                
                # Handle different response formats
                if hasattr(response, 'content'):
                    return response.content
                elif isinstance(response, str):
                    return response
                else:
                    return str(response)
            except Exception as e:
                print(f"Error with LangChain: {e}")
                return self.get_fallback_response(user_message, context)
        
        # Fallback to rule-based responses
        return self.get_fallback_response(user_message, context)
    
    def format_context(self, context: dict) -> str:
        """Format context dictionary into string"""
        if not context:
            return "No recent context"
        
        context_parts = []
        
        # Add recent jobs
        if "recent_jobs" in context:
            jobs = context["recent_jobs"]
            if jobs:
                context_parts.append("Recent actions:")
                for job in jobs[-5:]:  # Last 5 jobs
                    context_parts.append(f"- {job.get('type', 'unknown')}: {job.get('message', '')}")
        
        # Add other context
        for key, value in context.items():
            if key != "recent_jobs":
                context_parts.append(f"{key}: {value}")
        
        return "\n".join(context_parts) if context_parts else "No recent context"
    
    def get_fallback_response(self, user_message: str, context: dict) -> str:
        """Fallback response when AI is not available"""
        message_lower = user_message.lower()
        
        # Check for keywords and provide contextual responses
        if "classify" in message_lower or "sfx" in message_lower:
            return "I'm analyzing your audio files and organizing them into SFX, Music, and Ambience folders based on their content. This helps keep your media library organized!"
        
        elif "caption" in message_lower or "transcribe" in message_lower:
            return "I'm transcribing your video using Whisper AI. This will generate accurate captions with timestamps that you can use in your edit."
        
        elif "rough" in message_lower or "cut" in message_lower or "scene" in message_lower:
            return "I'm analyzing your video to detect scene changes and create a rough cut timeline. This will help you get started with your edit faster!"
        
        elif "status" in message_lower or "what" in message_lower:
            recent_jobs = context.get("recent_jobs", [])
            if recent_jobs:
                last_job = recent_jobs[-1]
                return f"Currently working on: {last_job.get('message', 'Processing your request')}"
            return "System is ready. I can help you classify audio, generate captions, or build rough cuts!"
        
        elif "hello" in message_lower or "hi" in message_lower:
            return "Hello! I'm your AI video editing assistant. I can help you organize audio files, generate captions, detect scenes, and create rough cuts. What would you like to do?"
        
        else:
            return "I'm here to help with your video editing tasks! I can classify audio files, generate captions, detect scenes, and create rough cuts. What would you like me to do?"

