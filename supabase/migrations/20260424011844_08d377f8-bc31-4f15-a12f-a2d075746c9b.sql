-- Create prescription_jobs table for background processing of prescription generation
CREATE TABLE public.prescription_jobs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  status TEXT NOT NULL DEFAULT 'processing',
  catalog_id UUID NOT NULL,
  record_id UUID NOT NULL,
  observations TEXT,
  progress TEXT,
  ai_response TEXT,
  result_id UUID,
  error_message TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.prescription_jobs ENABLE ROW LEVEL SECURITY;

-- Users can view their own jobs (for polling)
CREATE POLICY "Users can view their own prescription jobs"
ON public.prescription_jobs
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

-- Admins can view all jobs
CREATE POLICY "Admins can view all prescription jobs"
ON public.prescription_jobs
FOR SELECT
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));

-- INSERT/UPDATE handled by edge function with service role (bypasses RLS)

-- Trigger for automatic updated_at
CREATE TRIGGER update_prescription_jobs_updated_at
BEFORE UPDATE ON public.prescription_jobs
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Index for efficient polling
CREATE INDEX idx_prescription_jobs_user_status ON public.prescription_jobs(user_id, status);
CREATE INDEX idx_prescription_jobs_created_at ON public.prescription_jobs(created_at DESC);