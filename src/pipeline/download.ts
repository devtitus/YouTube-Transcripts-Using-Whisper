import path from "node:path";
import fs from "node:fs";
import crypto from "node:crypto";
import { loadConfig, rootDir } from "../config.js";
import { runCommand } from "../utils/process.js";
import ytdlp from "yt-dlp-exec";

const cfg = loadConfig();

export async function downloadAudioForJob(jobId: string, youtubeUrl: string, outBaseDir: string): Promise<{ audioPath: string; }> {
  // Download audio directly to the job-specific temporary directory
  const outPath = path.join(outBaseDir, `audio.%(ext)s`);

  // Use the package runner. We specify a predictable output filename.
  await ytdlp(youtubeUrl, {
    format: "bestaudio/best",
    output: outPath,
    noProgress: true,
    ffmpegLocation: cfg.ffmpegCmd,
  });

  // Find the downloaded file (extension can vary: webm, m4a, etc.)
  const files = fs.readdirSync(outBaseDir).filter(f => f.startsWith(`audio.`));
  if (files.length === 0) {
    throw new Error("yt-dlp did not produce an audio file");
  }
  const audioPath = path.join(outBaseDir, files[0]);
  return { audioPath };
}

export async function convertToWav16kMono(inputPath: string): Promise<string> {
  // Convert in-place within the job's temporary directory
  const dir = path.dirname(inputPath);
  const basename = path.parse(inputPath).name;
  const outWavPath = path.join(dir, `${basename}_16k_mono.wav`);

  await runCommand(cfg.ffmpegCmd, [
    "-y",
    "-i", inputPath,
    "-ac", "1",
    "-ar", "16000",
    outWavPath,
  ]);

  return outWavPath;
}

export async function fetchVideoDurationSeconds(youtubeUrl: string): Promise<number> {
  // This will now throw an error if the URL is invalid or video is unavailable
  const result: any = await ytdlp(youtubeUrl, {
    dumpSingleJson: true,
    skipDownload: true,
  });
  const dur = result?.duration;
  if (typeof dur === 'number' && isFinite(dur)) {
    return dur;
  }
  // If duration is missing from metadata, throw an error
  throw new Error("Could not determine video duration from metadata.");
}
