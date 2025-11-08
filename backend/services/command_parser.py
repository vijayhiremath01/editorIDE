"""
AI Command Parser - Parses natural language commands into structured actions
"""
import re
from typing import Dict, List, Optional, Tuple

class CommandParser:
    """Parses natural language commands into structured edit operations"""
    
    def __init__(self):
        # Define command patterns
        self.patterns = {
            'cut': [
                r'cut\s+.*?\s+at\s+(\d+)\s*(?:seconds?|s)',
                r'split\s+.*?\s+at\s+(\d+)\s*(?:seconds?|s)',
                r'cut\s+at\s+(\d+)\s*(?:seconds?|s)',
            ],
            'crop': [
                r'crop\s+.*?\s+to\s+(?:a\s+)?(square|16:9|4:3|9:16)',
                r'crop\s+.*?\s+(\d+)\s*[xX]\s*(\d+)',
                r'make\s+.*?\s+(square|16:9|4:3)',
            ],
            'speed': [
                r'(?:change|set|make)\s+.*?\s+speed\s+to\s+(\d*\.?\d+)\s*x',
                r'speed\s+.*?\s+up\s+by\s+(\d*\.?\d+)\s*x',
                r'slow\s+.*?\s+down\s+by\s+(\d*\.?\d+)\s*x',
                r'(\d*\.?\d+)\s*x\s+speed',
            ],
            'pip': [
                r'add\s+(?:a\s+)?pip\s+of\s+(.*?)\s+at\s+(\d+)\s*(?:seconds?|s)',
                r'picture\s+in\s+picture\s+(.*?)\s+at\s+(\d+)',
                r'overlay\s+(.*?)\s+at\s+(\d+)',
            ],
            'text': [
                r'add\s+text\s+"(.*?)"\s+at\s+(\d+)\s*(?:seconds?|s)',
                r'overlay\s+text\s+"(.*?)"',
                r'caption\s+"(.*?)"',
            ],
            'reverse': [
                r'reverse\s+.*',
                r'play\s+.*?\s+backwards',
            ],
            'rotate': [
                r'rotate\s+.*?\s+(\d+)\s*degrees?',
                r'turn\s+.*?\s+(\d+)\s*degrees?',
            ],
            'delete': [
                r'delete\s+.*',
                r'remove\s+.*',
            ],
            'trim': [
                r'trim\s+.*?\s+from\s+(\d+)\s+to\s+(\d+)',
                r'cut\s+.*?\s+from\s+(\d+)\s+to\s+(\d+)',
                r'(?:cut|remove)\s+(?:the\s+)?first\s+(\d+)\s*(?:seconds?|s)'
            ],
        }
    
    def parse(self, command: str, context: Optional[Dict] = None) -> Optional[Dict]:
        """
        Parse a natural language command into a structured action
        
        Returns:
            {
                "action": "cut",
                "parameters": {"timestamp": 5.0},
                "file": "intro.mp4" (if mentioned)
            }
        """
        command_lower = command.lower()
        context = context or {}
        
        # Extract filename if mentioned
        filename = self._extract_filename(command, context)
        
        # Try each action pattern
        for action, patterns in self.patterns.items():
            for pattern in patterns:
                match = re.search(pattern, command_lower)
                if match:
                    params = self._extract_parameters(action, match, command_lower)
                    return {
                        "action": action,
                        "parameters": params,
                        "file": filename,
                        "raw_command": command
                    }
        
        return None
    
    def _extract_filename(self, command: str, context: Dict) -> Optional[str]:
        """Extract filename from command or context"""
        # Check context for selected file
        if context.get('selected_file'):
            return context['selected_file']
        
        # Try to extract from command
        file_pattern = r'([a-zA-Z0-9_\-\.]+\.(?:mp4|mov|avi|mkv|webm|mp3|wav|jpg|png))'
        match = re.search(file_pattern, command, re.IGNORECASE)
        if match:
            return match.group(1)
        
        return None
    
    def _extract_parameters(self, action: str, match: re.Match, command: str) -> Dict:
        """Extract parameters based on action type"""
        params = {}
        
        if action == 'cut':
            params['timestamp'] = float(match.group(1))
        
        elif action == 'crop':
            if match.group(1) in ['square', '16:9', '4:3', '9:16']:
                params['aspect_ratio'] = match.group(1)
            elif len(match.groups()) >= 2:
                params['width'] = int(match.group(1))
                params['height'] = int(match.group(2))
        
        elif action == 'speed':
            params['speed'] = float(match.group(1))
        
        elif action == 'pip':
            if len(match.groups()) >= 2:
                params['overlay_file'] = match.group(1).strip()
                params['timestamp'] = float(match.group(2))
        
        elif action == 'text':
            if len(match.groups()) >= 2:
                params['text'] = match.group(1)
                params['timestamp'] = float(match.group(2))
            elif len(match.groups()) >= 1:
                params['text'] = match.group(1)
        
        elif action == 'rotate':
            params['angle'] = int(match.group(1))
        
        elif action == 'trim':
            # Support both explicit range and "first N seconds"
            if len(match.groups()) >= 2:
                params['start'] = float(match.group(1))
                params['end'] = float(match.group(2))
            elif len(match.groups()) == 1:
                params['start'] = 0.0
                params['end'] = float(match.group(1))

        return params
    
    def get_tools(self) -> List[Dict]:
        """Get list of available tools for LangChain"""
        return [
            {
                "name": "cut_clip",
                "description": "Cut or split a video at a specific timestamp",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "file": {"type": "string", "description": "Video file path"},
                        "timestamp": {"type": "number", "description": "Timestamp in seconds"}
                    },
                    "required": ["file", "timestamp"]
                }
            },
            {
                "name": "crop_clip",
                "description": "Crop a video to specific dimensions or aspect ratio",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "file": {"type": "string"},
                        "aspect_ratio": {"type": "string", "enum": ["square", "16:9", "4:3", "9:16"]},
                        "width": {"type": "integer"},
                        "height": {"type": "integer"}
                    }
                }
            },
            {
                "name": "adjust_speed",
                "description": "Change video playback speed",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "file": {"type": "string"},
                        "speed": {"type": "number", "description": "Speed multiplier (e.g., 1.5 for 1.5x)"}
                    },
                    "required": ["file", "speed"]
                }
            },
            {
                "name": "pip_insert",
                "description": "Add picture-in-picture overlay",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "file": {"type": "string"},
                        "overlay_file": {"type": "string"},
                        "timestamp": {"type": "number"},
                        "position": {"type": "string", "enum": ["top-left", "top-right", "bottom-left", "bottom-right"]}
                    },
                    "required": ["file", "overlay_file", "timestamp"]
                }
            },
            {
                "name": "text_overlay",
                "description": "Add text overlay to video",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "file": {"type": "string"},
                        "text": {"type": "string"},
                        "timestamp": {"type": "number"},
                        "duration": {"type": "number"}
                    },
                    "required": ["file", "text"]
                }
            },
            {
                "name": "reverse_video",
                "description": "Reverse video playback",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "file": {"type": "string"}
                    },
                    "required": ["file"]
                }
            },
            {
                "name": "rotate_video",
                "description": "Rotate video",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "file": {"type": "string"},
                        "angle": {"type": "integer", "enum": [90, 180, 270]}
                    },
                    "required": ["file", "angle"]
                }
            },
            {
                "name": "trim_clip",
                "description": "Trim video from start to end timestamp",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "file": {"type": "string"},
                        "start": {"type": "number"},
                        "end": {"type": "number"}
                    },
                    "required": ["file", "start", "end"]
                }
            }
        ]

