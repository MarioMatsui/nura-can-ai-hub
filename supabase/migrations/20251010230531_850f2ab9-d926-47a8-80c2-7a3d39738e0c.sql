-- Enable pgvector extension for vector similarity search
CREATE EXTENSION IF NOT EXISTS vector;

-- Create enum for knowledge base types
CREATE TYPE knowledge_base_type AS ENUM ('medical', 'legal', 'veterinary');

-- Create table for storing documents
CREATE TABLE public.knowledge_documents (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  knowledge_type knowledge_base_type NOT NULL,
  title TEXT NOT NULL,
  file_name TEXT NOT NULL,
  content TEXT NOT NULL,
  metadata JSONB,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create table for storing document chunks and their embeddings
CREATE TABLE public.document_chunks (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  document_id UUID NOT NULL REFERENCES public.knowledge_documents(id) ON DELETE CASCADE,
  chunk_index INTEGER NOT NULL,
  content TEXT NOT NULL,
  embedding vector(1536), -- OpenAI embeddings are 1536 dimensions
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create index for vector similarity search
CREATE INDEX document_chunks_embedding_idx ON public.document_chunks 
USING ivfflat (embedding vector_cosine_ops)
WITH (lists = 100);

-- Create index for faster document lookups
CREATE INDEX document_chunks_document_id_idx ON public.document_chunks(document_id);
CREATE INDEX knowledge_documents_type_idx ON public.knowledge_documents(knowledge_type);

-- Enable Row Level Security
ALTER TABLE public.knowledge_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.document_chunks ENABLE ROW LEVEL SECURITY;

-- RLS Policies for knowledge_documents
-- Only authenticated users can view documents
CREATE POLICY "Users can view all documents"
  ON public.knowledge_documents
  FOR SELECT
  USING (auth.uid() IS NOT NULL);

-- Only admins can insert/update/delete documents (you'll need to manage admin status)
CREATE POLICY "Admins can manage documents"
  ON public.knowledge_documents
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
      AND profiles.crm_crv IS NOT NULL -- Using CRM/CRV as a simple admin check
    )
  );

-- RLS Policies for document_chunks
CREATE POLICY "Users can view all chunks"
  ON public.document_chunks
  FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Admins can manage chunks"
  ON public.document_chunks
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
      AND profiles.crm_crv IS NOT NULL
    )
  );

-- Function to search similar chunks
CREATE OR REPLACE FUNCTION public.search_similar_chunks(
  query_embedding vector(1536),
  knowledge_type_filter knowledge_base_type,
  match_count INTEGER DEFAULT 3
)
RETURNS TABLE (
  id UUID,
  document_id UUID,
  content TEXT,
  similarity FLOAT,
  document_title TEXT
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
    kd.title AS document_title
  FROM public.document_chunks dc
  JOIN public.knowledge_documents kd ON kd.id = dc.document_id
  WHERE kd.knowledge_type = knowledge_type_filter
  ORDER BY dc.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;

-- Trigger for updating updated_at
CREATE TRIGGER update_knowledge_documents_updated_at
  BEFORE UPDATE ON public.knowledge_documents
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();