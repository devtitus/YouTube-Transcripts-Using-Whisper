import { Worker } from 'bullmq';
import { loadConfig } from '../config.js';
import processor from './processor.js';

const cfg = loadConfig();

console.log('Worker started');

const worker = new Worker('transcription', processor, {
  connection: {
    host: cfg.redisHost,
    port: cfg.redisPort,
  },
  concurrency: 5,
  removeOnComplete: { count: 100 },
  removeOnFail: { count: 500 },
});

worker.on('completed', job => {
  console.log(`${job.id} has completed!`);
});

worker.on('failed', (job, err) => {
  if (job) {
    console.log(`${job.id} has failed with ${err.message}`);
  } else {
    console.log(`A job has failed with ${err.message}`);
  }
});
