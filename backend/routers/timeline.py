"""
Timeline Router - Manages timeline operations
"""
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import List, Optional, Dict
import sys
from pathlib import Path

# Add parent directory to path for imports
sys.path.insert(0, str(Path(__file__).parent.parent))

from models.timeline import Timeline, Track, Clip, TrackType
from utils.timeline_manager import timeline_manager
from routers import websocket
import asyncio

router = APIRouter(prefix="/timeline", tags=["timeline"])

class CreateProjectRequest(BaseModel):
    project_id: str

class AddClipRequest(BaseModel):
    project_id: str
    track_id: str
    clip: Dict  # Accept dict, will convert to Clip

class UpdateClipRequest(BaseModel):
    project_id: str
    track_id: str
    clip_id: str
    updates: Dict

class RemoveClipRequest(BaseModel):
    project_id: str
    track_id: str
    clip_id: str

@router.post("/create-project")
async def create_project(request: CreateProjectRequest):
    """Create a new project timeline"""
    timeline_obj = timeline_manager.create_project(request.project_id)
    await websocket.broadcast_event("project_created", {
        "project_id": request.project_id,
        "timeline": timeline_obj.dict()
    })
    return {"success": True, "timeline": timeline_obj.dict()}

@router.get("/project/{project_id}")
async def get_project(project_id: str):
    """Get project timeline"""
    timeline = timeline_manager.get_project(project_id)
    if not timeline:
        raise HTTPException(status_code=404, detail="Project not found")
    return {"success": True, "timeline": timeline.dict()}

@router.post("/add-clip")
async def add_clip(request: AddClipRequest):
    """Add clip to timeline"""
    timeline_obj = timeline_manager.get_project(request.project_id)
    if not timeline_obj:
        raise HTTPException(status_code=404, detail="Project not found")
    
    # Convert dict to Clip model
    clip_data = request.clip if isinstance(request.clip, dict) else request.clip.dict()
    clip_obj = Clip(**clip_data)
    success = timeline_obj.add_clip(request.track_id, clip_obj)
    if success:
        timeline_manager.update_project(request.project_id, timeline_obj)
        await websocket.broadcast_event("clip_added", {
            "project_id": request.project_id,
            "track_id": request.track_id,
            "clip": clip_obj.dict()
        })
        await websocket.broadcast_event("timeline_updated", {
            "project_id": request.project_id,
            "timeline": timeline_obj.dict()
        })
        return {"success": True}
    raise HTTPException(status_code=400, detail="Failed to add clip")

@router.post("/update-clip")
async def update_clip(request: UpdateClipRequest):
    """Update clip in timeline"""
    timeline_obj = timeline_manager.get_project(request.project_id)
    if not timeline_obj:
        raise HTTPException(status_code=404, detail="Project not found")
    
    success = timeline_obj.update_clip(request.track_id, request.clip_id, request.updates)
    if success:
        timeline_manager.update_project(request.project_id, timeline_obj)
        await websocket.broadcast_event("clip_updated", {
            "project_id": request.project_id,
            "track_id": request.track_id,
            "clip_id": request.clip_id,
            "updates": request.updates
        })
        await websocket.broadcast_event("timeline_updated", {
            "project_id": request.project_id,
            "timeline": timeline_obj.dict()
        })
        return {"success": True}
    raise HTTPException(status_code=400, detail="Failed to update clip")

@router.post("/remove-clip")
async def remove_clip(request: RemoveClipRequest):
    """Remove clip from timeline"""
    timeline_obj = timeline_manager.get_project(request.project_id)
    if not timeline_obj:
        raise HTTPException(status_code=404, detail="Project not found")
    
    success = timeline_obj.remove_clip(request.track_id, request.clip_id)
    if success:
        timeline_manager.update_project(request.project_id, timeline_obj)
        await websocket.broadcast_event("clip_removed", {
            "project_id": request.project_id,
            "track_id": request.track_id,
            "clip_id": request.clip_id
        })
        await websocket.broadcast_event("timeline_updated", {
            "project_id": request.project_id,
            "timeline": timeline_obj.dict()
        })
        return {"success": True}
    raise HTTPException(status_code=400, detail="Failed to remove clip")

@router.post("/add-track")
async def add_track(project_id: str, track_type: TrackType):
    """Add new track to timeline"""
    timeline_obj = timeline_manager.get_project(project_id)
    if not timeline_obj:
        raise HTTPException(status_code=404, detail="Project not found")
    
    track = timeline_obj.add_track(track_type)
    timeline_manager.update_project(project_id, timeline_obj)
    await websocket.broadcast_event("track_added", {
        "project_id": project_id,
        "track": track.dict()
    })
    await websocket.broadcast_event("timeline_updated", {
        "project_id": project_id,
        "timeline": timeline_obj.dict()
    })
    return {"success": True, "track": track.dict()}

