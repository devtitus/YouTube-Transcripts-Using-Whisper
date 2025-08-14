import "dotenv/config";
import Fastify from "fastify";
import { z } from "zod";
import path from "node:path";
import fs from "node:fs";
import crypto from "node:crypto";
import { loadConfig } from "./config.js";
import { ALL_VALID_MODELS } from "./constants.js";

import type { CreateTranscriptRequest, TranscriptJSON } from "./types.js";
import {
  downloadOptimizedAudioForJob,
  fetchVideoDurationSeconds,
} from "./pipeline/download.js";
import { transcribeWithLocal } from "./pipeline/transcribe_local.js";

const cfg = loadConfig();
const app = Fastify({
  logger: true,
  connectionTimeout: 0, // Disable connection timeout
  keepAliveTimeout: 0, // Disable keep-alive timeout
  requestTimeout: 0, // Disable request timeout for long video processing
});

const CreateSchema = z.object({
  youtubeUrl: z.string().url(),
  options: z
    .object({
      language: z.string().optional(),
      model: z.string().optional(),
      task: z.enum(["transcribe", "translate"]).optional(),
      temperature: z.number().optional(),
      translateTo: z.string().optional(),
      // Chunking options for faster processing
      enableChunking: z.boolean().optional(),
      chunkDurationSeconds: z.number().min(30).max(300).optional(), // 30s to 5min chunks
      overlapSeconds: z.number().min(0).max(30).optional(), // 0-30s overlap
    })
    .optional(),
});

function newJobId(): string {
  return crypto.randomUUID();
}

async function processTranscription(
  jobId: string,
  youtubeUrl: string,
  opts: {
    language?: string;
    model?: string;
    task?: "transcribe" | "translate";
    enableChunking?: boolean;
    chunkDurationSeconds?: number;
    overlapSeconds?: number;
  }
): Promise<TranscriptJSON> {
  const outBaseDir = path.join(cfg.audioDir, `temp_${jobId}`);
  try {
    // Use temporary directory for all processing
    fs.mkdirSync(outBaseDir, { recursive: true });

    // Download audio directly as optimized MP3 - NO conversion needed!
    const { audioPath: optimizedAudioPath } =
      await downloadOptimizedAudioForJob(jobId, youtubeUrl, outBaseDir);

    app.log.info(`Using local transcription service for job ${jobId}`);
    const result = await transcribeWithLocal({
      jobId,
      wavPath: optimizedAudioPath, // Now using optimized MP3 format
      baseDir: outBaseDir,
      language: opts.language,
      model:
        (opts.model as (typeof ALL_VALID_MODELS)[number]) ||
        (cfg.localAsrModel as (typeof ALL_VALID_MODELS)[number]),
      task: opts.task || "transcribe", // Add task support
      youtubeUrl,
      // Chunking options for faster processing
      enableChunking: opts.enableChunking || false,
      chunkDurationSeconds: opts.chunkDurationSeconds || 120, // 2 minutes default
      overlapSeconds: opts.overlapSeconds || 10, // 10 seconds default
    });

    const { jsonPath } = result;

    // Read the transcript result
    const transcriptResult = JSON.parse(
      fs.readFileSync(jsonPath, "utf-8")
    ) as TranscriptJSON;

    return transcriptResult;
  } catch (err: any) {
    app.log.error({ err }, "Job failed");
    throw err; // Re-throw to be caught by the route handler
  } finally {
    // Clean up the entire temporary directory for this job
    try {
      if (fs.existsSync(outBaseDir)) {
        fs.rmSync(outBaseDir, { recursive: true, force: true });
        app.log.info(`Cleaned up temp directory: ${outBaseDir}`);
      }
    } catch (error) {
      app.log.warn(`Cleanup warning: ${error}`);
    }
  }
}

app.post("/v1/transcripts", async (req, reply) => {
  // Support query params: youtubeUrl/url, language, model, task
  const q = req.query as any;
  const modelParam = q?.model as string | undefined;
  const langParam = q?.language as string | undefined;
  const taskParam = q?.task as "transcribe" | "translate" | undefined;

  let youtubeUrl: string;
  let options: {
    language?: string;
    model?: string;
    task?: "transcribe" | "translate";
  } = {};

  // Check if we have JSON body or should use query params
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
      task: body.options?.task || taskParam || "transcribe", // Add task support with fallback
    };
  } else {
    // Use query parameters
    const url = q?.youtubeUrl || q?.url;
    if (!url)
      return reply.code(400).send({ error: "youtubeUrl or url is required" });

    youtubeUrl = url;
    options = {
      language: langParam,
      model: modelParam,
      task: taskParam || "transcribe", // Add task support for query params
    };
  }

  // Validate model parameter
  if (options.model) {
    if (!ALL_VALID_MODELS.includes(options.model as any)) {
      return reply.code(400).send({
        error: `Invalid local model. Must be one of: ${ALL_VALID_MODELS.join(
          ", "
        )}`,
      });
    }
  }

  // Check video duration (and existence) before starting the job
  try {
    await fetchVideoDurationSeconds(youtubeUrl);
  } catch (error: any) {
    app.log.warn(`Invalid YouTube URL or video not available: ${youtubeUrl}`);
    return reply.code(400).send({
      error: "Invalid YouTube URL or video not available.",
      details: error.message,
    });
  }

  const id = newJobId();

  try {
    const result = await processTranscription(id, youtubeUrl, options);
    return reply.code(200).send({ id, result });
  } catch (error: any) {
    app.log.error({ error, id }, "Transcription failed");
    return reply
      .code(500)
      .send({ error: error.message || "Transcription failed" });
  }
});

// Remove these endpoints since we're synchronous only and don't store results
// Users get the result immediately in the POST response

app.get("/healthz", async () => ({ ok: true }));

const start = async () => {
  try {
    // Start the server
    await app.listen({ port: cfg.port, host: "0.0.0.0" });
    app.log.info(`listening on :${cfg.port}`);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
};

// Graceful shutdown
process.on("SIGINT", async () => {
  app.log.info("Received SIGINT, shutting down gracefully...");
  process.exit(0);
});

process.on("SIGTERM", async () => {
  app.log.info("Received SIGTERM, shutting down gracefully...");
  process.exit(0);
});

start();
