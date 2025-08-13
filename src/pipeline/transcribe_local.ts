import fs from "node:fs";
import path from "node:path";
import { fetch, FormData, File } from "undici";
import type { TranscriptJSON, TranscriptSegment } from "../types.js";
import { loadConfig } from "../config.js";
import { runCommand } from "../utils/process.js";

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
      throw new Error(
        `Local ASR service health check failed: ${healthCheck.status}`
      );
    }
  } catch (error) {
    throw new Error(
      `Local ASR service is not available at ${cfg.localAsrBaseUrl}. Please ensure the Python service is running on port 5689.`
    );
  }

  // Use the provided model or fall back to config default
  const modelToUse = opts.model || cfg.localAsrModel;

  // Check if we need to chunk the audio file
  const needsChunking = await shouldChunkAudio(opts.wavPath);
  let result;

  if (needsChunking) {
    // Split into chunks and process each chunk
    const chunkPaths = await splitAudioIntoChunks(
      opts.wavPath,
      cfg.localChunkSeconds,
      opts.baseDir
    );

    // Process each chunk and merge results
    const merged: TranscriptJSON = {
      id: opts.jobId,
      youtubeUrl: opts.youtubeUrl,
      language: undefined,
      durationMs: 0,
      model: modelToUse,
      text: "",
      segments: [],
    };

    let cumulativeOffsetMs = 0;
    let detectedLanguage: string | undefined = opts.language;

    for (let i = 0; i < chunkPaths.length; i++) {
      const chunkPath = chunkPaths[i];

      // Transcribe this chunk
      const chunkResult = await transcribeFileWithLocal(
        chunkPath,
        detectedLanguage,
        modelToUse
      );
      const normalizedChunk = normalizeLocalAsrResponse(
        chunkResult,
        `${opts.jobId}_chunk_${i}`,
        opts.youtubeUrl,
        modelToUse
      );

      // Set detected language from first chunk
      if (!detectedLanguage && normalizedChunk.language) {
        detectedLanguage = normalizedChunk.language;
        merged.language = detectedLanguage;
      }

      // Offset timestamps and merge segments with overlap handling
      const overlapWindowMs = 2000; // tolerate 2s overlap
      for (const seg of normalizedChunk.segments) {
        const adjusted: TranscriptSegment = {
          idx: merged.segments.length,
          startMs: seg.startMs + cumulativeOffsetMs,
          endMs: seg.endMs + cumulativeOffsetMs,
          text: seg.text,
        };

        const last = merged.segments[merged.segments.length - 1];
        const isOverlapping =
          last &&
          adjusted.startMs < last.endMs - Math.min(500, overlapWindowMs / 2);
        const isDuplicateText =
          last && normalizeText(last.text) === normalizeText(adjusted.text);

        if (isOverlapping && isDuplicateText) {
          continue; // Skip duplicate segment
        }

        merged.segments.push(adjusted);
      }

      // Update cumulative offset based on last segment end
      cumulativeOffsetMs = merged.segments.length
        ? merged.segments[merged.segments.length - 1].endMs
        : cumulativeOffsetMs;
    }

    merged.text = merged.segments
      .map((s) => s.text)
      .join(" ")
      .trim();
    merged.durationMs = merged.segments.length
      ? merged.segments[merged.segments.length - 1].endMs
      : merged.durationMs;

    result = merged;
  } else {
    // Process entire file as single chunk
    const singleResult = await transcribeFileWithLocal(
      opts.wavPath,
      opts.language,
      modelToUse
    );
    result = normalizeLocalAsrResponse(
      singleResult,
      opts.jobId,
      opts.youtubeUrl,
      modelToUse
    );
  }

  // Save outputs in the same format as other transcription methods
  const outPrefix = path.join(opts.baseDir, `whisper_${opts.jobId}`);
  const jsonPath = path.join(opts.baseDir, `transcript_${opts.jobId}.json`);

  // Write JSON transcript
  fs.writeFileSync(jsonPath, JSON.stringify(result, null, 2), "utf-8");

  // Generate SRT, VTT, and TXT files
  const srtPath = `${outPrefix}.srt`;
  const vttPath = `${outPrefix}.vtt`;
  const txtPath = `${outPrefix}.txt`;

  fs.writeFileSync(srtPath, toSrt(result.segments), "utf-8");
  fs.writeFileSync(vttPath, toVtt(result.segments), "utf-8");
  fs.writeFileSync(txtPath, result.text + "\n", "utf-8");

  return { outPrefix, jsonPath, srtPath, vttPath, txtPath };
}

