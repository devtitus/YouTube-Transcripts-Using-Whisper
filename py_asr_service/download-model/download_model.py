#!/usr/bin/env python3
"""
Model downloader script for faster-whisper models
Downloads and caches the model for faster first-time usage
"""

import os
from faster_whisper import WhisperModel

def download_model(model_name="distil-large-v3", device="cpu", compute_type="int8"):
    """Download and cache a Whisper model"""
    print(f"🔽 Downloading model: {model_name}")
    print(f"Device: {device}, Compute type: {compute_type}")
    
    try:
        # This will download the model to the cache
        model = WhisperModel(model_name, device=device, compute_type=compute_type)
        print(f"✅ Model {model_name} downloaded successfully!")
        
        # Test the model with a simple transcription to ensure it's working
        print("🧪 Testing model...")
        
        # Create a simple test - transcribe silence (should return empty or minimal result)
        import tempfile
        import numpy as np
        
        # Create 1 second of silence as a simple wav file
        sample_rate = 16000
        duration = 1  # seconds
        silence = np.zeros(sample_rate * duration, dtype=np.int16)
        
        with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as f:
            # Write a simple WAV header and data
            import struct
            
            # WAV file header (44 bytes)
            f.write(b'RIFF')
            f.write(struct.pack('<I', 36 + len(silence) * 2))  # File size
            f.write(b'WAVE')
            f.write(b'fmt ')
            f.write(struct.pack('<I', 16))  # Format chunk size
            f.write(struct.pack('<H', 1))   # Audio format (PCM)
            f.write(struct.pack('<H', 1))   # Number of channels
            f.write(struct.pack('<I', sample_rate))  # Sample rate
            f.write(struct.pack('<I', sample_rate * 2))  # Byte rate
            f.write(struct.pack('<H', 2))   # Block align
            f.write(struct.pack('<H', 16))  # Bits per sample
            f.write(b'data')
            f.write(struct.pack('<I', len(silence) * 2))  # Data chunk size
            f.write(silence.tobytes())
            
            f.flush()
            
            # Test transcription
            segments, info = model.transcribe(f.name, language="en")
            print(f"✅ Model test successful! Detected language: {info.language}")
            
            # Clean up test file
            os.unlink(f.name)
            
        return True
        
    except Exception as e:
        print(f"❌ Error downloading model: {e}")
        return False

if __name__ == "__main__":
    # Download the default model
    print("📥 Starting model download...")
    
    # Use CPU by default since it's more compatible
    print("💻 Downloading CPU-optimized model...")
    success = download_model("distil-large-v3", device="cpu", compute_type="int8")
    
    if success:
        print("\n🎉 Model download completed successfully!")
        print("You can now start the ASR service with: python server.py")
    else:
        print("\n❌ Model download failed. Please check your internet connection and try again.")
