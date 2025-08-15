import "dotenv/config";
import Fastify from "fastify";
import { z } from "zod";
import path from "node:path";
import fs from "node:fs";
import crypto from "node:crypto";
import { loadConfig } from "./config.js";
import { Redis } from 'ioredis';

import type { CreateTranscriptRequest, TranscriptJSON } from "./types.js";
import {
  downloadAudioForJob,
  convertToWav16kMono,
  fetchVideoDurationSeconds,
} from "./pipeline/download.js";
import { reserveForGroq, checkDailyExhaustion } from "./limits/rateLimiter.js";
import { transcribeWithGroq } from "./pipeline/transcribe_groq.js";
import { transcriptionQueue } from "./async/queue.js";

const cfg = loadConfig();
const redis = new Redis(cfg.redisPort, cfg.redisHost);
const app = Fastify({
  logger: true,
  connectionTimeout: 0, // Disable connection timeout
  keepAliveTimeout: 0, // Disable keep-alive timeout
  requestTimeout: 0, // Disable request timeout for long video processing
});

// Add a pre-handler hook for API key authentication
app.addHook("preHandler", async (request, reply) => {
    app.log.info(`preHandler received request for: ${request.url}`);
    const syncRoute = request.routeOptions.url === "/v1/sync/transcripts";
    const asyncRoute = request.routeOptions.url === "/v1/async/transcripts";
    app.log.info(`Route options URL: ${request.routeOptions.url}, syncRoute: ${syncRoute}, asyncRoute: ${asyncRoute}`);

    if ((syncRoute || asyncRoute) && cfg.apiKey) {
    const apiKey = request.headers["x-api-key"];
    if (!apiKey || apiKey !== cfg.apiKey) {
      reply
        .code(401)
        .send({ error: "Unauthorized: Invalid or missing API key" });
    }
  }
});

const CreateSchema = z.object({
  youtubeUrl: z.string().url(),
  options: z
    .object({
      language: z.string().optional(),
      model: z.string().optional(),
      temperature: z.number().optional(),
      translateTo: z.string().optional(),
    })
    .optional(),
});

function newJobId(): string {
  return crypto.randomUUID();
}

// Keep the original synchronous processing logic for the sync route
async function processTranscriptionSync(
  jobId: string,
  youtubeUrl: string,
  opts: { language?: string; model?: string }
): Promise<TranscriptJSON> {
  // This function remains largely the same as the original processTranscription
  // It performs the download, conversion, and transcription in a single blocking operation.
  // ... implementation details ...
  try {
    const { audioPath } = await downloadAudioForJob(jobId, youtubeUrl);
    // Use temporary directory for processing
    const outBaseDir = path.join(cfg.audioDir, `temp_${jobId}`);
    fs.mkdirSync(outBaseDir, { recursive: true });
    const wavPath = await convertToWav16kMono(audioPath);

    // Always use Groq (cloud) transcription
    if (!cfg.groqApiKey) {
      throw new Error(
        "Groq transcription requested but GROQ_API_KEY not configured"
      );
    }

    app.log.info(`Using cloud transcription service for job ${jobId}`);
    const result = await transcribeWithGroq({
      jobId,
      wavPath,
      baseDir: outBaseDir,
      language: opts.language,
      model: opts.model || cfg.groqWhisperModel,
      youtubeUrl,
    });

    // Read the transcript result
    const transcriptResult = JSON.parse(
      fs.readFileSync(result.jsonPath, "utf-8")
    ) as TranscriptJSON;

    // Clean up temporary files and directories
    try {
      if (fs.existsSync(audioPath)) fs.unlinkSync(audioPath);
      if (fs.existsSync(wavPath)) fs.unlinkSync(wavPath);
      if (fs.existsSync(outBaseDir)) fs.rmSync(outBaseDir, { recursive: true, force: true });
    } catch (error) {
      app.log.warn(`Cleanup warning: ${error}`);
    }

    return transcriptResult;
  } catch (err: any) {
    app.log.error({ err }, "Job failed");
    // Cleanup on failure
    const outBaseDir = path.join(cfg.audioDir, `temp_${jobId}`);
    if (fs.existsSync(outBaseDir)) {
      fs.rmSync(outBaseDir, { recursive: true, force: true });
    }
    throw err;
  }
}

