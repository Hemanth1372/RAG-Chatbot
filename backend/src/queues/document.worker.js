import { Worker } from "bullmq";
import IORedis from "ioredis";

import { processDocument } from "../services/ingestion.service.js";

const connection = new IORedis({
  host: process.env.REDIS_HOST || "localhost",
  port: Number(process.env.REDIS_PORT || 6379),
  maxRetriesPerRequest: null,
});

const workerConcurrency = Number(process.env.WORKER_CONCURRENCY || 2);

const worker = new Worker(
  "document-processing",

  async (job) => {
    const { documentId } = job.data;

    console.log(`[worker] Starting document ${documentId}`);

    const result = await processDocument(documentId);

    console.log(`[worker] Completed document ${documentId}`, result);

    return result;
  },

  {
    connection,
    concurrency: workerConcurrency,

    limiter: {
      max: Number(process.env.WORKER_RATE_LIMIT_MAX || 10),
      duration: Number(process.env.WORKER_RATE_LIMIT_DURATION_MS || 1000),
    },

    lockDuration: Number(process.env.JOB_LOCK_DURATION_MS || 300000),

    stalledInterval: Number(process.env.JOB_STALLED_INTERVAL_MS || 30000),

    maxStalledCount: 2,
  }
);

worker.on("completed", (job, result) => {
  console.log(`[worker] Job ${job.id} completed`, result);
});

worker.on("failed", (job, error) => {
  console.error(`[worker] Job ${job?.id} failed:`, error.message);
});

worker.on("error", (error) => {
  console.error("[worker] Worker error:", error);
});

console.log(`Document worker started with concurrency=${workerConcurrency}`);

async function shutdown(signal) {
  console.log(`[worker] Received ${signal}, shutting down...`);

  try {
    await worker.close();
    await connection.quit();

    console.log("[worker] Shutdown complete.");
    process.exit(0);
  } catch (error) {
    console.error("[worker] Shutdown failed:", error);
    process.exit(1);
  }
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
