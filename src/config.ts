import 'dotenv/config';
import path from "node:path";
import fs from "node:fs";
import ffmpegStatic from "ffmpeg-static";

export interface ServiceConfig {
  apiKey?: string; // Optional API key for service authentication
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
  groqTimeoutMs: number; // timeout for groq transcription requests
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
  const port = parseInt(process.env.PORT || "5687", 10);
  const apiKey = process.env.API_KEY || undefined;
  const groqApiKey = process.env.GROQ_API_KEY || undefined;
  const groqBaseUrl = process.env.GROQ_BASE_URL || "https://api.groq.com/openai/v1";
  const groqWhisperModel = process.env.GROQ_WHISPER_MODEL || "whisper-large-v3-turbo";
  const groqAudioCodecEnv = (process.env.GROQ_AUDIO_CODEC || "aac").toLowerCase();
  const groqAudioCodec = (groqAudioCodecEnv === "mp3" ? "mp3" : "aac") as "aac" | "mp3";
  const groqAudioBitrateKbps = Math.max(16, parseInt(process.env.GROQ_AUDIO_BITRATE_KBPS || "32", 10) || 32);
  const groqChunkSeconds = Math.max(120, parseInt(process.env.GROQ_CHUNK_SECONDS || "600", 10) || 600);
  const groqMaxRequestMb = Math.max(5, parseInt(process.env.GROQ_MAX_REQUEST_MB || "15", 10) || 15);
  const groqTimeoutMs = Math.max(60000, parseInt(process.env.GROQ_TIMEOUT_MS || "1800000", 10) || 1800000); // Default 30 minutes
  
  // Only create directories that are actually needed (audio files)
  ensureDir(audioDir);

  return { apiKey, audioDir, ffmpegCmd, ytdlpCmd, port, groqApiKey, groqBaseUrl, groqWhisperModel, groqAudioCodec, groqAudioBitrateKbps, groqChunkSeconds, groqMaxRequestMb, groqTimeoutMs };
}
