# AI Video Editor Copilot

## Overview

AI Video Editor Copilot is a full-stack video editing application that combines traditional timeline-based editing with AI-powered natural language commands. Users can edit videos through both a visual timeline interface and conversational AI commands like "cut at 5 seconds" or "add text overlay." The system processes videos using FFmpeg, provides real-time feedback via WebSockets, and supports advanced features like scene detection, audio classification, and automated transcription.

## Replit Setup Notes

**Date**: November 8, 2025  
**Status**: Successfully configured for Replit environment

### Changes Made for Replit:
1. **Frontend Configuration**:
   - Configured Vite to run on port 5000 with host `0.0.0.0`
   - Enabled `allowedHosts: true` for Replit proxy compatibility
   - Updated API client to use `/api` prefix for proxy routing

2. **Backend Configuration**:
   - Node.js backend runs on `localhost:3001`
   - Updated CORS to allow all origins for Replit domain flexibility
   - Configured Socket.IO with permissive CORS settings

3. **Dependencies**:
   - Installed Node.js 20 and Python 3.11 modules
   - Note: `opentimelineio` package was disabled due to build issues in Replit environment

4. **Workflows**:
   - Frontend: `cd frontend && npm run dev` (port 5000, webview)
   - Backend: `cd backend/node && npm start` (port 3001, console)

5. **Deployment**: Configured as VM deployment to support both frontend and backend services

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture

**Technology Stack**: React 18 + Vite for fast development and hot module replacement, with Zustand for state management and TailwindCSS for styling. The application can run as a web app or be packaged as an Electron desktop application for local file access.

**Key Design Patterns**:
- **State Management**: Zustand with persistence middleware manages timeline state, including tracks, clips, playback position, and zoom level. The store syncs with the backend for multi-client consistency.
- **Component Structure**: Modular components for timeline visualization, video preview canvas, AI chat interface, and toolbar controls. The timeline uses drag-and-drop (react-dnd) for intuitive clip manipulation.
- **Real-time Updates**: Socket.IO client subscribes to backend events for progress tracking, timeline synchronization, and file system changes.
- **Dual Runtime**: The application supports both browser-based and Electron environments, with conditional APIs for file system access through the preload bridge.

**Video Playback**: ReactPlayer handles video preview with precise seek controls. The timeline scale (pixels per second) is adjustable for fine-grained or overview editing.

**Pros**: Fast development cycles with Vite, type-safe state management, responsive UI with Framer Motion animations.  
**Cons**: Electron bundle size can be large; browser version has limited local file access without backend uploads.

### Backend Architecture

**Dual Backend Strategy**: The system employs both a Python FastAPI backend and a Node.js/Express backend, each serving complementary purposes:

**Python Backend (FastAPI)**:
- **Purpose**: AI/ML processing, including Whisper transcription, YAMNet audio classification, PySceneDetect scene detection, and LangChain/OpenAI GPT integration for command parsing.
- **Structure**: Service-oriented architecture with dedicated modules for each AI capability. Background task management tracks long-running operations with progress updates via WebSocket broadcasting.
- **Router Pattern**: Separate routers for AI operations (`/ai`), timeline management (`/timeline`), and WebSocket connections organize endpoints logically.
- **Performance**: Optional C++ modules (pybind11) for frame extraction and timeline calculations provide 10-100x speedup over pure Python.

**Node.js Backend (Express)**:
- **Purpose**: Video processing orchestration with FFmpeg, file management, and timeline persistence. Chosen for its mature FFmpeg bindings (fluent-ffmpeg) and efficient I/O operations.
- **Structure**: Route-based organization with separate modules for video, audio, AI command routing, media library, and timeline operations.
- **LLM Integration**: Delegates natural language processing to either the Python FastAPI service or directly to Google Gemini API for command parsing.
- **Auto-start**: Optionally launches the Python LLM service on startup for seamless single-process operation.

**Rationale for Dual Backend**: Python excels at ML/AI workloads with extensive library support (Whisper, TensorFlow, scikit-learn), while Node.js provides superior FFmpeg integration and JavaScript ecosystem alignment with the React frontend. This separation of concerns allows each backend to use its optimal tooling.

**Video Processing Pipeline**:
1. User command (UI or natural language) → Backend API
2. Command parser interprets intent and parameters
3. Task manager creates background job with unique ID
4. FFmpeg queue manages concurrent processing (limit: 2 simultaneous)
5. Progress updates broadcast via WebSocket
6. Completed output stored in temp/output directories
7. Timeline updated with new clip metadata

**GPU Acceleration**: The system detects VideoToolbox (macOS) or other hardware encoders and automatically applies acceleration flags to FFmpeg commands when available.

**Pros**: Leverages best tools for each task, scalable task queue prevents resource exhaustion, modular services enable independent testing.  
**Cons**: Increased deployment complexity with two server processes, potential version drift between backends.

### Data Storage Solutions

**Timeline Persistence**: Project timelines are stored as JSON files in the `backend/node/projects/` directory. Each project includes track definitions, clip metadata (start/end times, file paths, effects), and playback settings. This file-based approach enables easy versioning and portability without database setup.

**Schema Structure**:
```javascript
{
  id: "project-id",
  tracks: [
    {
      id: "track-id",
      type: "video|audio|text",
      clips: [
        {
          id: "clip-id",
          start: 0,        // seconds
          end: 10,         // seconds
          fullPath: "path/to/media.mp4",
          effects: [],
          volume: 1.0
        }
      ]
    }
  ]
}
```

**Media Organization**: The `media/` folder contains subdirectories for uploads, temp processing files, and final outputs. The folder watcher service (watchdog) monitors for new files and triggers automatic classification/analysis workflows.

