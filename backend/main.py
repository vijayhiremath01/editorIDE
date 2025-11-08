from fastapi import FastAPI, HTTPException, BackgroundTasks, UploadFile, File, Form
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, FileResponse
from pydantic import BaseModel
import os
import json
import shutil
from datetime import datetime
from pathlib import Path
from dotenv import load_dotenv
from typing import Optional

# Load environment variables
load_dotenv()

from services.folder_watcher import FolderWatcher
from services.audio_classifier import AudioClassifier
from services.transcription import TranscriptionService
from services.scene_detector import SceneDetector
from services.ai_chat import AIChatService
from services.task_manager import task_manager, TaskStatus
from services.video_editor import VideoEditor

from routers import ai_ops, websocket, timeline
import asyncio

app = FastAPI(title="AI Video Copilot v3 - Optimized & Professional")

# Include routers
app.include_router(ai_ops.router)
app.include_router(websocket.router)
app.include_router(timeline.router)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:5174", "http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Initialize services
media_folder = Path(os.getenv("MEDIA_FOLDER", "./media"))
media_folder.mkdir(exist_ok=True)

classifier = AudioClassifier()
transcriber = TranscriptionService()
scene_detector = SceneDetector()
ai_chat = AIChatService()
video_editor = VideoEditor()

# Background jobs tracking
jobs_log = []
folder_watcher = None

# Request models
class ChatRequest(BaseModel):
    message: str
    context: dict = {}

class FileRequest(BaseModel):
    file_path: str

class SplitRequest(BaseModel):
    file_path: str
    start_time: float
    end_time: Optional[float] = None

class SpeedRequest(BaseModel):
    file_path: str
    speed: float

class VolumeRequest(BaseModel):
    file_path: str
    volume_db: float

class CropRequest(BaseModel):
    file_path: str
    x: int
    y: int
    width: int
    height: int

class RotateRequest(BaseModel):
    file_path: str
    angle: int

class EditRequest(BaseModel):
    file_path: str
    operation: str
    parameters: dict = {}

# Additional request models for extended operations
class TextOverlayRequest(BaseModel):
    file_path: str
    text: str
    x: Optional[int] = 50
    y: Optional[int] = 50
    font_size: Optional[int] = 24
    font_color: Optional[str] = "white"
    fontfile: Optional[str] = None

class PipRequest(BaseModel):
    base_file_path: str
    overlay_file_path: str
    x: Optional[int] = 50
    y: Optional[int] = 50
    width: Optional[int] = None
    height: Optional[int] = None

class AudioReplaceRequest(BaseModel):
    video_file_path: str
    audio_file_path: str

class AudioAddRequest(BaseModel):
    video_file_path: str
    audio_file_path: str
    audio_volume: Optional[float] = 1.0

class OpacityRequest(BaseModel):
    file_path: str
    alpha: float

class DuplicateRequest(BaseModel):
    file_path: str

def on_file_added_handler(file_path: Path):
    """Handle new file added event"""
    log_job("file_added", f"New file detected: {file_path.name}", {"path": str(file_path)})

@app.on_event("startup")
async def startup_event():
    """Initialize folder watcher on startup"""
    global folder_watcher
    folder_watcher = FolderWatcher(media_folder, on_file_added_handler)
    folder_watcher.start()
    log_job("system", "Folder watcher started", {"folder": str(media_folder)})

@app.on_event("shutdown")
async def shutdown_event():
    """Stop folder watcher on shutdown"""
    global folder_watcher
    if folder_watcher:
        folder_watcher.stop()

def log_job(job_type: str, message: str, metadata: dict = {}):
    """Log a job action"""
    job = {
        "type": job_type,
        "message": message,
        "timestamp": datetime.now().isoformat(),
        "metadata": metadata
    }
    jobs_log.append(job)
    # Keep only last 100 jobs
    if len(jobs_log) > 100:
        jobs_log.pop(0)
    return job

@app.get("/")
async def root():
    return {"message": "AI Video Editor Copilot API", "status": "running"}

@app.get("/status")
async def get_status():
    """Get current status and recent jobs"""
    return {
        "status": "active",
        "media_folder": str(media_folder),
        "recent_jobs": jobs_log[-10:],
        "watcher_active": folder_watcher.is_running() if folder_watcher else False,
        "tasks": task_manager.get_all_tasks(10)
    }

