import fs from "node:fs";
import path from "node:path";
import { fetch, FormData, File } from "undici";
import type { TranscriptJSON, TranscriptSegment } from "../types.js";
import { loadConfig } from "../config.js";

const cfg = loadConfig();

export interface LocalTranscribeOptions {
  jobId: string;
  wavPath: string;
  baseDir: string;
  youtubeUrl: string;
  language?: string;
  model?: string; // base.en | small.en | ggml-base.en.bin | ggml-small.en.bin
}

export async function transcribeWithLocal(opts: LocalTranscribeOptions) {
  // Check if local ASR service is available
  try {
    const healthCheck = await fetch(`${cfg.localAsrBaseUrl}/healthz`);
    if (!healthCheck.ok) {
      throw new Error(`Local ASR service health check failed: ${healthCheck.status}`);
    }
  } catch (error) {
    throw new Error(`Local ASR service is not available at ${cfg.localAsrBaseUrl}. Please ensure the Python service is running on port 5686.`);
  }

  // Use the provided model or fall back to config default
  const modelToUse = opts.model || cfg.localAsrModel;

  // Transcribe using local Python service
  const result = await transcribeFileWithLocal(opts.wavPath, opts.language, modelToUse);
  
  // Normalize the response to our standard format
  const normalized = normalizeLocalAsrResponse(result, opts.jobId, opts.youtubeUrl, modelToUse);

  // Save outputs in the same format as other transcription methods
  const outPrefix = path.join(opts.baseDir, `whisper_${opts.jobId}`);
  const jsonPath = path.join(opts.baseDir, `transcript_${opts.jobId}.json`);
  
  // Write JSON transcript
  fs.writeFileSync(jsonPath, JSON.stringify(normalized, null, 2), "utf-8");

  // Generate SRT, VTT, and TXT files
  const srtPath = `${outPrefix}.srt`;
  const vttPath = `${outPrefix}.vtt`;
  const txtPath = `${outPrefix}.txt`;
  
  fs.writeFileSync(srtPath, toSrt(normalized.segments), "utf-8");
  fs.writeFileSync(vttPath, toVtt(normalized.segments), "utf-8");
  fs.writeFileSync(txtPath, normalized.text + "\n", "utf-8");

  return { outPrefix, jsonPath, srtPath, vttPath, txtPath };
}

async function transcribeFileWithLocal(filePath: string, language: string | undefined, model: string) {
  const form = new FormData();
  
  // Read the audio file
  const audioBuffer = fs.readFileSync(filePath);
  const fileName = path.basename(filePath);
  const file = new File([audioBuffer], fileName, { type: getAudioMimeType(fileName) });
  
  // Prepare form data
  form.append('file', file);
  form.append('model', model);
  if (language) {
    form.append('language', language);
  }
  form.append('response_format', 'verbose_json');

  // Make request to local Python ASR service
  const response = await fetch(`${cfg.localAsrBaseUrl}/openai/v1/audio/transcriptions`, {
    method: 'POST',
    body: form as any,
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Local ASR transcription failed: ${response.status} ${errorText}`);
  }

  return await response.json();
}

function normalizeLocalAsrResponse(raw: any, jobId: string, youtubeUrl: string, model: string): TranscriptJSON {
  // The local Python service returns OpenAI-compatible verbose_json format
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
    model: model,
    text: text.trim(),
    segments,
  };
}

function getAudioMimeType(fileName: string): string {
  const ext = path.extname(fileName).toLowerCase();
  const mimeTypes: Record<string, string> = {
    '.mp3': 'audio/mpeg',
    '.wav': 'audio/wav',
    '.m4a': 'audio/mp4',
    '.aac': 'audio/aac',
    '.ogg': 'audio/ogg',
    '.flac': 'audio/flac',
  };
  return mimeTypes[ext] || 'audio/wav';
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