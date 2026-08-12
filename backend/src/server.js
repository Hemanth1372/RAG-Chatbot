import express from "express";
import cors from "cors";
import morgan from "morgan";
import dotenv from "dotenv";

import uploadRoutes from "./routes/upload.routes.js";
import askRoutes from "./routes/ask.routes.js";
import documentRoutes from "./routes/document.routes.js";
import chatRoutes from "./routes/chat.routes.js";
import historyRouter from "./routes/history.routes.js";

dotenv.config();

const port = Number(process.env.PORT) || 3000;

const app = express();

app.disable("x-powered-by");

app.use(
  cors({
    origin: process.env.FRONTEND_URL || "http://localhost:5173",
  })
);

app.use(morgan("tiny"));

app.use(
  express.json({
    limit: "1mb",
  })
);

app.use("/upload", uploadRoutes);

app.use("/ask", askRoutes);

app.use("/documents", documentRoutes);

app.use("/chat", chatRoutes);

app.use("/chat/history", historyRouter);

app.use("/documents", documentRoutes);

app.get("/health", (req, res) => {
  res.json({
    status: "ok",
    service: "rag-chatbot-api",
    timestamp: new Date().toISOString(),
  });
});

app.use((error, req, res, next) => {
  console.error("Unhandled API error:", error);

  if (error.name === "MulterError") {
    return res.status(400).json({
      status: "failed",
      message: error.message,
    });
  }

  return res.status(500).json({
    status: "failed",
    message: "Internal server error.",
  });
});

app.listen(port, () => {
  console.log(`Server listening on port ${port}`);
});