**In-Memory Caching**: Active projects are cached in Node.js Map structures for fast access, with writes-through to disk for persistence. The Python backend uses similar in-memory task tracking.

**Alternatives Considered**: SQLite or PostgreSQL would provide better query capabilities and concurrent access, but add deployment complexity. OpenTimelineIO (OTIO) was initially planned for industry-standard interchange but skipped due to build issues.

**Pros**: Zero database setup, human-readable project files, easy backup/restore.  
**Cons**: No built-in concurrency control for multi-user editing, limited query capabilities for large media libraries.

### Authentication and Authorization

**Current State**: The application operates as a single-user desktop/local tool without authentication. CORS is configured to allow localhost origins (ports 3000, 5173, 5174) for development flexibility.

**Security Model**: Trust is based on local execution - users have full access to their project files and media. The Electron version uses context isolation and disables Node integration in renderer processes to prevent XSS attacks.

**Future Considerations**: For multi-user deployments, JWT-based authentication with role-based access control (editor, viewer, admin) would be appropriate. WebSocket connections would require token validation on connect.

## External Dependencies

### AI/ML Services

**OpenAI**:
- **Whisper**: Speech-to-text transcription with timestamp alignment. Models: tiny/base/small/medium/large with accuracy/speed tradeoffs.
- **GPT Models**: Natural language command parsing via LangChain integration or direct API calls. Converts user intent like "cut this video at 5 seconds" into structured operations.
- **Configuration**: Requires `OPENAI_API_KEY` environment variable. Falls back to mock responses if unavailable.

**Google Gemini**:
- **Purpose**: Alternative LLM provider for command parsing and chat assistance via `@google/generative-ai` SDK.
- **Model**: Defaults to `gemini-pro` with configurable temperature (0.4) for consistent edit command interpretation.
- **Configuration**: Requires `GEMINI_API_KEY` environment variable.

**TensorFlow + YAMNet**:
- **Purpose**: Audio classification for automatic tagging (music, SFX, ambience, speech).
- **Implementation**: Optional dependency due to build complexity on Python 3.13+. Falls back to basic file type detection.
- **Use Case**: Organizes imported audio into categorized folders for faster media browsing.

**PySceneDetect**:
- **Purpose**: Automated scene boundary detection using content-based analysis.
- **Integration**: Identifies cuts/transitions and can auto-segment videos into logical chapters.
- **Configuration**: Threshold parameter controls detection sensitivity (lower = more sensitive).

### Video Processing

**FFmpeg**:
- **Core Dependency**: All video/audio transformations use FFmpeg via fluent-ffmpeg (Node) or ffmpeg-python (Python).
- **Operations**: Splitting, trimming, cropping, speed changes, volume adjustments, text overlays, picture-in-picture, rotation, fade effects.
- **Probe**: ffprobe extracts metadata (duration, resolution, codecs, frame rate) for timeline initialization.
- **Static Binaries**: Optional ffmpeg-static and ffprobe-static packages bundle FFmpeg for environments without system installation.

**Hardware Acceleration**: Detects and uses VideoToolbox (macOS), NVENC (NVIDIA), or other platform-specific encoders via hwaccel flags.

### Real-time Communication

**Socket.IO**:
- **Purpose**: Bidirectional WebSocket communication for progress updates, timeline synchronization, and file system events.
- **Events**: `progress` (task completion %), `timeline_updated` (clip changes), `file_added` (new media detected).
- **Client Library**: socket.io-client connects from React frontend with automatic reconnection.

### Development Tools

**Vite**: Frontend build tool providing instant HMR and optimized production builds. Proxies `/api` requests to backend during development.

**Electron**: Desktop packaging with native file dialogs, menu bars, and local file access via IPC bridge (preload script).

**Tailwind CSS**: Utility-first styling with custom color palette (sky-blue, charcoal grays) and Inter font family.

**Concurrently**: Runs both Vite and Electron dev servers simultaneously with single `npm run electron:dev` command.

### File System

**Watchdog** (Python): Monitors `media/` directory for filesystem events and triggers processing pipelines when new files appear.

**fs-extra** (Node): Enhanced filesystem operations with promise support for copying, moving, and organizing media files.

**Multer** (Node): Multipart form parser for file uploads via HTTP POST.

### Python Environment

**Pydantic**: Request/response validation and serialization for FastAPI endpoints.

**python-dotenv**: Environment variable loading from `.env` files for API keys and configuration.

**pandas + opencv-python**: Data manipulation and computer vision utilities for advanced scene analysis.

**pydub**: Audio manipulation library for waveform processing and effects.

### Deployment Considerations

**Environment Variables**:
- `OPENAI_API_KEY`, `GEMINI_API_KEY`: LLM provider authentication
- `MEDIA_FOLDER`: Watch directory for imports (default: `./media`)
- `UPLOAD_DIR`, `TEMP_DIR`, `OUTPUT_DIR`: File organization paths
- `FFMPEG_PATH`, `FFPROBE_PATH`: Custom FFmpeg binary locations
- `PY_LLM_BASE_URL`: Python LLM service endpoint (default: `http://127.0.0.1:8000`)
- `PY_LLM_AUTOSTART`: Auto-launch Python service from Node (default: true)

**Port Configuration**:
- Frontend: 5000 (Vite dev), 5173 (alternate)
- Python Backend: 8000 (FastAPI)
- Node Backend: 3001 (Express)

**Alternatives Considered**: Unified backend in Python or Node would simplify deployment but sacrifice specialized tooling advantages. A message queue (Redis/RabbitMQ) could replace direct HTTP calls between backends but adds infrastructure overhead for a desktop application.