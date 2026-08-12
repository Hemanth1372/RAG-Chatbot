import express from "express";

import { getChatHistory, deleteChatHistory } from "../services/chatHistory.service.js";

const router = express.Router();

router.get("/:documentId", async (req, res) => {
  try {
    const { documentId } = req.params;

    const history = await getChatHistory(documentId);

    return res.status(200).json({
      status: "success",
      documentId,
      count: history.length,
      history: history.map((item) => ({
        id: item.id,
        question: item.question,
        answer: item.answer,
        citations: item.citations,
        retrievalConfidence: item.retrieval_confidence,
        createdAt: item.created_at,
      })),
    });
  } catch (error) {
    console.error("GET CHAT HISTORY ERROR:", error);

    return res.status(500).json({
      status: "failed",
      message: "Failed to retrieve chat history.",
    });
  }
});

router.delete("/:documentId", async (req, res) => {
  try {
    const { documentId } = req.params;

    const deletedCount = await deleteChatHistory(documentId);

    return res.status(200).json({
      status: "success",
      message: "Chat history deleted successfully.",
      deletedCount,
    });
  } catch (error) {
    console.error("DELETE CHAT HISTORY ERROR:", error);

    return res.status(500).json({
      status: "failed",
      message: "Failed to delete chat history.",
    });
  }
});

export default router;
