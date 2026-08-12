import { pool } from "../config/db.js";

export async function saveChatHistory({
  documentId,
  question,
  answer,
  citations = [],
  retrievalConfidence = null,
}) {
  const result = await pool.query(
    `
      INSERT INTO chat_history (
        document_id,
        question,
        answer,
        citations,
        retrieval_confidence
      )
      VALUES ($1, $2, $3, $4::jsonb, $5)
      RETURNING
        id,
        document_id,
        question,
        answer,
        citations,
        retrieval_confidence,
        created_at
    `,
    [documentId, question, answer, JSON.stringify(citations), retrievalConfidence]
  );

  return result.rows[0];
}

export async function getChatHistory(documentId) {
  const result = await pool.query(
    `
      SELECT
        id,
        document_id,
        question,
        answer,
        citations,
        retrieval_confidence,
        created_at
      FROM chat_history
      WHERE document_id = $1
      ORDER BY created_at DESC
    `,
    [documentId]
  );

  return result.rows;
}

export async function deleteChatHistory(documentId) {
  const result = await pool.query(
    `
      DELETE FROM chat_history
      WHERE document_id = $1
      RETURNING id
    `,
    [documentId]
  );

  return result.rowCount;
}
