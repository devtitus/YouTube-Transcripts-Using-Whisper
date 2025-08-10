import type { JobRecord } from "../types.js";

// In-memory storage - no persistence to disk
const jobs = new Map<string, JobRecord>();
const artifacts = new Map<string, { jobId: string; baseDir: string; audioPath?: string | null; wavPath?: string | null; outPrefix: string; jsonPath: string; srtPath: string; vttPath: string; txtPath: string; result?: any }>();

export function insertJob(job: JobRecord) {
  jobs.set(job.id, { ...job });
}

export function updateJobStatus(id: string, status: string, error: string | null = null) {
  const job = jobs.get(id);
  if (!job) throw new Error("Job not found");
  job.status = status as any;
  job.error = error;
  job.updatedAt = Date.now();
  jobs.set(id, job);
}

export function updateJobModelLang(id: string, model: string | null, language: string | null) {
  const job = jobs.get(id);
  if (!job) throw new Error("Job not found");
  job.model = model;
  job.language = language;
  job.updatedAt = Date.now();
  jobs.set(id, job);
}

export function getJob(id: string): JobRecord | null {
  return jobs.get(id) || null;
}

export function upsertArtifacts(rec: { jobId: string; baseDir: string; audioPath?: string | null; wavPath?: string | null; outPrefix: string; jsonPath: string; srtPath: string; vttPath: string; txtPath: string; result?: any }) {
  artifacts.set(rec.jobId, { ...rec });
}

export function getArtifacts(jobId: string): { jobId: string; baseDir: string; audioPath?: string | null; wavPath?: string | null; outPrefix: string; jsonPath: string; srtPath: string; vttPath: string; txtPath: string; result?: any } | null {
  return artifacts.get(jobId) || null;
}
