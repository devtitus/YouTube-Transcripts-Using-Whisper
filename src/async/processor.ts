import path from 'node:path';
import fs from 'node:fs';
import { Job } from 'bullmq';
import { loadConfig } from '../config.js';
import { downloadAudioForJob, convertToWav16kMono } from '../pipeline/download.js';
import { transcribeWithGroq } from '../pipeline/transcribe_groq.js';
import type { TranscriptJSON } from '../types.js';
import { Redis } from 'ioredis';
import { request } from 'undici';

const cfg = loadConfig();
const redis = new Redis(cfg.redisPort, cfg.redisHost);

async function processTranscription(
    job: Job,
  ): Promise<TranscriptJSON> {
    const { youtubeUrl, opts, jobId } = job.data;
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

      console.log(`Using cloud transcription service for job ${jobId}`);
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
        // Remove original audio file and converted wav file
        if (fs.existsSync(audioPath)) {
          fs.unlinkSync(audioPath);
          console.log(`Cleaned up audio file: ${audioPath}`);
        }
        if (fs.existsSync(wavPath)) {
          fs.unlinkSync(wavPath);
          console.log(`Cleaned up wav file: ${wavPath}`);
        }

        // Remove the entire temporary directory for this job
        if (fs.existsSync(outBaseDir)) {
          fs.rmSync(outBaseDir, { recursive: true, force: true });
          console.log(`Cleaned up temp directory: ${outBaseDir}`);
        }
      } catch (error) {
        console.warn(`Cleanup warning: ${error}`);
      }

      return transcriptResult;
    } catch (err: any) {
      console.error({ err }, "Job failed");

      // Clean up temporary files even on failure
      try {
        const outBaseDir = path.join(cfg.audioDir, `temp_${jobId}`);
        if (fs.existsSync(outBaseDir)) {
          fs.rmSync(outBaseDir, { recursive: true, force: true });
          console.log(`Cleaned up temp directory after failure: ${outBaseDir}`);
        }
      } catch (cleanupError) {
        console.warn(`Cleanup after failure warning: ${cleanupError}`);
      }

      throw err;
    }
}

export default async function (job: Job) {
    console.log(`Processing job ${job.id}`);
    try {
      const result = await processTranscription(job);
      // Store the result in Redis
      await redis.set(`job:${job.id}:result`, JSON.stringify(result), 'EX', 60 * 60 * 24); // Expire in 24 hours

      // Send webhook if configured
      if (cfg.webhookUrl) {
        try {
          await request(cfg.webhookUrl, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              jobId: job.id,
              status: 'completed',
              result,
            }),
          });
          console.log(`Webhook sent for job ${job.id}`);
        } catch (error) {
          console.error(`Failed to send webhook for job ${job.id}`, error);
        }
      }

      return result;
    } catch (error) {
      console.error(`Job ${job.id} failed with error`, error);
      // Store error information in Redis
      await redis.set(`job:${job.id}:error`, JSON.stringify(error), 'EX', 60 * 60 * 24);
      throw error;
    }
}