@app.get("/task/{task_id}")
async def get_task(task_id: str):
    """Get task status by ID"""
    task = task_manager.get_task(task_id)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    return task

@app.get("/media/list")
async def list_media():
    """List all media files in the media folder with metadata"""
    media_files = []
    
    for root, dirs, files in os.walk(media_folder):
        for file in files:
            file_path = Path(root) / file
            relative_path = file_path.relative_to(media_folder)
            
            file_info = {
                "name": file,
                "path": str(relative_path),
                "full_path": str(file_path),
                "size": file_path.stat().st_size,
                "type": get_file_type(file),
                "duration": None,
                "thumbnail": None
            }
            
            # Get video metadata if it's a video file
            if file_info["type"] == "video":
                try:
                    info = video_editor.get_video_info(str(file_path))
                    if info.get("success"):
                        streams = info["info"].get("streams", [])
                        video_stream = next((s for s in streams if s.get("codec_type") == "video"), None)
                        if video_stream:
                            duration = info["info"].get("format", {}).get("duration")
                            if duration:
                                file_info["duration"] = float(duration)
                except Exception as e:
                    print(f"Error getting video info: {e}")
            
            media_files.append(file_info)
    
    return {"files": media_files}

@app.post("/upload")
async def upload_file(file: UploadFile = File(...)):
    """Upload a new media file"""
    try:
        # Create uploads directory if it doesn't exist
        upload_dir = media_folder / "uploads"
        upload_dir.mkdir(exist_ok=True)
        
        # Save file
        file_path = upload_dir / file.filename
        with open(file_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
        
        log_job("upload", f"File uploaded: {file.filename}", {"path": str(file_path)})
        
        return {
            "success": True,
            "message": "File uploaded successfully",
            "file_path": str(file_path.relative_to(media_folder)),
            "full_path": str(file_path),
            "size": file_path.stat().st_size
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Upload failed: {str(e)}")

@app.delete("/media/{file_path:path}")
async def delete_file(file_path: str):
    """Delete a media file"""
    full_path = media_folder / file_path
    
    # Security check
    try:
        full_path.resolve().relative_to(media_folder.resolve())
    except ValueError:
        raise HTTPException(status_code=403, detail="Access denied")
    
    if not full_path.exists():
        raise HTTPException(status_code=404, detail="File not found")
    
    try:
        full_path.unlink()
        log_job("delete", f"File deleted: {file_path}", {})
        return {"success": True, "message": "File deleted successfully"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Delete failed: {str(e)}")

@app.get("/media/{file_path:path}")
async def serve_media(file_path: str):
    """Serve media files"""
    full_path = media_folder / file_path
    
    # Security check - ensure path is within media folder
    try:
        full_path.resolve().relative_to(media_folder.resolve())
    except ValueError:
        raise HTTPException(status_code=403, detail="Access denied")
    
    if not full_path.exists():
        raise HTTPException(status_code=404, detail="File not found")
    
    return FileResponse(str(full_path))

@app.post("/classify-sfx")
async def classify_sfx(file_request: FileRequest, background_tasks: BackgroundTasks):
    """Classify audio file and organize into SFX/Ambience/Music folders"""
    file_path = Path(file_request.file_path)
    
    # If relative path, assume it's relative to media folder
    if not file_path.is_absolute():
        file_path = media_folder / file_path
    
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="File not found")
    
    task_id = task_manager.create_task("classification", "Classifying audio file", {"file": file_path.name})
    log_job("classification", "Starting audio classification", {"file": file_path.name, "task_id": task_id})
    
    def classify_task():
        try:
            task_manager.update_task(task_id, TaskStatus.RUNNING, 20, "Analyzing audio content...")
            category = classifier.classify_audio(str(file_path))
            task_manager.update_task(task_id, TaskStatus.RUNNING, 60, f"Organizing into {category} folder...")
            result_path = classifier.organize_file(str(file_path), category)
            task_manager.update_task(task_id, TaskStatus.COMPLETED, 100, f"Classified as {category}", 
                                   {"category": category, "output_path": str(result_path)})
            log_job("classification", f"Classified as {category}", {"file": file_path.name, "category": category})
        except Exception as e:
            task_manager.update_task(task_id, TaskStatus.FAILED, 0, f"Classification failed: {str(e)}", error=str(e))
            log_job("classification", f"Classification failed: {str(e)}", {"file": file_path.name, "error": str(e)})
    
    background_tasks.add_task(classify_task)
    
    return {"task_id": task_id, "message": "Classification started", "file": file_path.name}

@app.post("/auto-caption")
async def auto_caption(file_request: FileRequest, background_tasks: BackgroundTasks):
    """Transcribe video/audio and generate captions"""
    file_path = Path(file_request.file_path)
    
    if not file_path.is_absolute():
        file_path = media_folder / file_path
    
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="File not found")
    
    task_id = task_manager.create_task("transcription", "Transcribing audio/video", {"file": file_path.name})
    log_job("transcription", "Starting transcription", {"file": file_path.name, "task_id": task_id})
    
    def transcribe_task():
        try:
            task_manager.update_task(task_id, TaskStatus.RUNNING, 20, "Loading Whisper model...")
            result = transcriber.transcribe(str(file_path))
            task_manager.update_task(task_id, TaskStatus.RUNNING, 60, "Generating captions...")
            srt_path = transcriber.save_srt(result, file_path)
            task_manager.update_task(task_id, TaskStatus.COMPLETED, 100, "Transcription completed",
                                   {"srt_path": str(srt_path), "duration": result.get("duration", 0)})
            log_job("transcription", "Transcription completed", {
                "file": file_path.name,
                "srt_path": str(srt_path),
                "duration": result.get("duration", 0)
            })
        except Exception as e:
            task_manager.update_task(task_id, TaskStatus.FAILED, 0, f"Transcription failed: {str(e)}", error=str(e))
            log_job("transcription", f"Transcription failed: {str(e)}", {"file": file_path.name, "error": str(e)})
    
    background_tasks.add_task(transcribe_task)
    
    return {"task_id": task_id, "message": "Transcription started", "file": file_path.name}

@app.post("/build-roughcut")
async def build_roughcut(file_request: FileRequest, background_tasks: BackgroundTasks):
    """Detect scenes and build rough cut timeline"""
    file_path = Path(file_request.file_path)
    
    if not file_path.is_absolute():
        file_path = media_folder / file_path
    
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="File not found")
    
    task_id = task_manager.create_task("roughcut", "Building rough cut", {"file": file_path.name})
    log_job("roughcut", "Starting rough cut generation", {"file": file_path.name, "task_id": task_id})
    
    def roughcut_task():
        try:
            task_manager.update_task(task_id, TaskStatus.RUNNING, 20, "Detecting scenes...")
            scenes = scene_detector.detect_scenes(str(file_path))
            task_manager.update_task(task_id, TaskStatus.RUNNING, 60, f"Found {len(scenes)} scenes, building timeline...")
            otio_path = scene_detector.build_timeline(scenes, file_path)
            task_manager.update_task(task_id, TaskStatus.COMPLETED, 100, "Rough cut completed",
                                   {"scenes": len(scenes), "otio_path": str(otio_path)})
            log_job("roughcut", "Rough cut completed", {
                "file": file_path.name,
                "scenes": len(scenes),
                "otio_path": str(otio_path)
            })
        except Exception as e:
            task_manager.update_task(task_id, TaskStatus.FAILED, 0, f"Rough cut failed: {str(e)}", error=str(e))
            log_job("roughcut", f"Rough cut failed: {str(e)}", {"file": file_path.name, "error": str(e)})
    
    background_tasks.add_task(roughcut_task)
    
    return {"task_id": task_id, "message": "Rough cut generation started", "file": file_path.name}

