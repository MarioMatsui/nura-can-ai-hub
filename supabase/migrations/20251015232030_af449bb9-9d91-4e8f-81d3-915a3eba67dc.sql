-- Ajustar tabela webhook_events para compatibilidade total com CannaPag
ALTER TABLE public.webhook_events 
  ADD COLUMN IF NOT EXISTS charge_id TEXT,
  ADD COLUMN IF NOT EXISTS status TEXT,
  ADD COLUMN IF NOT EXISTS reference TEXT,
  ADD COLUMN IF NOT EXISTS external_reference TEXT,
  ADD COLUMN IF NOT EXISTS payer_email TEXT,
  ADD COLUMN IF NOT EXISTS valid_token BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS processed_at TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS request_id UUID DEFAULT gen_random_uuid();

-- Alterar event_id para nullable (pode não vir sempre)
ALTER TABLE public.webhook_events 
  ALTER COLUMN event_id DROP NOT NULL;

-- Criar índice único para idempotência usando COALESCE
CREATE UNIQUE INDEX IF NOT EXISTS idx_webhook_events_idempotency 
  ON public.webhook_events (COALESCE(event_id, charge_id));

-- Adicionar colunas faltantes em payments
ALTER TABLE public.payments
  ADD COLUMN IF NOT EXISTS charge_id TEXT,
  ADD COLUMN IF NOT EXISTS reference TEXT,
  ADD COLUMN IF NOT EXISTS request_id UUID;

-- Criar tabela processed_webhooks se não existir (para backward compatibility)
CREATE TABLE IF NOT EXISTS public.processed_webhooks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  webhook_id TEXT NOT NULL UNIQUE,
  event_type TEXT NOT NULL,
  processed_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Habilitar RLS
ALTER TABLE public.processed_webhooks ENABLE ROW LEVEL SECURITY;

-- Remover policy existente se houver e criar nova
DO $$ 
BEGIN
  DROP POLICY IF EXISTS "Service role can manage processed webhooks" ON public.processed_webhooks;
EXCEPTION
  WHEN undefined_object THEN NULL;
END $$;

-- Policy para service role gerenciar
CREATE POLICY "Service role can manage processed webhooks"
  ON public.processed_webhooks
  FOR ALL
  USING (true)
  WITH CHECK (true);