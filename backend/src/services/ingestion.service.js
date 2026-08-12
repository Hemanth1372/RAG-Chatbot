import fs from "fs/promises";
import { performance } from "perf_hooks";

import { extractDocument } from "./extraction.service.js";
import { chunkDocument } from "./chunking.service.js";
import { createFileHash } from "./documentHash.service.js";
import {
  DOCUMENT_STATUS,
  findDocumentByHash,
  getDocument,
  updateDocumentStatus,
} from "./document.service.js";
import { createEmbeddings } from "./embeddings.service.js";
import { insertChunks } from "./chunkStorage.service.js";

export async function processDocument(documentId) {
  const startedAt = performance.now();

  const document = await getDocument(documentId);

  if (!document) {
    throw new Error(`Document not found: ${documentId}`);
  }

  try {
    await updateDocumentStatus(documentId, DOCUMENT_STATUS.EXTRACTING, 10);

    const extracted = await extractDocument(document.file_path, document.file_type);

    await updateDocumentStatus(documentId, DOCUMENT_STATUS.EXTRACTING, 25, {
      totalPages: extracted.totalPages,
    });

    if (!extracted.pages.some((page) => page.text.trim())) {
      throw new Error("No readable text was extracted from the document.");
    }

    const contentHash = await createFileHash(document.file_path);

    const duplicate = await findDocumentByHash(contentHash);

    if (duplicate && duplicate.id !== documentId) {
      await updateDocumentStatus(documentId, DOCUMENT_STATUS.FAILED, 100, {
        errorMessage: `Duplicate document. Existing document: ${duplicate.id}`,
      });

      return {
        duplicate: true,
        duplicateDocumentId: duplicate.id,
        durationMs: Math.round(performance.now() - startedAt),
      };
    }

    await updateDocumentStatus(documentId, DOCUMENT_STATUS.CHUNKING, 35);

    const chunks = chunkDocument(
      extracted.pages,
      Number(process.env.CHUNK_SIZE || 350),
      Number(process.env.CHUNK_OVERLAP || 70)
    );

    if (chunks.length === 0) {
      throw new Error("Document produced zero chunks.");
    }

    await updateDocumentStatus(documentId, DOCUMENT_STATUS.CHUNKING, 45, {
      totalPages: extracted.totalPages,
      totalChunks: chunks.length,
    });

    await updateDocumentStatus(documentId, DOCUMENT_STATUS.EMBEDDING, 50);

    const embeddings = await createEmbeddings(
      chunks.map((chunk) => chunk.text),
      Number(process.env.EMBEDDING_CONCURRENCY || 4)
    );

    await updateDocumentStatus(documentId, DOCUMENT_STATUS.STORING, 85);

    await insertChunks(documentId, chunks, embeddings);

    await updateDocumentStatus(documentId, DOCUMENT_STATUS.COMPLETED, 100, {
      totalPages: extracted.totalPages,
      totalChunks: chunks.length,
    });

    return {
      documentId,
      status: DOCUMENT_STATUS.COMPLETED,
      totalPages: extracted.totalPages,
      totalChunks: chunks.length,
      durationMs: Math.round(performance.now() - startedAt),
    };
  } catch (error) {
    await updateDocumentStatus(documentId, DOCUMENT_STATUS.FAILED, 100, {
      errorMessage: error.message,
    });

    throw error;
  }
}
