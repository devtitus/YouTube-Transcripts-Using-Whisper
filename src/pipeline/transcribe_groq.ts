import fs from "node:fs";
import path from "node:path";
import { fetch, FormData, File } from "undici";
import type { TranscriptJSON, TranscriptSegment } from "../types.js";
import { loadConfig } from "../config.js";
import { runCommand } from "../utils/process.js";

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

  // 1) Produce compressed audio for Groq uploads
  const { compressedPath, ext, mimeType } = await compressForGroq(opts.wavPath, opts.baseDir);

  // 2) Split into chunks (always; single chunk for short files)
  const chunkPaths = await splitAudioIntoChunks(compressedPath, cfg.groqChunkSeconds, ext, opts.baseDir);

  // 3) Transcribe each chunk with retries and merge results
  let detectedLanguage: string | undefined = opts.language;
  const merged: TranscriptJSON = {
    id: opts.jobId,
    youtubeUrl: opts.youtubeUrl,
    language: undefined,
    durationMs: 0,
    model: opts.model || cfg.groqWhisperModel,
    text: "",
    segments: [],
  } as TranscriptJSON;

  let cumulativeOffsetMs = 0;
  for (let i = 0; i < chunkPaths.length; i++) {
    const thisChunkPath = chunkPaths[i];

    const raw = await transcribeFileWithRetries(thisChunkPath, detectedLanguage, opts.model || cfg.groqWhisperModel, mimeType);
    const normalizedChunk = normalizeOpenAIWhisperJson(raw, opts.jobId, opts.youtubeUrl);
    if (!detectedLanguage && normalizedChunk.language) {
      detectedLanguage = normalizedChunk.language;
      merged.language = detectedLanguage;
    }

    // Offset timestamps and merge with simple overlap handling
    const overlapWindowMs = 2000; // tolerate 2s overlap
    for (const seg of normalizedChunk.segments) {
      const adjusted: TranscriptSegment = {
        idx: merged.segments.length,
        startMs: seg.startMs + cumulativeOffsetMs,
        endMs: seg.endMs + cumulativeOffsetMs,
        text: seg.text,
      };
      const last = merged.segments[merged.segments.length - 1];
      const isOverlapping = last && adjusted.startMs < (last.endMs - Math.min(500, overlapWindowMs / 2));
      const isDuplicateText = last && normalizeText(last.text) === normalizeText(adjusted.text);
      if (isOverlapping && isDuplicateText) {
        continue;
      }
      merged.segments.push(adjusted);
    }
    merged.text = merged.segments.map(s => s.text).join(" ").trim();
    merged.durationMs = merged.segments.length ? merged.segments[merged.segments.length - 1].endMs : merged.durationMs;

    // Update offset based on last segment end to avoid drift without ffprobe
    cumulativeOffsetMs = merged.segments.length ? merged.segments[merged.segments.length - 1].endMs : cumulativeOffsetMs;
  }

  const outPrefix = path.join(opts.baseDir, `whisper_${opts.jobId}`);
  const jsonPath = path.join(opts.baseDir, `transcript_${opts.jobId}.json`);
  fs.writeFileSync(jsonPath, JSON.stringify(merged, null, 2), "utf-8");

  // SRT/VTT/TXT from normalized segments
  const srtPath = `${outPrefix}.srt`;
  const vttPath = `${outPrefix}.vtt`;
  const txtPath = `${outPrefix}.txt`;
  fs.writeFileSync(srtPath, toSrt(merged.segments), "utf-8");
  fs.writeFileSync(vttPath, toVtt(merged.segments), "utf-8");
  fs.writeFileSync(txtPath, merged.text + "\n", "utf-8");

  return { outPrefix, jsonPath, srtPath, vttPath, txtPath };
}

async function compressForGroq(wavPath: string, baseDir: string): Promise<{ compressedPath: string; ext: string; mimeType: string; }> {
  const codec = cfg.groqAudioCodec; // 'aac' | 'mp3'
  const bitrate = cfg.groqAudioBitrateKbps;
  const ext = codec === 'aac' ? 'm4a' : 'mp3';
  const mimeType = codec === 'aac' ? 'audio/mp4' : 'audio/mpeg';
  const outPath = path.join(baseDir, `${path.parse(wavPath).name}.${ext}`);

  const ffArgs = [
    '-y',
    '-i', wavPath,
    '-ac', '1',
    '-ar', '16000',
    ...(codec === 'aac' ? ['-c:a', 'aac'] : ['-c:a', 'libmp3lame']),
    '-b:a', `${bitrate}k`,
    outPath,
  ];
  await runCommand(cfg.ffmpegCmd, ffArgs);
  return { compressedPath: outPath, ext, mimeType };
}

