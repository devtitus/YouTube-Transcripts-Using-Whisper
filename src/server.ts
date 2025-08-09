import 'dotenv/config';
import Fastify from "fastify";
import { z } from "zod";
import path from "node:path";
import fs from "node:fs";
import crypto from "node:crypto";
import { loadConfig } from "./config.js";
import { insertJob, updateJobStatus, updateJobModelLang, getJob, upsertArtifacts, getArtifacts } from "./store/fsStore.js";
import type { CreateTranscriptRequest, JobRecord, TranscriptJSON } from "./types.js";
import { downloadAudioForJob, convertToWav16kMono, fetchVideoDurationSeconds } from "./pipeline/download.js";
import { reserveForGroq, checkDailyExhaustion } from "./limits/rateLimiter.js";
import { transcribeWithWhisperCpp } from "./pipeline/transcribe.js";
import { transcribeWithGroq } from "./pipeline/transcribe_groq.js";
import { connectRedis, disconnectRedis } from "./utils/redis.js";

const cfg = loadConfig();
const app = Fastify({ logger: true });

const CreateSchema = z.object({
  youtubeUrl: z.string().url(),
  options: z.object({
    language: z.string().optional(),
    model: z.string().optional(),
    temperature: z.number().optional(),
    translateTo: z.string().optional(),
  }).optional(),
  sync: z.boolean().optional(),
});

function newJobId(): string {
  return crypto.randomUUID();
}

async function processJob(job: JobRecord, opts: { language?: string; model?: string }): Promise<TranscriptJSON | null> {
  try {
    updateJobStatus(job.id, "downloading");
    const { audioPath } = await downloadAudioForJob(job.id, job.youtubeUrl);
    // Use temporary directory for processing
    const outBaseDir = path.join(cfg.audioDir, `temp_${job.id}`);
    fs.mkdirSync(outBaseDir, { recursive: true });

    updateJobStatus(job.id, "converting");
    const wavPath = await convertToWav16kMono(audioPath);

    updateJobStatus(job.id, "transcribing");
    const { outPrefix, jsonPath, srtPath, vttPath, txtPath } = cfg.groqApiKey
      ? await transcribeWithGroq({
          jobId: job.id,
          wavPath,
          baseDir: outBaseDir,
          language: opts.language,
          model: opts.model || cfg.groqWhisperModel,
          youtubeUrl: job.youtubeUrl,
        })
      : await transcribeWithWhisperCpp({
          jobId: job.id,
          wavPath,
          baseDir: outBaseDir,
          language: opts.language,
          modelFileName: opts.model,
          youtubeUrl: job.youtubeUrl,
        });

    // Read the transcript result
    const transcriptResult = JSON.parse(fs.readFileSync(jsonPath, "utf-8")) as TranscriptJSON;

    upsertArtifacts({
      jobId: job.id,
      baseDir: outBaseDir,
      audioPath,
      wavPath,
      outPrefix,
      jsonPath,
      srtPath,
      vttPath,
      txtPath,
    });

    // Clean up all temporary files
    try {
      if (fs.existsSync(audioPath)) fs.unlinkSync(audioPath);
      if (fs.existsSync(wavPath)) fs.unlinkSync(wavPath);
      if (fs.existsSync(jsonPath)) fs.unlinkSync(jsonPath);
      if (fs.existsSync(srtPath)) fs.unlinkSync(srtPath);
      if (fs.existsSync(vttPath)) fs.unlinkSync(vttPath);
      if (fs.existsSync(txtPath)) fs.unlinkSync(txtPath);
      if (fs.existsSync(outBaseDir)) fs.rmSync(outBaseDir, { recursive: true });
    } catch {}

    updateJobModelLang(job.id, opts.model || cfg.whisperModel, opts.language || null);
    updateJobStatus(job.id, "completed");
    return transcriptResult;
  } catch (err: any) {
    app.log.error({ err }, "Job failed");
    updateJobStatus(job.id, "failed", err?.message || String(err));
    return null;
  }
}

