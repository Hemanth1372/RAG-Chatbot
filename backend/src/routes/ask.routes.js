import express from "express";

const router = express.Router();

router.post("/", (req, res) => {
  res.json({
    message: "Ask route is working",
    question: "What is RAG ?",
  });
});

export default router;
