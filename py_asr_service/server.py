import os
import shutil
import tempfile
from pathlib import Path
from typing import Optional, Dict, Any, List

from fastapi import FastAPI, UploadFile, File, Form
from fastapi.responses import JSONResponse
from faster_whisper import WhisperModel
from dotenv import load_dotenv

from constants import get_default_model, resolve_model_name, supports_translation

# Load environment variables from .env file
load_dotenv(Path(__file__).parent.parent / ".env")

# Local faster-whisper service (no whisper.cpp)
# Model configuration is now centralized in constants.py

FW_DEVICE = os.environ.get("FW_DEVICE", "cpu")
FW_COMPUTE_TYPE = os.environ.get("FW_COMPUTE_TYPE", "int8")

print(f"[GPU CONFIG] Device: {FW_DEVICE}, Compute Type: {FW_COMPUTE_TYPE}")

app = FastAPI()

_model_cache: Dict[str, WhisperModel] = {}


def get_model(size: str) -> WhisperModel:
    print(f"[DEBUG] Loading model: {size}")
    print(f"[DEBUG] Using device: {FW_DEVICE}, compute_type: {FW_COMPUTE_TYPE}")
    
    if size not in _model_cache:
        # faster-whisper doesn't support GGML format directly
        # We'll use the model name and let it download/cache the model
        # The local GGML files are from whisper.cpp format which is incompatible
        print(f"[DEBUG] Loading {size} model from Hugging Face (GGML format not supported by faster-whisper)")
        
        _model_cache[size] = WhisperModel(size, device=FW_DEVICE, compute_type=FW_COMPUTE_TYPE)
        print(f"[DEBUG] Model {size} loaded successfully on {FW_DEVICE}")
    
    return _model_cache[size]


def to_verbose_json(segments_iter, info) -> Dict[str, Any]:
    segs: List[Dict[str, Any]] = []
    texts: List[str] = []
    
    for idx, seg in enumerate(segments_iter):
        start = float(getattr(seg, "start", 0.0) or 0.0)
        end = float(getattr(seg, "end", 0.0) or 0.0)
        text = (getattr(seg, "text", "") or "").strip()
        
        segs.append({"id": idx, "start": start, "end": end, "text": text})
        if text:
            texts.append(text)
    
    # Join all text segments
    full_text = " ".join(texts).strip()
    
    return {
        "text": full_text,
        "language": getattr(info, "language", None),
        "duration": float(getattr(info, "duration", 0.0) or 0.0),
        "segments": segs,
        "model": getattr(info, "model_path", None) or getattr(info, "model", None) or "faster-whisper",
    }


@app.post("/openai/v1/audio/transcriptions")
async def transcribe(
    file: UploadFile = File(...),
    model: str = Form(None),  # Will use default from constants
    language: Optional[str] = Form(None),
    task: str = Form("transcribe"),  # "transcribe" or "translate"
    response_format: str = Form("verbose_json"),
):
    print(f"[DEBUG] Transcription request - Model: {model}, Language: {language}, Task: {task}")
    
    if response_format != "verbose_json":
        return JSONResponse(status_code=400, content={"error": "Only verbose_json supported"})

    size = resolve_model_name(model)
    print(f"[DEBUG] Resolved model size: {size}")
    
    # Check if task is translate but model is English-only
    if task == "translate" and not supports_translation(size):
        return JSONResponse(
            status_code=400, 
            content={"error": f"Translation not supported with English-only model '{size}'. Use multilingual model (base, small, medium, large)"}
        )
    
    mdl = get_model(size)

    tmpdir = Path(tempfile.mkdtemp(prefix="asr_"))
    try:
        suffix = Path(file.filename or "audio").suffix or ".mp3"
        audio_tmp = tmpdir / f"in{suffix}"
        with audio_tmp.open("wb") as out:
            shutil.copyfileobj(file.file, out)

        # Check model type for parameter optimization
        is_multilingual = supports_translation(size)
        
        # AGGRESSIVE anti-hallucination parameters optimized for distil-large-v3
        segments, info = mdl.transcribe(
            str(audio_tmp), 
            language=language,
            task=task,  # "transcribe" or "translate"
            vad_filter=True,
            vad_parameters=dict(
                min_silence_duration_ms=2000,  # Aggressive silence detection (2 seconds)
                threshold=0.6,  # Higher threshold for speech detection
                speech_pad_ms=300  # Reduced padding to avoid capturing noise
            ),
            beam_size=3,  # Reduced for more conservative, less creative output
            best_of=3,  # Conservative search
            temperature=0.0,  # Deterministic output
            compression_ratio_threshold=1.8,  # Stricter threshold (was 2.0)
            log_prob_threshold=-0.6,  # Much stricter probability threshold (was -0.8)
            no_speech_threshold=0.8,  # Very high threshold to avoid false speech (was 0.7)
            condition_on_previous_text=False,  # Critical: prevents error propagation
            word_timestamps=True,
            # Additional anti-hallucination measures
            suppress_blank=True,
            suppress_tokens=[-1],  # Suppress problematic tokens
            initial_prompt="",  # No bias from prompts
            # Prefix for translation tasks to provide context
            prefix="Transcript:" if task == "transcribe" else "English translation:",
        )
        out = to_verbose_json(segments, info)
        out["model"] = size
        out["task"] = task
        return out
    finally:
        try:
            shutil.rmtree(tmpdir, ignore_errors=True)
        except Exception:
            pass


@app.get("/healthz")
def healthz():
    return {"ok": True, "device": FW_DEVICE, "computeType": FW_COMPUTE_TYPE, "defaultModel": get_default_model()}
