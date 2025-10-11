-- Create storage bucket for knowledge documents
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'knowledge-documents',
  'knowledge-documents',
  false,
  52428800, -- 50MB limit
  ARRAY['application/pdf', 'text/plain']::text[]
);

-- RLS policies for knowledge-documents bucket
CREATE POLICY "Admins can upload documents"
ON storage.objects
FOR INSERT
WITH CHECK (
  bucket_id = 'knowledge-documents' AND
  EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid() AND role = 'admin'
  )
);

CREATE POLICY "Admins can view documents"
ON storage.objects
FOR SELECT
USING (
  bucket_id = 'knowledge-documents' AND
  EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid() AND role = 'admin'
  )
);

CREATE POLICY "Admins can delete documents"
ON storage.objects
FOR DELETE
USING (
  bucket_id = 'knowledge-documents' AND
  EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid() AND role = 'admin'
  )
);

-- Add file_path column to knowledge_documents
ALTER TABLE public.knowledge_documents
ADD COLUMN IF NOT EXISTS file_path TEXT;