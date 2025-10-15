-- Fix processing_jobs RLS policies to restrict access properly

-- Drop the overly permissive policy
DROP POLICY IF EXISTS "System can manage all jobs" ON public.processing_jobs;

-- Drop existing view policy if it exists (we'll recreate a better one)
DROP POLICY IF EXISTS "Users can view their own document jobs" ON public.processing_jobs;

-- Only admins can view processing jobs
CREATE POLICY "Admins can view all jobs"
ON public.processing_jobs
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

-- Only service role can insert jobs (for system/edge functions)
CREATE POLICY "Service role can insert jobs"
ON public.processing_jobs
FOR INSERT
TO service_role
WITH CHECK (true);

-- Only service role can update jobs (for processing workers)
CREATE POLICY "Service role can update jobs"
ON public.processing_jobs
FOR UPDATE
TO service_role
USING (true);

-- Only admins can delete jobs
CREATE POLICY "Admins can delete jobs"
ON public.processing_jobs
FOR DELETE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

-- Create a table to track processed webhook IDs for idempotency
CREATE TABLE IF NOT EXISTS public.processed_webhooks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  webhook_id text UNIQUE NOT NULL,
  event_type text NOT NULL,
  processed_at timestamp with time zone NOT NULL DEFAULT now(),
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS on processed_webhooks
ALTER TABLE public.processed_webhooks ENABLE ROW LEVEL SECURITY;

-- Only service role can manage webhook tracking
CREATE POLICY "Service role can manage processed webhooks"
ON public.processed_webhooks
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_processed_webhooks_webhook_id ON public.processed_webhooks(webhook_id);
CREATE INDEX IF NOT EXISTS idx_processed_webhooks_processed_at ON public.processed_webhooks(processed_at);

-- Add cleanup function to remove old webhook records (older than 30 days)
CREATE OR REPLACE FUNCTION public.cleanup_old_webhooks()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM public.processed_webhooks
  WHERE processed_at < now() - interval '30 days';
END;
$$;