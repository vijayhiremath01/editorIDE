import os
import threading
from pathlib import Path
from watchdog.observers import Observer
from watchdog.events import FileSystemEventHandler

class FolderWatcher:
    """Watches a folder for new files and triggers callbacks"""
    
    def __init__(self, folder_path: Path, on_file_added_callback=None):
        self.folder_path = Path(folder_path)
        self.on_file_added = on_file_added_callback
        self.observer = None
        self.running = False
        self.event_handler = FileWatcherHandler(self)
        
    def start(self):
        """Start watching the folder"""
        if self.running:
            return
        
        self.folder_path.mkdir(parents=True, exist_ok=True)
        
        self.observer = Observer()
        self.observer.schedule(self.event_handler, str(self.folder_path), recursive=True)
        self.observer.start()
        self.running = True
    
    def stop(self):
        """Stop watching the folder"""
        if self.observer:
            self.observer.stop()
            self.observer.join()
        self.running = False
    
    def is_running(self):
        """Check if watcher is running"""
        return self.running
    
    def handle_file_added(self, file_path: Path):
        """Handle new file event"""
        if self.on_file_added:
            self.on_file_added(file_path)

class FileWatcherHandler(FileSystemEventHandler):
    """Handler for file system events"""
    
    def __init__(self, watcher: FolderWatcher):
        self.watcher = watcher
    
    def on_created(self, event):
        """Handle file creation event"""
        if not event.is_directory:
            file_path = Path(event.src_path)
            # Wait a bit to ensure file is fully written
            import time
            time.sleep(0.5)
            if file_path.exists():
                self.watcher.handle_file_added(file_path)

