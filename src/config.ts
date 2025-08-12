import 'dotenv/config';
import path from "node:path";
import fs from "node:fs";
import ffmpegStatic from "ffmpeg-static";

export interface ServiceConfig {
  audioDir: string;
  ffmpegCmd: string;
  ytdlpCmd:string;
  port: number;
  // Local ASR service configuration
  localAsrBaseUrl: string; // e.g., http://localhost:5686
  localAsrModel: string; // default model for local service
  localChunkSeconds: number; // e.g., 600 (10 minutes) for local service
  localMaxFileMb: number; // when larger than this, chunk for local service
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
  const ffmpegResolved = typeof ffmpegStatic === 'string' ? (ffmpegStatic as string) : null;
  const ffmpegCmd = process.env.FFMPEG_CMD || ffmpegResolved || "ffmpeg";
  // We use yt-dlp-exec directly; keep YTDLP_CMD only as a last-resort fallback
  const ytdlpCmd = process.env.YTDLP_CMD || "yt-dlp";
  const port = parseInt(process.env.PORT || "5685", 10);
  
  // Local ASR service configuration
  const localAsrBaseUrl = process.env.LOCAL_ASR_BASE_URL || "http://localhost:5686";
  const localAsrModel = process.env.LOCAL_ASR_MODEL || "base.en";
  const localChunkSeconds = Math.max(120, parseInt(process.env.LOCAL_CHUNK_SECONDS || "600", 10) || 600);
  const localMaxFileMb = Math.max(5, parseInt(process.env.LOCAL_MAX_FILE_MB || "100", 10) || 100);
  const localTimeoutMs = Math.max(60000, parseInt(process.env.LOCAL_TIMEOUT_MS || "1800000", 10) || 1800000); // Default 30 minutes

  // Only create directories that are actually needed (audio files)
  ensureDir(audioDir);

  return { audioDir, ffmpegCmd, ytdlpCmd, port, localAsrBaseUrl, localAsrModel, localChunkSeconds, localMaxFileMb, localTimeoutMs };
}
