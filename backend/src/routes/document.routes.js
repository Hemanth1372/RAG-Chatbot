import express from "express";
import fs from "fs";

import { pool } from "../config/db.js";
import { deleteDocumentChatCache } from "../services/chatCache.service.js";

const router = express.Router();

router.get("/", async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        id,
        source_name,
        file_type,
        status,
        progress,
        total_pages,
        total_chunks,
        error_message,
        created_at,
        updated_at,
        completed_at
      FROM documents
      ORDER BY created_at DESC
    `);

    return res.status(200).json({
      status: "success",
      count: result.rows.length,
      documents: result.rows.map((document) => ({
        documentId: document.id,
        sourceName: document.source_name,
        fileType: document.file_type,
        status: document.status,
        progress: document.progress,
        totalPages: document.total_pages,
        totalChunks: document.total_chunks,
        errorMessage: document.error_message,
        createdAt: document.created_at,
        updatedAt: document.updated_at,
        completedAt: document.completed_at,
      })),
    });
  } catch (error) {
    console.error("DOCUMENT LIST ERROR:", error);

    return res.status(500).json({
      status: "failed",
      message: "Failed to fetch documents.",
    });
  }
});

async function removeFile(filePath) {
  if (!filePath) return;

  try {
    await fs.promises.unlink(filePath);
  } catch (error) {
    if (error.code !== "ENOENT") {
      console.error("Failed to remove document file:", error);
    }
  }
}

router.get("/", async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        id,
        source_name,
        file_type,
        status,
        progress,
        total_pages,
        total_chunks,
        error_message,
        created_at,
        updated_at,
        completed_at
      FROM documents
      ORDER BY created_at DESC
    `);

    return res.status(200).json({
      status: "success",
      count: result.rows.length,
      documents: result.rows.map((document) => ({
        documentId: document.id,
        sourceName: document.source_name,
        fileType: document.file_type,
        status: document.status,
        progress: document.progress,
        totalPages: document.total_pages,
        totalChunks: document.total_chunks,
        errorMessage: document.error_message,
        createdAt: document.created_at,
        updatedAt: document.updated_at,
        completedAt: document.completed_at,
      })),
    });
  } catch (error) {
    console.error("DOCUMENT LIST ERROR:", error);

    return res.status(500).json({
      status: "failed",
      message: "Failed to fetch documents.",
    });
  }
});

router.get("/:documentId", async (req, res) => {
  try {
    const { documentId } = req.params;

    const result = await pool.query(
      `
      SELECT
        id,
        source_name,
        file_type,
        status,
        progress,
        total_pages,
        total_chunks,
        error_message,
        created_at,
        updated_at,
        completed_at
      FROM documents
      WHERE id = $1
      `,
      [documentId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        status: "failed",
        message: "Document not found.",
      });
    }

    const document = result.rows[0];

    return res.status(200).json({
      status: "success",
      document: {
        documentId: document.id,
        sourceName: document.source_name,
        fileType: document.file_type,
        status: document.status,
        progress: document.progress,
        totalPages: document.total_pages,
        totalChunks: document.total_chunks,
        errorMessage: document.error_message,
        createdAt: document.created_at,
        updatedAt: document.updated_at,
        completedAt: document.completed_at,
      },
    });
  } catch (error) {
    console.error("DOCUMENT DETAILS ERROR:", error);

    return res.status(500).json({
      status: "failed",
      message: "Failed to fetch document.",
    });
  }
});

router.delete("/:documentId", async (req, res) => {
  const { documentId } = req.params;

  try {
    // 1. Find document first
    const result = await pool.query(
      `
      SELECT
        id,
        source_name,
        file_path
      FROM documents
      WHERE id = $1
      `,
      [documentId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        status: "failed",
        message: "Document not found.",
      });
    }

    const document = result.rows[0];

    // 2. Delete database record
    // chunks are automatically deleted because of ON DELETE CASCADE
    await pool.query(
      `
      DELETE FROM documents
      WHERE id = $1
      `,
      [documentId]
    );

    await deleteDocumentChatCache(documentId);
    // 3. Delete physical uploaded file
    await removeFile(document.file_path);

    console.log(
      JSON.stringify({
        event: "document_deleted",
        documentId,
        sourceName: document.source_name,
      })
    );

    return res.status(200).json({
      status: "success",
      message: "Document deleted successfully.",
      document: {
        documentId: document.id,
        sourceName: document.source_name,
      },
    });
  } catch (error) {
    console.error("DOCUMENT DELETE ERROR:", error);

    return res.status(500).json({
      status: "failed",
      message: "Failed to delete document.",
    });
  }
});

export default router;
