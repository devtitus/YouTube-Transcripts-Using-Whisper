export type JobStatus = "queued" | "downloading" | "converting" | "transcribing" | "completed" | "failed";

export interface CreateTranscriptRequest {
  youtubeUrl: string;
  options?: {
    language?: string;
    model?: string; // e.g., ggml-base.en.bin
    temperature?: number;
    translateTo?: string; // optional future use
  };
  sync?: boolean; // if true, wait until done (use for short videos)
}

export interface TranscriptSegmentWord {
  startMs: number;
  endMs: number;
  text: string;
  confidence?: number;
}

export interface TranscriptSegment {
  idx: number;
  startMs: number;
  endMs: number;
  speaker?: string;
  text: string;
  words?: TranscriptSegmentWord[];
}

export interface TranscriptJSON {
  id: string;
  youtubeUrl: string;
  language?: string;
  durationMs?: number;
  model?: string;
  text: string;
  segments: TranscriptSegment[];
}

export interface JobRecord {
  id: string;
  youtubeUrl: string;
  status: JobStatus;
  model: string | null;
  language: string | null;
  error: string | null;
  createdAt: number; // epoch ms
  updatedAt: number; // epoch ms
}

export interface ArtifactPaths {
  jobId: string;
  baseDir: string; // per-job dir
  audioPath?: string; // original container file from yt-dlp
  wavPath?: string;   // 16k mono wav
  outPrefix: string;  // prefix for whisper outputs
  jsonPath: string;   // normalized JSON path
  srtPath: string;
  vttPath: string;
  txtPath: string;
}
