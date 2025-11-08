from scenedetect import VideoManager, SceneManager
from scenedetect.detectors import ContentDetector
import opentimelineio as otio
from pathlib import Path
from datetime import timedelta

class SceneDetector:
    """Detects scenes in video and builds OTIO timeline"""
    
    def __init__(self, threshold: float = 30.0):
        """
        Initialize scene detector
        threshold: Sensitivity (lower = more sensitive)
        """
        self.threshold = threshold
    
    def detect_scenes(self, file_path: str) -> list:
        """Detect scene boundaries in video"""
        print(f"Detecting scenes in: {file_path}")
        
        # Create video manager and scene manager
        video_manager = VideoManager([file_path])
        scene_manager = SceneManager()
        
        # Add detector
        scene_manager.add_detector(ContentDetector(threshold=self.threshold))
        
        # Start detection
        video_manager.set_duration()
        video_manager.start()
        scene_manager.detect_scenes(frame_source=video_manager)
        
        # Get scene list
        scene_list = scene_manager.get_scene_list()
        
        # Format scenes
        scenes = []
        for i, (start_time, end_time) in enumerate(scene_list):
            scenes.append({
                "id": i + 1,
                "start": start_time.get_seconds(),
                "end": end_time.get_seconds(),
                "duration": (end_time - start_time).get_seconds()
            })
        
        video_manager.release()
        
        return scenes
    
    def build_timeline(self, scenes: list, source_file: Path) -> Path:
        """Build OTIO timeline from scenes"""
        print(f"Building timeline with {len(scenes)} scenes")
        
        # Get actual video FPS using ffprobe
        import subprocess, json
        try:
            probe = subprocess.run([
                "ffprobe", "-v", "error", "-select_streams", "v:0",
                "-show_entries", "stream=r_frame_rate", "-of", "json", str(source_file)
            ], capture_output=True, text=True, check=True)
            fps_frac = json.loads(probe.stdout)["streams"][0]["r_frame_rate"]
            num, den = map(int, fps_frac.split("/"))
            fps = num / den
        except Exception:
            fps = 24  # fallback
        
        # Create timeline
        timeline = otio.schema.Timeline(name=source_file.stem)
        
        # Create track
        track = otio.schema.Track(name="Video", kind=otio.schema.TrackKind.Video)
        timeline.tracks.append(track)
        
        # Add clips for each scene, ensuring first clip starts at 0
        timeline_start = 0
        for scene in scenes:
            clip = otio.schema.Clip(
                name=f"Scene {scene['id']}",
                media_reference=otio.schema.ExternalReference(
                    target_url=str(source_file.absolute())
                ),
                source_range=otio.opentime.TimeRange(
                    start_time=otio.opentime.RationalTime(
                        value=int(scene['start'] * fps),
                        rate=fps
                    ),
                    duration=otio.opentime.RationalTime(
                        value=int(scene['duration'] * fps),
                        rate=fps
                    )
                )
            )
            # Ensure clips are placed sequentially starting at 0
            clip.visible_range = otio.opentime.TimeRange(
                start_time=otio.opentime.RationalTime(value=int(timeline_start * fps), rate=fps),
                duration=otio.opentime.RationalTime(value=int(scene['duration'] * fps), rate=fps)
            )
            timeline_start += scene['duration']
            track.append(clip)
        
        # Save timeline
        otio_path = source_file.parent / f"{source_file.stem}_roughcut.otio"
        otio.adapters.write_to_file(timeline, str(otio_path))
        
        return otio_path

