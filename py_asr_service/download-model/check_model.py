#!/usr/bin/env python3
"""
Simple model downloader for faster-whisper models
"""

from faster_whisper import WhisperModel

def download_model(model_name="distil-large-v3"):
    """Download and cache a Whisper model"""
    print(f"🔽 Downloading model: {model_name}")
    
    try:
        # This will download the model to the cache if not already present
        model = WhisperModel(model_name, device="cpu", compute_type="int8")
        print(f"✅ Model {model_name} is ready!")
        return True
        
    except Exception as e:
        print(f"❌ Error with model: {e}")
        return False

if __name__ == "__main__":
    print("📥 Checking/downloading distil-large-v3 model...")
    success = download_model("distil-large-v3")
    
    if success:
        print("\n🎉 Model is ready! You can now start the ASR service.")
        print("Run: python server.py")
