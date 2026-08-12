import { pool } from "../config/db.js";
import crypto, { createHash } from "crypto";

function vectorToPgVector(values) {
  return `[${values.join(",")}]`;
}

function createChunkHash(documentId, chunk) {
  return createHash("sha256")
    .update([documentId, chunk.chunkIndex, chunk.pageStart, chunk.pageEnd, chunk.text].join("|"))
    .digest("hex");
}

export async function insertChunks(documentId, chunks, embeddings) {
  if (chunks.length !== embeddings.length) {
    throw new Error("Chunk count and embedding count do not match.");
  }

  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      const embedding = embeddings[i];

      const id = crypto.randomUUID();

      await client.query(
        `
          INSERT INTO chunks (
            id,
            document_id,
            chunk_text,
            embedding,
            page,
            section,
            chunk_index,
            page_start,
            page_end,
            word_count,
            content_hash
          )
          VALUES (
            $1,
            $2,
            $3,
            $4,
            $5,
            $6,
            $7,
            $8,
            $9,
            $10,
            $11
          )
          ON CONFLICT (id) DO UPDATE SET
            chunk_text = EXCLUDED.chunk_text,
            embedding = EXCLUDED.embedding,
            page = EXCLUDED.page,
            section = EXCLUDED.section,
            chunk_index = EXCLUDED.chunk_index,
            page_start = EXCLUDED.page_start,
            page_end = EXCLUDED.page_end,
            word_count = EXCLUDED.word_count,
            content_hash = EXCLUDED.content_hash
        `,
        [
          id,
          documentId,
          chunk.text,
          vectorToPgVector(embedding),
          chunk.pageStart,
          chunk.section,
          chunk.chunkIndex,
          chunk.pageStart,
          chunk.pageEnd,
          chunk.wordCount,
          createHash("sha256").update(chunk.text).digest("hex"),
        ]
      );
    }

    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