@app.post("/split")
async def split_video(request: SplitRequest, background_tasks: BackgroundTasks):
    """Split video at timestamp"""
    file_path = Path(request.file_path)
    # Normalize incoming file paths (absolute, relative, or URL-like)
    if not file_path.is_absolute():
        file_path = media_folder / file_path
    if not file_path.exists():
        # Try resolving from URL-like path `/media/...`
        rp = request.file_path
        if isinstance(rp, str) and "/media/" in rp:
            rel = rp.split("/media/", 1)[1]
            alt = media_folder / rel
            if alt.exists():
                file_path = alt
        # Try resolving by filename under uploads
        if not file_path.exists():
            name = Path(rp).name if isinstance(rp, str) else None
            if name:
                alt2 = media_folder / "uploads" / name
                if alt2.exists():
                    file_path = alt2
        if not file_path.exists():
            raise HTTPException(status_code=404, detail="File not found")
    
    task_id = task_manager.create_task("split", "Splitting video", {"file": file_path.name})
    
    def split_task():
        try:
            task_manager.update_task(task_id, TaskStatus.RUNNING, 20, "Processing video split...")
            output_path = file_path.parent / f"{file_path.stem}_split_{int(request.start_time)}{file_path.suffix}"
            result = video_editor.split_video(str(file_path), str(output_path), request.start_time, request.end_time)
            
            if result["success"]:
                task_manager.update_task(task_id, TaskStatus.COMPLETED, 100, "Split completed", result)
            else:
                task_manager.update_task(task_id, TaskStatus.FAILED, 0, f"Split failed: {result.get('error')}", 
                                       error=result.get('error'))
        except Exception as e:
            task_manager.update_task(task_id, TaskStatus.FAILED, 0, f"Split failed: {str(e)}", error=str(e))
    
    background_tasks.add_task(split_task)
    return {"task_id": task_id, "message": "Split started"}

