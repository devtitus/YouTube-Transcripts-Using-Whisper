import fs from "node:fs";
import path from "node:path";
import { fetch, FormData, File } from "undici";
import type { TranscriptJSON, TranscriptSegment } from "../types.js";
import { loadConfig } from "../config.js";

const cfg = loadConfig();

export interface GroqTranscribeOptions {
  jobId: string;
  wavPath: string;
  baseDir: string;
  youtubeUrl: string;
  language?: string; // hint
  model?: string; // whisper-large-v3-turbo | whisper-large-v3 | distil-whisper-large-v3-en
}

export async function transcribeWithGroq(opts: GroqTranscribeOptions) {
  if (!cfg.groqApiKey) {
    throw new Error("GROQ_API_KEY not set");
  }

  const form = new FormData();
  const buf = fs.readFileSync(opts.wavPath);
  const file = new File([buf], path.basename(opts.wavPath), { type: "audio/wav" });
  form.append("file", file);
  form.append("model", opts.model || cfg.groqWhisperModel);
  if (opts.language) form.append("language", opts.language);
  form.append("response_format", "verbose_json");

  // cfg.groqBaseUrl should be the OpenAI-compatible base (no trailing /audio/transcriptions)
  // e.g., https://api.groq.com/openai/v1
  const res = await fetch(`${cfg.groqBaseUrl}/audio/transcriptions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${cfg.groqApiKey}` },
    body: form as any,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Groq transcription failed: ${res.status} ${text}`);
  }
  const raw = await res.json();
  const normalized = normalizeOpenAIWhisperJson(raw, opts.jobId, opts.youtubeUrl);

  const outPrefix = path.join(opts.baseDir, `whisper_${opts.jobId}`);
  const jsonPath = path.join(opts.baseDir, `transcript_${opts.jobId}.json`);
  fs.writeFileSync(jsonPath, JSON.stringify(normalized, null, 2), "utf-8");

  // SRT/VTT/TXT from normalized segments
  const srtPath = `${outPrefix}.srt`;
  const vttPath = `${outPrefix}.vtt`;
  const txtPath = `${outPrefix}.txt`;
  fs.writeFileSync(srtPath, toSrt(normalized.segments), "utf-8");
  fs.writeFileSync(vttPath, toVtt(normalized.segments), "utf-8");
  fs.writeFileSync(txtPath, normalized.text + "\n", "utf-8");

  return { outPrefix, jsonPath, srtPath, vttPath, txtPath };
}

function normalizeOpenAIWhisperJson(raw: any, jobId: string, youtubeUrl: string): TranscriptJSON {
  // OpenAI-compatible verbose_json returns: text, language, duration? and segments [{ id, start, end, text }]
  const segments: TranscriptSegment[] = (raw.segments || []).map((s: any, idx: number) => ({
    idx: idx,
    startMs: Math.round((s.start ?? 0) * 1000),
    endMs: Math.round((s.end ?? 0) * 1000),
    text: (s.text ?? "").trim(),
  }));
  const text = (raw.text as string) ?? segments.map(s => s.text).join(" ");
  return {
    id: jobId,
    youtubeUrl,
    language: raw.language,
    durationMs: raw.duration ? Math.round(raw.duration * 1000) : undefined,
    model: raw.model || undefined,
    text: text.trim(),
    segments,
  };
}

function toSrt(segments: TranscriptSegment[]): string {
  return segments
    .map((s, i) => `${i + 1}\n${fmtSrtTime(s.startMs)} --> ${fmtSrtTime(s.endMs)}\n${s.text}\n`)
    .join("\n");
}

function toVtt(segments: TranscriptSegment[]): string {
  return `WEBVTT\n\n${segments
    .map((s) => `${fmtVttTime(s.startMs)} --> ${fmtVttTime(s.endMs)}\n${s.text}\n`)
    .join("\n")}`;
}

function fmtSrtTime(ms: number): string {
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  const msPart = ms % 1000;
  return `${pad2(h)}:${pad2(m)}:${pad2(s)},${pad3(msPart)}`;
}

function fmtVttTime(ms: number): string {
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  const msPart = ms % 1000;
  return `${pad2(h)}:${pad2(m)}:${pad2(s)}.${pad3(msPart)}`;
}

function pad2(n: number) { return n.toString().padStart(2, "0"); }
function pad3(n: number) { return n.toString().padStart(3, "0"); }
