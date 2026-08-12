import { redis } from "../config/redis.js";

const CACHE_TTL = Number(process.env.CHAT_CACHE_TTL_SECONDS || 60 * 60);

function normalizeQuestion(question) {
  return question.trim().toLowerCase().replace(/\s+/g, " ");
}

function getCacheKey(documentId, question) {
  const normalizedQuestion = normalizeQuestion(question);

  return `chat:${documentId}:${normalizedQuestion}`;
}

export async function getCachedAnswer(documentId, question) {
  const key = getCacheKey(documentId, question);

  const cached = await redis.get(key);

  if (!cached) {
    return null;
  }

  try {
    return JSON.parse(cached);
  } catch {
    await redis.del(key);
    return null;
  }
}

export async function cacheAnswer(documentId, question, answer) {
  const key = getCacheKey(documentId, question);

  await redis.set(key, JSON.stringify(answer), "EX", CACHE_TTL);
}

export async function deleteDocumentChatCache(documentId) {
  const pattern = `chat:${documentId}:*`;

  console.log("[cache] Deleting document cache:", pattern);

  let cursor = "0";
  let deletedCount = 0;

  do {
    const result = await redis.scan(cursor, "MATCH", pattern, "COUNT", 100);

    cursor = result[0];

    const keys = result[1];

    console.log("[cache] Found keys:", keys);

    if (keys.length > 0) {
      await redis.del(...keys);
      deletedCount += keys.length;
    }
  } while (cursor !== "0");

  console.log(`[cache] Deleted ${deletedCount} cache key(s) for document ${documentId}`);
}
