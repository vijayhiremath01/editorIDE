"""
Timeline Manager - Manages project timeline state
"""
import json
from pathlib import Path
from typing import Optional
from models.timeline import Timeline, Track, Clip, TrackType
from routers.websocket import broadcast_event

class TimelineManager:
    """Manages timeline state and persistence"""
    
    def __init__(self, project_dir: Path = Path("./projects")):
        self.project_dir = project_dir
        self.project_dir.mkdir(exist_ok=True)
        self.timelines: dict = {}  # project_id -> Timeline
    
    def create_project(self, project_id: str) -> Timeline:
        """Create a new project timeline"""
        timeline = Timeline()
        # Add default tracks
        timeline.add_track(TrackType.VIDEO)
        timeline.add_track(TrackType.AUDIO)
        timeline.add_track(TrackType.TEXT)
        
        self.timelines[project_id] = timeline
        self._save_project(project_id, timeline)
        return timeline
    
    def get_project(self, project_id: str) -> Optional[Timeline]:
        """Get project timeline"""
        if project_id not in self.timelines:
            self._load_project(project_id)
        return self.timelines.get(project_id)
    
    def update_project(self, project_id: str, timeline: Timeline):
        """Update project timeline"""
        self.timelines[project_id] = timeline
        self._save_project(project_id, timeline)
        # Broadcast update (will be called from router)
        # asyncio.create_task(broadcast_event("timeline_updated", {
        #     "project_id": project_id,
        #     "timeline": timeline.dict()
        # }))
    
    def _save_project(self, project_id: str, timeline: Timeline):
        """Save project to disk"""
        project_file = self.project_dir / f"{project_id}.json"
        with open(project_file, 'w') as f:
            json.dump(timeline.dict(), f, indent=2)
    
    def _load_project(self, project_id: str) -> Optional[Timeline]:
        """Load project from disk"""
        project_file = self.project_dir / f"{project_id}.json"
        if project_file.exists():
            with open(project_file, 'r') as f:
                data = json.load(f)
                timeline = Timeline(**data)
                self.timelines[project_id] = timeline
                return timeline
        return None

# Global timeline manager
timeline_manager = TimelineManager()

# Fix import for async
import asyncio

