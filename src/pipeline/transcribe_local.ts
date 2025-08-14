import fs from "node:fs";
import path from "node:path";
import { fetch, FormData, File } from "undici";
import { runCommand } from "../utils/process.js";
import type { TranscriptJSON, TranscriptSegment } from "../types.js";
import type { WhisperModel } from "../constants.js";
import { loadConfig } from "../config.js";

const cfg = loadConfig();

export interface LocalTranscribeOptions {
  jobId: string;
  wavPath: string;
  baseDir: string;
  youtubeUrl: string;
  language?: string;
  model?: WhisperModel; // Use centralized model type
  task?: "transcribe" | "translate"; // Default: "transcribe", "translate" for X-language -> English
  enableChunking?: boolean; // New option to enable chunking for faster processing
  chunkDurationSeconds?: number; // Chunk size (default: 120 seconds)
  overlapSeconds?: number; // Overlap between chunks (default: 10 seconds)
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
  const taskToUse = opts.task || "transcribe"; // Default to transcription

  // Choose processing strategy based on options
  let transcriptionResult;

  if (opts.enableChunking) {
    // Chunked processing for faster output
    console.log(
      `[DEBUG] Using chunked transcription for faster processing: ${opts.wavPath}`
    );
    const chunkDuration = opts.chunkDurationSeconds || 120; // 2 minutes default
    const overlapDuration = opts.overlapSeconds || 10; // 10 seconds overlap

    transcriptionResult = await transcribeWithChunks(
      opts.wavPath,
      opts.language,
      modelToUse,
      taskToUse,
      chunkDuration,
      overlapDuration
    );
  } else {
    // Single file processing for best quality (no chunking to avoid hallucinations)
    console.log(`[DEBUG] Transcribing entire file: ${opts.wavPath}`);
    const singleResult = await transcribeFileWithLocal(
      opts.wavPath,
      opts.language,
      modelToUse,
      taskToUse
    );
    transcriptionResult = singleResult;
  }

