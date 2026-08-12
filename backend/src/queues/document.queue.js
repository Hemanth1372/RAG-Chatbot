import { Queue } from "bullmq";
import IORedis from "ioredis";

const connection = new IORedis({
  host: process.env.REDIS_HOST || "localhost",
  port: Number(process.env.REDIS_PORT || 6379),
  maxRetriesPerRequest: null,
});

export const documentQueue = new Queue("document-processing", {
  connection,

  defaultJobOptions: {
    attempts: Number(process.env.JOB_ATTEMPTS || 3),

    backoff: {
      type: "exponential",
      delay: Number(process.env.JOB_BACKOFF_MS || 2000),
    },

    removeOnComplete: {
      age: 24 * 60 * 60,
      count: 1000,
    },

    removeOnFail: {
      age: 7 * 24 * 60 * 60,
      count: 5000,
    },
  },
});
