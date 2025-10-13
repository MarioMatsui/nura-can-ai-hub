-- Fase 2: Melhorias para Chunking Semântico

-- Adicionar campos semânticos à tabela document_chunks
ALTER TABLE public.document_chunks
ADD COLUMN IF NOT EXISTS page_range TEXT, -- ex: "2-3" para chunks multi-página
ADD COLUMN IF NOT EXISTS block_ids TEXT[], -- IDs dos blocos incluídos neste chunk
ADD COLUMN IF NOT EXISTS is_atomic BOOLEAN DEFAULT false, -- true para tabelas completas
ADD COLUMN IF NOT EXISTS chunk_type TEXT DEFAULT 'mixed'; -- heading, paragraph, table, mixed

-- Criar índice para busca por tipo de chunk
CREATE INDEX IF NOT EXISTS idx_document_chunks_type ON public.document_chunks(chunk_type);
CREATE INDEX IF NOT EXISTS idx_document_chunks_atomic ON public.document_chunks(is_atomic);

-- Função para busca semântica avançada
CREATE OR REPLACE FUNCTION public.search_semantic_chunks(
  query_embedding vector,
  knowledge_type_filter knowledge_base_type,
  match_count integer DEFAULT 5,
  chunk_type_filter TEXT DEFAULT NULL
)
RETURNS TABLE(
  id uuid,
  document_id uuid,
  content text,
  similarity double precision,
  document_title text,
  page_range text,
  section_title text,
  chunk_type text,
  is_atomic boolean
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    dc.id,
    dc.document_id,
    dc.content,
    1 - (dc.embedding <=> query_embedding) AS similarity,
    kd.title AS document_title,
    dc.page_range,
    dc.section_title,
    dc.chunk_type,
    dc.is_atomic
  FROM public.document_chunks dc
  JOIN public.knowledge_documents kd ON kd.id = dc.document_id
  WHERE kd.knowledge_type = knowledge_type_filter
    AND (chunk_type_filter IS NULL OR dc.chunk_type = chunk_type_filter)
  ORDER BY dc.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;

-- Função para busca híbrida em blocos estruturados
CREATE OR REPLACE FUNCTION public.search_structured_blocks(
  query_embedding vector,
  document_id_filter uuid,
  match_count integer DEFAULT 10,
  block_type_filter TEXT DEFAULT NULL
)
RETURNS TABLE(
  id uuid,
  document_id uuid,
  page_number integer,
  block_id text,
  block_type text,
  content text,
  section_title text,
  similarity double precision
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    db.id,
    db.document_id,
    db.page_number,
    db.block_id,
    db.block_type,
    db.content,
    db.section_title,
    1 - (db.embedding <=> query_embedding) AS similarity
  FROM public.document_blocks db
  WHERE (document_id_filter IS NULL OR db.document_id = document_id_filter)
    AND (block_type_filter IS NULL OR db.block_type = block_type_filter)
  ORDER BY db.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;

-- Função para buscar tabelas relevantes
CREATE OR REPLACE FUNCTION public.search_tables(
  query_embedding vector,
  document_id_filter uuid DEFAULT NULL,
  match_count integer DEFAULT 3
)
RETURNS TABLE(
  id uuid,
  document_id uuid,
  page_number integer,
  table_id text,
  markdown text,
  structured_data jsonb,
  caption text,
  similarity double precision
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    dt.id,
    dt.document_id,
    dt.page_number,
    dt.table_id,
    dt.markdown,
    dt.structured_data,
    dt.caption,
    1 - (dt.embedding <=> query_embedding) AS similarity
  FROM public.document_tables dt
  WHERE (document_id_filter IS NULL OR dt.document_id = document_id_filter)
  ORDER BY dt.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;