-- Add status and processing fields to knowledge_documents
ALTER TABLE public.knowledge_documents 
ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'queued' NOT NULL,
ADD COLUMN IF NOT EXISTS progress INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS error_message TEXT;

-- Create jobs table for async processing
CREATE TABLE IF NOT EXISTS public.processing_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID NOT NULL REFERENCES public.knowledge_documents(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'queued', -- queued, processing, completed, failed
  job_type TEXT NOT NULL, -- extraction, chunking, embedding, indexing
  progress INTEGER DEFAULT 0,
  error_message TEXT,
  started_at TIMESTAMP WITH TIME ZONE,
  completed_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL
);

-- Create index for faster job queries
CREATE INDEX IF NOT EXISTS idx_processing_jobs_document_id ON public.processing_jobs(document_id);
CREATE INDEX IF NOT EXISTS idx_processing_jobs_status ON public.processing_jobs(status);

-- Add hash field to document_chunks if not exists
ALTER TABLE public.document_chunks 
ADD COLUMN IF NOT EXISTS hash TEXT UNIQUE;

-- Add order field to document_chunks if chunk_index doesn't exist
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name='document_chunks' AND column_name='chunk_order') THEN
    ALTER TABLE public.document_chunks RENAME COLUMN chunk_index TO chunk_order;
  END IF;
END $$;

-- Ensure vector index exists for fast similarity search
CREATE INDEX IF NOT EXISTS idx_document_chunks_embedding ON public.document_chunks 
USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

-- RLS policies for jobs table
ALTER TABLE public.processing_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own document jobs"
ON public.processing_jobs FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.knowledge_documents kd
    WHERE kd.id = processing_jobs.document_id
  )
);

CREATE POLICY "System can manage all jobs"
ON public.processing_jobs FOR ALL
USING (true)
WITH CHECK (true);