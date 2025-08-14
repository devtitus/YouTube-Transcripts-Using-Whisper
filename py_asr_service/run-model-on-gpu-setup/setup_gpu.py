#!/usr/bin/env python3
"""
GPU setup and verification script
"""

def check_gpu_setup():
    print("🔍 Checking GPU setup...")
    
    # Check if CUDA is available
    try:
        import torch
        print(f"✅ PyTorch installed: {torch.__version__}")
        
        if torch.cuda.is_available():
            print(f"✅ CUDA available: {torch.version.cuda}")
            print(f"🚀 GPU devices found: {torch.cuda.device_count()}")
            for i in range(torch.cuda.device_count()):
                gpu_name = torch.cuda.get_device_name(i)
                print(f"   GPU {i}: {gpu_name}")
        else:
            print("❌ CUDA not available")
            return False
            
    except ImportError:
        print("❌ PyTorch not found - installing...")
        return False
    
    # Check for NVIDIA libraries
    try:
        import nvidia.cublas.lib
        import nvidia.cudnn.lib
        print("✅ NVIDIA cuBLAS and cuDNN libraries found")
    except ImportError:
        print("⚠️  NVIDIA libraries not found - need to install")
        return False
    
    return True

def install_gpu_dependencies():
    """Install GPU dependencies"""
    import subprocess
    import sys
    
    print("📦 Installing GPU dependencies...")
    
    # Install NVIDIA libraries for CUDA 12
    subprocess.check_call([
        sys.executable, "-m", "pip", "install", 
        "nvidia-cublas-cu12", "nvidia-cudnn-cu12==9.*"
    ])
    
    print("✅ GPU dependencies installed!")

def test_gpu_model():
    """Test loading the model on GPU"""
    print("🧪 Testing GPU model loading...")
    
    from faster_whisper import WhisperModel
    
    try:
        # Load model on GPU
        model = WhisperModel("distil-large-v3", device="cuda", compute_type="float16")
        print("✅ Model loaded successfully on GPU!")
        
        # Check memory usage
        import torch
        if torch.cuda.is_available():
            memory_allocated = torch.cuda.memory_allocated() / 1024**3  # GB
            memory_cached = torch.cuda.memory_reserved() / 1024**3  # GB
            print(f"📊 GPU Memory - Allocated: {memory_allocated:.2f}GB, Cached: {memory_cached:.2f}GB")
        
        return True
        
    except Exception as e:
        print(f"❌ Error loading model on GPU: {e}")
        return False

if __name__ == "__main__":
    print("🚀 GPU Setup Verification")
    print("=" * 50)
    
    if not check_gpu_setup():
        try:
            install_gpu_dependencies()
            print("\n🔄 Please restart the script after installation...")
        except Exception as e:
            print(f"❌ Installation failed: {e}")
            print("\n💡 Manual installation steps:")
            print("pip install nvidia-cublas-cu12 nvidia-cudnn-cu12==9.*")
    else:
        if test_gpu_model():
            print("\n🎉 GPU setup complete! Ready for faster transcription.")
        else:
            print("\n❌ GPU model loading failed. Check CUDA installation.")
