import os
import shutil
import tempfile
from pathlib import Path
from typing import Optional, Dict, Any, List

from fastapi import FastAPI, UploadFile, File, Form
from fastapi.responses import JSONResponse
from faster_whisper import WhisperModel

# Local faster-whisper service (no whisper.cpp)
# ENV options:
#   DEFAULT_MODEL: base.en | small.en | tiny.en | large-v3 (default: base.en)
#   FW_DEVICE: cpu | cuda (default: cpu)
#   FW_COMPUTE_TYPE: int8 | int8_float16 | float16 | float32 (default: int8 for CPU)

DEFAULT_MODEL = os.environ.get("DEFAULT_MODEL", "base.en")
FW_DEVICE = os.environ.get("FW_DEVICE", "cpu")
FW_COMPUTE_TYPE = os.environ.get("FW_COMPUTE_TYPE", "int8")

app = FastAPI()

_model_cache: Dict[str, WhisperModel] = {}


def resolve_model_name(requested: Optional[str]) -> str:
    name = (requested or DEFAULT_MODEL or "base.en").strip()
    mapping = {
        # Map OpenAI-like names to faster-whisper sizes
        "whisper-large-v3-turbo": "base.en",
        "whisper-large-v3": "small.en",
        "distil-whisper-large-v3-en": "base.en",
        # Allow ggml names to map to faster-whisper
        "ggml-base.en.bin": "base.en",
        "ggml-small.en.bin": "small.en",
        "ggml-tiny.en.bin": "tiny.en",
    }
    normalized = name.lower()
    return mapping.get(normalized, name)


def get_model(size: str) -> WhisperModel:
    if size not in _model_cache:
        _model_cache[size] = WhisperModel(size, device=FW_DEVICE, compute_type=FW_COMPUTE_TYPE)
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
    return {
        "text": " ".join(texts).strip(),
        "language": getattr(info, "language", None),
        "duration": float(getattr(info, "duration", 0.0) or 0.0),
        "segments": segs,
        "model": getattr(info, "model_path", None) or getattr(info, "model", None) or "faster-whisper",
    }


@app.post("/openai/v1/audio/transcriptions")
async def transcribe(
    file: UploadFile = File(...),
    model: str = Form(DEFAULT_MODEL),
    language: Optional[str] = Form(None),
    response_format: str = Form("verbose_json"),
):
    if response_format != "verbose_json":
        return JSONResponse(status_code=400, content={"error": "Only verbose_json supported"})

    size = resolve_model_name(model)
    mdl = get_model(size)

    tmpdir = Path(tempfile.mkdtemp(prefix="asr_"))
    try:
        suffix = Path(file.filename or "audio").suffix or ".mp3"
        audio_tmp = tmpdir / f"in{suffix}"
        with audio_tmp.open("wb") as out:
            shutil.copyfileobj(file.file, out)

        segments, info = mdl.transcribe(str(audio_tmp), language=language)
        out = to_verbose_json(segments, info)
        out["model"] = size
        return out
    finally:
        try:
            shutil.rmtree(tmpdir, ignore_errors=True)
        except Exception:
            pass


@app.get("/healthz")
def healthz():
    return {"ok": True, "device": FW_DEVICE, "computeType": FW_COMPUTE_TYPE, "defaultModel": DEFAULT_MODEL}
