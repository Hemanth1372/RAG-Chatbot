import dotenv from "dotenv";
import pg from "pg";
import { fileURLToPath } from "url";

const envPath = fileURLToPath(new URL("../../.env", import.meta.url));

dotenv.config({ path: envPath });

const { Pool } = pg;

const requiredDbEnvVars = ["DB_USER", "DB_HOST", "DB_DATABASE", "DB_PASSWORD", "DB_PORT"];

const missingDbEnvVars = requiredDbEnvVars.filter((envVar) => !process.env[envVar]);

if (missingDbEnvVars.length > 0) {
  throw new Error(
    `Missing database environment variables: ${missingDbEnvVars.join(
      ", "
    )}. Create backend/.env and add your PostgreSQL connection values.`
  );
}

const dbPort = Number(process.env.DB_PORT);

if (Number.isNaN(dbPort)) {
  throw new Error("DB_PORT must be a valid number in backend/.env.");
}

export const pool = new Pool({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_DATABASE,
  password: process.env.DB_PASSWORD,
  port: dbPort,

  max: Number(process.env.DB_POOL_MAX || 20),
  idleTimeoutMillis: Number(process.env.DB_IDLE_TIMEOUT_MS || 30000),
  connectionTimeoutMillis: Number(process.env.DB_CONNECTION_TIMEOUT_MS || 5000),
});

pool.on("error", (err) => {
  console.error("Unexpected PostgreSQL pool error:", err);
});
