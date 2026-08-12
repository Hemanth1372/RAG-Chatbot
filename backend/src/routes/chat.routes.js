import express from "express";
import { performance } from "perf_hooks";

import { getCachedAnswer, cacheAnswer } from "../services/chatCache.service.js";

import { createEmbedding } from "../services/embeddings.service.js";

import {
  checkDocumentCompleted,
  retrieveHybridChunks,
  evaluateRetrievalConfidence,
} from "../services/retrieval.service.js";

import { generateAnswer } from "../services/generation.service.js";

import { saveChatHistory } from "../services/chatHistory.service.js";

const router = express.Router();

function formatSources(chunks, citations = []) {
  return chunks.map((chunk, index) => ({
    sourceNumber: index + 1,

    chunkId: chunk.id,

    page: chunk.page,

    pageStart: chunk.page_start,

    pageEnd: chunk.page_end,

    section: chunk.section,

    chunkIndex: chunk.chunk_index,

    similarity: Number(chunk.similarity || 0),

    vectorScore: Number(chunk.vectorScore || 0),

    keywordScore: Number(chunk.keywordScore || 0),

    hybridScore: Number(chunk.hybridScore || 0),

    vectorRank: chunk.vectorRank,

    keywordRank: chunk.keywordRank,

    cited: citations.includes(index + 1),

    preview: chunk.chunk_text?.slice(0, 300),
  }));
}

function getApiErrorStatus(err) {
  return err.status || err.code || err.response?.status;
}

function getApiErrorMessage(err) {
  return err.message || err.response?.data?.error?.message || "Unknown Gemini API error";
}

