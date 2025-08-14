import path from "node:path";
import fs from "node:fs";
import crypto from "node:crypto";
import { loadConfig, rootDir } from "../config.js";
import { runCommand } from "../utils/process.js";
import ytdlp from "yt-dlp-exec";

const cfg = loadConfig();

export async function downloadOptimizedAudioForJob(
  jobId: string,
  youtubeUrl: string,
  outBaseDir: string
): Promise<{ audioPath: string }> {
  // Download audio directly as optimized MP3 (64kbps, 16kHz, mono) - NO conversion needed!
  const outPath = path.join(outBaseDir, `audio_optimized.mp3`);

  // Use yt-dlp to download and convert in one step
  await ytdlp(youtubeUrl, {
    format: "bestaudio/best",
    output: outPath,
    noProgress: true,
    ffmpegLocation: cfg.ffmpegCmd,
    // Direct MP3 optimization during download - much faster!
    extractAudio: true,
    audioFormat: "mp3",
    audioQuality: 64, // 64kbps bitrate
    postprocessorArgs: [
      "-ac",
      "1", // Mono audio
      "-ar",
      "16000", // 16kHz sample rate (optimal for Whisper)
    ].join(" "), // Join as single string
  });

  // Verify the file was created
  if (!fs.existsSync(outPath)) {
    throw new Error("yt-dlp did not produce the optimized MP3 file");
  }

  return { audioPath: outPath };
}

// Legacy function - kept for backward compatibility
export async function downloadAudioForJob(
  jobId: string,
  youtubeUrl: string,
  outBaseDir: string
): Promise<{ audioPath: string }> {
  // LEGACY: Downloads in original format, requires conversion
  const outPath = path.join(outBaseDir, `audio.%(ext)s`);

  await ytdlp(youtubeUrl, {
    format: "bestaudio/best",
    output: outPath,
    noProgress: true,
    ffmpegLocation: cfg.ffmpegCmd,
  });

  const files = fs
    .readdirSync(outBaseDir)
    .filter((f) => f.startsWith(`audio.`));
  if (files.length === 0) {
    throw new Error("yt-dlp did not produce an audio file");
  }
  const audioPath = path.join(outBaseDir, files[0]);
  return { audioPath };
}

export async function fetchVideoDurationSeconds(
  youtubeUrl: string
): Promise<number> {
  // This will now throw an error if the URL is invalid or video is unavailable
  const result: any = await ytdlp(youtubeUrl, {
    dumpSingleJson: true,
    skipDownload: true,
  });
  const dur = result?.duration;
  if (typeof dur === "number" && isFinite(dur)) {
    return dur;
  }
  // If duration is missing from metadata, throw an error
  throw new Error("Could not determine video duration from metadata.");
}