@app.post("/speed")
async def change_speed(request: SpeedRequest, background_tasks: BackgroundTasks):
    """Change video playback speed"""
    file_path = Path(request.file_path)
    
    if not file_path.is_absolute():
        file_path = media_folder / file_path
    
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="File not found")
    
    task_id = task_manager.create_task("speed", "Changing playback speed", {"file": file_path.name, "speed": request.speed})
    
    def speed_task():
        try:
            task_manager.update_task(task_id, TaskStatus.RUNNING, 20, "Processing speed change...")
            output_path = file_path.parent / f"{file_path.stem}_speed_{request.speed}x{file_path.suffix}"
            result = video_editor.change_speed(str(file_path), str(output_path), request.speed)
            
            if result["success"]:
                task_manager.update_task(task_id, TaskStatus.COMPLETED, 100, "Speed change completed", result)
            else:
                task_manager.update_task(task_id, TaskStatus.FAILED, 0, f"Speed change failed: {result.get('error')}", 
                                       error=result.get('error'))
        except Exception as e:
            task_manager.update_task(task_id, TaskStatus.FAILED, 0, f"Speed change failed: {str(e)}", error=str(e))
    
    background_tasks.add_task(speed_task)
    return {"task_id": task_id, "message": "Speed change started"}

@app.post("/volume")
async def adjust_volume(request: VolumeRequest, background_tasks: BackgroundTasks):
    """Adjust audio volume"""
    file_path = Path(request.file_path)
    # Normalize incoming file paths (absolute, relative, or URL-like)
    if not file_path.is_absolute():
        file_path = media_folder / file_path
    if not file_path.exists():
        rp = request.file_path
        if isinstance(rp, str) and "/media/" in rp:
            rel = rp.split("/media/", 1)[1]
            alt = media_folder / rel
            if alt.exists():
                file_path = alt
        if not file_path.exists():
            name = Path(rp).name if isinstance(rp, str) else None
            if name:
                alt2 = media_folder / "uploads" / name
                if alt2.exists():
                    file_path = alt2
        if not file_path.exists():
            raise HTTPException(status_code=404, detail="File not found")
    
    task_id = task_manager.create_task("volume", "Adjusting volume", {"file": file_path.name, "volume_db": request.volume_db})
    
    def volume_task():
        try:
            task_manager.update_task(task_id, TaskStatus.RUNNING, 20, "Processing volume adjustment...")
            output_path = file_path.parent / f"{file_path.stem}_volume_{request.volume_db}db{file_path.suffix}"
            result = video_editor.adjust_volume(str(file_path), str(output_path), request.volume_db)
            
            if result["success"]:
                task_manager.update_task(task_id, TaskStatus.COMPLETED, 100, "Volume adjustment completed", result)
            else:
                task_manager.update_task(task_id, TaskStatus.FAILED, 0, f"Volume adjustment failed: {result.get('error')}", 
                                       error=result.get('error'))
        except Exception as e:
            task_manager.update_task(task_id, TaskStatus.FAILED, 0, f"Volume adjustment failed: {str(e)}", error=str(e))
    
    background_tasks.add_task(volume_task)
    return {"task_id": task_id, "message": "Volume adjustment started"}

