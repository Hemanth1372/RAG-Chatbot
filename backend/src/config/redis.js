import IORedis from "ioredis";
import dotenv from "dotenv";

dotenv.config();

export const redis = new IORedis({
  host: process.env.REDIS_HOST || "localhost",
  port: Number(process.env.REDIS_PORT || 6379),
  maxRetriesPerRequest: null,
});

redis.on("connect", () => {
  console.log("[redis] Connected");
});

redis.on("error", (error) => {
  console.error("[redis] Error:", error);
});
