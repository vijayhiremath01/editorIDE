import whisper
import json
from pathlib import Path
from datetime import timedelta

class TranscriptionService:
    """Transcribes audio/video using Whisper"""
    
    def __init__(self, model_size: str = "base"):
        """
        Initialize Whisper model
        Options: tiny, base, small, medium, large
        """
        self.model = None
        self.model_size = model_size
        try:
            print(f"Loading Whisper model ({model_size})...")
            self.model = whisper.load_model(model_size)
            print("Whisper model loaded successfully")
        except Exception as e:
            print(f"Warning: Could not load Whisper model: {e}")
            print("Transcription will not be available until model is loaded")
            self.model = None
    
    def transcribe(self, file_path: str) -> dict:
        """Transcribe audio/video file and return result with timestamps"""
        if not self.model:
            # Try to load model if not loaded
            try:
                print(f"Loading Whisper model ({self.model_size})...")
                self.model = whisper.load_model(self.model_size)
            except Exception as e:
                raise Exception(f"Whisper model not loaded and could not be loaded: {e}")
        
        print(f"Transcribing: {file_path}")
        
        # Transcribe
        result = self.model.transcribe(
            file_path,
            task="transcribe",
            language=None,  # Auto-detect
            verbose=False
        )
        
        # Format result
        segments = []
        for segment in result.get("segments", []):
            segments.append({
                "id": segment.get("id", len(segments)),
                "start": segment.get("start", 0),
                "end": segment.get("end", 0),
                "text": segment.get("text", "").strip()
            })
        
        return {
            "text": result.get("text", "").strip(),
            "language": result.get("language", "en"),
            "duration": result.get("segments", [{}])[-1].get("end", 0) if result.get("segments") else 0,
            "segments": segments
        }
    
    def save_srt(self, result: dict, source_file: Path) -> Path:
        """Save transcription as SRT subtitle file"""
        srt_path = source_file.parent / f"{source_file.stem}.srt"
        
        with open(srt_path, "w", encoding="utf-8") as f:
            for i, segment in enumerate(result.get("segments", []), 1):
                start_time = self.format_timestamp(segment["start"])
                end_time = self.format_timestamp(segment["end"])
                text = segment["text"]
                
                f.write(f"{i}\n")
                f.write(f"{start_time} --> {end_time}\n")
                f.write(f"{text}\n\n")
        
        return srt_path
    
    def format_timestamp(self, seconds: float) -> str:
        """Format seconds to SRT timestamp (HH:MM:SS,mmm)"""
        td = timedelta(seconds=seconds)
        hours, remainder = divmod(td.total_seconds(), 3600)
        minutes, seconds = divmod(remainder, 60)
        milliseconds = int((seconds % 1) * 1000)
        return f"{int(hours):02d}:{int(minutes):02d}:{int(seconds):02d},{milliseconds:03d}"
    
    def save_json(self, result: dict, source_file: Path) -> Path:
        """Save transcription as JSON metadata"""
        json_path = source_file.parent / f"{source_file.stem}_transcription.json"
        
        with open(json_path, "w", encoding="utf-8") as f:
            json.dump(result, f, indent=2, ensure_ascii=False)
        
        return json_path