@app.post("/apply-edit")
async def apply_edit(request: EditRequest, background_tasks: BackgroundTasks):
    """Apply video editing operations"""
    file_path = Path(request.file_path)
    
    if not file_path.is_absolute():
        file_path = media_folder / file_path
    
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="File not found")
    
    task_id = task_manager.create_task("edit", f"Applying {request.operation}", {"file": file_path.name, "operation": request.operation})
    
    def edit_task():
        try:
            task_manager.update_task(task_id, TaskStatus.RUNNING, 20, f"Processing {request.operation}...")
            params = request.parameters
            output_path = file_path.parent / f"{file_path.stem}_{request.operation}{file_path.suffix}"
            result = None
            
            if request.operation == "crop":
                result = video_editor.crop_video(str(file_path), str(output_path), 
                                                params.get("x", 0), params.get("y", 0),
                                                params.get("width", 640), params.get("height", 480))
            elif request.operation == "rotate":
                result = video_editor.rotate_video(str(file_path), str(output_path), params.get("angle", 90))
            elif request.operation == "reverse":
                result = video_editor.reverse_video(str(file_path), str(output_path))
            else:
                task_manager.update_task(task_id, TaskStatus.FAILED, 0, f"Unknown operation: {request.operation}", 
                                       error=f"Unknown operation: {request.operation}")
                return
            
            if result and result.get("success"):
                task_manager.update_task(task_id, TaskStatus.COMPLETED, 100, f"{request.operation} completed", result)
            elif result:
                task_manager.update_task(task_id, TaskStatus.FAILED, 0, f"{request.operation} failed: {result.get('error')}", 
                                       error=result.get('error'))
        except Exception as e:
            task_manager.update_task(task_id, TaskStatus.FAILED, 0, f"{request.operation} failed: {str(e)}", error=str(e))
    
    background_tasks.add_task(edit_task)
    return {"task_id": task_id, "message": f"{request.operation} started"}

# Text overlay
@app.post("/text")
async def text_overlay(request: TextOverlayRequest, background_tasks: BackgroundTasks):
    file_path = Path(request.file_path)
    if not file_path.is_absolute():
        file_path = media_folder / file_path
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="File not found")

    task_id = task_manager.create_task("text", "Adding text overlay", {"file": file_path.name})

    def text_task():
        try:
            task_manager.update_task(task_id, TaskStatus.RUNNING, 20, "Rendering text overlay...")
            output_path = file_path.parent / f"{file_path.stem}_text{file_path.suffix}"
            result = video_editor.add_text_overlay(
                str(file_path),
                str(output_path),
                request.text,
                request.x or 50,
                request.y or 50,
                request.font_size or 24,
                request.font_color or "white",
                request.fontfile
            )
            if result["success"]:
                task_manager.update_task(task_id, TaskStatus.COMPLETED, 100, "Text overlay completed", result)
            else:
                task_manager.update_task(task_id, TaskStatus.FAILED, 0, f"Text overlay failed: {result.get('error')}", error=result.get('error'))
        except Exception as e:
            task_manager.update_task(task_id, TaskStatus.FAILED, 0, f"Text overlay failed: {str(e)}", error=str(e))

    background_tasks.add_task(text_task)
    return {"task_id": task_id, "message": "Text overlay started"}

