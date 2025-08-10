import 'dotenv/config';
import Fastify from "fastify";
import { z } from "zod";
import path from "node:path";
import fs from "node:fs";
import crypto from "node:crypto";
import { fetch } from "undici";
import { loadConfig } from "./config.js";

import type { CreateTranscriptRequest, TranscriptJSON } from "./types.js";
import { downloadAudioForJob, convertToWav16kMono, fetchVideoDurationSeconds } from "./pipeline/download.js";
import { reserveForGroq, checkDailyExhaustion } from "./limits/rateLimiter.js";

import { transcribeWithGroq } from "./pipeline/transcribe_groq.js";
import { transcribeWithLocal } from "./pipeline/transcribe_local.js";
// Redis removed since we're synchronous only

const cfg = loadConfig();
const app = Fastify({ 
  logger: true,
  connectionTimeout: 0, // Disable connection timeout
  keepAliveTimeout: 0,  // Disable keep-alive timeout
  requestTimeout: 0,    // Disable request timeout for long video processing
});

const CreateSchema = z.object({
  youtubeUrl: z.string().url(),
  options: z.object({
    language: z.string().optional(),
    model: z.string().optional(),
    modelType: z.enum(["local", "cloud", "auto"]).optional(),
    temperature: z.number().optional(),
    translateTo: z.string().optional(),
  }).optional(),
});

function newJobId(): string {
  return crypto.randomUUID();
}

