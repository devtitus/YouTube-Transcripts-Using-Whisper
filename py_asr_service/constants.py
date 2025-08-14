"""
Centralized model configuration for Python ASR service
This is the single source of truth for model names and validation
"""

import os

# Default model to use across the application
DEFAULT_WHISPER_MODEL = "small"  # Optimized model with better hallucination resistance

# Valid model names that can be used
VALID_WHISPER_MODELS = [
    # Multilingual models (support translation and transcription)
    "base",
    "small",

]

# Legacy ggml format to standard format mapping
GGML_MODEL_MAPPING = {
    "ggml-base.bin": "base",
    "ggml-small.bin": "small",
}

def get_default_model():
    """Get the default model from environment or use centralized default"""
    return os.environ.get("LOCAL_ASR_MODEL") or os.environ.get("DEFAULT_MODEL", DEFAULT_WHISPER_MODEL)

def resolve_model_name(requested=None):
    """
    Resolve model name to standard format
    """
    name = (requested or get_default_model()).strip().lower()
    
    # Check if it's a ggml format that needs mapping
    if name in GGML_MODEL_MAPPING:
        resolved = GGML_MODEL_MAPPING[name]
    # Check if it's already a valid standard model name
    elif name in VALID_WHISPER_MODELS:
        resolved = name
    else:
        # Default to multilingual base model
        resolved = DEFAULT_WHISPER_MODEL
    
    print(f"[DEBUG] Requested: {requested}, Normalized: {name}, Resolved: {resolved}")
    return resolved

def is_valid_model(model_name):
    """Check if a model name is valid"""
    return model_name in VALID_WHISPER_MODELS or model_name in GGML_MODEL_MAPPING

def supports_translation(model_name):
    """Check if model supports translation (multilingual models only)"""
    resolved = resolve_model_name(model_name)
    return not resolved.endswith('.en')
