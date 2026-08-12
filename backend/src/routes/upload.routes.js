import express from "express";
import multer from "multer";
import { v4 as uuidv4 } from "uuid";
import fs from "fs";
import path from "path";

import { pool } from "../config/db.js";
import { documentQueue } from "../queues/document.queue.js";

import { createFileHash } from "../services/documentHash.service.js";
import { findDocumentByHash } from "../services/document.service.js";

const uploadDir = "./uploads";

if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, {
    recursive: true,
  });
}

const fileFilter = (req, file, cb) => {
  if (file.mimetype === "application/pdf" || file.mimetype === "text/plain") {
    cb(null, true);
  } else {
    cb(new Error("Only PDF and TXT files are allowed."), false);
  }
};

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },

  filename: (req, file, cb) => {
    const documentId = uuidv4();

    const safeName = path.basename(file.originalname).replace(/[^a-zA-Z0-9._-]/g, "_");

    req.documentId = documentId;

    cb(null, `${documentId}-${safeName}`);
  },
});

const upload = multer({
  storage,

  fileFilter,

  limits: {
    fileSize: Number(process.env.MAX_UPLOAD_SIZE_MB || 25) * 1024 * 1024,
  },
});

const router = express.Router();

async function removeFile(filePath) {
  if (!filePath) {
    return;
  }

  try {
    await fs.promises.unlink(filePath);
  } catch (error) {
    if (error.code !== "ENOENT") {
      console.error("Failed to remove uploaded file:", error);
    }
  }
}

router.post("/", upload.single("file"), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({
      status: "failed",
      message: "No file uploaded.",
    });
  }

  const documentId = req.documentId;

  try {
    const sourceName = req.file.originalname;
    const contentHash = await createFileHash(req.file.path);

    const existingDocument = await findDocumentByHash(contentHash);

    // Existing document
    if (existingDocument) {
      // Completed / currently processing → duplicate
      if (existingDocument.status !== "failed") {
        console.log(
          `[upload] Duplicate document detected. Existing document: ${existingDocument.id}`
        );

        await removeFile(req.file.path);

        return res.status(200).json({
          status: "duplicate",
          message: "This document has already been uploaded.",
          document: {
            documentId: existingDocument.id,
            sourceName: existingDocument.source_name,
            status: existingDocument.status,
          },
        });
      }

      // Failed document → retry it
      console.log(`[upload] Retrying failed document: ${existingDocument.id}`);

      const fileType = req.file.mimetype === "application/pdf" ? "pdf" : "txt";

      await pool.query(
        `
        UPDATE documents
        SET
          file_path = $1,
          source_name = $2,
          file_type = $3,
          status = 'uploaded',
          progress = 0,
          total_pages = 0,
          total_chunks = 0,
          error_message = NULL,
          updated_at = NOW(),
          completed_at = NULL
        WHERE id = $4
        `,
        [req.file.path, sourceName, fileType, existingDocument.id]
      );

      await documentQueue.add(
        "process-document",
        {
          documentId: existingDocument.id,
        },
        {
          jobId: `${existingDocument.id}-retry-${Date.now()}`,

          attempts: Number(process.env.JOB_ATTEMPTS || 3),

          backoff: {
            type: "exponential",
            delay: Number(process.env.JOB_BACKOFF_MS || 2000),
          },

          removeOnComplete: {
            age: 24 * 60 * 60,
            count: 1000,
          },

          removeOnFail: {
            age: 7 * 24 * 60 * 60,
            count: 5000,
          },
        }
      );

      return res.status(202).json({
        status: "accepted",
        message: "Previously failed document has been queued for retry.",
        document: {
          documentId: existingDocument.id,
          sourceName,
          status: "uploaded",
        },
      });
    }

    // Completely new document
    const fileType = req.file.mimetype === "application/pdf" ? "pdf" : "txt";

    const result = await pool.query(
      `
      INSERT INTO documents (
        id,
        source_name,
        file_type,
        file_path,
        status,
        progress,
        total_pages,
        total_chunks,
        error_message,
        content_hash
      )
      VALUES (
        $1,
        $2,
        $3,
        $4,
        'uploaded',
        0,
        0,
        0,
        NULL,
        $5
      )
      RETURNING id, source_name, status
      `,
      [documentId, sourceName, fileType, req.file.path, contentHash]
    );

    await documentQueue.add(
      "process-document",
      {
        documentId,
      },
      {
        jobId: documentId,

        attempts: Number(process.env.JOB_ATTEMPTS || 3),

        backoff: {
          type: "exponential",
          delay: Number(process.env.JOB_BACKOFF_MS || 2000),
        },

        removeOnComplete: {
          age: 24 * 60 * 60,
          count: 1000,
        },

        removeOnFail: {
          age: 7 * 24 * 60 * 60,
          count: 5000,
        },
      }
    );

    return res.status(202).json({
      status: "accepted",
      message: "Document uploaded and queued for processing.",
      document: {
        documentId: result.rows[0].id,
        sourceName: result.rows[0].source_name,
        status: result.rows[0].status,
      },
    });
  } catch (error) {
    await removeFile(req.file.path);

    console.error("Upload failed:", error);

    return res.status(500).json({
      status: "failed",
      message: "Failed to queue document for processing.",
    });
  }
});

export default router;
