import 'dotenv/config';
import path from "node:path";
import fs from "node:fs";
import ffmpegStatic from "ffmpeg-static";

export interface ServiceConfig {
  audioDir: string;
  ffmpegCmd: string;
  ytdlpCmd: string;
  port: number;
  groqApiKey?: string;
  groqBaseUrl: string; // OpenAI-compatible route
  groqWhisperModel: string; // e.g., whisper-large-v3-turbo
  // Groq upload tuning
  groqAudioCodec: "aac" | "mp3";
  groqAudioBitrateKbps: number; // e.g., 32
  groqChunkSeconds: number; // e.g., 600 (10 minutes)
  groqMaxRequestMb: number; // when larger than this, chunk
  // Local ASR service configuration
  localAsrBaseUrl: string; // e.g., http://localhost:5686
  localAsrModel: string; // default model for local service
  localChunkSeconds: number; // e.g., 600 (10 minutes) for local service
  localMaxFileMb: number; // when larger than this, chunk for local service
  defaultModelType: "local" | "cloud" | "auto"; // default routing
}

function ensureDir(dir: string) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

export const rootDir = path.resolve(process.cwd());

export function loadConfig(): ServiceConfig {
  const audioDir = process.env.AUDIO_DIR || path.join(rootDir, "audio_file");
  const ffmpegResolved = typeof ffmpegStatic === 'string' ? (ffmpegStatic as string) : null;
  const ffmpegCmd = process.env.FFMPEG_CMD || ffmpegResolved || "ffmpeg";
  // We use yt-dlp-exec directly; keep YTDLP_CMD only as a last-resort fallback
  const ytdlpCmd = process.env.YTDLP_CMD || "yt-dlp";
  const port = parseInt(process.env.PORT || "5685", 10);
  const groqApiKey = process.env.GROQ_API_KEY || undefined;
  const groqBaseUrl = process.env.GROQ_BASE_URL || "https://api.groq.com/openai/v1";
  const groqWhisperModel = process.env.GROQ_WHISPER_MODEL || "whisper-large-v3-turbo";
  const groqAudioCodecEnv = (process.env.GROQ_AUDIO_CODEC || "aac").toLowerCase();
  const groqAudioCodec = (groqAudioCodecEnv === "mp3" ? "mp3" : "aac") as "aac" | "mp3";
  const groqAudioBitrateKbps = Math.max(16, parseInt(process.env.GROQ_AUDIO_BITRATE_KBPS || "32", 10) || 32);
  const groqChunkSeconds = Math.max(120, parseInt(process.env.GROQ_CHUNK_SECONDS || "600", 10) || 600);
  const groqMaxRequestMb = Math.max(5, parseInt(process.env.GROQ_MAX_REQUEST_MB || "15", 10) || 15);
  
  // Local ASR service configuration
  const localAsrBaseUrl = process.env.LOCAL_ASR_BASE_URL || "http://localhost:5686";
  const localAsrModel = process.env.LOCAL_ASR_MODEL || "base.en";
  const localChunkSeconds = Math.max(120, parseInt(process.env.LOCAL_CHUNK_SECONDS || "600", 10) || 600);
  const localMaxFileMb = Math.max(5, parseInt(process.env.LOCAL_MAX_FILE_MB || "100", 10) || 100);
  const defaultModelTypeEnv = (process.env.DEFAULT_MODEL_TYPE || "auto").toLowerCase();
  const defaultModelType = (["local", "cloud", "auto"].includes(defaultModelTypeEnv) ? defaultModelTypeEnv : "auto") as "local" | "cloud" | "auto";

  // Only create directories that are actually needed (audio files)
  ensureDir(audioDir);

  return { audioDir, ffmpegCmd, ytdlpCmd, port, groqApiKey, groqBaseUrl, groqWhisperModel, groqAudioCodec, groqAudioBitrateKbps, groqChunkSeconds, groqMaxRequestMb, localAsrBaseUrl, localAsrModel, localChunkSeconds, localMaxFileMb, defaultModelType };
}