app.post("/v1/transcripts", async (req, reply) => {
  // Support query params: youtubeUrl/url, language, model, sync
  const q = req.query as any;
  const modelParam = q?.model as string | undefined;
  const langParam = q?.language as string | undefined;
  const syncParam = q?.sync === 'true' || q?.sync === true;

  let body: CreateTranscriptRequest;
  
  // Check if we have JSON body or should use query params
  const hasJsonBody = req.headers["content-type"]?.includes("application/json") && req.body && Object.keys(req.body as any).length > 0;
  
  if (hasJsonBody) {
    const parsed = CreateSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.issues });
    }
    body = parsed.data as CreateTranscriptRequest;
    // Override with query params if provided
    if (modelParam) body.options = { ...body.options, model: modelParam };
    if (langParam) body.options = { ...body.options, language: langParam };
    if (q?.sync !== undefined) body.sync = syncParam;
  } else {
    // Use query parameters
    const url = q?.youtubeUrl || q?.url;
    if (!url) return reply.code(400).send({ error: "youtubeUrl or url is required" });
    
    // Validate model parameter
    const validModels = ["distil-whisper-large-v3-en", "whisper-large-v3-turbo", "whisper-large-v3"];
    if (modelParam && !validModels.includes(modelParam)) {
      return reply.code(400).send({ 
        error: `Invalid model. Must be one of: ${validModels.join(", ")}` 
      });
    }
    
    body = { 
      youtubeUrl: url, 
      options: { language: langParam, model: modelParam }, 
      sync: syncParam 
    };
  }

  const id = newJobId();
  const now = Date.now();
  const job: JobRecord = {
    id,
    youtubeUrl: body.youtubeUrl,
    status: "queued",
    model: body.options?.model || null,
    language: body.options?.language || null,
    error: null,
    createdAt: now,
    updatedAt: now,
  };
  insertJob(job);

  // Rate limiting (Groq only). Estimate duration prior to reserving.
  if (cfg.groqApiKey) {
    const seconds = await fetchVideoDurationSeconds(body.youtubeUrl);
    const daily = await checkDailyExhaustion(seconds);
    if (daily.requestsExhausted) {
      return reply.code(429).send({ id, status: "failed", error: "Daily request quota (2000) exhausted. Try tomorrow." });
    }
    if (daily.audioSecondsExhausted) {
      return reply.code(429).send({ id, status: "failed", error: "Daily audio seconds quota (28800s) exhausted. Try tomorrow." });
    }
    await reserveForGroq(seconds || 0);
  }

  if (body.sync) {
    const result = await processJob(job, { language: body.options?.language, model: body.options?.model });
    const latest = getJob(id);
    if (latest?.status === "completed" && result) {
      return reply.code(200).send({ id, status: latest.status, result });
    } else {
      return reply.code(200).send({ id, status: latest?.status, error: latest?.error });
    }
  } else {
    // Run in background
    processJob(job, { language: body.options?.language, model: body.options?.model });
    return reply.code(202).send({ id, status: "queued" });
  }
});

app.get("/v1/transcripts/:id", async (req, reply) => {
  const { id } = req.params as { id: string };
  const job = getJob(id);
  if (!job) return reply.code(404).send({ error: "Not found" });
  return reply.code(200).send({ 
    id: job.id, 
    status: job.status, 
    error: job.error,
    message: "Transcript data is not persisted. Use sync=true in POST request to get results immediately."
  });
});

app.get("/v1/transcripts/:id.:fmt", async (req, reply) => {
  return reply.code(404).send({ error: "File downloads not available. Transcript data is not persisted. Use sync=true in POST request to get results immediately." });
});

app.get("/healthz", async () => ({ ok: true }));

const start = async () => {
  try {
    // Connect to Redis
    await connectRedis();
    
    // Start the server
    await app.listen({ port: cfg.port, host: "0.0.0.0" });
    app.log.info(`listening on :${cfg.port}`);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
};

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('Received SIGINT, shutting down gracefully...');
  await disconnectRedis();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('Received SIGTERM, shutting down gracefully...');
  await disconnectRedis();
  process.exit(0);
});

start();
