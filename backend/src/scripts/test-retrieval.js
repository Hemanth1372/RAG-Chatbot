import dotenv from "dotenv";
dotenv.config();

import { createEmbedding } from "../services/embeddings.service.js";
import {
  retrieveHybridChunks,
  evaluateRetrievalConfidence,
} from "../services/retrieval.service.js";

const documentId = "157465ca-7da4-46e2-a0d8-8147cef763c8";

const questions = [
  "What is the total hostel fee?",
  "How much does the student need to pay for accommodation?",
  "Who is Guntuku Asha Latha?",
  "What hostel is the student staying in?",
  "What is the student's specialization?",
  "What is the student's roll number?",
];

for (const question of questions) {
  console.log("\n========================================");
  console.log(`Question: ${question}`);
  console.log("========================================");

  try {
    const embedding = await createEmbedding(question);

    const chunks = await retrieveHybridChunks(
      documentId,
      question,
      embedding,
      Number(process.env.RETRIEVAL_TOP_K || 10)
    );

    const confidence = evaluateRetrievalConfidence(chunks, question);

    if (!chunks || chunks.length === 0) {
      console.log("❌ No chunks retrieved");
      continue;
    }

    const top = chunks[0];

    console.log("Top Chunk:");
    console.log(`  ID:            ${top.id}`);
    console.log(`  Vector Score:  ${Number(top.vectorScore || 0).toFixed(4)}`);
    console.log(`  Keyword Score: ${Number(top.keywordScore || 0).toFixed(4)}`);
    console.log(`  Hybrid Score:  ${Number(top.hybridScore || 0).toFixed(4)}`);
    console.log(`  Vector Rank:   ${top.vectorRank ?? "N/A"}`);
    console.log(`  Keyword Rank:  ${top.keywordRank ?? "N/A"}`);

    console.log("\nRetrieval Confidence:");
    console.log(`  Confident: ${confidence.confident}`);
    console.log(`  Reason:    ${confidence.reason}`);
    console.log(`  Score:     ${confidence.score.toFixed(4)}`);

    console.log("\nPreview:");
    console.log(top.chunk_text?.slice(0, 250));
  } catch (error) {
    console.error("❌ Retrieval test failed:");
    console.error(error.message);
  }
}
