import "dotenv/config";

import {
  retrieveRelevantChunks,
  retrieveKeywordChunks,
  retrieveHybridChunks,
  evaluateRetrievalConfidence,
} from "../services/retrieval.service.js";

import { createEmbedding } from "../services/embeddings.service.js";

const DOCUMENT_ID = "157465ca-7da4-46e2-a0d8-8147cef763c8";
const TOP_K = 5;

/*
 * Each question has:
 *
 * expectedTerms:
 *   Terms that should appear in the correct retrieved chunk.
 *
 * category:
 *   direct       -> directly asks for information
 *   paraphrased  -> asks the same thing differently
 *   unrelated    -> answer should NOT exist in the document
 */
const TEST_CASES = [
  {
    question: "What is the total hostel fee?",
    expectedTerms: ["total", "31000"],
    category: "direct",
  },
  {
    question: "How much does the student need to pay for accommodation?",
    expectedTerms: ["31000", "hostel", "fee"],
    category: "paraphrased",
  },
  {
    question: "Who is Guntuku Asha Latha?",
    expectedTerms: ["mother", "asha", "latha"],
    category: "direct",
  },
  {
    question: "What hostel and room has been assigned to the student?",
    expectedTerms: ["hostel", "kakatiya", "room", "2616"],
    category: "paraphrased",
  },
  {
    question: "What is the student's specialization?",
    expectedTerms: ["specialization", "computer", "science"],
    category: "direct",
  },
  {
    question: "What is the student's roll number?",
    expectedTerms: ["roll", "23csb0b36"],
    category: "direct",
  },
  {
    question: "What is the maintenance fee?",
    expectedTerms: ["maintenance", "7500"],
    category: "direct",
  },
  {
    question: "How much is the seat rent?",
    expectedTerms: ["seat", "rent", "3000"],
    category: "direct",
  },
  {
    question: "How much are the water and electricity charges?",
    expectedTerms: ["water", "electricity", "5500"],
    category: "direct",
  },
  {
    question: "What is the mess fee?",
    expectedTerms: ["mess", "15000"],
    category: "direct",
  },
  {
    question: "Which degree is the student pursuing?",
    expectedTerms: ["degree", "b.tech"],
    category: "direct",
  },
  {
    question: "What is the student's father's name?",
    expectedTerms: ["father", "srinivasarao"],
    category: "direct",
  },

  // Negative / out-of-document questions
  {
    question: "What is the capital of Japan?",
    expectedTerms: [],
    category: "unrelated",
  },
  {
    question: "What is the student's CGPA?",
    expectedTerms: [],
    category: "unrelated",
  },
  {
    question: "What is the student's date of birth?",
    expectedTerms: [],
    category: "unrelated",
  },
];

/* -------------------------------------------------- */
/* Helpers                                            */
/* -------------------------------------------------- */

