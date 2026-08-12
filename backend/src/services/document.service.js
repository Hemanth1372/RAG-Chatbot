import { pool } from "../config/db.js";

export const DOCUMENT_STATUS = Object.freeze({
  UPLOADED: "uploaded",
  EXTRACTING: "extracting",
  CHUNKING: "chunking",
  EMBEDDING: "embedding",
  STORING: "storing",
  COMPLETED: "completed",
  FAILED: "failed",
});

export async function updateDocumentStatus(documentId, status, progress, extra = {}) {
  const { totalPages = undefined, totalChunks = undefined, errorMessage = undefined } = extra;

  await pool.query(
    `
      UPDATE documents
      SET
        status = $2,
        progress = $3,
        total_pages = COALESCE($4, total_pages),
        total_chunks = COALESCE($5, total_chunks),
        error_message = $6,
        updated_at = NOW(),
        completed_at =
          CASE
            WHEN $2 = 'completed' THEN NOW()
            ELSE completed_at
          END
      WHERE id = $1
    `,
    [documentId, status, progress, totalPages ?? null, totalChunks ?? null, errorMessage ?? null]
  );
}

export async function getDocument(documentId) {
  const result = await pool.query(
    `
      SELECT *
      FROM documents
      WHERE id = $1
      LIMIT 1
    `,
    [documentId]
  );

  return result.rows[0] || null;
}

export async function findDocumentByHash(contentHash) {
  const result = await pool.query(
    `
      SELECT id, source_name, status
      FROM documents
      WHERE content_hash = $1
      ORDER BY created_at DESC
      LIMIT 1
    `,
    [contentHash]
  );

  return result.rows[0] || null;
}

export async function deleteChunksForDocument(documentId) {
  await pool.query(
    `
      DELETE FROM chunks
      WHERE document_id = $1
    `,
    [documentId]
  );
}
