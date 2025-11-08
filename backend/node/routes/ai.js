const express = require('express');
const router = express.Router();
const { GoogleGenerativeAI } = require('@google/generative-ai');
const axios = require('axios');
const PY_LLM_BASE_URL = process.env.PY_LLM_BASE_URL || '';

// Initialize Gemini AI
if (!process.env.GOOGLE_API_KEY) {
  console.warn('GOOGLE_API_KEY is not set; AI features will not work.');
}
const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY);
const MODEL_NAME = process.env.GEMINI_MODEL || "gemini-2.0-flash-exp";
const model = genAI.getGenerativeModel({ 
  model: MODEL_NAME,
  generationConfig: {
    temperature: 0.4,
    topK: 40,
    topP: 0.9,
  }
});

// System prompt for video editing context
const SYSTEM_PROMPT = `You are an AI video editing assistant that translates natural language commands into structured editing operations. 

Available operations and their parameters:
- split: { filePath, startTime, endTime? } - Cut video at specific time
- crop: { filePath, x, y, width, height } - Crop video to region
- speed: { filePath, speed } - Change playback speed (0.5x to 2.0x)
- volume: { filePath, volumeDb } - Adjust volume (-20 to +20 dB)
- text: { filePath, text, x?, y?, fontSize?, fontColor? } - Add text overlay
- rotate: { filePath, angle } - Rotate video by angle in degrees
- trim: { filePath, startTime, endTime? } - Trim audio/video
- fade: { filePath, fadeIn?, fadeOut? } - Fade audio in/out

Time parsing rules:
- "5 seconds" or "5s" = 5
- "1 minute 30 seconds" or "1:30" = 90
- "at 5 seconds" = 5
- "from 2s to 10s" = start: 2, end: 10

Volume parsing:
- "reduce by 20%" = -6dB
- "increase by 50%" = +4dB
- "half volume" = -6dB
- "double volume" = +6dB

Coordinate parsing:
- "center" = x: 50%, y: 50%
- "top left" = x: 0, y: 0
- "bottom right" = x: 100%, y: 100%

Respond with JSON only, no additional text. Example responses:

User: "cut at 70 seconds"
Response: {"operation": "split", "parameters": {"startTime": 70}}

User: "add text at 5 seconds saying 'Welcome'"
Response: {"operation": "text", "parameters": {"text": "Welcome", "x": 50, "y": 50}}

User: "reduce audio by 20%"
Response: {"operation": "volume", "parameters": {"volumeDb": -6}}

User: "make slow motion from 2s to 10s"
Response: {"operation": "speed", "parameters": {"speed": 0.5}}

User: "crop the center 50% of the video"
Response: {"operation": "crop", "parameters": {"x": 25, "y": 25, "width": 50, "height": 50}}

If the command is unclear, respond with: {"error": "unclear_command", "message": "Please clarify what you'd like to do"}`;

// Parse natural language command
router.post('/parse-command', async (req, res) => {
  try {
    const { message, filePath, context = {} } = req.body;
    
    if (!message) {
      return res.status(400).json({ error: 'Message is required' });
    }

    // If Python LLM service is configured, proxy to it first
    if (PY_LLM_BASE_URL) {
      try {
        const pyResp = await axios.post(`${PY_LLM_BASE_URL}/parse-command`, { message, filePath, context }, { timeout: 60000 });
        return res.json(pyResp.data);
      } catch (e) {
        console.error('Python LLM parse-command proxy error:', e.message);
        // fall through to Node Gemini as fallback
      }
    }

    const prompt = `${SYSTEM_PROMPT}\n\nUser: "${message}"\nContext: ${JSON.stringify(context)}\n\nResponse:`;
    
    const result = await model.generateContent(prompt);
    const response = await result.response;
    const text = response.text();
    
    try {
      // Parse the JSON response
      const parsedResponse = JSON.parse(text.trim());
      
      // Add filePath if not present and we have it
      if (filePath && !parsedResponse.parameters?.filePath) {
        parsedResponse.parameters = {
          ...parsedResponse.parameters,
          filePath
        };
      }
      
      res.json({
        success: true,
        command: parsedResponse,
        rawResponse: text
      });
      
    } catch (parseError) {
      // If JSON parsing fails, try to extract operation manually
      const manualParse = manualCommandParse(message, filePath);
      
      if (manualParse) {
        res.json({
          success: true,
          command: manualParse,
          rawResponse: text,
          fallback: true
        });
      } else {
        res.json({
          success: false,
          error: 'Failed to parse command',
          rawResponse: text
        });
      }
    }
    
  } catch (error) {
    console.error('AI command parsing error:', error);
    const { message, filePath } = req.body || {};
    const manualParse = message ? manualCommandParse(message, filePath) : null;

    if (manualParse) {
      return res.json({
        success: true,
        command: manualParse,
        rawResponse: null,
        fallback: true,
        error: 'AI unavailable',
        details: error.message
      });
    }

    res.status(500).json({ 
      error: 'Failed to parse command',
      details: error.message 
    });
  }
});

