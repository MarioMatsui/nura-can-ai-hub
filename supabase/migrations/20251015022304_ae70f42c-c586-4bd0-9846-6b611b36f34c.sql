-- Create cancellation_reason enum if it doesn't exist
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'cancellation_reason') THEN
    CREATE TYPE cancellation_reason AS ENUM (
      'solicitacao_usuario',
      'upgrade_para_especialista',
      'outros'
    );
  END IF;
END $$;

-- Add cancellation_reason column if it doesn't exist
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'cancellation_requests' 
    AND column_name = 'cancellation_reason'
  ) THEN
    ALTER TABLE public.cancellation_requests 
    ADD COLUMN cancellation_reason cancellation_reason DEFAULT 'solicitacao_usuario';
  END IF;
END $$;

-- Add notes column if it doesn't exist
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'cancellation_requests' 
    AND column_name = 'notes'
  ) THEN
    ALTER TABLE public.cancellation_requests 
    ADD COLUMN notes text;
  END IF;
END $$;

-- Add plan_type_requested column if it doesn't exist
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'cancellation_requests' 
    AND column_name = 'plan_type_requested'
  ) THEN
    ALTER TABLE public.cancellation_requests 
    ADD COLUMN plan_type_requested subscription_plan;
  END IF;
END $$;

-- Update subscriptions that have pending/processed cancellation requests to scheduled_cancellation status
UPDATE public.user_subscriptions us
SET status = 'scheduled_cancellation'
FROM public.cancellation_requests cr
WHERE us.id = cr.subscription_id
  AND cr.status IN ('pending', 'processed')
  AND us.status = 'active';