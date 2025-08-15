import path from "node:path";
import fs from "node:fs";
import crypto from "node:crypto";
import { loadConfig, rootDir } from "../config.js";
import { runCommand } from "../utils/process.js";
import ytdlp from "yt-dlp-exec";

const cfg = loadConfig();

export async function downloadAudioForJob(jobId: string, youtubeUrl: string): Promise<{ audioPath: string; baseDir: string; }> {
  // Store raw audio in a shared local folder `audio_file/`, not in DB, and not per-job
  const baseDir = cfg.audioDir;
  fs.mkdirSync(baseDir, { recursive: true });

  const safe = crypto.createHash("sha1").update(youtubeUrl).digest("hex").slice(0, 16);
  const outPath = path.join(baseDir, `audio_${safe}.%(ext)s`);

  // Use the package runner (works on Windows without PATH). Build args explicitly to avoid bad flag names.
  await ytdlp(youtubeUrl, {
    format: "bestaudio/best",
    output: outPath,
    noProgress: true,
    ffmpegLocation: cfg.ffmpegCmd,
  });

  // Find the downloaded file (extension can vary: webm, m4a, etc.)
  const files = fs.readdirSync(baseDir).filter(f => f.startsWith(`audio_${safe}.`));
  if (files.length === 0) {
    throw new Error("yt-dlp did not produce an audio file");
  }
  const audioPath = path.join(baseDir, files[0]);
  return { audioPath, baseDir };
}

export async function convertToWav16kMono(inputPath: string): Promise<string> {
  // Convert in-place within `audio_file/` directory
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
  try {
    const result: any = await ytdlp(youtubeUrl, {
      dumpSingleJson: true,
      skipDownload: true,
    });
    const dur = result?.duration;
    if (typeof dur === 'number' && isFinite(dur)) return dur;
    return 0;
  } catch {
    return 0;
  }
}
