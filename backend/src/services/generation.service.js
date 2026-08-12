import dotenv from "dotenv";
import { generateWithGemini } from "./llm.service.js";

dotenv.config();

export async function generateAnswer(question, chunks) {
  // No retrieved context
  if (!chunks || chunks.length === 0) {
    return {
      answer: "I don't know from the provided document.",
      citations: [],
    };
  }

  // Build grounded context
  const context = chunks
    .map(
      (chunk, index) => `[SOURCE ${index + 1}]
Chunk ID: ${chunk.id}
Page: ${chunk.page ?? "N/A"}
Section: ${chunk.section ?? "N/A"}
Content:
${chunk.chunk_text}
[/SOURCE ${index + 1}]`
    )
    .join("\n");

  const prompt = `
You are a strict document-grounded assistant.

Rules:

1. Answer ONLY using the provided sources.
2. Do not use outside knowledge.
3. If the sources do not contain enough information, say:
   "I don't know from the provided document."
4. Do not invent facts, numbers, names, dates, or citations.
5. Every factual statement must be supported by one or more sources.
6. Return valid JSON only.
7. "citations" must contain the source numbers that directly support the answer.
8. If you cannot answer from the sources, return an empty citations array.
9. Do not include markdown.
10. Do not include explanations outside the required JSON object.

Required JSON format:

{
  "answer": "string",
  "citations": [1, 2]
}

Sources:

${context}

Question:

${question}
`;

  // LLM generation
  const rawText = await generateWithGemini(prompt);

  if (!rawText || rawText.trim() === "") {
    throw new Error("LLM returned an empty response.");
  }

  let parsed;

  try {
    parsed = JSON.parse(rawText);
  } catch {
    throw new Error("LLM returned invalid JSON.");
  }

  // Validate answer
  if (typeof parsed.answer !== "string" || parsed.answer.trim() === "") {
    throw new Error("Generation response is missing a valid answer.");
  }

  // Validate citations
  const citations = Array.isArray(parsed.citations)
    ? parsed.citations
        .filter((value) => Number.isInteger(value))
        .filter((value) => value >= 1 && value <= chunks.length)
    : [];

  return {
    answer: parsed.answer.trim(),
    citations,
  };
}
