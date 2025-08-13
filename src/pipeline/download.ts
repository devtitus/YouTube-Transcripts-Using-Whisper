import path from "node:path";
import fs from "node:fs";
import crypto from "node:crypto";
import { loadConfig, rootDir } from "../config.js";
import { runCommand } from "../utils/process.js";
import ytdlp from "yt-dlp-exec";

const cfg = loadConfig();

function handleYtdlpError(err: any) {
  const stderr: string = err?.stderr || err?.message || "";
  // Extract a short diagnostic (first 400 chars, single line) for debugging if enabled
  const diag = stderr.replace(/\s+/g, " ").slice(0, 400);

  const wrap = (msg: string) => {
    if (process.env.DEBUG_YTDLP === "1") {
      return `${msg} (yt-dlp stderr: ${diag || "n/a"})`;
    }
    return msg;
  };

  if (/private video/i.test(stderr)) {
    throw new Error(wrap("This video is private and cannot be downloaded."));
  }
  if (/video unavailable|404 Not Found/i.test(stderr)) {
    throw new Error(
      wrap("This video is unavailable and cannot be downloaded.")
    );
  }
  if (/age-restricted|adult only/i.test(stderr)) {
    throw new Error(
      wrap("This video is age-restricted and requires login to download.")
    );
  }
  if (/live event will begin|premieres? in/i.test(stderr)) {
    throw new Error(
      wrap("This video is a future live stream and cannot be transcribed yet.")
    );
  }
  if (/Sign in to confirm your age/i.test(stderr)) {
    throw new Error(
      wrap("Age confirmation required; cannot download anonymously.")
    );
  }
  if (/unsupported URL/i.test(stderr)) {
    throw new Error(wrap("Unsupported URL for yt-dlp."));
  }
  if (/network is unreachable|TLS handshake/i.test(stderr)) {
    throw new Error(
      wrap("Network / TLS failure reaching YouTube from container.")
    );
  }
  // Generic fallback with optional diagnostic
  throw new Error(
    wrap("Failed to download video audio. Please check the URL and try again.")
  );
}

export async function downloadAudioForJob(
  jobId: string,
  youtubeUrl: string
): Promise<{ audioPath: string; baseDir: string }> {
  // Store raw audio in a shared local folder `audio_file/`, not in DB, and not per-job
  const baseDir = cfg.audioDir;
  fs.mkdirSync(baseDir, { recursive: true });

  const safe = crypto
    .createHash("sha1")
    .update(youtubeUrl)
    .digest("hex")
    .slice(0, 16);
  const outPath = path.join(baseDir, `audio_${safe}.%(ext)s`);

  try {
    // Use the package runner (works on Windows without PATH). Build args explicitly to avoid bad flag names.
    await ytdlp(youtubeUrl, {
      format: "bestaudio/best",
      output: outPath,
      noProgress: true,
      ffmpegLocation: cfg.ffmpegCmd,
      // Provide a stable user agent; some environments fail without it
      userAgent:
        process.env.YTDLP_USER_AGENT ||
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
      // Retries to mitigate transient network issues in container
      retries: 2,
    });
  } catch (err) {
    handleYtdlpError(err);
  }

  // Find the downloaded file (extension can vary: webm, m4a, etc.)
  const files = fs
    .readdirSync(baseDir)
    .filter((f) => f.startsWith(`audio_${safe}.`));
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
    "-i",
    inputPath,
    "-ac",
    "1",
    "-ar",
    "16000",
    outWavPath,
  ]);

  return outWavPath;
}

export async function fetchVideoDurationSeconds(
  youtubeUrl: string
): Promise<number> {
  try {
    const result: any = await ytdlp(youtubeUrl, {
      dumpSingleJson: true,
      skipDownload: true,
      userAgent:
        process.env.YTDLP_USER_AGENT ||
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
      retries: 2,
    });
    const dur = result?.duration;
    if (typeof dur === "number" && isFinite(dur)) return dur;
    return 0;
  } catch (err) {
    handleYtdlpError(err);
    return 0; // Should not be reached due to throw, but satisfies type checker
  }
}
