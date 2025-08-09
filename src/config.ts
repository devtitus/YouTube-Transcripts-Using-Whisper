import 'dotenv/config';
import path from "node:path";
import fs from "node:fs";
import ffmpegStatic from "ffmpeg-static";

export interface ServiceConfig {
  dataDir: string;
  audioDir: string;
  modelsDir: string;
  whisperCmd: string; // path to whisper.cpp binary (e.g., ./third_party/whisper.cpp/main)
  whisperModel: string; // file name under modelsDir (e.g., ggml-base.en.bin)
  ffmpegCmd: string;
  ytdlpCmd: string;
  port: number;
  groqApiKey?: string;
  groqBaseUrl: string; // OpenAI-compatible route
  groqWhisperModel: string; // e.g., whisper-large-v3-turbo
}

function ensureDir(dir: string) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

export const rootDir = path.resolve(process.cwd());

export function loadConfig(): ServiceConfig {
  const dataDir = process.env.DATA_DIR || path.join(rootDir, "data");
  const audioDir = process.env.AUDIO_DIR || path.join(rootDir, "audio_file");
  const modelsDir = process.env.MODELS_DIR || path.join(rootDir, "models");
  const whisperCmd = process.env.WHISPER_CMD || path.join(rootDir, "third_party/whisper.cpp/main");
  const whisperModel = process.env.WHISPER_MODEL || "ggml-base.en.bin";
  const ffmpegResolved = typeof ffmpegStatic === 'string' ? (ffmpegStatic as string) : null;
  const ffmpegCmd = process.env.FFMPEG_CMD || ffmpegResolved || "ffmpeg";
  // We use yt-dlp-exec directly; keep YTDLP_CMD only as a last-resort fallback
  const ytdlpCmd = process.env.YTDLP_CMD || "yt-dlp";
  const port = parseInt(process.env.PORT || "8080", 10);
  const groqApiKey = process.env.GROQ_API_KEY || undefined;
  const groqBaseUrl = process.env.GROQ_BASE_URL || "https://api.groq.com/openai/v1";
  const groqWhisperModel = process.env.GROQ_WHISPER_MODEL || "whisper-large-v3-turbo";

  // Only create directories that are actually needed (audio files and models)
  [audioDir, modelsDir].forEach(ensureDir);

  return { dataDir, audioDir, modelsDir, whisperCmd, whisperModel, ffmpegCmd, ytdlpCmd, port, groqApiKey, groqBaseUrl, groqWhisperModel };
}
