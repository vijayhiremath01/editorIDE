import subprocess
import json
from pathlib import Path
from typing import Dict, Optional
import os

class VideoEditor:
    """Handles video editing operations using FFmpeg"""
    
    def __init__(self, use_gpu: bool = True):
        self.ffmpeg_path = self._find_ffmpeg()
        self.use_gpu = use_gpu and self._check_gpu_support()
    
    def _check_gpu_support(self) -> bool:
        """Check if GPU acceleration is available"""
        try:
            result = subprocess.run(
                [self.ffmpeg_path, '-hide_banner', '-encoders'],
                capture_output=True,
                text=True,
                timeout=5
            )
            return 'h264_videotoolbox' in result.stdout or 'hevc_videotoolbox' in result.stdout
        except:
            return False
    
    def _get_gpu_flags(self) -> list:
        """Get GPU acceleration flags"""
        if self.use_gpu:
            return ['-hwaccel', 'videotoolbox']
        return []
    
    def _find_ffmpeg(self) -> str:
        """Find FFmpeg executable"""
        # Try common paths
        for path in ['ffmpeg', '/opt/homebrew/bin/ffmpeg', '/usr/local/bin/ffmpeg']:
            try:
                result = subprocess.run(
                    [path, '-version'],
                    capture_output=True,
                    timeout=5
                )
                if result.returncode == 0:
                    return path
            except:
                continue
        return 'ffmpeg'  # Fallback

    def _run_ffmpeg(self, command: list, output_path: str) -> Dict:
        """Run FFmpeg command synchronously and return result dict"""
        try:
            # Ensure output directory exists
            out_path = Path(output_path)
            out_path.parent.mkdir(parents=True, exist_ok=True)

            full_cmd = self._get_gpu_flags() + command
            result = subprocess.run(full_cmd, capture_output=True, text=True)
            if result.returncode == 0 and out_path.exists():
                return {"success": True, "output_path": str(out_path)}
            return {"success": False, "error": result.stderr or "Unknown FFmpeg error"}
        except Exception as e:
            return {"success": False, "error": str(e)}

    def add_text_overlay(self, input_path: str, output_path: str,
                          text: str, x: int = 50, y: int = 50,
                          font_size: int = 24, font_color: str = "white",
                          fontfile: Optional[str] = None) -> Dict:
        """Add text overlay using drawtext filter"""
        # Escape text for FFmpeg drawtext
        safe_text = text.replace(':', '\\:').replace("'", "\\'")
        drawtext = f"drawtext=text='{safe_text}':x={x}:y={y}:fontsize={font_size}:fontcolor={font_color}"
        if fontfile:
            drawtext += f":fontfile='{fontfile}'"

        command = [
            self.ffmpeg_path, '-y',
            '-i', input_path,
            '-vf', drawtext,
            '-c:a', 'copy',
            output_path
        ]
        return self._run_ffmpeg(command, output_path)

    def add_pip_overlay(self, base_path: str, overlay_path: str, output_path: str,
                         x: int = 50, y: int = 50, width: Optional[int] = None,
                         height: Optional[int] = None) -> Dict:
        """Overlay picture-in-picture (overlay video/image onto base video)"""
        # Build scale for overlay if width/height provided
        scale = None
        if width and height:
            scale = f"[1:v]scale={width}:{height}[ov];[0:v][ov]overlay={x}:{y}"
        else:
            scale = f"[0:v][1:v]overlay={x}:{y}"

        command = [
            self.ffmpeg_path, '-y',
            '-i', base_path,
            '-i', overlay_path,
            '-filter_complex', scale,
            '-map', '0:a?',
            '-c:v', 'libx264',
            '-c:a', 'aac',
            '-shortest',
            output_path
        ]
        return self._run_ffmpeg(command, output_path)

    def adjust_opacity(self, input_path: str, output_path: str, alpha: float = 1.0) -> Dict:
        """Adjust clip opacity (alpha) using colorchannelmixer"""
        # Clamp alpha between 0 and 1
        alpha = max(0.0, min(1.0, alpha))
        command = [
            self.ffmpeg_path, '-y',
            '-i', input_path,
            '-vf', f"colorchannelmixer=aa={alpha}",
            '-c:a', 'copy',
            output_path
        ]
        return self._run_ffmpeg(command, output_path)

    def replace_audio(self, video_path: str, audio_path: str, output_path: str) -> Dict:
        """Replace video audio track with provided audio"""
        command = [
            self.ffmpeg_path, '-y',
            '-i', video_path,
            '-i', audio_path,
            '-map', '0:v:0', '-map', '1:a:0',
            '-c:v', 'copy', '-c:a', 'aac',
            '-shortest',
            output_path
        ]
        return self._run_ffmpeg(command, output_path)

    def add_background_audio(self, video_path: str, audio_path: str, output_path: str, audio_volume: float = 1.0) -> Dict:
        """Mix background audio into video using amix"""
        # audio_volume can be used via volume filter on second input
        command = [
            self.ffmpeg_path, '-y',
            '-i', video_path,
            '-i', audio_path,
            '-filter_complex', f"[1:a]volume={audio_volume}[bg];[0:a][bg]amix=inputs=2:duration=longest[mix]",
            '-map', '0:v', '-map', '[mix]',
            '-c:v', 'copy', '-c:a', 'aac',
            '-shortest',
            output_path
        ]
        return self._run_ffmpeg(command, output_path)

    def duplicate_clip(self, input_path: str, output_path: str) -> Dict:
        """Duplicate a media file by copying"""
        try:
            in_path = Path(input_path)
            out_path = Path(output_path)
            out_path.parent.mkdir(parents=True, exist_ok=True)
            data = in_path.read_bytes()
            out_path.write_bytes(data)
            return {"success": True, "output_path": str(out_path)}
        except Exception as e:
            return {"success": False, "error": str(e)}
    
    def split_video(self, input_path: str, output_path: str, 
                    start_time: float, end_time: Optional[float] = None) -> dict:
        """Split video at timestamp"""
        try:
            cmd = [self.ffmpeg_path, '-i', input_path, '-ss', str(start_time), '-c', 'copy']
            
            if end_time:
                cmd.extend(['-t', str(end_time - start_time)])
            
            cmd.append(output_path)
            
            result = subprocess.run(
                cmd,
                capture_output=True,
                text=True,
                timeout=300
            )
            
            if result.returncode == 0 and Path(output_path).exists():
                return {"success": True, "output_path": output_path}
            else:
                return {"success": False, "error": result.stderr}
        except Exception as e:
            return {"success": False, "error": str(e)}
    
    def change_speed(self, input_path: str, output_path: str, speed: float) -> dict:
        """Change video playback speed with GPU acceleration"""
        try:
            # Speed > 1.0 = faster, < 1.0 = slower
            # For video: setpts filter, for audio: atempo filter
            video_speed = 1.0 / speed
            audio_speed = speed
            
            # Limit audio speed between 0.5 and 2.0
            if audio_speed > 2.0:
                # Chain multiple atempo filters
                audio_filter = "atempo=2.0,atempo=" + str(audio_speed / 2.0)
            elif audio_speed < 0.5:
                audio_filter = "atempo=0.5,atempo=" + str(audio_speed * 2.0)
            else:
                audio_filter = f"atempo={audio_speed}"
            
            cmd = [self.ffmpeg_path] + self._get_gpu_flags() + ['-i', input_path]
            
            # Use GPU encoder if available
            if self.use_gpu:
                cmd.extend([
                    '-filter_complex',
                    f'[0:v]setpts={video_speed}*PTS[v];[0:a]{audio_filter}[a]',
                    '-map', '[v]', '-map', '[a]',
                    '-c:v', 'h264_videotoolbox',
                    '-b:v', '5M',
                    output_path, '-y'
                ])
            else:
                cmd.extend([
                    '-filter_complex',
                    f'[0:v]setpts={video_speed}*PTS[v];[0:a]{audio_filter}[a]',
                    '-map', '[v]', '-map', '[a]',
                    output_path, '-y'
                ])
            
            result = subprocess.run(
                cmd,
                capture_output=True,
                text=True,
                timeout=300
            )
            
            if result.returncode == 0 and Path(output_path).exists():
                return {"success": True, "output_path": output_path}
            else:
                return {"success": False, "error": result.stderr}
        except Exception as e:
            return {"success": False, "error": str(e)}
    
    def adjust_volume(self, input_path: str, output_path: str, volume_db: float) -> dict:
        """Adjust audio volume in dB"""
        try:
            # volume_db: positive = louder, negative = quieter
            cmd = [
                self.ffmpeg_path, '-i', input_path,
                '-af', f'volume={volume_db}dB',
                '-c:v', 'copy',  # Copy video without re-encoding
                output_path, '-y'
            ]
            
            result = subprocess.run(
                cmd,
                capture_output=True,
                text=True,
                timeout=300
            )
            
            if result.returncode == 0 and Path(output_path).exists():
                return {"success": True, "output_path": output_path}
            else:
                return {"success": False, "error": result.stderr}
        except Exception as e:
            return {"success": False, "error": str(e)}
    
    def crop_video(self, input_path: str, output_path: str, 
                   x: int, y: int, width: int, height: int) -> dict:
        """Crop video"""
        try:
            cmd = [
                self.ffmpeg_path, '-i', input_path,
                '-filter:v', f'crop={width}:{height}:{x}:{y}',
                output_path, '-y'
            ]
            
            result = subprocess.run(
                cmd,
                capture_output=True,
                text=True,
                timeout=300
            )
            
            if result.returncode == 0 and Path(output_path).exists():
                return {"success": True, "output_path": output_path}
            else:
                return {"success": False, "error": result.stderr}
        except Exception as e:
            return {"success": False, "error": str(e)}
    
    def rotate_video(self, input_path: str, output_path: str, angle: int) -> dict:
        """Rotate video (90, 180, 270 degrees)"""
        try:
            # FFmpeg transpose values: 1=90° clockwise, 2=90° counter-clockwise
            transpose_map = {
                90: '1',
                180: '1,1',  # Rotate twice
                270: '2',
                -90: '2'
            }
            
            transpose = transpose_map.get(angle, '1')
            
            cmd = [
                self.ffmpeg_path, '-i', input_path,
                '-vf', f'transpose={transpose}',
                output_path, '-y'
            ]
            
            result = subprocess.run(
                cmd,
                capture_output=True,
                text=True,
                timeout=300
            )
            
            if result.returncode == 0 and Path(output_path).exists():
                return {"success": True, "output_path": output_path}
            else:
                return {"success": False, "error": result.stderr}
        except Exception as e:
            return {"success": False, "error": str(e)}
    
    def reverse_video(self, input_path: str, output_path: str) -> dict:
        """Reverse video playback"""
        try:
            cmd = [
                self.ffmpeg_path, '-i', input_path,
                '-vf', 'reverse', '-af', 'areverse',
                output_path, '-y'
            ]
            
            result = subprocess.run(
                cmd,
                capture_output=True,
                text=True,
                timeout=300
            )
            
            if result.returncode == 0 and Path(output_path).exists():
                return {"success": True, "output_path": output_path}
            else:
                return {"success": False, "error": result.stderr}
        except Exception as e:
            return {"success": False, "error": str(e)}
    
    def get_video_info(self, input_path: str) -> dict:
        """Get video metadata using ffprobe"""
        try:
            # Try to find ffprobe
            ffprobe_path = 'ffprobe'
            if '/opt/homebrew/bin/ffmpeg' in self.ffmpeg_path:
                ffprobe_path = '/opt/homebrew/bin/ffprobe'
            elif '/usr/local/bin/ffmpeg' in self.ffmpeg_path:
                ffprobe_path = '/usr/local/bin/ffprobe'
            elif 'ffmpeg' in self.ffmpeg_path:
                ffprobe_path = self.ffmpeg_path.replace('ffmpeg', 'ffprobe')
            
            cmd = [
                ffprobe_path, '-v', 'quiet', '-print_format', 'json',
                '-show_format', '-show_streams', input_path
            ]
            
            result = subprocess.run(
                cmd,
                capture_output=True,
                text=True,
                timeout=30
            )
            
            if result.returncode == 0:
                info = json.loads(result.stdout)
                return {"success": True, "info": info}
            else:
                return {"success": False, "error": result.stderr}
        except Exception as e:
            return {"success": False, "error": str(e)}


            