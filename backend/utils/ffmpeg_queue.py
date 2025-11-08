"""
FFmpeg Task Queue - Manages concurrent video processing tasks
"""
import asyncio
import subprocess
from typing import Dict, Optional
from datetime import datetime
from pathlib import Path
from services.task_manager import task_manager, TaskStatus

class FFmpegQueue:
    """Manages FFmpeg task queue with concurrency limits"""
    
    def __init__(self, max_concurrent: int = 2):
        self.max_concurrent = max_concurrent
        self.queue = asyncio.Queue()
        self.running_tasks = set()
        self.workers = []
        self.gpu_enabled = self._check_gpu_support()
    
    def _check_gpu_support(self) -> bool:
        """Check if GPU acceleration is available"""
        try:
            # Check for macOS VideoToolbox
            result = subprocess.run(
                ['ffmpeg', '-hide_banner', '-encoders'],
                capture_output=True,
                text=True,
                timeout=5
            )
            return 'h264_videotoolbox' in result.stdout or 'hevc_videotoolbox' in result.stdout
        except:
            return False
    
    def get_gpu_flags(self) -> list:
        """Get GPU acceleration flags for FFmpeg"""
        if not self.gpu_enabled:
            return []
        
        # macOS VideoToolbox
        return ['-hwaccel', 'videotoolbox']
    
    async def add_task(self, task_id: str, command: list, output_path: str):
        """Add task to queue"""
        await self.queue.put({
            'task_id': task_id,
            'command': command,
            'output_path': output_path,
            'created_at': datetime.now()
        })
    
    async def worker(self):
        """Worker process that executes FFmpeg tasks"""
        while True:
            try:
                task = await asyncio.wait_for(self.queue.get(), timeout=1.0)
                
                # Check if we can run more tasks
                if len(self.running_tasks) >= self.max_concurrent:
                    # Put back in queue
                    await self.queue.put(task)
                    await asyncio.sleep(0.5)
                    continue
                
                # Execute task
                self.running_tasks.add(task['task_id'])
                asyncio.create_task(self.execute_task(task))
                
            except asyncio.TimeoutError:
                continue
            except Exception as e:
                print(f"Queue worker error: {e}")
    
    async def execute_task(self, task: Dict):
        """Execute a single FFmpeg task"""
        task_id = task['task_id']
        command = task['command']
        output_path = task['output_path']
        
        try:
            task_manager.update_task(task_id, TaskStatus.RUNNING, 10, "Starting FFmpeg process...")
            
            # Add GPU flags if available
            if self.gpu_enabled and '-hwaccel' not in command:
                gpu_flags = self.get_gpu_flags()
                command = gpu_flags + command
            
            # Run FFmpeg
            process = await asyncio.create_subprocess_exec(
                *command,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE
            )
            
            # Monitor progress (simplified)
            task_manager.update_task(task_id, TaskStatus.RUNNING, 50, "Processing video...")
            
            stdout, stderr = await process.communicate()
            
            if process.returncode == 0 and Path(output_path).exists():
                task_manager.update_task(
                    task_id,
                    TaskStatus.COMPLETED,
                    100,
                    "Video processing completed",
                    {"output_path": output_path}
                )
            else:
                error_msg = stderr.decode() if stderr else "Unknown error"
                task_manager.update_task(
                    task_id,
                    TaskStatus.FAILED,
                    0,
                    f"FFmpeg failed: {error_msg[:100]}",
                    error=error_msg[:200]
                )
        except Exception as e:
            task_manager.update_task(
                task_id,
                TaskStatus.FAILED,
                0,
                f"Task execution error: {str(e)}",
                error=str(e)
            )
        finally:
            self.running_tasks.discard(task_id)
    
    async def start(self):
        """Start worker processes"""
        for _ in range(self.max_concurrent):
            worker = asyncio.create_task(self.worker())
            self.workers.append(worker)
    
    async def stop(self):
        """Stop all workers"""
        for worker in self.workers:
            worker.cancel()
        await asyncio.gather(*self.workers, return_exceptions=True)

# Global queue instance
ffmpeg_queue = FFmpegQueue(max_concurrent=2)

