# AI Video Editor Copilot MVP

A full-stack AI-integrated video editor copilot application that uses AI models to classify audio, generate captions, detect scenes, and assist users with natural language updates.

## 🏗️ Architecture

- **Backend**: Python FastAPI with AI services (Whisper, YAMNet, PySceneDetect, OTIO)
- **Frontend**: React + Vite + TailwindCSS
- **AI Integration**: OpenAI Whisper, YAMNet, LangChain/OpenAI GPT

## 📁 Project Structure

```
project-root/
├── backend/          # FastAPI backend
│   ├── main.py      # API endpoints
│   ├── services/    # AI services
│   └── requirements.txt
├── frontend/        # React frontend
│   ├── src/
│   │   ├── components/
│   │   ├── api/
│   │   └── App.jsx
│   └── package.json
├── media/           # Watched folder for media files
└── README.md
```

## 🚀 Setup

### Prerequisites

- Python 3.9+
- Node.js 18+
- FFmpeg installed on your system

### Backend Setup

1. Navigate to the backend directory:
```bash
cd backend
```

2. Create a virtual environment:
```bash
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
```

3. Install dependencies:
```bash
pip install -r requirements.txt
```

4. Set up environment variables:
```bash
cp .env.example .env
# Edit .env and add your OPENAI_API_KEY (optional, for AI chat)
```

5. Create the media folder:
```bash
mkdir -p ../media
```

6. Run the backend:
```bash
python main.py
# Or: uvicorn main:app --reload
```

The backend will run on `http://localhost:8000`

### Frontend Setup

1. Navigate to the frontend directory:
```bash
cd frontend
```

2. Install dependencies:
```bash
npm install
```

3. Run the frontend:
```bash
npm run dev
```

The frontend will run on `http://localhost:5173`

## 🎯 Features

### Backend Endpoints

- `POST /classify-sfx` - Classify audio files and organize into SFX/Music/Ambience folders
- `POST /auto-caption` - Transcribe video/audio using Whisper
- `POST /build-roughcut` - Detect scenes and build OTIO timeline
- `GET /status` - Get current status and recent jobs
- `POST /chat` - AI assistant endpoint
- `GET /media/list` - List all media files
- `GET /media/{file_path}` - Serve media files

### Frontend Components

- **Left Sidebar**: File structure view of media assets
- **Center Panel**: Video preview + timeline view (sky-blue track lines)
- **Bottom Bar**: Editing tool buttons (Canvas, Audio, Text, Split, Speed, AI Cut, etc.)
- **Right Sidebar**: AI-suggested clips/images + AI Chat window

## 🧠 AI Services

### Audio Classification (YAMNet)
- Classifies audio files into SFX, Music, Ambience, or Other
- Automatically organizes files into folders

### Transcription (Whisper)
- Transcribes audio/video files
- Generates SRT subtitle files
- Supports multiple languages

### Scene Detection (PySceneDetect)
- Detects scene boundaries in videos
- Builds OTIO timeline files for import into professional editors

### AI Chat (OpenAI GPT)
- Provides natural language status updates
- Answers questions about the editing process
- Fallback responses when API key is not set

## 📝 Usage

1. **Add Media Files**: Place video/audio files in the `media/` folder
2. **Select a File**: Click on a file in the left sidebar
3. **Classify SFX**: Click "Arrange SFX" to classify and organize audio files
4. **Auto Caption**: Click "Auto Caption" to generate captions for videos
5. **Build Rough Cut**: Click "Build Rough Cut" to detect scenes and create a timeline
6. **Chat with AI**: Use the chat panel on the right to ask questions or get status updates

## 🎨 Design

- Dark theme (charcoal background)
- Sky-blue timeline tracks
- Flat design, no gradients or glows
- Rounded corners (8px)
- Minimal, clean UI

## ⚠️ Notes

- First run will download AI models (Whisper, YAMNet) which may take time
- OpenAI API key is optional - the app works with fallback responses
- FFmpeg must be installed for video processing
- Large video files may take time to process

## 🔧 Troubleshooting

### Backend Issues
- Ensure FFmpeg is installed: `ffmpeg -version`
- Check Python version: `python --version` (should be 3.9+)
- Verify media folder exists and is writable

### Frontend Issues
- Clear browser cache
- Check that backend is running on port 8000
- Verify CORS settings in backend/main.py

### AI Model Issues
- Models download on first use (may take several minutes)
- Check internet connection for model downloads
- Verify disk space (models can be large)

## 📄 License

MIT License

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

