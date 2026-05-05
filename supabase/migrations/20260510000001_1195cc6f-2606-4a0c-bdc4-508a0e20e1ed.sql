-- Phase 3: pg_trgm GIN index on document_chunks.content
-- Speeds up the ILIKE %term% queries used by RAG search in chat-ai.
-- Without this index, each ILIKE forces a full table scan.

CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS idx_chunks_content_trgm
  ON public.document_chunks
  USING gin (content gin_trgm_ops);

-- Note: document_chunks_document_id_idx already exists from migration
-- 20251010230531; not recreating here. pgvector + ivfflat are also already
-- installed on the embedding column (vector(1536)). The current chat-ai
-- searchKnowledgeBase function does not use them — ILIKE-based search remains
-- in place for Option 1. Migrating searchKnowledgeBase to pgvector is the
-- single biggest remaining performance win and is recommended for Option 2.
