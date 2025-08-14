/**
 * Centralized model configuration
 * This is the single source of truth for model names and defaults
 * Must match py_asr_service/constants.py
 */

// Default model to use across the application
export const DEFAULT_WHISPER_MODEL = "distil-large-v3"; // Optimized model with better hallucination resistance

// Valid standard model names
export const VALID_WHISPER_MODELS = [
  // Multilingual models (support translation and transcription)
  "base",
  "small",
  "medium",
  "large",
  "large-v2",
  "large-v3",
  "turbo",

  // Distil models (optimized for speed and accuracy)
  "distil-large-v2",
  "distil-large-v3",
  "distil-medium.en",
  "distil-small.en",

  // English-only models (transcription only)
  "base.en",
  "small.en",
  "medium.en",
  "tiny.en",
] as const;

// Legacy ggml format names (for validation only)
export const LEGACY_GGML_MODELS = [
  "ggml-base.bin",
  "ggml-small.bin",
  "ggml-medium.bin",
  "ggml-large.bin",
  "ggml-base.en.bin",
  "ggml-small.en.bin",
  "ggml-medium.en.bin",
  "ggml-tiny.en.bin",
  "ggml-small.en-q5_1.bin",
] as const;

// All valid models (standard + legacy)
export const ALL_VALID_MODELS = [
  ...VALID_WHISPER_MODELS,
  ...LEGACY_GGML_MODELS,
] as const;

export type WhisperModel = (typeof ALL_VALID_MODELS)[number];

// Helper function to validate model names
export function isValidModel(model: string): model is WhisperModel {
  return ALL_VALID_MODELS.includes(model as WhisperModel);
}

// Helper function to check if model supports translation
export function supportsTranslation(model: string): boolean {
  return !model.endsWith(".en") && !model.includes(".en.");
}