async function processTranscription(jobId: string, youtubeUrl: string, opts: { language?: string; model?: string; modelType?: "local" | "cloud" | "auto" }): Promise<TranscriptJSON> {
  try {
    const { audioPath } = await downloadAudioForJob(jobId, youtubeUrl);
    // Use temporary directory for processing
    const outBaseDir = path.join(cfg.audioDir, `temp_${jobId}`);
    fs.mkdirSync(outBaseDir, { recursive: true });
    const wavPath = await convertToWav16kMono(audioPath);

    // Determine which transcription service to use
    const modelType = opts.modelType || cfg.defaultModelType;
    let result;
    
    if (modelType === "local") {
      // Try local first, fallback to cloud if it fails
      try {
        app.log.info(`Using local transcription service for job ${jobId}`);
        result = await transcribeWithLocal({
          jobId,
          wavPath,
          baseDir: outBaseDir,
          language: opts.language,
          model: opts.model || cfg.localAsrModel,
          youtubeUrl,
        });
      } catch (localError: any) {
        app.log.warn(`Local transcription failed for job ${jobId}: ${localError.message}`);
        
        // Fallback to cloud service
        if (cfg.groqApiKey) {
          try {
            app.log.info(`Falling back to cloud transcription service for job ${jobId}`);
            result = await transcribeWithGroq({
              jobId,
              wavPath,
              baseDir: outBaseDir,
              language: opts.language,
              model: opts.model || cfg.groqWhisperModel,
              youtubeUrl,
            });
          } catch (cloudError) {
            app.log.error(`Both local and cloud transcription failed for job ${jobId}`);
            throw new Error("Unable to transcribe. Both local and cloud services failed.");
          }
        } else {
          app.log.error(`Local transcription failed and no cloud service configured for job ${jobId}`);
          throw new Error("Unable to transcribe. Local service failed and cloud service not configured.");
        }
      }
    } else if (modelType === "cloud") {
      // Try cloud first, fallback to local if it fails
      if (!cfg.groqApiKey) {
        throw new Error("Cloud transcription requested but GROQ_API_KEY not configured");
      }
      
      try {
        app.log.info(`Using cloud transcription service for job ${jobId}`);
        result = await transcribeWithGroq({
          jobId,
          wavPath,
          baseDir: outBaseDir,
          language: opts.language,
          model: opts.model || cfg.groqWhisperModel,
          youtubeUrl,
        });
      } catch (cloudError: any) {
        app.log.warn(`Cloud transcription failed for job ${jobId}: ${cloudError.message}`);
        
        // Fallback to local service
        try {
          // Check if local service is available
          const healthCheck = await fetch(`${cfg.localAsrBaseUrl}/healthz`);
          if (!healthCheck.ok) {
            throw new Error("Local ASR service is not available");
          }
          
          app.log.info(`Falling back to local transcription service for job ${jobId}`);
          result = await transcribeWithLocal({
            jobId,
            wavPath,
            baseDir: outBaseDir,
            language: opts.language,
            model: opts.model || cfg.localAsrModel,
            youtubeUrl,
          });
        } catch (localError) {
          app.log.error(`Both cloud and local transcription failed for job ${jobId}`);
          throw new Error("Unable to transcribe. Both cloud and local services failed.");
        }
      }
    } else { // auto
      if (cfg.groqApiKey) {
        try {
          app.log.info(`Using cloud transcription service (auto mode) for job ${jobId}`);
          result = await transcribeWithGroq({
            jobId,
            wavPath,
            baseDir: outBaseDir,
            language: opts.language,
            model: opts.model || cfg.groqWhisperModel,
            youtubeUrl,
          });
        } catch (cloudError: any) {
          app.log.warn(`Cloud transcription failed in auto mode for job ${jobId}: ${cloudError.message}`);
          
          // Fallback to local service
          try {
            const healthCheck = await fetch(`${cfg.localAsrBaseUrl}/healthz`);
            if (!healthCheck.ok) {
              throw new Error("Local ASR service is not available");
            }
            
            app.log.info(`Falling back to local transcription service (auto mode) for job ${jobId}`);
            result = await transcribeWithLocal({
              jobId,
              wavPath,
              baseDir: outBaseDir,
              language: opts.language,
              model: opts.model || cfg.localAsrModel,
              youtubeUrl,
            });
          } catch (localError) {
            app.log.error(`Both cloud and local transcription failed in auto mode for job ${jobId}`);
            throw new Error("Unable to transcribe. Both cloud and local services failed.");
          }
        }
      } else {
        // Check if local service is available
        try {
          const healthCheck = await fetch(`${cfg.localAsrBaseUrl}/healthz`);
          if (!healthCheck.ok) {
            throw new Error("Local ASR service is not available");
          }
          
          app.log.info(`Using local transcription service (auto mode) for job ${jobId}`);
          result = await transcribeWithLocal({
            jobId,
            wavPath,
            baseDir: outBaseDir,
            language: opts.language,
            model: opts.model || cfg.localAsrModel,
            youtubeUrl,
          });
        } catch (localError) {
          app.log.error(`Local transcription failed in auto mode and no cloud service configured for job ${jobId}`);
          throw new Error("Unable to transcribe. Local service failed and cloud service not configured.");
        }
      }
    }
    
    const { outPrefix, jsonPath, srtPath, vttPath, txtPath } = result;

    // Read the transcript result
    const transcriptResult = JSON.parse(fs.readFileSync(jsonPath, "utf-8")) as TranscriptJSON;

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
  // Support query params: youtubeUrl/url, language, model, model_type
  const q = req.query as any;
  const modelParam = q?.model as string | undefined;
  const modelTypeParam = q?.model_type as "local" | "cloud" | "auto" | undefined;
  const langParam = q?.language as string | undefined;

  let youtubeUrl: string;
  let options: { language?: string; model?: string; modelType?: "local" | "cloud" | "auto" } = {};
  
  // Check if we have JSON body or should use query params
  const hasJsonBody = req.headers["content-type"]?.includes("application/json") && req.body && Object.keys(req.body as any).length > 0;
  
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
      modelType: body.options?.modelType || modelTypeParam
    };
  } else {
    // Use query parameters
    const url = q?.youtubeUrl || q?.url;
    if (!url) return reply.code(400).send({ error: "youtubeUrl or url is required" });
    
    youtubeUrl = url;
    options = { 
      language: langParam, 
      model: modelParam, 
      modelType: modelTypeParam 
    };
  }

  // Validate model parameter based on model_type
  if (options.model) {
    const modelType = options.modelType || cfg.defaultModelType;
    
    if (modelType === "local") {
      // Local models (based on your py_asr_service/models/ folder)
      const validLocalModels = ["base.en", "small.en", "tiny.en", "large-v3"];
      if (!validLocalModels.includes(options.model)) {
        return reply.code(400).send({ 
          error: `Invalid local model. Must be one of: ${validLocalModels.join(", ")}` 
        });
      }
    } else if (modelType === "cloud") {
      // Cloud models (Groq)
      const validCloudModels = ["distil-whisper-large-v3-en", "whisper-large-v3-turbo", "whisper-large-v3"];
      if (!validCloudModels.includes(options.model)) {
        return reply.code(400).send({ 
          error: `Invalid cloud model. Must be one of: ${validCloudModels.join(", ")}` 
        });
      }
    }
    // For "auto" mode, we accept both local and cloud models
  }

  const id = newJobId();

  // Estimate duration; apply rate limiting if Groq will be used
  const anticipatedSeconds = await fetchVideoDurationSeconds(youtubeUrl);
  const willUseGroq = options.modelType === "cloud" || 
    (options.modelType === "auto" && cfg.groqApiKey) || 
    (!options.modelType && cfg.defaultModelType === "cloud") ||
    (!options.modelType && cfg.defaultModelType === "auto" && cfg.groqApiKey);
    
  if (willUseGroq && cfg.groqApiKey) {
    const daily = await checkDailyExhaustion(anticipatedSeconds);
    if (daily.requestsExhausted) {
      return reply.code(429).send({ error: "Daily request quota (2000) exhausted. Try tomorrow." });
    }
    if (daily.audioSecondsExhausted) {
      return reply.code(429).send({ error: "Daily audio seconds quota (28800s) exhausted. Try tomorrow." });
    }
    
    // Reserve only if we actually start processing
    await reserveForGroq(anticipatedSeconds || 0);
  }

  try {
    const result = await processTranscription(id, youtubeUrl, options);
    return reply.code(200).send({ id, result });
  } catch (error: any) {
    app.log.error({ error, id }, "Transcription failed");
    return reply.code(500).send({ error: error.message || "Transcription failed" });
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
process.on('SIGINT', async () => {
  app.log.info('Received SIGINT, shutting down gracefully...');
  process.exit(0);
});

process.on('SIGTERM', async () => {
  app.log.info('Received SIGTERM, shutting down gracefully...');
  process.exit(0);
});

start();