# Picture-in-picture overlay
@app.post("/pip")
async def pip_overlay(request: PipRequest, background_tasks: BackgroundTasks):
    base_path = Path(request.base_file_path)
    overlay_path = Path(request.overlay_file_path)
    if not base_path.is_absolute():
        base_path = media_folder / base_path
    if not overlay_path.is_absolute():
        overlay_path = media_folder / overlay_path
    if not base_path.exists() or not overlay_path.exists():
        raise HTTPException(status_code=404, detail="Base or overlay file not found")

    task_id = task_manager.create_task("pip", "Adding picture-in-picture", {"file": base_path.name})

    def pip_task():
        try:
            task_manager.update_task(task_id, TaskStatus.RUNNING, 20, "Rendering overlay...")
            output_path = base_path.parent / f"{base_path.stem}_pip{base_path.suffix}"
            result = video_editor.add_pip_overlay(
                str(base_path),
                str(overlay_path),
                str(output_path),
                request.x or 50,
                request.y or 50,
                request.width,
                request.height
            )
            if result["success"]:
                task_manager.update_task(task_id, TaskStatus.COMPLETED, 100, "PIP completed", result)
            else:
                task_manager.update_task(task_id, TaskStatus.FAILED, 0, f"PIP failed: {result.get('error')}", error=result.get('error'))
        except Exception as e:
            task_manager.update_task(task_id, TaskStatus.FAILED, 0, f"PIP failed: {str(e)}", error=str(e))

    background_tasks.add_task(pip_task)
    return {"task_id": task_id, "message": "PIP started"}

# Audio replace
@app.post("/audio/replace")
async def audio_replace(request: AudioReplaceRequest, background_tasks: BackgroundTasks):
    video_path = Path(request.video_file_path)
    audio_path = Path(request.audio_file_path)
    if not video_path.is_absolute():
        video_path = media_folder / video_path
    if not audio_path.is_absolute():
        audio_path = media_folder / audio_path
    if not video_path.exists() or not audio_path.exists():
        raise HTTPException(status_code=404, detail="Video or audio file not found")

    task_id = task_manager.create_task("audio_replace", "Replacing audio track", {"file": video_path.name})

    def replace_task():
        try:
            task_manager.update_task(task_id, TaskStatus.RUNNING, 20, "Replacing audio...")
            output_path = video_path.parent / f"{video_path.stem}_replaced{video_path.suffix}"
            result = video_editor.replace_audio(str(video_path), str(audio_path), str(output_path))
            if result["success"]:
                task_manager.update_task(task_id, TaskStatus.COMPLETED, 100, "Audio replaced", result)
            else:
                task_manager.update_task(task_id, TaskStatus.FAILED, 0, f"Audio replace failed: {result.get('error')}", error=result.get('error'))
        except Exception as e:
            task_manager.update_task(task_id, TaskStatus.FAILED, 0, f"Audio replace failed: {str(e)}", error=str(e))

    background_tasks.add_task(replace_task)
    return {"task_id": task_id, "message": "Audio replace started"}

# Audio add (mix background)
@app.post("/audio/add")
async def audio_add(request: AudioAddRequest, background_tasks: BackgroundTasks):
    video_path = Path(request.video_file_path)
    audio_path = Path(request.audio_file_path)
    if not video_path.is_absolute():
        video_path = media_folder / video_path
    if not audio_path.is_absolute():
        audio_path = media_folder / audio_path
    if not video_path.exists() or not audio_path.exists():
        raise HTTPException(status_code=404, detail="Video or audio file not found")

    task_id = task_manager.create_task("audio_add", "Adding background audio", {"file": video_path.name})

    def add_task():
        try:
            task_manager.update_task(task_id, TaskStatus.RUNNING, 20, "Mixing audio...")
            output_path = video_path.parent / f"{video_path.stem}_bg{video_path.suffix}"
            result = video_editor.add_background_audio(str(video_path), str(audio_path), str(output_path), request.audio_volume or 1.0)
            if result["success"]:
                task_manager.update_task(task_id, TaskStatus.COMPLETED, 100, "Audio mixed", result)
            else:
                task_manager.update_task(task_id, TaskStatus.FAILED, 0, f"Audio mix failed: {result.get('error')}", error=result.get('error'))
        except Exception as e:
            task_manager.update_task(task_id, TaskStatus.FAILED, 0, f"Audio mix failed: {str(e)}", error=str(e))

    background_tasks.add_task(add_task)
    return {"task_id": task_id, "message": "Audio add started"}

