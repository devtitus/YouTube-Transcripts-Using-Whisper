import "dotenv/config";
import Fastify from "fastify";
import { z } from "zod";
import path from "node:path";
import fs from "node:fs";
import crypto from "node:crypto";
import { loadConfig } from "./config.js";

import type { CreateTranscriptRequest, TranscriptJSON } from "./types.js";
import {
  downloadAudioForJob,
  convertToWav16kMono,
  fetchVideoDurationSeconds,
} from "./pipeline/download.js";
import { reserveForGroq, checkDailyExhaustion } from "./limits/rateLimiter.js";

import { transcribeWithGroq } from "./pipeline/transcribe_groq.js";

const cfg = loadConfig();
const app = Fastify({
  logger: true,
  connectionTimeout: 0, // Disable connection timeout
  keepAliveTimeout: 0, // Disable keep-alive timeout
  requestTimeout: 0, // Disable request timeout for long video processing
});

// Add a pre-handler hook for API key authentication
app.addHook("preHandler", async (request, reply) => {
  if (request.routeOptions.url === "/v1/transcripts" && cfg.apiKey) {
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

async function processTranscription(
  jobId: string,
  youtubeUrl: string,
  opts: { language?: string; model?: string }
): Promise<TranscriptJSON> {
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

    const { outPrefix, jsonPath, srtPath, vttPath, txtPath } = result;

    // Read the transcript result
    const transcriptResult = JSON.parse(
      fs.readFileSync(jsonPath, "utf-8")
    ) as TranscriptJSON;

    // Clean up temporary files and directories
    try {
      // Remove original audio file and converted wav file
      if (fs.existsSync(audioPath)) {
        fs.unlinkSync(audioPath);
        app.log.info(`Cleaned up audio file: ${audioPath}`);
      }
      if (fs.existsSync(wavPath)) {
        fs.unlinkSync(wavPath);
        app.log.info(`Cleaned up wav file: ${wavPath}`);
      }

      // Remove the entire temporary directory for this job
      if (fs.existsSync(outBaseDir)) {
        fs.rmSync(outBaseDir, { recursive: true, force: true });
        app.log.info(`Cleaned up temp directory: ${outBaseDir}`);
      }
    } catch (error) {
      app.log.warn(`Cleanup warning: ${error}`);
    }

    return transcriptResult;
  } catch (err: any) {
    app.log.error({ err }, "Job failed");

    // Clean up temporary files even on failure
    try {
      const outBaseDir = path.join(cfg.audioDir, `temp_${jobId}`);
      if (fs.existsSync(outBaseDir)) {
        fs.rmSync(outBaseDir, { recursive: true, force: true });
        app.log.info(`Cleaned up temp directory after failure: ${outBaseDir}`);
      }
    } catch (cleanupError) {
      app.log.warn(`Cleanup after failure warning: ${cleanupError}`);
    }

    throw err;
  }
}

app.post("/v1/transcripts", async (req, reply) => {
  // Support query params: youtubeUrl/url, language, model
  const q = req.query as any;
  const modelParam = q?.model as string | undefined;
  const langParam = q?.language as string | undefined;

  let youtubeUrl: string;
  let options: { language?: string; model?: string } = {};

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
    };
  }

  // Validate model parameter
  if (options.model) {
    // Cloud models (Groq)
    const validCloudModels = [
      "distil-whisper-large-v3-en",
      "whisper-large-v3-turbo",
      "whisper-large-v3",
    ];
    if (!validCloudModels.includes(options.model)) {
      return reply.code(400).send({
        error: `Invalid cloud model. Must be one of: ${validCloudModels.join(
          ", "
        )}`,
      });
    }
  }

  const id = newJobId();

  // Estimate duration; apply rate limiting for Groq
  const anticipatedSeconds = await fetchVideoDurationSeconds(youtubeUrl);

  if (cfg.groqApiKey) {
    const daily = await checkDailyExhaustion(anticipatedSeconds);
    if (daily.requestsExhausted) {
      return reply
        .code(429)
        .send({ error: "Daily request quota (2000) exhausted. Try tomorrow." });
    }
    if (daily.audioSecondsExhausted) {
      return reply
        .code(429)
        .send({
          error: "Daily audio seconds quota (28800s) exhausted. Try tomorrow.",
        });
    }

    // Reserve only if we actually start processing
    await reserveForGroq(anticipatedSeconds || 0);
  }

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
