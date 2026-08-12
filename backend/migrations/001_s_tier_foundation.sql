CREATE EXTENSION IF NOT EXISTS vector;

ALTER TABLE documents
ADD COLUMN IF NOT EXISTS total_pages INTEGER DEFAULT 0;

ALTER TABLE documents
ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ;

ALTER TABLE documents
ADD COLUMN IF NOT EXISTS error_message TEXT;

ALTER TABLE documents
ADD COLUMN IF NOT EXISTS content_hash TEXT;

ALTER TABLE chunks
ADD COLUMN IF NOT EXISTS page_start INTEGER;

ALTER TABLE chunks
ADD COLUMN IF NOT EXISTS page_end INTEGER;

ALTER TABLE chunks
ADD COLUMN IF NOT EXISTS word_count INTEGER;

ALTER TABLE chunks
ADD COLUMN IF NOT EXISTS content_hash TEXT;

CREATE INDEX IF NOT EXISTS idx_documents_content_hash
ON documents(content_hash);

CREATE INDEX IF NOT EXISTS idx_chunks_document_id
ON chunks(document_id);

CREATE INDEX IF NOT EXISTS idx_chunks_document_chunk_index
ON chunks(document_id, chunk_index);

CREATE UNIQUE INDEX IF NOT EXISTS idx_chunks_id_unique
ON chunks(id);