# Opacity adjustment
@app.post("/opacity")
async def set_opacity(request: OpacityRequest, background_tasks: BackgroundTasks):
    file_path = Path(request.file_path)
    if not file_path.is_absolute():
        file_path = media_folder / file_path
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="File not found")

    task_id = task_manager.create_task("opacity", "Adjusting opacity", {"file": file_path.name})

    def opacity_task():
        try:
            task_manager.update_task(task_id, TaskStatus.RUNNING, 20, "Applying opacity...")
            output_path = file_path.parent / f"{file_path.stem}_opacity{file_path.suffix}"
            result = video_editor.adjust_opacity(str(file_path), str(output_path), request.alpha)
            if result["success"]:
                task_manager.update_task(task_id, TaskStatus.COMPLETED, 100, "Opacity adjusted", result)
            else:
                task_manager.update_task(task_id, TaskStatus.FAILED, 0, f"Opacity failed: {result.get('error')}", error=result.get('error'))
        except Exception as e:
            task_manager.update_task(task_id, TaskStatus.FAILED, 0, f"Opacity failed: {str(e)}", error=str(e))

    background_tasks.add_task(opacity_task)
    return {"task_id": task_id, "message": "Opacity started"}

# Duplicate clip
@app.post("/duplicate")
async def duplicate(request: DuplicateRequest, background_tasks: BackgroundTasks):
    file_path = Path(request.file_path)
    if not file_path.is_absolute():
        file_path = media_folder / file_path
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="File not found")

    task_id = task_manager.create_task("duplicate", "Duplicating clip", {"file": file_path.name})

    def duplicate_task():
        try:
            task_manager.update_task(task_id, TaskStatus.RUNNING, 20, "Duplicating...")
            output_path = file_path.parent / f"{file_path.stem}_copy{file_path.suffix}"
            result = video_editor.duplicate_clip(str(file_path), str(output_path))
            if result["success"]:
                task_manager.update_task(task_id, TaskStatus.COMPLETED, 100, "Duplicate completed", result)
            else:
                task_manager.update_task(task_id, TaskStatus.FAILED, 0, f"Duplicate failed: {result.get('error')}", error=result.get('error'))
        except Exception as e:
            task_manager.update_task(task_id, TaskStatus.FAILED, 0, f"Duplicate failed: {str(e)}", error=str(e))

    background_tasks.add_task(duplicate_task)
    return {"task_id": task_id, "message": "Duplicate started"}

@app.post("/chat")
async def chat(chat_request: ChatRequest):
    """AI chat endpoint with command parsing"""
    try:
        # Parse commands
        message_lower = chat_request.message.lower()
        
        # Check for commands
        if "arrange" in message_lower and "sfx" in message_lower:
            # Trigger SFX classification for all audio files
            return {
                "message": "I'll help you arrange your SFX files. Please select an audio file and click 'Arrange SFX'.",
                "commands": ["classify-sfx"],
                "timestamp": datetime.now().isoformat()
            }
        elif "rough cut" in message_lower or "roughcut" in message_lower or "build cut" in message_lower:
            return {
                "message": "I'll build a rough cut for you. Please select a video file and click 'Build Rough Cut'.",
                "commands": ["build-roughcut"],
                "timestamp": datetime.now().isoformat()
            }
        elif "caption" in message_lower or "transcribe" in message_lower:
            return {
                "message": "I'll generate captions for your video. Please select a video file and click 'Auto Caption'.",
                "commands": ["auto-caption"],
                "timestamp": datetime.now().isoformat()
            }
        
        # Get recent context from jobs log
        recent_jobs = jobs_log[-5:] if len(jobs_log) > 5 else jobs_log
        context = {
            "recent_jobs": recent_jobs,
            **chat_request.context
        }
        
        response = ai_chat.get_response(chat_request.message, context)
        
        log_job("chat", f"User: {chat_request.message}", {"response": response})
        
        return {
            "message": response,
            "timestamp": datetime.now().isoformat()
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Chat error: {str(e)}")

def get_file_type(filename: str) -> str:
    """Determine file type from extension"""
    ext = Path(filename).suffix.lower()
    video_exts = ['.mp4', '.mov', '.avi', '.mkv', '.webm', '.m4v']
    audio_exts = ['.wav', '.mp3', '.aac', '.m4a', '.flac', '.ogg']
    image_exts = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp']
    
    if ext in video_exts:
        return "video"
    elif ext in audio_exts:
        return "audio"
    elif ext in image_exts:
        return "image"
    else:
        return "other"

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
