import asyncio
import uuid
from datetime import datetime
from typing import Dict, Optional
from enum import Enum

class TaskStatus(Enum):
    PENDING = "pending"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"

class TaskManager:
    """Manages background tasks with progress tracking"""
    
    def __init__(self):
        self.tasks: Dict[str, dict] = {}
    
    def create_task(self, task_type: str, description: str, metadata: dict = None) -> str:
        """Create a new task and return task ID"""
        task_id = str(uuid.uuid4())
        self.tasks[task_id] = {
            "id": task_id,
            "type": task_type,
            "description": description,
            "status": TaskStatus.PENDING.value,
            "progress": 0,
            "message": description,
            "metadata": metadata or {},
            "created_at": datetime.now().isoformat(),
            "updated_at": datetime.now().isoformat(),
            "result": None,
            "error": None
        }
        return task_id
    
    def update_task(self, task_id: str, status: Optional[TaskStatus] = None, 
                    progress: Optional[int] = None, message: Optional[str] = None,
                    result: Optional[dict] = None, error: Optional[str] = None):
        """Update task status and progress"""
        if task_id not in self.tasks:
            return
        
        task = self.tasks[task_id]
        if status:
            task["status"] = status.value
        if progress is not None:
            task["progress"] = min(100, max(0, progress))
        if message:
            task["message"] = message
        if result:
            task["result"] = result
        if error:
            task["error"] = error
            task["status"] = TaskStatus.FAILED.value
        
        task["updated_at"] = datetime.now().isoformat()
    
    def get_task(self, task_id: str) -> Optional[dict]:
        """Get task by ID"""
        return self.tasks.get(task_id)
    
    def get_all_tasks(self, limit: int = 50) -> list:
        """Get all tasks, sorted by creation time"""
        tasks = list(self.tasks.values())
        tasks.sort(key=lambda x: x["created_at"], reverse=True)
        return tasks[:limit]
    
    def cleanup_old_tasks(self, days: int = 7):
        """Remove tasks older than specified days"""
        cutoff = datetime.now().timestamp() - (days * 24 * 60 * 60)
        to_remove = [
            task_id for task_id, task in self.tasks.items()
            if datetime.fromisoformat(task["created_at"]).timestamp() < cutoff
        ]
        for task_id in to_remove:
            del self.tasks[task_id]

# Global task manager instance
task_manager = TaskManager()

