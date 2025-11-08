"""
AI Operations Router - Handles AI command parsing and execution
"""
from fastapi import APIRouter, HTTPException, BackgroundTasks
from pydantic import BaseModel
from typing import Optional, Dict
import os
from pathlib import Path

from services.command_parser import CommandParser
from services.task_manager import task_manager, TaskStatus
from services.video_editor import VideoEditor
from services.ai_chat import AIChatService

router = APIRouter(prefix="/ai", tags=["ai"])

command_parser = CommandParser()
video_editor = VideoEditor()
ai_chat = AIChatService()

class ExecuteCommandRequest(BaseModel):
    command: str
    context: Optional[Dict] = {}

class ExecuteCommandResponse(BaseModel):
    success: bool
    action: Optional[str] = None
    parameters: Optional[Dict] = None
    task_id: Optional[str] = None
    message: str

@router.post("/execute-command")
async def execute_command(request: ExecuteCommandRequest, background_tasks: BackgroundTasks):
    """Execute a natural language command"""
    try:
        # Parse the command
        parsed = command_parser.parse(request.command, request.context)
        
        if not parsed:
            return ExecuteCommandResponse(
                success=False,
                message="I couldn't understand that command. Try something like 'cut at 5 seconds' or 'crop to square'."
            )
        
        action = parsed.get("action")
        parameters = parsed.get("parameters", {})
        file_path = parsed.get("file") or request.context.get("selected_file")
        
        if not file_path:
            return ExecuteCommandResponse(
                success=False,
                message="Please select a file first, or specify the file in your command."
            )
        
        # Create task
        task_id = task_manager.create_task(
            action,
            f"Executing {action}...",
            {"command": request.command, "file": file_path}
        )
        
        # Execute the action
        def execute_task():
            try:
                task_manager.update_task(task_id, TaskStatus.RUNNING, 20, f"Processing {action}...")
                
                media_folder = Path(os.getenv("MEDIA_FOLDER", "./media"))
                if not Path(file_path).is_absolute():
                    file_path_full = media_folder / file_path
                else:
                    file_path_full = Path(file_path)
                
                result = None
                
                if action == "cut":
                    output_path = file_path_full.parent / f"{file_path_full.stem}_cut{file_path_full.suffix}"
                    # Support simple split at timestamp
                    ts = parameters.get("timestamp")
                    if ts is None and "start" in parameters:
                        ts = parameters.get("start", 0)
                    result = video_editor.split_video(
                        str(file_path_full),
                        str(output_path),
                        float(ts or 0)
                    )
                
                elif action == "crop":
                    output_path = file_path_full.parent / f"{file_path_full.stem}_crop{file_path_full.suffix}"
                    # Default crop dimensions
                    width = parameters.get("width", 640)
                    height = parameters.get("height", 480)
                    result = video_editor.crop_video(
                        str(file_path_full),
                        str(output_path),
                        0, 0, width, height
                    )
                
                elif action == "speed":
                    output_path = file_path_full.parent / f"{file_path_full.stem}_speed{file_path_full.suffix}"
                    result = video_editor.change_speed(
                        str(file_path_full),
                        str(output_path),
                        parameters.get("speed", 1.5)
                    )
                
                elif action == "reverse":
                    output_path = file_path_full.parent / f"{file_path_full.stem}_reverse{file_path_full.suffix}"
                    result = video_editor.reverse_video(
                        str(file_path_full),
                        str(output_path)
                    )
                
                elif action == "rotate":
                    output_path = file_path_full.parent / f"{file_path_full.stem}_rotate{file_path_full.suffix}"
                    result = video_editor.rotate_video(
                        str(file_path_full),
                        str(output_path),
                        parameters.get("angle", 90)
                    )
                
                elif action == "trim":
                    # Trim between start and end
                    start = float(parameters.get("start", 0))
                    end = parameters.get("end")
                    if end is None:
                        # Fallback: if only timestamp provided, treat as end
                        end = float(parameters.get("timestamp", start))
                    end = float(end)
                    if end <= start:
                        raise ValueError("End time must be greater than start time for trim")
                    output_path = file_path_full.parent / f"{file_path_full.stem}_trim_{int(start)}-{int(end)}{file_path_full.suffix}"
                    result = video_editor.split_video(
                        str(file_path_full),
                        str(output_path),
                        start,
                        end
                    )
                
                if result and result.get("success"):
                    task_manager.update_task(
                        task_id,
                        TaskStatus.COMPLETED,
                        100,
                        f"{action} completed successfully",
                        result
                    )
                else:
                    task_manager.update_task(
                        task_id,
                        TaskStatus.FAILED,
                        0,
                        f"{action} failed: {result.get('error', 'Unknown error') if result else 'Unknown error'}",
                        error=result.get('error', 'Unknown error') if result else 'Unknown error'
                    )
            except Exception as e:
                task_manager.update_task(
                    task_id,
                    TaskStatus.FAILED,
                    0,
                    f"Error: {str(e)}",
                    error=str(e)
                )
        
        background_tasks.add_task(execute_task)
        
        return ExecuteCommandResponse(
            success=True,
            action=action,
            parameters=parameters,
            task_id=task_id,
            message=f"Executing {action}..."
        )
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Command execution error: {str(e)}")

@router.get("/tools")
async def get_tools():
    """Get available AI tools"""
    return {
        "tools": command_parser.get_tools()
    }

@router.post("/parse-command")
async def parse_command(request: ExecuteCommandRequest):
    """Parse a command without executing it"""
    try:
        parsed = command_parser.parse(request.command, request.context)
        return {
            "success": parsed is not None,
            "parsed": parsed
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Command parsing error: {str(e)}")

