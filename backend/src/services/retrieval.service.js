import { performance } from "perf_hooks";
import { pool } from "../config/db.js";

export async function checkDocumentCompleted(documentId) {
  const response = await pool.query(
    `
        SELECT
          id,
          status,
          total_chunks,
          total_pages,
          error_message
        FROM documents
        WHERE id = $1
      `,
    [documentId]
  );

  if (response.rows.length === 0) {
    return {
      exists: false,
      status: null,
      canProceed: false,
    };
  }

  const document = response.rows[0];

  return {
    exists: true,
    status: document.status,
    totalChunks: document.total_chunks,
    totalPages: document.total_pages,
    errorMessage: document.error_message,
    canProceed: document.status === "completed",
  };
}

export async function retrieveRelevantChunks(
  documentId,
  queryEmbedding,
  topK = Number(process.env.RETRIEVAL_TOP_K || 5)
) {
  const startedAt = performance.now();

  const vectorString = `[${queryEmbedding.join(",")}]`;

  const response = await pool.query(
    `
      SELECT
        id,
        document_id,
        chunk_text,
        page,
        section,
        chunk_index,
        page_start,
        page_end,
        word_count,
        1 - (
          embedding <=> $2::vector
        ) AS similarity
      FROM chunks
      WHERE document_id = $1
      ORDER BY embedding <=> $2::vector
      LIMIT $3
    `,
    [documentId, vectorString, topK]
  );

  const latencyMs = performance.now() - startedAt;

  const candidates = response.rows;

  console.log(
    JSON.stringify({
      event: "retrieval",
      documentId,
      topK,
      candidates: candidates.length,
      maxSimilarity: candidates.length > 0 ? Number(candidates[0].similarity) : null,
      latencyMs: Math.round(latencyMs),
    })
  );

  return candidates;
}

export async function retrieveKeywordChunks(
  documentId,
  query,
  topK = Number(process.env.RETRIEVAL_KEYWORD_TOP_K || 5)
) {
  const startedAt = performance.now();

  const response = await pool.query(
    `
      SELECT
        id,
        document_id,
        chunk_text,
        page,
        section,
        chunk_index,
        page_start,
        page_end,
        word_count,
        ts_rank(
          search_vector,
          plainto_tsquery('english', $2)
        ) AS keyword_score
      FROM chunks
      WHERE document_id = $1
        AND search_vector @@ plainto_tsquery('english', $2)
      ORDER BY keyword_score DESC
      LIMIT $3
    `,
    [documentId, query, topK]
  );

  const latencyMs = performance.now() - startedAt;

  console.log(
    JSON.stringify({
      event: "keyword_retrieval",
      documentId,
      topK,
      query,
      returned: response.rows.length,
      latencyMs: Math.round(latencyMs),
    })
  );

  return response.rows;
}

export async function retrieveHybridChunks(
  documentId,
  query,
  queryEmbedding,
  topK = Number(process.env.RETRIEVAL_TOP_K || 5)
) {
  const startedAt = performance.now();

  const vectorChunks = await retrieveRelevantChunks(documentId, queryEmbedding, topK);

  const keywordChunks = await retrieveKeywordChunks(documentId, query, topK);

  const merged = new Map();

  // Add vector results
  for (let rank = 0; rank < vectorChunks.length; rank++) {
    const chunk = vectorChunks[rank];

    merged.set(chunk.id, {
      ...chunk,
      vectorScore: Number(chunk.similarity),
      keywordScore: 0,
      vectorRank: rank + 1,
      keywordRank: null,
    });
  }

  // Add / merge keyword results
  for (let rank = 0; rank < keywordChunks.length; rank++) {
    const chunk = keywordChunks[rank];

    if (merged.has(chunk.id)) {
      const existing = merged.get(chunk.id);

      existing.keywordScore = Number(chunk.keyword_score);
      existing.keywordRank = rank + 1;
    } else {
      merged.set(chunk.id, {
        ...chunk,
        similarity: 0,
        vectorScore: 0,
        keywordScore: Number(chunk.keyword_score),
        vectorRank: null,
        keywordRank: rank + 1,
      });
    }
  }

  const results = Array.from(merged.values());

  /*
   * Reciprocal Rank Fusion (RRF)
   *
   * We use rank instead of directly adding vector and
   * keyword scores because the two scoring systems are
   * not directly comparable.
   */
  const RRF_K = 60;

  for (const chunk of results) {
    const vectorContribution = chunk.vectorRank ? 1 / (RRF_K + chunk.vectorRank) : 0;

    const keywordContribution = chunk.keywordRank ? 1 / (RRF_K + chunk.keywordRank) : 0;

    chunk.hybridScore = vectorContribution + keywordContribution;
  }

  results.sort((a, b) => b.hybridScore - a.hybridScore);

  const finalResults = results.slice(0, topK);

  const latencyMs = performance.now() - startedAt;

  console.log(
    JSON.stringify({
      event: "hybrid_retrieval",
      documentId,
      topK,
      vectorResults: vectorChunks.length,
      keywordResults: keywordChunks.length,
      mergedResults: results.length,
      returned: finalResults.length,
      latencyMs: Math.round(latencyMs),
    })
  );

  return finalResults;
}

const STOP_WORDS = new Set([
  "what",
  "which",
  "who",
  "when",
  "where",
  "why",
  "how",
  "much",
  "many",
  "does",
  "do",
  "did",
  "is",
  "are",
  "was",
  "were",
  "the",
  "a",
  "an",
  "and",
  "or",
  "to",
  "of",
  "for",
  "in",
  "on",
  "at",
  "from",
  "with",
  "this",
  "that",
  "student",
]);

function getQuestionTerms(question) {
  return question
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((word) => word.length >= 3 && !STOP_WORDS.has(word));
}
function calculateTermOverlap(question, chunkText) {
  if (!question || !chunkText) {
    return 0;
  }

  const questionTerms = new Set(getQuestionTerms(question));

  const chunkTerms = new Set(getQuestionTerms(chunkText));

  if (questionTerms.size === 0) {
    return 0;
  }

  let matches = 0;

  for (const term of questionTerms) {
    if (chunkTerms.has(term)) {
      matches++;
    }
  }

  return matches / questionTerms.size;
}

export function evaluateRetrievalConfidence(chunks, question = "") {
  if (!chunks || chunks.length === 0) {
    return {
      confident: false,
      reason: "no_results",
      score: 0,
    };
  }

  const top = chunks[0];

  const vectorScore = Number(top.vectorScore || 0);
  const keywordScore = Number(top.keywordScore || 0);

  const minVectorScore = Number(process.env.HYBRID_MIN_VECTOR_SCORE || 0.5);

  const minKeywordScore = Number(process.env.HYBRID_MIN_KEYWORD_SCORE || 0.05);

  const vectorPass = vectorScore >= minVectorScore;
  const keywordPass = keywordScore >= minKeywordScore;

  // Strong semantic + lexical match
  if (vectorPass && keywordPass) {
    return {
      confident: true,
      reason: "strong_semantic_and_lexical_match",
      score: vectorScore,
    };
  }

  // Strong semantic match even without lexical overlap
  if (vectorPass) {
    return {
      confident: true,
      reason: "strong_semantic_match",
      score: vectorScore,
    };
  }

  // Strong lexical match even when semantic similarity is weak
  if (keywordPass) {
    return {
      confident: true,
      reason: "strong_keyword_match",
      score: keywordScore,
    };
  }

  return {
    confident: false,
    reason: "weak_retrieval",
    score: Math.max(vectorScore, keywordScore),
  };
}
