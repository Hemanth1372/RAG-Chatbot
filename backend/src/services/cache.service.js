import { redis } from "../config/redis.js";

const CACHE_TTL_SECONDS = Number(process.env.RAG_CACHE_TTL_SECONDS || 3600);

function normalizeQuestion(question) {
  return String(question).trim().replace(/\s+/g, " ").toLowerCase();
}

function createCacheKey(documentId, question) {
  const normalizedQuestion = normalizeQuestion(question);

  return `rag:answer:${documentId}:${normalizedQuestion}`;
}

export async function getCachedAnswer(documentId, question) {
  const key = createCacheKey(documentId, question);

  const cached = await redis.get(key);

  if (!cached) {
    console.log(
      JSON.stringify({
        event: "cache_miss",
        documentId,
      })
    );

    return null;
  }

  console.log(
    JSON.stringify({
      event: "cache_hit",
      documentId,
    })
  );

  return JSON.parse(cached);
}

export async function setCachedAnswer(documentId, question, answer) {
  const key = createCacheKey(documentId, question);

  await redis.set(key, JSON.stringify(answer), "EX", CACHE_TTL_SECONDS);

  console.log(
    JSON.stringify({
      event: "cache_set",
      documentId,
      ttlSeconds: CACHE_TTL_SECONDS,
    })
  );
}

export async function deleteCachedAnswer(documentId, question) {
  const key = createCacheKey(documentId, question);

  await redis.del(key);
}