router.post("/", async (req, res) => {
  const requestStartedAt = performance.now();

  try {
    const { documentId, question } = req.body;

    // --------------------------------------------------
    // 1. Validate request
    // --------------------------------------------------

    if (!documentId || !question || question.trim() === "") {
      return res.status(400).json({
        status: "failed",
        message: "Please select a document and enter a question.",
      });
    }

    const cleanedQuestion = question.trim();

    // --------------------------------------------------
    // 2. Check Redis cache
    // --------------------------------------------------

    const cachedAnswer = await getCachedAnswer(documentId, cleanedQuestion);

    if (cachedAnswer) {
      console.log(
        JSON.stringify({
          event: "chat_cache_hit",
          documentId,
          question: cleanedQuestion,
        })
      );

      return res.status(200).json({
        status: "success",

        message: "Answer retrieved from cache.",

        answer: cachedAnswer.answer,

        citations: cachedAnswer.citations,

        sources: cachedAnswer.sources || [],

        metrics: {
          cacheHit: true,

          retrievedChunks: 0,

          citedSources: cachedAnswer.citations?.length || 0,

          embeddingLatencyMs: 0,

          retrievalLatencyMs: 0,

          generationLatencyMs: 0,

          totalLatencyMs: Math.round(performance.now() - requestStartedAt),
        },
      });
    }

    console.log(
      JSON.stringify({
        event: "chat_cache_miss",
        documentId,
        question: cleanedQuestion,
      })
    );

    // --------------------------------------------------
    // 3. Check document status
    // --------------------------------------------------

    const documentStatus = await checkDocumentCompleted(documentId);

    if (!documentStatus.exists) {
      return res.status(404).json({
        status: "failed",
        message: "The selected document was not found.",
      });
    }

    if (!documentStatus.canProceed) {
      return res.status(400).json({
        status: "failed",

        message:
          documentStatus.status === "failed"
            ? `Document processing failed: ${documentStatus.errorMessage || "Unknown error"}`
            : `This document is not ready yet. Current status: ${documentStatus.status}.`,
      });
    }

    // --------------------------------------------------
    // 4. Generate query embedding
    // --------------------------------------------------

    const embeddingStartedAt = performance.now();

    const queryEmbedding = await createEmbedding(cleanedQuestion);

    const embeddingLatencyMs = performance.now() - embeddingStartedAt;

    // --------------------------------------------------
    // 5. Hybrid retrieval
    // --------------------------------------------------

    const retrievalStartedAt = performance.now();

    const chunks = await retrieveHybridChunks(
      documentId,
      cleanedQuestion,
      queryEmbedding,
      Number(process.env.RETRIEVAL_TOP_K || 10)
    );

    const retrievalLatencyMs = performance.now() - retrievalStartedAt;

    // --------------------------------------------------
    // 6. Evaluate retrieval confidence
    // --------------------------------------------------

    const retrievalConfidence = evaluateRetrievalConfidence(chunks, cleanedQuestion);
    console.log(
      JSON.stringify({
        event: "retrieval_confidence",

        documentId,

        confident: retrievalConfidence.confident,

        reason: retrievalConfidence.reason,

        score: retrievalConfidence.score,
      })
    );

    if (!retrievalConfidence.confident) {
      return res.status(200).json({
        status: "success",

        answer: "I don't know from the provided document.",

        citations: [],

        sources: [],

        metrics: {
          cacheHit: false,

          retrievedChunks: chunks.length,

          citedSources: 0,

          retrievalConfidence: retrievalConfidence.score,

          retrievalConfidenceReason: retrievalConfidence.reason,

          embeddingLatencyMs: Math.round(embeddingLatencyMs),

          retrievalLatencyMs: Math.round(retrievalLatencyMs),

          totalLatencyMs: Math.round(performance.now() - requestStartedAt),
        },
      });
    }

    // --------------------------------------------------
    // 7. No chunks
    // --------------------------------------------------

    if (!chunks || chunks.length === 0) {
      return res.status(200).json({
        status: "success",

        answer: "I don't know from the provided document.",

        citations: [],

        sources: [],

        metrics: {
          cacheHit: false,

          retrievedChunks: 0,

          citedSources: 0,

          embeddingLatencyMs: Math.round(embeddingLatencyMs),

          retrievalLatencyMs: Math.round(retrievalLatencyMs),

          totalLatencyMs: Math.round(performance.now() - requestStartedAt),
        },
      });
    }

    // --------------------------------------------------
    // 8. Generate answer
    // --------------------------------------------------

    const generationStartedAt = performance.now();

    let generated;

    try {
      generated = await generateAnswer(cleanedQuestion, chunks);
    } catch (err) {
      console.error("GENERATION ERROR:", err);

      const apiStatus = getApiErrorStatus(err);

      const apiMessage = getApiErrorMessage(err);

      const sources = formatSources(chunks);

      if (apiStatus === 429) {
        return res.status(429).json({
          status: "failed",

          message:
            "Gemini quota exceeded. Retrieval completed successfully, but answer generation is temporarily unavailable.",

          answer: "",

          sources,
        });
      }

      return res.status(500).json({
        status: "failed",

        message: `Relevant document content was found, but answer generation failed: ${apiMessage}`,

        answer: "",

        sources,
      });
    }

    const generationLatencyMs = performance.now() - generationStartedAt;

    // --------------------------------------------------
    // 9. Format sources
    // --------------------------------------------------

    const sources = formatSources(chunks, generated.citations);

    // --------------------------------------------------
    // 10. Save answer to Redis
    // --------------------------------------------------

    await cacheAnswer(documentId, cleanedQuestion, {
      answer: generated.answer,

      citations: generated.citations,

      sources,
    });

    console.log(
      JSON.stringify({
        event: "chat_cache_set",

        documentId,

        question: cleanedQuestion,
      })
    );

    // --------------------------------------------------
    // 11. Save chat history
    // --------------------------------------------------

    await saveChatHistory({
      documentId,

      question: cleanedQuestion,

      answer: generated.answer,

      citations: generated.citations,

      retrievalConfidence: retrievalConfidence.score,
    });

    // --------------------------------------------------
    // 12. Metrics
    // --------------------------------------------------

    const totalLatencyMs = performance.now() - requestStartedAt;

    console.log(
      JSON.stringify({
        event: "chat_request",

        documentId,

        cacheHit: false,

        retrievedChunks: chunks.length,

        citedSources: generated.citations.length,

        embeddingLatencyMs: Math.round(embeddingLatencyMs),

        retrievalLatencyMs: Math.round(retrievalLatencyMs),

        generationLatencyMs: Math.round(generationLatencyMs),

        totalLatencyMs: Math.round(totalLatencyMs),
      })
    );

    // --------------------------------------------------
    // 13. Response
    // --------------------------------------------------

    return res.status(200).json({
      status: "success",

      message: "Answer generated successfully.",

      answer: generated.answer,

      citations: generated.citations,

      sources,

      metrics: {
        cacheHit: false,

        retrievedChunks: chunks.length,

        citedSources: generated.citations.length,

        embeddingLatencyMs: Math.round(embeddingLatencyMs),

        retrievalLatencyMs: Math.round(retrievalLatencyMs),

        generationLatencyMs: Math.round(generationLatencyMs),

        totalLatencyMs: Math.round(totalLatencyMs),
      },
    });
  } catch (err) {
    console.error("CHAT ROUTE ERROR:", err);

    return res.status(500).json({
      status: "failed",

      message: "Something went wrong while processing your question.",
    });
  }
});

export default router;
