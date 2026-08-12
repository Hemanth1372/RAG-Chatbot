import React, { useEffect, useState } from "react";

import Options from "./Options.jsx";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3000";

function Chat() {
  const [allDocuments, setAllDocuments] = useState([]);

  const [documentList, setDocumentList] = useState([]);

  const [selectDocument, setSelectDocument] = useState("");

  const [selectedFile, setSelectedFile] = useState(null);

  const [question, setQuestion] = useState("");

  const [answer, setAnswer] = useState("");

  const [sources, setSources] = useState([]);

  const [metrics, setMetrics] = useState(null);

  const [error, setError] = useState("");

  const [uploadMessage, setUploadMessage] = useState("");

  const [uploadInputKey, setUploadInputKey] = useState(0);

  const [loading, setLoading] = useState(false);

  const [uploading, setUploading] = useState(false);

  async function fetchDocuments() {
    const response = await fetch(`${API_URL}/documents`);

    const parsedResponse = await response.json();

    if (!response.ok) {
      throw new Error(parsedResponse.message || "Failed to load documents.");
    }

    const documentsArray = parsedResponse.documents || [];

    setAllDocuments(documentsArray);

    setDocumentList(
      documentsArray
        .filter((document) => document.status === "completed")
        .map((document) => ({
          id: document.documentId,
          filename: document.sourceName,
        })),
    );
  }

  useEffect(() => {
    let interval;

    async function initialize() {
      try {
        await fetchDocuments();

        interval = setInterval(fetchDocuments, 3000);
      } catch (err) {
        console.error(err);

        setError("Failed to load documents. Please check the backend.");
      }
    }

    initialize();

    return () => {
      if (interval) {
        clearInterval(interval);
      }
    };
  }, []);

  function handleFileChange(event) {
    setSelectedFile(event.target.files[0] || null);

    setError("");
    setUploadMessage("");
  }

  async function handleUpload() {
    if (!selectedFile) {
      setError("Please choose a PDF or TXT file first.");
      return;
    }

    const allowedTypes = ["application/pdf", "text/plain"];

    if (!allowedTypes.includes(selectedFile.type)) {
      setError("Only PDF and TXT files are allowed.");
      return;
    }

    const formData = new FormData();

    formData.append("file", selectedFile);

    setError("");
    setUploadMessage("");
    setUploading(true);

    try {
      const response = await fetch(`${API_URL}/upload`, {
        method: "POST",
        body: formData,
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        setError(data.message || "File upload failed.");
        return;
      }

      setSelectedFile(null);

      setUploadInputKey((key) => key + 1);

      setUploadMessage(
        "Document uploaded successfully. Background processing has started.",
      );

      await fetchDocuments();
    } catch (err) {
      console.error(err);

      setError("Failed to upload file. Please check the backend.");
    } finally {
      setUploading(false);
    }
  }

  function handleChange(event) {
    setSelectDocument(event.target.value);

    setError("");
    setAnswer("");
    setSources([]);
    setMetrics(null);
  }

  function handleQuestion(event) {
    setQuestion(event.target.value);
  }

  async function handleAsk() {
    if (!selectDocument) {
      setError("Please select a completed document first.");
      return;
    }

    const trimmedQuestion = question.trim();

    if (!trimmedQuestion) {
      setError("Please enter a question.");
      return;
    }

    setError("");
    setLoading(true);
    setSources([]);
    setAnswer("");
    setMetrics(null);

    try {
      const response = await fetch(`${API_URL}/chat`, {
        method: "POST",

        headers: {
          "Content-Type": "application/json",
        },

        body: JSON.stringify({
          documentId: selectDocument,
          question: trimmedQuestion,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.message || "Something went wrong.");

        setSources(data.sources || []);

        return;
      }

      setAnswer(data.answer || "");

      setSources(data.sources || []);

      setMetrics(data.metrics || null);
    } catch (err) {
      console.error(err);

      setError("Failed to connect to server.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="chat-card">
      <div className="chat-header">
        <h2>Chat with your document</h2>

        <p>
          Upload a document, wait for background processing, then ask grounded
          questions.
        </p>
      </div>

      <div className="upload-panel">
        <div className="form-group">
          <label>Upload Document</label>

          <input
            key={uploadInputKey}
            type="file"
            accept=".pdf,.txt,application/pdf,text/plain"
            onChange={handleFileChange}
          />
        </div>

        <button
          className="upload-button"
          onClick={handleUpload}
          disabled={uploading}
        >
          {uploading ? "Uploading..." : "Upload File"}
        </button>

        {uploadMessage && <div className="success-box">{uploadMessage}</div>}
      </div>

      {allDocuments.length > 0 && (
        <div className="documents-status">
          <h3>Documents</h3>

          {allDocuments.map((document) => (
            <div className="document-row" key={document.documentId}>
              <div>
                <strong>{document.sourceName}</strong>

                <div className="document-progress">
                  {document.progress ?? 0}% · {document.totalPages ?? 0} pages ·{" "}
                  {document.totalChunks ?? 0} chunks
                </div>

                {document.error_message && (
                  <div className="document-error">{document.error_message}</div>
                )}
              </div>

              <span className={`status-pill status-${document.status}`}>
                {document.status}
              </span>
            </div>
          ))}
        </div>
      )}

      <div className="form-group">
        <label>Select Document</label>

        <select value={selectDocument} onChange={handleChange}>
          <option value="">Choose a completed document</option>

          {documentList.map((document) => (
            <Options
              key={document.documentId}
              value={document.documentId}
              name={document.filename}
            />
          ))}
        </select>
      </div>

      <div className="form-group">
        <label>Your Question</label>

        <textarea
          value={question}
          onChange={handleQuestion}
          placeholder="Ask something about the selected document..."
          rows="5"
        />
      </div>

      <button className="ask-button" onClick={handleAsk} disabled={loading}>
        {loading ? "Thinking..." : "Ask Question"}
      </button>

      {error && <div className="error-box">{error}</div>}

      {answer && (
        <div className="answer-box">
          <h3>Answer</h3>

          <p>{answer}</p>
        </div>
      )}

      {metrics && (
        <div className="metrics-box">
          <h3>Retrieval Metrics</h3>

          <div className="metrics-grid">
            <span>Retrieved: {metrics.retrievedChunks}</span>

            <span>Cited: {metrics.citedSources}</span>

            <span>
              Embedding: {metrics.embeddingLatencyMs}
              ms
            </span>

            <span>
              Retrieval: {metrics.retrievalLatencyMs}
              ms
            </span>

            <span>
              Generation: {metrics.generationLatencyMs}
              ms
            </span>

            <span>
              Total: {metrics.totalLatencyMs}
              ms
            </span>
          </div>
        </div>
      )}

      {sources.length > 0 && (
        <div className="sources-box">
          <h3>Sources</h3>

          {sources.map((source, index) => (
            <div
              className={`source-card ${source.cited ? "source-cited" : ""}`}
              key={source.chunkId || index}
            >
              <h4>
                Source {source.sourceNumber}
                {source.cited && " ✓"}
              </h4>

              <p>{source.preview}</p>

              <div className="source-meta">
                <span>Similarity: {Number(source.similarity).toFixed(3)}</span>

                <span>Page: {source.page ?? "N/A"}</span>

                <span>Section: {source.section ?? "N/A"}</span>

                <span>Chunk: {source.chunkIndex}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default Chat;
