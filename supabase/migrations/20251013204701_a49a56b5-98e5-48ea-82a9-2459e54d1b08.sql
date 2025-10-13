-- Fase 1: Tabelas para armazenamento estruturado de documentos

-- Estender knowledge_documents com metadados estruturados
ALTER TABLE public.knowledge_documents
ADD COLUMN IF NOT EXISTS total_pages INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS file_hash TEXT,
ADD COLUMN IF NOT EXISTS file_size_bytes BIGINT,
ADD COLUMN IF NOT EXISTS doc_type TEXT, -- COA, contrato, laudo, manual, etc
ADD COLUMN IF NOT EXISTS language TEXT DEFAULT 'pt',
ADD COLUMN IF NOT EXISTS author TEXT,
ADD COLUMN IF NOT EXISTS created_date DATE,
ADD COLUMN IF NOT EXISTS extracted_metadata JSONB DEFAULT '{}'::jsonb;

-- Criar índice para hash (deduplicação)
CREATE INDEX IF NOT EXISTS idx_knowledge_documents_hash ON public.knowledge_documents(file_hash);

-- Tabela para blocos estruturados de documentos (parágrafos, headings, listas, etc)
CREATE TABLE IF NOT EXISTS public.document_blocks (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  document_id UUID NOT NULL REFERENCES public.knowledge_documents(id) ON DELETE CASCADE,
  page_number INTEGER NOT NULL,
  block_id TEXT NOT NULL, -- identificador único do bloco dentro do documento
  block_type TEXT NOT NULL, -- heading, paragraph, list, table_ref, figure_ref, note
  content TEXT NOT NULL,
  markdown TEXT, -- versão markdown do conteúdo
  bbox JSONB, -- bounding box: {x, y, width, height}
  token_count INTEGER,
  section_title TEXT, -- título da seção a que pertence
  embedding vector(1536), -- embedding para RAG
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(document_id, block_id)
);

-- Índices para busca eficiente
CREATE INDEX IF NOT EXISTS idx_document_blocks_document ON public.document_blocks(document_id);
CREATE INDEX IF NOT EXISTS idx_document_blocks_page ON public.document_blocks(page_number);
CREATE INDEX IF NOT EXISTS idx_document_blocks_type ON public.document_blocks(block_type);
CREATE INDEX IF NOT EXISTS idx_document_blocks_embedding ON public.document_blocks 
  USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

-- Tabela para tabelas estruturadas
CREATE TABLE IF NOT EXISTS public.document_tables (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  document_id UUID NOT NULL REFERENCES public.knowledge_documents(id) ON DELETE CASCADE,
  page_number INTEGER NOT NULL,
  table_id TEXT NOT NULL, -- identificador único da tabela
  markdown TEXT NOT NULL, -- representação markdown
  structured_data JSONB NOT NULL, -- matriz estruturada {headers: [], rows: [[]]}
  bbox JSONB, -- posição na página
  caption TEXT,
  embedding vector(1536), -- embedding da tabela completa para RAG
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(document_id, table_id)
);

CREATE INDEX IF NOT EXISTS idx_document_tables_document ON public.document_tables(document_id);
CREATE INDEX IF NOT EXISTS idx_document_tables_page ON public.document_tables(page_number);
CREATE INDEX IF NOT EXISTS idx_document_tables_embedding ON public.document_tables 
  USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

-- Tabela para imagens e figuras extraídas
CREATE TABLE IF NOT EXISTS public.document_images (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  document_id UUID NOT NULL REFERENCES public.knowledge_documents(id) ON DELETE CASCADE,
  page_number INTEGER NOT NULL,
  image_id TEXT NOT NULL, -- identificador único da imagem
  image_type TEXT, -- chart, signature, qr_code, logo, photo, diagram
  storage_path TEXT NOT NULL, -- caminho no storage bucket
  thumbnail_path TEXT, -- caminho do thumbnail
  bbox JSONB, -- posição na página
  caption TEXT,
  description TEXT, -- descrição gerada por IA (quando aplicável)
  ocr_text TEXT, -- texto extraído da imagem via OCR
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(document_id, image_id)
);

CREATE INDEX IF NOT EXISTS idx_document_images_document ON public.document_images(document_id);
CREATE INDEX IF NOT EXISTS idx_document_images_page ON public.document_images(page_number);
CREATE INDEX IF NOT EXISTS idx_document_images_type ON public.document_images(image_type);

-- Habilitar RLS
ALTER TABLE public.document_blocks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.document_tables ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.document_images ENABLE ROW LEVEL SECURITY;

-- Policies para document_blocks
CREATE POLICY "Admins can manage blocks" ON public.document_blocks
  FOR ALL USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Users can view all blocks" ON public.document_blocks
  FOR SELECT USING (auth.uid() IS NOT NULL);

-- Policies para document_tables
CREATE POLICY "Admins can manage tables" ON public.document_tables
  FOR ALL USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Users can view all tables" ON public.document_tables
  FOR SELECT USING (auth.uid() IS NOT NULL);

-- Policies para document_images
CREATE POLICY "Admins can manage images" ON public.document_images
  FOR ALL USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Users can view all images" ON public.document_images
  FOR SELECT USING (auth.uid() IS NOT NULL);

-- Bucket para imagens extraídas de documentos
INSERT INTO storage.buckets (id, name, public) 
VALUES ('document-images', 'document-images', false)
ON CONFLICT (id) DO NOTHING;

-- Policies para o bucket de imagens
CREATE POLICY "Admins can upload document images" 
ON storage.objects FOR INSERT 
WITH CHECK (bucket_id = 'document-images' AND has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can update document images" 
ON storage.objects FOR UPDATE 
USING (bucket_id = 'document-images' AND has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Users can view document images" 
ON storage.objects FOR SELECT 
USING (bucket_id = 'document-images' AND auth.uid() IS NOT NULL);

CREATE POLICY "Admins can delete document images" 
ON storage.objects FOR DELETE 
USING (bucket_id = 'document-images' AND has_role(auth.uid(), 'admin'::app_role));