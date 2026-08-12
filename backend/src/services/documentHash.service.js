import { createHash } from "crypto";
import fs from "fs/promises";

export async function createFileHash(filePath) {
  const buffer = await fs.readFile(filePath);

  return createHash("sha256").update(buffer).digest("hex");
}

export function createContentHash(text) {
  return createHash("sha256")
    .update(String(text).replace(/\s+/g, " ").trim().toLowerCase())
    .digest("hex");
}
