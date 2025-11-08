import os
import shutil
from pathlib import Path

# Optional imports for audio classification
try:
    import tensorflow as tf
    import tensorflow_hub as hub
    TENSORFLOW_AVAILABLE = True
except ImportError:
    TENSORFLOW_AVAILABLE = False
    print("Warning: TensorFlow not available. Audio classification will use fallback method.")

try:
    import numpy as np
    import librosa
    import soundfile as sf
    AUDIO_LIBS_AVAILABLE = True
except ImportError:
    AUDIO_LIBS_AVAILABLE = False
    print("Warning: Audio processing libraries not available. Audio classification disabled.")

class AudioClassifier:
    """Classifies audio files using YAMNet and organizes them into folders"""
    
    def __init__(self):
        self.model = None
        self.class_names = None
        self.load_model()
        
        # Category mappings
        self.sfx_classes = [
            'Door', 'Knock', 'Tap', 'Slam', 'Crash', 'Squeak', 'Click',
            'Mechanical', 'Tools', 'Machine', 'Motor', 'Engine', 'Alarm',
            'Bell', 'Ring', 'Beep', 'Buzzer', 'Chime', 'Explosion', 'Gunshot',
            'Thump', 'Thud', 'Pop', 'Bang', 'Whistle', 'Whoosh', 'Rustle'
        ]
        
        self.music_classes = [
            'Music', 'Musical instrument', 'Guitar', 'Piano', 'Drum',
            'Singing', 'Choir', 'Harmonica', 'Organ', 'String instrument',
            'Wind instrument', 'Brass instrument', 'Percussion', 'Violin',
            'Saxophone', 'Trumpet', 'Flute', 'Cello', 'Bass guitar'
        ]
        
        self.ambience_classes = [
            'Nature sounds', 'Water', 'Rain', 'Ocean', 'River', 'Stream',
            'Wind', 'Thunder', 'Fire', 'Crowd', 'Applause', 'Chatter',
            'Traffic', 'Vehicle', 'Airplane', 'Helicopter', 'Train',
            'Boat', 'Subway', 'Footsteps', 'Walking', 'Running'
        ]
    
    def load_model(self):
        """Load YAMNet model from TensorFlow Hub"""
        if not TENSORFLOW_AVAILABLE:
            print("TensorFlow not available. Audio classification disabled.")
            self.model = None
            self.class_names = []
            return
            
        if not AUDIO_LIBS_AVAILABLE:
            print("Audio processing libraries not available. Audio classification disabled.")
            self.model = None
            self.class_names = []
            return
            
        try:
            model_handle = 'https://tfhub.dev/google/yamnet/1'
            self.model = hub.load(model_handle)
            
            # Load class names
            class_map_path = tf.keras.utils.get_file(
                'yamnet_class_map.csv',
                'https://raw.githubusercontent.com/tensorflow/models/master/research/audioset/yamnet/yamnet_class_map.csv',
                cache_dir='./models'
            )
            
            try:
                import pandas as pd
                class_map_df = pd.read_csv(class_map_path)
                self.class_names = class_map_df['display_name'].values
            except Exception as e:
                print(f"Warning: Could not load class map: {e}")
                # Fallback to empty class names
                self.class_names = []
        except Exception as e:
            print(f"Warning: Could not load YAMNet model: {e}")
            print("Audio classification will use fallback method")
            self.model = None
            self.class_names = []
    
    def classify_audio(self, file_path: str) -> str:
        """Classify an audio file and return category (SFX, Music, Ambience, or Other)"""
        # Fallback classification based on file extension and name
        if not self.model or not self.class_names or not TENSORFLOW_AVAILABLE or not AUDIO_LIBS_AVAILABLE:
            return self._fallback_classify(file_path)
        
        try:
            # Load and preprocess audio
            audio_data, sample_rate = librosa.load(file_path, sr=16000, duration=10)
            
            # Get predictions
            scores, embeddings, spectrogram = self.model(audio_data)
            
            # Get top predictions
            scores_mean = np.mean(scores, axis=0)
            top_indices = np.argsort(scores_mean)[::-1][:10]
            
            # Check categories
            sfx_score = 0
            music_score = 0
            ambience_score = 0
            
            for idx in top_indices:
                class_name = self.class_names[idx]
                score = scores_mean[idx]
                
                if any(sfx in class_name for sfx in self.sfx_classes):
                    sfx_score += score
                if any(music in class_name for music in self.music_classes):
                    music_score += score
                if any(amb in class_name for amb in self.ambience_classes):
                    ambience_score += score
            
            # Determine category
            if music_score > 0.3:
                return "Music"
            elif sfx_score > 0.2:
                return "SFX"
            elif ambience_score > 0.2:
                return "Ambience"
            else:
                return "Other"
                
        except Exception as e:
            print(f"Error classifying audio: {e}")
            return self._fallback_classify(file_path)
    
    def _fallback_classify(self, file_path: str) -> str:
        """Fallback classification based on filename patterns"""
        filename_lower = Path(file_path).name.lower()
        
        # Music patterns
        music_keywords = ['music', 'song', 'track', 'beat', 'melody', 'tune', 'audio', 'soundtrack']
        if any(keyword in filename_lower for keyword in music_keywords):
            return "Music"
        
        # SFX patterns
        sfx_keywords = ['sfx', 'effect', 'sound', 'click', 'beep', 'pop', 'bang', 'crash', 'slam']
        if any(keyword in filename_lower for keyword in sfx_keywords):
            return "SFX"
        
        # Ambience patterns
        ambience_keywords = ['ambient', 'ambience', 'nature', 'wind', 'rain', 'ocean', 'forest', 'crowd']
        if any(keyword in filename_lower for keyword in ambience_keywords):
            return "Ambience"
        
        # Default to Other
        return "Other"
    
    def organize_file(self, file_path: str, category: str):
        """Move file to appropriate category folder"""
        file_path_obj = Path(file_path)
        base_folder = file_path_obj.parent
        
        # Create category folder
        category_folder = base_folder / category
        category_folder.mkdir(exist_ok=True)
        
        # Move file
        destination = category_folder / file_path_obj.name
        if file_path_obj != destination:
            shutil.move(str(file_path_obj), str(destination))
            return str(destination)
        return str(file_path_obj)