  const result = normalizeLocalAsrResponse(
    transcriptionResult,
    opts.jobId,
    opts.youtubeUrl,
    modelToUse
  );

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
  model: string,
  task: string = "transcribe"
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
  form.append("task", task); // Add translation task support
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

function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .replace(/[\p{P}\p{S}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Transcribe audio using chunks for faster processing and streaming-like output
 */
async function transcribeWithChunks(
  audioPath: string,
  language: string | undefined,
  model: string,
  task: string,
  chunkDurationSeconds: number,
  overlapSeconds: number
) {
  console.log(
    `[CHUNKING] Starting chunked transcription: ${chunkDurationSeconds}s chunks with ${overlapSeconds}s overlap`
  );

  // Create chunks using ffmpeg
  const chunks = await createAudioChunks(
    audioPath,
    chunkDurationSeconds,
    overlapSeconds
  );

  // Process chunks in parallel for speed
  const chunkResults = await Promise.all(
    chunks.map(async (chunk, index) => {
      console.log(
        `[CHUNKING] Processing chunk ${index + 1}/${chunks.length}: ${
          chunk.startTime
        }s-${chunk.endTime}s`
      );

      const result = await transcribeFileWithLocal(
        chunk.filePath,
        language,
        model,
        task
      );

      const transcriptResult = result as any; // Local ASR response type

      return {
        text: transcriptResult.text,
        language: transcriptResult.language,
        duration: transcriptResult.duration,
        segments: transcriptResult.segments,
        model: transcriptResult.model,
        chunkIndex: index,
        startOffset: chunk.startTime,
        endOffset: chunk.endTime,
        originalFilePath: chunk.filePath,
      };
    })
  );

  // Merge results and handle overlaps
  const mergedResult = mergeChunkResults(chunkResults, overlapSeconds);

  // Clean up temporary chunk files
  await cleanupChunkFiles(chunks);

  console.log(
    `[CHUNKING] Completed chunked transcription: ${chunkResults.length} chunks processed`
  );
  return mergedResult;
}

/**
 * Create audio chunks using ffmpeg
 */
async function createAudioChunks(
  audioPath: string,
  chunkDurationSeconds: number,
  overlapSeconds: number
): Promise<Array<{ filePath: string; startTime: number; endTime: number }>> {
  // Get audio duration first
  const { stdout: durationOutput } = await runCommand("ffprobe", [
    "-v",
    "quiet",
    "-show_entries",
    "format=duration",
    "-of",
    "csv=p=0",
    audioPath,
  ]);

  const totalDuration = parseFloat(durationOutput.trim());
  console.log(`[CHUNKING] Total audio duration: ${totalDuration.toFixed(2)}s`);

  const chunks: Array<{
    filePath: string;
    startTime: number;
    endTime: number;
  }> = [];
  const baseDir = path.dirname(audioPath);
  const baseExt = path.extname(audioPath);
  const baseName = path.basename(audioPath, baseExt);

  let currentStart = 0;
  let chunkIndex = 0;

  while (currentStart < totalDuration) {
    const chunkEnd = Math.min(
      currentStart + chunkDurationSeconds,
      totalDuration
    );
    const chunkPath = path.join(
      baseDir,
      `${baseName}_chunk_${chunkIndex}${baseExt}`
    );

    // Extract chunk with ffmpeg
    await runCommand("ffmpeg", [
      "-i",
      audioPath,
      "-ss",
      currentStart.toString(),
      "-t",
      (chunkEnd - currentStart).toString(),
      "-c",
      "copy",
      "-y",
      chunkPath,
    ]);

    chunks.push({
      filePath: chunkPath,
      startTime: currentStart,
      endTime: chunkEnd,
    });

    // Move to next chunk (with overlap consideration)
    currentStart += chunkDurationSeconds - overlapSeconds;
    chunkIndex++;
  }

  console.log(`[CHUNKING] Created ${chunks.length} audio chunks`);
  return chunks;
}

/**
 * Merge transcription results from multiple chunks, handling overlaps
 */
function mergeChunkResults(chunkResults: any[], overlapSeconds: number) {
  if (chunkResults.length === 0) {
    throw new Error("No chunk results to merge");
  }

  if (chunkResults.length === 1) {
    return chunkResults[0];
  }

  // Sort by chunk index to ensure proper order
  chunkResults.sort((a, b) => a.chunkIndex - b.chunkIndex);

  let mergedText = "";
  let mergedSegments: any[] = [];
  let cumulativeOffset = 0;

  for (let i = 0; i < chunkResults.length; i++) {
    const chunk = chunkResults[i];
    const isFirstChunk = i === 0;
    const isLastChunk = i === chunkResults.length - 1;

    if (isFirstChunk) {
      // First chunk: take everything
      mergedText = chunk.text;
      mergedSegments =
        chunk.segments?.map((seg: any) => ({
          ...seg,
          start: seg.start,
          end: seg.end,
        })) || [];
      cumulativeOffset = chunk.endOffset;
    } else {
      // Subsequent chunks: handle overlap
      let chunkText = chunk.text || "";
      let chunkSegments = chunk.segments || [];

      if (!isLastChunk) {
        // Remove overlap from the end (except for last chunk)
        chunkSegments = chunkSegments.filter(
          (seg: any) =>
            seg.start < chunk.endOffset - chunk.startOffset - overlapSeconds
        );

        // Trim text to match segments
        if (chunkSegments.length > 0) {
          const lastSegEnd = chunkSegments[chunkSegments.length - 1].end;
          const words = chunkText.split(" ");
          const segmentWords = chunkSegments
            .map((s: any) => s.text)
            .join(" ")
            .split(" ");
          chunkText = segmentWords.join(" ");
        }
      }

      // Adjust timestamps and add to merged results
      const adjustedSegments = chunkSegments.map((seg: any) => ({
        ...seg,
        start: seg.start + chunk.startOffset,
        end: seg.end + chunk.startOffset,
      }));

      mergedText += (mergedText ? " " : "") + chunkText;
      mergedSegments.push(...adjustedSegments);
    }
  }

  // Use the structure from the first chunk as template
  const baseResult = chunkResults[0];
  return {
    ...baseResult,
    text: mergedText.trim(),
    segments: mergedSegments,
    duration: chunkResults[chunkResults.length - 1].endOffset,
  };
}

/**
 * Clean up temporary chunk files
 */
async function cleanupChunkFiles(
  chunks: Array<{ filePath: string; startTime: number; endTime: number }>
) {
  for (const chunk of chunks) {
    try {
      if (fs.existsSync(chunk.filePath)) {
        fs.unlinkSync(chunk.filePath);
      }
    } catch (error) {
      console.warn(
        `[CHUNKING] Failed to cleanup chunk file ${chunk.filePath}:`,
        error
      );
    }
  }
  console.log(`[CHUNKING] Cleaned up ${chunks.length} temporary chunk files`);
}
