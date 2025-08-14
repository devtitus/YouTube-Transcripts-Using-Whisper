import "dotenv/config";
import path from "node:path";
import fs from "node:fs";
import ffmpegStatic from "ffmpeg-static";
import { DEFAULT_WHISPER_MODEL } from "./constants.js";

export interface ServiceConfig {
  audioDir: string;
  ffmpegCmd: string;
  ytdlpCmd: string;
  port: number;
  // Local ASR service configuration
  localAsrBaseUrl: string; // e.g., http://localhost:5689
  localAsrModel: string; // default model for local service
  localTimeoutMs: number; // timeout for local transcription requests
}

function ensureDir(dir: string) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

export const rootDir = path.resolve(process.cwd());

export function loadConfig(): ServiceConfig {
  const audioDir = process.env.AUDIO_DIR || path.join(rootDir, "audio_file");
  const ffmpegResolved =
    typeof ffmpegStatic === "string" ? (ffmpegStatic as string) : null;
  const ffmpegCmd = process.env.FFMPEG_CMD || ffmpegResolved || "ffmpeg";
  // We use yt-dlp-exec directly; keep YTDLP_CMD only as a last-resort fallback
  const ytdlpCmd = process.env.YTDLP_CMD || "yt-dlp";
  const port = parseInt(process.env.PORT || "5688", 10);

  // Local ASR service configuration
  const localAsrBaseUrl =
    process.env.LOCAL_ASR_BASE_URL || "http://localhost:5689";
  const localAsrModel = process.env.LOCAL_ASR_MODEL || DEFAULT_WHISPER_MODEL;
  const localTimeoutMs = Math.max(
    60000,
    parseInt(process.env.LOCAL_TIMEOUT_MS || "7200000", 10) || 7200000
  ); // Default 2 hours for full file processing

  // Only create directories that are actually needed (audio files)
  ensureDir(audioDir);

  return {
    audioDir,
    ffmpegCmd,
    ytdlpCmd,
    port,
    localAsrBaseUrl,
    localAsrModel,
    localTimeoutMs,
  };
}
