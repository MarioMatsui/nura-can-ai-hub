-- ============================================
-- TABLE: prescription_catalogs
-- ============================================
CREATE TABLE public.prescription_catalogs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  file_name TEXT NOT NULL,
  file_type TEXT NOT NULL,
  file_path TEXT NOT NULL,
  file_size BIGINT,
  extracted_content TEXT,
  extracted_metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.prescription_catalogs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own catalogs"
  ON public.prescription_catalogs FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Admins can view all catalogs"
  ON public.prescription_catalogs FOR SELECT
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Users can insert own catalogs"
  ON public.prescription_catalogs FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own catalogs"
  ON public.prescription_catalogs FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own catalogs"
  ON public.prescription_catalogs FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

CREATE INDEX idx_prescription_catalogs_user ON public.prescription_catalogs(user_id, created_at DESC);

-- ============================================
-- TABLE: prescription_records (prontuários)
-- ============================================
CREATE TABLE public.prescription_records (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  file_name TEXT NOT NULL,
  file_type TEXT NOT NULL,
  file_path TEXT NOT NULL,
  file_size BIGINT,
  patient_name TEXT,
  main_complaint TEXT,
  extracted_content TEXT,
  extracted_metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.prescription_records ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own records"
  ON public.prescription_records FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Admins can view all records"
  ON public.prescription_records FOR SELECT
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Users can insert own records"
  ON public.prescription_records FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own records"
  ON public.prescription_records FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own records"
  ON public.prescription_records FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

CREATE INDEX idx_prescription_records_user ON public.prescription_records(user_id, created_at DESC);

-- ============================================
-- TABLE: prescription_results
-- ============================================
CREATE TABLE public.prescription_results (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  catalog_id UUID REFERENCES public.prescription_catalogs(id) ON DELETE SET NULL,
  record_id UUID REFERENCES public.prescription_records(id) ON DELETE SET NULL,
  user_observations TEXT,
  ai_response TEXT NOT NULL,
  suggested_products JSONB DEFAULT '[]'::jsonb,
  patient_name TEXT,
  main_complaint TEXT,
  model_used TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.prescription_results ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own results"
  ON public.prescription_results FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Admins can view all results"
  ON public.prescription_results FOR SELECT
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Users can insert own results"
  ON public.prescription_results FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own results"
  ON public.prescription_results FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

CREATE INDEX idx_prescription_results_user ON public.prescription_results(user_id, created_at DESC);

-- ============================================
-- STORAGE: prescription-files (private bucket)
-- ============================================
INSERT INTO storage.buckets (id, name, public)
VALUES ('prescription-files', 'prescription-files', false)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Users can read own prescription files"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'prescription-files'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "Admins can read all prescription files"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'prescription-files'
    AND has_role(auth.uid(), 'admin'::app_role)
  );

CREATE POLICY "Users can upload own prescription files"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'prescription-files'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "Users can update own prescription files"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'prescription-files'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "Users can delete own prescription files"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'prescription-files'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );