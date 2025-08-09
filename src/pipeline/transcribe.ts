import path from "node:path";
import fs from "node:fs";
import { loadConfig } from "../config.js";
import { runCommand } from "../utils/process.js";
import type { TranscriptJSON, TranscriptSegment } from "../types.js";

const cfg = loadConfig();

export interface TranscribeOptions {
  jobId: string;
  wavPath: string;
  baseDir: string;
  language?: string; // e.g., en
  modelFileName?: string; // e.g., ggml-base.en.bin
  youtubeUrl: string;
}

export async function transcribeWithWhisperCpp(opts: TranscribeOptions) {
  const modelPath = path.isAbsolute(opts.modelFileName || cfg.whisperModel)
    ? (opts.modelFileName as string)
    : path.join(cfg.modelsDir, opts.modelFileName || cfg.whisperModel);

  const outPrefix = path.join(opts.baseDir, `whisper_${opts.jobId}`);

  // Produce txt, srt, vtt, json
  const args = [
    "-m", modelPath,
    "-f", opts.wavPath,
    "-of", outPrefix,
    "-otxt",
    "-osrt",
    "-ovtt",
    "-oj",
  ];
  if (opts.language) {
    args.push("-l", opts.language);
  }

  await runCommand(cfg.whisperCmd, args);

  const jsonPath = `${outPrefix}.json`;
  const srtPath = `${outPrefix}.srt`;
  const vttPath = `${outPrefix}.vtt`;
  const txtPath = `${outPrefix}.txt`;

  if (!fs.existsSync(jsonPath)) {
    throw new Error(`Whisper output JSON not found at ${jsonPath}`);
  }

  // Normalize JSON to our schema
  const raw = JSON.parse(fs.readFileSync(jsonPath, "utf-8"));
  const normalized = normalizeWhisperJson(raw, opts.jobId, opts.youtubeUrl);
  const normalizedJsonPath = path.join(opts.baseDir, `transcript_${opts.jobId}.json`);
  fs.writeFileSync(normalizedJsonPath, JSON.stringify(normalized, null, 2), "utf-8");

  return { outPrefix, jsonPath: normalizedJsonPath, srtPath, vttPath, txtPath };
}

function normalizeWhisperJson(raw: any, jobId: string, youtubeUrl: string): TranscriptJSON {
  // whisper.cpp JSON usually has { language, duration, segments: [{ id, seek, start, end, text, tokens, temperature, avg_logprob, compression_ratio, no_speech_prob } ] }
  const segments: TranscriptSegment[] = (raw.segments || []).map((seg: any, idx: number) => ({
    idx: idx,
    startMs: Math.round((seg.start ?? 0) * 1000),
    endMs: Math.round((seg.end ?? 0) * 1000),
    text: (seg.text ?? "").trim(),
    words: undefined, // could be enriched by parsing tokens if needed
  }));
  const text = segments.map(s => s.text).join(" ").trim();
  return {
    id: jobId,
    youtubeUrl,
    language: raw.language,
    durationMs: raw.duration ? Math.round(raw.duration * 1000) : undefined,
    model: raw.model || undefined,
    text,
    segments,
  };
}