async function transcribeFileWithLocal(
  filePath: string,
  language: string | undefined,
  model: string
) {
  const form = new FormData();

  // Read the audio file
  const audioBuffer = fs.readFileSync(filePath);
  const fileName = path.basename(filePath);
  const file = new File([audioBuffer], fileName, {
    type: getAudioMimeType(fileName),
  });

  // Prepare form data
  form.append("file", file);
  form.append("model", model);
  if (language) {
    form.append("language", language);
  }
  form.append("response_format", "verbose_json");

  // Make request to local Python ASR service
  const response = await fetch(
    `${cfg.localAsrBaseUrl}/openai/v1/audio/transcriptions`,
    {
      method: "POST",
      body: form as any,
      // Set configurable timeout for transcription
      signal: AbortSignal.timeout(cfg.localTimeoutMs),
    }
  );

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `Local ASR transcription failed: ${response.status} ${errorText}`
    );
  }

  return await response.json();
}

function normalizeLocalAsrResponse(
  raw: any,
  jobId: string,
  youtubeUrl: string,
  model: string
): TranscriptJSON {
  // The local Python service returns OpenAI-compatible verbose_json format
  const segments: TranscriptSegment[] = (raw.segments || []).map(
    (s: any, idx: number) => ({
      idx: idx,
      startMs: Math.round((s.start ?? 0) * 1000),
      endMs: Math.round((s.end ?? 0) * 1000),
      text: (s.text ?? "").trim(),
    })
  );

  const text = (raw.text as string) ?? segments.map((s) => s.text).join(" ");

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
    ".mp3": "audio/mpeg",
    ".wav": "audio/wav",
    ".m4a": "audio/mp4",
    ".aac": "audio/aac",
    ".ogg": "audio/ogg",
    ".flac": "audio/flac",
  };
  return mimeTypes[ext] || "audio/wav";
}

function toSrt(segments: TranscriptSegment[]): string {
  return segments
    .map(
      (s, i) =>
        `${i + 1}\n${fmtSrtTime(s.startMs)} --> ${fmtSrtTime(s.endMs)}\n${
          s.text
        }\n`
    )
    .join("\n");
}

function toVtt(segments: TranscriptSegment[]): string {
  return `WEBVTT\n\n${segments
    .map(
      (s) => `${fmtVttTime(s.startMs)} --> ${fmtVttTime(s.endMs)}\n${s.text}\n`
    )
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

function pad2(n: number) {
  return n.toString().padStart(2, "0");
}
function pad3(n: number) {
  return n.toString().padStart(3, "0");
}

async function shouldChunkAudio(filePath: string): Promise<boolean> {
  try {
    const stats = fs.statSync(filePath);
    const fileSizeMb = stats.size / (1024 * 1024);
    return fileSizeMb > cfg.localMaxFileMb;
  } catch (error) {
    // If we can't determine file size, assume chunking is needed for safety
    return true;
  }
}

async function splitAudioIntoChunks(
  inputPath: string,
  chunkSeconds: number,
  baseDir: string
): Promise<string[]> {
  // Use WAV format for local processing to maintain quality
  const outPattern = path.join(baseDir, `local_chunk_%03d.wav`);
  const args = [
    "-y",
    "-i",
    inputPath,
    "-f",
    "segment",
    "-segment_time",
    String(chunkSeconds),
    "-reset_timestamps",
    "1",
    "-map",
    "0:a",
    "-c",
    "copy", // Keep as WAV
    outPattern,
  ];
  await runCommand(cfg.ffmpegCmd, args);

  // List generated files in numeric order
  const files = fs
    .readdirSync(baseDir)
    .filter((f) => f.startsWith("local_chunk_") && f.endsWith(".wav"))
    .sort();
  return files.map((f) => path.join(baseDir, f));
}

function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .replace(/[\p{P}\p{S}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}