// Synchronous endpoint (the original behavior)
app.post("/v1/sync/transcripts", async (req, reply) => {
    // This route retains the original implementation of /v1/transcripts
    // ... implementation details from the original route ...
    const q = req.query as any;
    const modelParam = q?.model as string | undefined;
    const langParam = q?.language as string | undefined;

    let youtubeUrl: string;
    let options: { language?: string; model?: string } = {};

    const hasJsonBody =
      req.headers["content-type"]?.includes("application/json") &&
      req.body &&
      Object.keys(req.body as any).length > 0;

    if (hasJsonBody) {
      const parsed = CreateSchema.safeParse(req.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: parsed.error.issues });
      }
      const body = parsed.data as CreateTranscriptRequest;
      youtubeUrl = body.youtubeUrl;
      options = {
        language: body.options?.language || langParam,
        model: body.options?.model || modelParam,
      };
    } else {
      const url = q?.youtubeUrl || q?.url;
      if (!url)
        return reply.code(400).send({ error: "youtubeUrl or url is required" });

      youtubeUrl = url;
      options = {
        language: langParam,
        model: modelParam,
      };
    }

    const id = newJobId();
    const anticipatedSeconds = await fetchVideoDurationSeconds(youtubeUrl);

    if (cfg.groqApiKey) {
      const daily = await checkDailyExhaustion(anticipatedSeconds);
      if (daily.requestsExhausted || daily.audioSecondsExhausted) {
        return reply.code(429).send({ error: "Daily quota exhausted." });
      }
      await reserveForGroq(anticipatedSeconds || 0);
    }

    try {
      const result = await processTranscriptionSync(id, youtubeUrl, options);
      return reply.code(200).send({ id, result });
    } catch (error: any) {
      app.log.error({ error, id }, "Transcription failed");
      return reply.code(500).send({ error: error.message || "Transcription failed" });
    }
});

app.get("/v1/test", async (req, reply) => {
    reply.send({ ok: true });
});

// Asynchronous endpoint for creating a transcription job
app.post("/v1/async/transcripts", async (req, reply) => {
    app.log.info("Handling POST /v1/async/transcripts");
    const q = req.query as any;
    const modelParam = q?.model as string | undefined;
    const langParam = q?.language as string | undefined;

    let youtubeUrl: string;
    let options: { language?: string; model?: string } = {};

    const hasJsonBody =
      req.headers["content-type"]?.includes("application/json") &&
      req.body &&
      Object.keys(req.body as any).length > 0;

    if (hasJsonBody) {
      const parsed = CreateSchema.safeParse(req.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: parsed.error.issues });
      }
      const body = parsed.data as CreateTranscriptRequest;
      youtubeUrl = body.youtubeUrl;
      options = {
        language: body.options?.language || langParam,
        model: body.options?.model || modelParam,
      };
    } else {
      const url = q?.youtubeUrl || q?.url;
      if (!url)
        return reply.code(400).send({ error: "youtubeUrl or url is required" });

      youtubeUrl = url;
      options = {
        language: langParam,
        model: modelParam,
      };
    }

    const jobId = newJobId();

    // Add job to the queue
    await transcriptionQueue.add('transcribe', {
      jobId,
      youtubeUrl,
      opts: options,
    }, { jobId });

    // Track the last 50 jobs
    const jobListKey = 'jobs:recent';
    await redis.lpush(jobListKey, jobId);
    await redis.ltrim(jobListKey, 0, 49);

    reply.code(202).send({
      jobId,
      message: "Job accepted for processing.",
      statusUrl: `http://${req.hostname}/v1/async/transcripts/status/${jobId}`,
    });
});

// Endpoint to get the status of a job
app.get("/v1/async/transcripts/status/:jobId", async (req, reply) => {
    const { jobId } = req.params as { jobId: string };
    const job = await transcriptionQueue.getJob(jobId);

    if (!job) {
      return reply.code(404).send({ error: "Job not found." });
    }

    const state = await job.getState();
    const result = await redis.get(`job:${jobId}:result`);
    const error = await redis.get(`job:${jobId}:error`);

    reply.code(200).send({
      jobId,
      state,
      progress: job.progress,
      result: result ? JSON.parse(result) : null,
      error: error ? JSON.parse(error) : null,
      timestamp: new Date(job.timestamp).toISOString(),
    });
});

app.get("/healthz", async () => ({ ok: true }));

const start = async () => {
  try {
    await app.listen({ port: cfg.port, host: "0.0.0.0" });
    app.log.info(`listening on :${cfg.port}`);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
};

process.on("SIGINT", () => process.exit(0));
process.on("SIGTERM", () => process.exit(0));

start();
