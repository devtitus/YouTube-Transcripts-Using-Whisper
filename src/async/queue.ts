import { Queue } from 'bullmq';
import { loadConfig } from '../config.js';

const cfg = loadConfig();

export const transcriptionQueue = new Queue('transcription', {
  connection: {
    host: cfg.redisHost,
    port: cfg.redisPort,
  },
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 1000,
    },
  },
});