function normalize(text = "") {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9.\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function chunkContainsExpectedTerms(chunk, expectedTerms) {
  if (!expectedTerms.length) {
    return false;
  }

  const text = normalize(chunk?.chunk_text || "");

  const matched = expectedTerms.filter((term) => text.includes(normalize(term)));

  return matched.length === expectedTerms.length;
}

function percentile(values, percentileValue) {
  if (!values.length) return 0;

  const sorted = [...values].sort((a, b) => a - b);

  const index = Math.ceil((percentileValue / 100) * sorted.length) - 1;

  return sorted[Math.max(0, index)];
}

function average(values) {
  if (!values.length) return 0;

  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

/* -------------------------------------------------- */
/* Benchmark                                         */
/* -------------------------------------------------- */

async function benchmarkQuestion(testCase) {
  const { question, expectedTerms, category } = testCase;

  const start = performance.now();

  const queryEmbedding = await createEmbedding(question);

  const chunks = await retrieveHybridChunks(DOCUMENT_ID, question, queryEmbedding, TOP_K);

  const retrievalLatency = performance.now() - start;

  const confidence = evaluateRetrievalConfidence(chunks, question);

  const topChunk = chunks[0] || null;

  const topChunkCorrect = topChunk && chunkContainsExpectedTerms(topChunk, expectedTerms);

  const retrievedCorrectChunk = chunks.some((chunk) =>
    chunkContainsExpectedTerms(chunk, expectedTerms)
  );

  return {
    question,
    category,
    candidates: chunks.length,

    vectorScore: Number(topChunk?.vectorScore || 0),
    keywordScore: Number(topChunk?.keywordScore || 0),
    hybridScore: Number(topChunk?.hybridScore || 0),

    confident: confidence.confident,
    confidenceReason: confidence.reason,

    topChunkCorrect: Boolean(topChunkCorrect),
    retrievedCorrectChunk: Boolean(retrievedCorrectChunk),

    retrievalLatency,
  };
}

/* -------------------------------------------------- */
/* Main                                              */
/* -------------------------------------------------- */

async function main() {
  console.log("\n========================================");
  console.log("RAG RETRIEVAL BENCHMARK");
  console.log("========================================\n");

  console.log(`Document: ${DOCUMENT_ID}`);
  console.log(`Top-K: ${TOP_K}`);
  console.log(`Questions: ${TEST_CASES.length}\n`);

  const results = [];

  for (const testCase of TEST_CASES) {
    console.log("----------------------------------------");
    console.log(`Question: ${testCase.question}`);

    try {
      const result = await benchmarkQuestion(testCase);

      results.push(result);

      console.log(`Vector:      ${result.vectorScore.toFixed(4)}`);

      console.log(`Keyword:     ${result.keywordScore.toFixed(4)}`);

      console.log(`Hybrid:      ${result.hybridScore.toFixed(4)}`);

      console.log(`Confidence:  ${result.confident} (${result.confidenceReason})`);

      console.log(`Top Correct: ${result.topChunkCorrect}`);

      console.log(`Recall@${TOP_K}: ${result.retrievedCorrectChunk}`);

      console.log(`Latency:     ${result.retrievalLatency.toFixed(2)} ms`);
    } catch (error) {
      console.error(`Benchmark failed: ${error.message}`);
    }
  }

  /* -------------------------------------------------- */
  /* Metrics                                            */
  /* -------------------------------------------------- */

  const answerable = results.filter((r) => r.category !== "unrelated");

  const unrelated = results.filter((r) => r.category === "unrelated");

  const recallAtK =
    answerable.length === 0
      ? 0
      : answerable.filter((r) => r.retrievedCorrectChunk).length / answerable.length;

  const top1Accuracy =
    answerable.length === 0
      ? 0
      : answerable.filter((r) => r.topChunkCorrect).length / answerable.length;

  /*
   * For unrelated questions, we want the
   * confidence gate to reject the retrieval.
   */
  const rejectionAccuracy =
    unrelated.length === 0 ? 0 : unrelated.filter((r) => !r.confident).length / unrelated.length;

  const confidenceAccuracy =
    results.length === 0
      ? 0
      : (answerable.filter((r) => r.confident).length +
          unrelated.filter((r) => !r.confident).length) /
        results.length;

  const latencies = results.map((r) => r.retrievalLatency);

  const vectorScores = results.map((r) => r.vectorScore);

  const keywordScores = results.map((r) => r.keywordScore);

  console.log("\n\n========================================");
  console.log("BENCHMARK RESULTS");
  console.log("========================================\n");

  console.log(`Total Questions:       ${results.length}`);

  console.log(`Answerable Questions:  ${answerable.length}`);

  console.log(`Unrelated Questions:   ${unrelated.length}`);

  console.log(`Top-1 Accuracy:         ${(top1Accuracy * 100).toFixed(2)}%`);

  console.log(`Recall@${TOP_K}:              ${(recallAtK * 100).toFixed(2)}%`);

  console.log(`Confidence Accuracy:    ${(confidenceAccuracy * 100).toFixed(2)}%`);

  console.log(`Unrelated Rejection:    ${(rejectionAccuracy * 100).toFixed(2)}%`);

  console.log(`Avg Retrieval Latency:  ${average(latencies).toFixed(2)} ms`);

  console.log(`P95 Retrieval Latency:  ${percentile(latencies, 95).toFixed(2)} ms`);

  console.log(`Avg Vector Score:       ${average(vectorScores).toFixed(4)}`);

  console.log(`Avg Keyword Score:      ${average(keywordScores).toFixed(4)}`);

  console.log("\n========================================");
  console.log("CATEGORY BREAKDOWN");
  console.log("========================================\n");

  for (const category of ["direct", "paraphrased", "unrelated"]) {
    const categoryResults = results.filter((r) => r.category === category);

    if (!categoryResults.length) continue;

    const correct = categoryResults.filter((r) =>
      category === "unrelated" ? !r.confident : r.retrievedCorrectChunk
    ).length;

    console.log(`${category.padEnd(15)} ${((correct / categoryResults.length) * 100).toFixed(2)}%`);
  }

  console.log("\n========================================");
  console.log("END BENCHMARK");
  console.log("========================================\n");
}

main().catch((error) => {
  console.error("\nBenchmark failed:", error);
  process.exit(1);
});