async function splitAudioIntoChunks(inputPath: string, chunkSeconds: number, ext: string, baseDir: string): Promise<string[]> {
  // Produce out_{index}.{ext} in baseDir
  const outPattern = path.join(baseDir, `chunk_%03d.${ext}`);
  const args = [
    '-y',
    '-i', inputPath,
    '-f', 'segment',
    '-segment_time', String(chunkSeconds),
    '-reset_timestamps', '1',
    '-map', '0:a',
    '-c', 'copy',
    outPattern,
  ];
  await runCommand(cfg.ffmpegCmd, args);

  // List generated files in numeric order
  const files = fs.readdirSync(baseDir)
    .filter(f => f.startsWith('chunk_') && f.endsWith(`.${ext}`))
    .sort();
  return files.map(f => path.join(baseDir, f));
}

async function transcribeFileWithRetries(filePath: string, language: string | undefined, model: string, mimeType: string) {
  const maxAttempts = 3;
  let attempt = 0;
  while (true) {
    attempt++;
    try {
      return await transcribeSingleFile(filePath, language, model, mimeType);
    } catch (err: any) {
      const message = String(err?.message || err);
      const is413 = message.includes(' 413 ') || /request_too_large|Request Entity Too Large/i.test(message);
      const is429Or5xx = /\s(429|5\d\d)\s/.test(message);
      if (is413) {
        // Try emergency re-split of this chunk into halves and process sequentially, then return combined raw
        const parentDir = path.dirname(filePath);
        const ext = path.extname(filePath).slice(1);
        const tmpDir = path.join(parentDir, `resplit_${path.parse(filePath).name}`);
        fs.mkdirSync(tmpDir, { recursive: true });
        const pattern = path.join(tmpDir, `sub_%03d.${ext}`);
        await runCommand(cfg.ffmpegCmd, [
          '-y',
          '-i', filePath,
          '-f', 'segment',
          '-segment_time', '300',
          '-reset_timestamps', '1',
          '-map', '0:a',
          '-c', 'copy',
          pattern,
        ]);
        const subs = fs.readdirSync(tmpDir).filter(f => f.startsWith('sub_') && f.endsWith(`.${ext}`)).sort().map(f => path.join(tmpDir, f));
        const raws: any[] = [];
        for (const sub of subs) {
          const r = await transcribeSingleFile(sub, language, model, mimeType);
          raws.push(r);
        }
        return mergeRawVerboseJson(raws);
      }
      if (is429Or5xx && attempt < maxAttempts) {
        const backoffMs = attempt === 1 ? 1000 : attempt === 2 ? 3000 : 7000;
        await new Promise(r => setTimeout(r, backoffMs));
        continue;
      }
      throw err;
    }
  }
}

async function transcribeSingleFile(filePath: string, language: string | undefined, model: string, mimeType: string) {
  const form = new FormData();
  const buf = fs.readFileSync(filePath);
  const file = new File([buf], path.basename(filePath), { type: mimeType });
  form.append('file', file);
  form.append('model', model);
  if (language) form.append('language', language);
  form.append('response_format', 'verbose_json');

  const res = await fetch(`${cfg.groqBaseUrl}/audio/transcriptions`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${cfg.groqApiKey}` },
    body: form as any,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Groq transcription failed: ${res.status} ${text}`);
  }
  return await res.json();
}

function mergeRawVerboseJson(raws: any[]): any {
  // Merge arrays of OpenAI-compatible verbose_json outputs into one raw
  const merged: any = { text: '', segments: [], language: undefined };
  let cumText: string[] = [];
  for (const r of raws) {
    if (!merged.language && r.language) merged.language = r.language;
    const segs = Array.isArray(r.segments) ? r.segments : [];
    for (const s of segs) {
      merged.segments.push({ ...s });
    }
    if (r.text) cumText.push(String(r.text));
  }
  merged.text = cumText.join(' ');
  return merged;
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

function normalizeText(t: string): string {
  return t.toLowerCase().replace(/[\p{P}\p{S}]+/gu, " ").replace(/\s+/g, " ").trim();
}
