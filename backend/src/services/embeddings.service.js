import dotenv from "dotenv";
dotenv.config();

import { GoogleGenAI } from "@google/genai";

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
});

const embeddingModel = process.env.GEMINI_EMBEDDING_MODEL || "gemini-embedding-001";

const embeddingDimensions = Number(process.env.EMBEDDING_DIMENSIONS || 3072);

function validateEmbeddingText(text) {
  if (typeof text !== "string") {
    throw new Error(`createEmbedding expects string, got ${typeof text}`);
  }

  if (!text.trim()) {
    throw new Error("Cannot generate embedding for empty text.");
  }
}

export async function createEmbedding(text) {
  if (!process.env.GEMINI_API_KEY) {
    throw new Error("GEMINI_API_KEY is missing in .env");
  }

  validateEmbeddingText(text);

  const response = await ai.models.embedContent({
    model: embeddingModel,
    contents: text,
    config: {
      outputDimensionality: embeddingDimensions,
    },
  });

  const embedding = response.embeddings?.[0]?.values;

  if (!embedding || embedding.length === 0) {
    throw new Error("Gemini returned an empty embedding.");
  }

  return embedding;
}

export async function createEmbeddings(
  texts,
  concurrency = Number(process.env.EMBEDDING_CONCURRENCY || 4)
) {
  if (!Array.isArray(texts) || texts.length === 0) {
    return [];
  }

  const results = new Array(texts.length);

  let nextIndex = 0;

  async function worker() {
    while (true) {
      const index = nextIndex++;

      if (index >= texts.length) {
        return;
      }

      results[index] = await createEmbedding(texts[index]);
    }
  }

  const workerCount = Math.min(concurrency, texts.length);

  await Promise.all(Array.from({ length: workerCount }, () => worker()));

  return results;
}
