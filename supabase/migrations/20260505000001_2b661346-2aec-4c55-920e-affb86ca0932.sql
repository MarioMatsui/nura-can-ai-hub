-- Performance metrics table for chat-ai edge function
-- Used during Phase 0 (baseline) and beyond to track latency per request

CREATE TABLE IF NOT EXISTS public.chat_perf_metrics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid REFERENCES public.conversations(id) ON DELETE SET NULL,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  model text,
  model_type text,
  knowledge_type text,

  -- Absolute start
  t_request_start timestamptz NOT NULL,

  -- Phase durations in milliseconds
  duration_total_ms integer,
  duration_auth_ms integer,
  duration_rag_ms integer,
  duration_llm_ms integer,
  duration_response_ms integer,
  duration_ttft_ms integer, -- time-to-first-token (populated once streaming lands in Phase 1)

  -- Request shape
  rag_chunk_count integer DEFAULT 0,
  attachment_count integer DEFAULT 0,
  tokens_input integer DEFAULT 0,
  tokens_output integer DEFAULT 0,

  -- Outcome
  status_code integer,
  error text,

  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_chat_perf_created_at ON public.chat_perf_metrics(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_chat_perf_user ON public.chat_perf_metrics(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_chat_perf_model ON public.chat_perf_metrics(model_type, created_at DESC);

ALTER TABLE public.chat_perf_metrics ENABLE ROW LEVEL SECURITY;

-- Only service role writes; admins read via existing admin role check
CREATE POLICY "service_role_writes_perf_metrics"
  ON public.chat_perf_metrics
  FOR INSERT
  TO service_role
  WITH CHECK (true);

CREATE POLICY "admins_read_perf_metrics"
  ON public.chat_perf_metrics
  FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));
