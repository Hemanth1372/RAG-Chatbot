# RAG Chatbot

A production-oriented **Retrieval-Augmented Generation (RAG) chatbot** built with React, Node.js, PostgreSQL + pgvector, Redis, BullMQ, and Gemini.

## Tech Stack

- **Frontend:** React + Vite
- **Backend:** Node.js + Express
- **Database:** PostgreSQL + pgvector
- **Queue:** Redis + BullMQ
- **Embeddings:** Gemini Embedding API
- **LLM:** Gemini
- **Document formats:** PDF, TXT

## Architecture

```text
User
 │
 ▼
React Frontend
 │
 ├── Upload Document ──────► Express API
 │                              │
 │                              ▼
 │                         PostgreSQL
 │                              │
 │                              ▼
 │                           BullMQ
 │                              │
 │                              ▼
 │                       Document Worker
 │                              │
 │                ┌─────────────┴─────────────┐
 │                ▼                           ▼
 │          Extract + Chunk              Gemini Embedding
 │                                              │
 │                                              ▼
 │                                      pgvector Storage
 │
 └── Ask Question ─────────► Express API
                                │
                                ▼
                         Query Embedding
                                │
                    ┌───────────┴───────────┐
                    ▼                       ▼
              Vector Search           Keyword Search
                    │                       │
                    └───────────┬───────────┘
                                ▼
                         Hybrid Retrieval
                                │
                                ▼
                         Gemini Generation
                                │
                                ▼
                       Answer + Citations
```

## Features

- PDF/TXT document upload
- SHA-256 content hashing for duplicate detection
- Asynchronous document processing with BullMQ
- Redis-backed job queue
- PDF text extraction with page information
- Configurable chunk size and overlap
- Gemini embeddings
- PostgreSQL + pgvector similarity search
- Keyword retrieval
- Hybrid vector + keyword retrieval
- Retrieval confidence evaluation
- Gemini-based answer generation
- Source citations with page information
- Chat response caching
- Document processing status tracking
- Retry and exponential backoff for failed jobs
- Retrieval benchmarking

---

# Setup

## 1. Clone Repository

```bash
git clone <your-repository-url>
cd RAG-Chatbot-main
```

## 2. Backend Setup

```bash
cd backend
npm install
```

Create `.env`:

```env
PORT=3000

DATABASE_URL=postgresql://hemanth@localhost:5432/rag_chatbot

REDIS_HOST=localhost
REDIS_PORT=6379

GEMINI_API_KEY=your_gemini_api_key
GEMINI_GENERATION_MODEL=gemini-3.5-flash
GEMINI_EMBEDDING_MODEL=gemini-embedding-001
EMBEDDING_DIMENSIONS=3072

RETRIEVAL_TOP_K=5
```

## 3. PostgreSQL

Create the database:

```bash
createdb rag_chatbot
```

Enable pgvector:

```sql
CREATE EXTENSION IF NOT EXISTS vector;
```

Run the project's migrations:

```bash
psql -U hemanth -d rag_chatbot -f migrations/001_s_tier_foundation.sql
```

## 4. Redis

Start Redis:

```bash
redis-server
```

Check:

```bash
redis-cli ping
```

Expected:

```text
PONG
```

---

# Running the Backend

Start the API:

```bash
cd backend
npm run dev
```

Start the document worker separately:

```bash
npm run worker
```

The worker consumes document-processing jobs from **BullMQ/Redis**.

---

# Running the Frontend

```bash
cd frontend
npm install
npm run dev
```

The frontend communicates with:

```text
http://localhost:3000
```

You can configure the backend URL through:

```env
VITE_API_URL=http://localhost:3000
```

---

# Document Processing Workflow

When a document is uploaded:

```text
Upload
  ↓
Generate SHA-256 hash
  ↓
Check duplicate
  ↓
Store document metadata
  ↓
Create BullMQ job
  ↓
Worker picks job
  ↓
Extract text
  ↓
Split into chunks
  ↓
Generate embeddings
  ↓
Store chunks + vectors
  ↓
Mark document Completed
```

Document status is tracked through stages such as:

```text
uploaded
Extracting
Chunking
Embedding
Saving
Completed
Failed
```

---

# Query Workflow

When the user asks a question:

```text
Question
   ↓
Generate query embedding
   ↓
Vector retrieval
   +
Keyword retrieval
   ↓
Hybrid ranking
   ↓
Confidence evaluation
   ↓
Relevant chunks
   ↓
Gemini
   ↓
Answer + citations
```

The response includes:

- Generated answer
- Citation numbers
- Source document
- Page number
- Retrieved chunk
- Similarity scores
- Retrieval/generation latency

---

# Benchmark

Run the retrieval benchmark:

```bash
node src/scripts/benchmark-retrieval.js
```

The benchmark evaluates:

- Top-1 Accuracy
- Recall@5
- Confidence Accuracy
- Unrelated-question rejection
- Average retrieval latency
- P95 retrieval latency
- Vector similarity score
- Keyword score
- Direct questions
- Paraphrased questions
- Unrelated questions

Example result:

```text
Top-1 Accuracy:      100.00%
Recall@5:            100.00%
Confidence Accuracy: 86.67%
Avg Retrieval:       1243.89 ms
P95 Retrieval:       5348.46 ms
```

---

# Useful Commands

### Start Redis

```bash
redis-server
```

### Check Redis

```bash
redis-cli ping
```

### Start API

```bash
npm run dev
```

### Start Worker

```bash
npm run worker
```

### Run Retrieval Benchmark

```bash
node src/scripts/benchmark-retrieval.js
```

### Check Documents

```bash
psql -U hemanth -d rag_chatbot \
-c "SELECT id, source_name, status, total_chunks FROM documents;"
```

### Check Redis

```bash
redis-cli
```

### Check Backend API

```bash
curl http://localhost:3000/documents
```

---

# Project Structure

```text
RAG-Chatbot-main/
│
├── backend/
│   ├── migrations/
│   ├── src/
│   │   ├── config/
│   │   ├── routes/
│   │   ├── services/
│   │   ├── queues/
│   │   └── scripts/
│   │
│   ├── uploads/
│   ├── .env
│   └── package.json
│
└── frontend/
    ├── src/
    │   ├── components/
    │   └── App.jsx
    └── package.json
```

## Main Backend Components

```text
document.service.js
    → Document metadata/status management

extraction.service.js
    → PDF/TXT text extraction

chunking.service.js
    → Text chunking

embeddings.service.js
    → Gemini embeddings

chunkStorage.service.js
    → Store chunks and vectors

retrieval.service.js
    → Vector + keyword + hybrid retrieval

generation.service.js
    → RAG prompt construction

llm.service.js
    → Gemini generation

chatCache.service.js
    → Cache repeated questions

document.queue.js
    → BullMQ queue

document.worker.js
    → Asynchronous document processing
```

**In short:** the project implements the complete pipeline from **document upload → asynchronous processing → vector storage → hybrid retrieval → LLM generation → cited answer**, with Redis/BullMQ reliability, PostgreSQL/pgvector retrieval, caching, status tracking, and benchmark evaluation.