// Manual command parsing as fallback
function manualCommandParse(message, filePath) {
  const lowerMessage = message.toLowerCase();
  
  // Split/Cut commands
  if (lowerMessage.includes('cut') || lowerMessage.includes('split')) {
    const timeMatch = lowerMessage.match(/(\d+)\s*(?:seconds?|s)/);
    if (timeMatch) {
      return {
        operation: 'split',
        parameters: {
          filePath,
          startTime: parseInt(timeMatch[1])
        }
      };
    }
  }
  
  // Volume commands
  if (lowerMessage.includes('volume') || lowerMessage.includes('audio')) {
    if (lowerMessage.includes('reduce') || lowerMessage.includes('lower')) {
      const percentMatch = lowerMessage.match(/(\d+)%/);
      if (percentMatch) {
        const percent = parseInt(percentMatch[1]);
        const db = -6 * (percent / 50); // Approximate conversion
        return {
          operation: 'volume',
          parameters: {
            filePath,
            volumeDb: Math.round(db)
          }
        };
      }
    }
    
    if (lowerMessage.includes('increase') || lowerMessage.includes('higher')) {
      const percentMatch = lowerMessage.match(/(\d+)%/);
      if (percentMatch) {
        const percent = parseInt(percentMatch[1]);
        const db = 4 * (percent / 50); // Approximate conversion
        return {
          operation: 'volume',
          parameters: {
            filePath,
            volumeDb: Math.round(db)
          }
        };
      }
    }
  }
  
  // Speed commands
  if (lowerMessage.includes('speed') || lowerMessage.includes('slow')) {
    if (lowerMessage.includes('slow')) {
      return {
        operation: 'speed',
        parameters: {
          filePath,
          speed: 0.5
        }
      };
    }
    
    if (lowerMessage.includes('fast') || lowerMessage.includes('speed up')) {
      return {
        operation: 'speed',
        parameters: {
          filePath,
          speed: 2.0
        }
      };
    }
  }
  
  // Text overlay commands
  if (lowerMessage.includes('text') || lowerMessage.includes('add text')) {
    const textMatch = lowerMessage.match(/['"](.+?)['"]/);
    if (textMatch) {
      return {
        operation: 'text',
        parameters: {
          filePath,
          text: textMatch[1],
          x: 50,
          y: 50
        }
      };
    }
  }
  
  return null;
}

// Execute AI-parsed command
router.post('/execute-command', async (req, res) => {
  try {
    const { command } = req.body;
    
    if (!command || !command.operation) {
      return res.status(400).json({ error: 'Invalid command format' });
    }
    
    const { operation, parameters } = command;
    
    // Route to appropriate backend endpoint
    let endpoint;
    let payload = { ...parameters };
    
    switch (operation) {
      case 'split':
        endpoint = '/api/video/split';
        break;
      case 'crop':
        endpoint = '/api/video/crop';
        break;
      case 'speed':
        endpoint = '/api/video/speed';
        break;
      case 'volume':
        endpoint = '/api/audio/volume';
        break;
      case 'text':
        endpoint = '/api/video/text';
        break;
      case 'rotate':
        endpoint = '/api/video/rotate';
        break;
      case 'trim':
        endpoint = '/api/audio/trim';
        break;
      case 'fade':
        endpoint = '/api/audio/fade';
        break;
      default:
        return res.status(400).json({ error: `Unknown operation: ${operation}` });
    }
    
    // Make internal request to the appropriate service
    const axiosConfig = {
      method: 'POST',
      url: `http://localhost:${process.env.PORT || 3001}${endpoint}`,
      data: payload,
      timeout: 300000 // 5 minutes
    };
    
    const response = await axios(axiosConfig);
    
    res.json({
      success: true,
      operation,
      result: response.data,
      message: `${operation} completed successfully`
    });
    
  } catch (error) {
    console.error('Command execution error:', error);
    res.status(500).json({ 
      error: 'Failed to execute command',
      details: error.response?.data || error.message 
    });
  }
});

// Get AI assistant response
router.post('/chat', async (req, res) => {
  try {
    const { message, context = {} } = req.body;
    
    if (!message) {
      return res.status(400).json({ error: 'Message is required' });
    }

    // If Python LLM service is configured, proxy to it
    if (PY_LLM_BASE_URL) {
      try {
        const pyResp = await axios.post(`${PY_LLM_BASE_URL}/chat`, { message, context }, { timeout: 60000 });
        return res.json(pyResp.data);
      } catch (e) {
        console.error('Python LLM chat proxy error:', e.message);
        // fall through to Node Gemini as fallback
      }
    }

    const CHAT_SYSTEM_PROMPT = `You are an expert AI video editing assistant inside our app. Goals:
- Be friendly for greetings (e.g., "hello how are you") with a short, warm reply.
- Give concrete, step-by-step guidance for edits users can do in this app.
- Prefer our available operations and UI terms.
- When a user seems to ask for an edit (cut, trim, crop, speed, volume, text, rotate, fade), suggest the exact button or command and what to expect.

Supported operations and hints:
- split: cut clip at a time
- crop: set x,y,width,height
- speed: 0.5x–2.0x
- volume: +/- dB
- text: overlay with position and size
- rotate: degrees
- trim: start/end
- fade: fadeIn/fadeOut

If user input is casual or not an edit, respond with a helpful, concise message and one or two suggestions of what they can try in the app.
Keep responses to 1–4 short sentences unless the user asks for more detail.`;

    const prompt = `${CHAT_SYSTEM_PROMPT}\n\nContext: ${JSON.stringify(context)}\n\nUser: ${message}\nAssistant:`;

    const result = await model.generateContent(prompt);
    const response = await result.response;
    const text = response.text();
    
    res.json({
      success: true,
      response: text,
      message: text,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('AI chat error:', error);
    const fallback = 'I’m having trouble reaching the AI service right now. You can still use toolbar actions (Split, Crop, Speed, Text). Try again in a moment.';
    // Return 200 with a friendly fallback to avoid UI error popups
    res.json({ 
      success: true,
      response: fallback,
      message: fallback,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Analyze video content (placeholder for future AI features)
router.post('/analyze', async (req, res) => {
  try {
    const { filePath, analysisType = 'general' } = req.body;
    
    if (!filePath) {
      return res.status(400).json({ error: 'File path is required' });
    }

    // Placeholder for video analysis
    // In a real implementation, you might use:
    // - Scene detection
    // - Object recognition
    // - Audio analysis
    // - Transcription
    
    const analysisResults = {
      duration: 'placeholder',
      scenes: [],
      audio: {
        peaks: [],
        silence: []
      },
      objects: [],
      text: []
    };
    
    res.json({
      success: true,
      analysis: analysisResults,
      message: 'Video analysis completed (placeholder)'
    });
    
  } catch (error) {
    console.error('AI analysis error:', error);
    res.status(500).json({ 
      error: 'Failed to analyze video',
      details: error.message 
    });
  }
});

// Health/status route to verify Gemini connectivity without exposing secrets
router.get('/status', async (req, res) => {
  const hasKey = Boolean(process.env.GOOGLE_API_KEY);
  try {
    // Do not call the API if no key; just report status
    return res.json({ success: true, hasKey, model: MODEL_NAME });
  } catch (e) {
    return res.json({ success: false, hasKey, model: MODEL_NAME, error: e.message });
  }
});

// Streaming chat via Server-Sent Events (SSE)
router.get('/stream-chat', async (req, res) => {
  try {
    const message = req.query.message;
    const contextRaw = req.query.context || '{}';
    let context = {};
    try { context = JSON.parse(contextRaw); } catch (_) {}

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    // If Python LLM service is configured, proxy its SSE
    if (PY_LLM_BASE_URL) {
      try {
        const url = `${PY_LLM_BASE_URL}/stream-chat?message=${encodeURIComponent(message || '')}&context=${encodeURIComponent(JSON.stringify(context || {}))}`;
        const response = await axios.get(url, { responseType: 'stream', timeout: 0 });
        response.data.on('data', (chunk) => res.write(chunk));
        response.data.on('end', () => res.end());
        response.data.on('error', (err) => {
          console.error('Python LLM stream error:', err.message);
          try { res.end(); } catch (_) {}
        });
        return; // handled by proxy
      } catch (e) {
        console.warn('Falling back to Node streaming, Python stream failed:', e.message);
      }
    }

    // Node+Gemini streaming fallback
    const CHAT_SYSTEM_PROMPT = `You are an expert AI video editing assistant inside our app. Goals:\n- Be friendly for greetings (e.g., "hello how are you").\n- Give concrete, step-by-step guidance for edits users can do in this app.\n- Prefer our operations: split, crop, speed, volume, text, rotate, trim, fade.\n- Keep responses concise (1–4 short sentences).`;
    const prompt = `${CHAT_SYSTEM_PROMPT}\n\nContext: ${JSON.stringify(context)}\n\nUser: ${message}\nAssistant:`;

    const result = await model.generateContentStream(prompt);
    for await (const chunk of result.stream) {
      const delta = chunk.text();
      if (delta) {
        res.write(`data: ${JSON.stringify({ delta })}\n\n`);
      }
    }
    // aggregated response is available if needed
    res.write('event: done\n');
    res.write('data: {}\n\n');
    res.end();
  } catch (error) {
    console.error('SSE stream error:', error);
    try {
      res.write(`data: ${JSON.stringify({ delta: '' })}\n\n`);
      res.write('event: done\n');
      res.write('data: {}\n\n');
    } catch (_) {}
    try { res.end(); } catch (_) {}
  }
});

module.exports = router;
