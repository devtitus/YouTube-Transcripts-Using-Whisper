export interface CreateTranscriptRequest {
  youtubeUrl: string;
  options?: {
    language?: string;
    model?: string; // e.g., whisper-large-v3-turbo
    temperature?: number;
    translateTo?: string; // optional future use
  };
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

// Removed JobRecord and ArtifactPaths - no longer needed for synchronous operation
