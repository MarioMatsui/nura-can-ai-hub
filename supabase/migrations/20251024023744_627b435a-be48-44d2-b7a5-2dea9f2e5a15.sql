-- Create enums for user_plans table
CREATE TYPE plan_type_enum AS ENUM ('free', 'medico', 'juridico', 'veterinario', 'especialista');
CREATE TYPE billing_cycle_enum AS ENUM ('mensal', 'anual');
CREATE TYPE plan_status_enum AS ENUM ('active', 'trialing', 'past_due', 'canceled', 'incomplete', 'inactive');

-- Create user_plans table
CREATE TABLE public.user_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  stripe_customer_id TEXT,
  subscription_id TEXT,
  plan_type plan_type_enum NOT NULL DEFAULT 'free',
  billing_cycle billing_cycle_enum,
  status plan_status_enum NOT NULL DEFAULT 'inactive',
  current_period_end TIMESTAMP WITH TIME ZONE,
  cancel_at_period_end BOOLEAN NOT NULL DEFAULT false,
  raw JSONB,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create indexes for better query performance
CREATE UNIQUE INDEX idx_user_plans_user_id ON public.user_plans(user_id);
CREATE INDEX idx_user_plans_stripe_customer ON public.user_plans(stripe_customer_id);
CREATE INDEX idx_user_plans_subscription ON public.user_plans(subscription_id);
CREATE INDEX idx_user_plans_status ON public.user_plans(status);

-- Enable Row Level Security
ALTER TABLE public.user_plans ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Users can only read their own plan
CREATE POLICY "Users can view their own plan"
ON public.user_plans
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

-- RLS Policy: Service role can manage all plans (for backend operations)
CREATE POLICY "Service role can manage all plans"
ON public.user_plans
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- Trigger to automatically update updated_at timestamp
CREATE TRIGGER update_user_plans_updated_at
BEFORE UPDATE ON public.user_plans
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Create a function to upsert user plans (helper for backend)
CREATE OR REPLACE FUNCTION public.upsert_user_plan(
  _user_id UUID,
  _stripe_customer_id TEXT DEFAULT NULL,
  _subscription_id TEXT DEFAULT NULL,
  _plan_type plan_type_enum DEFAULT NULL,
  _billing_cycle billing_cycle_enum DEFAULT NULL,
  _status plan_status_enum DEFAULT NULL,
  _current_period_end TIMESTAMP WITH TIME ZONE DEFAULT NULL,
  _cancel_at_period_end BOOLEAN DEFAULT NULL,
  _raw JSONB DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _plan_id UUID;
BEGIN
  INSERT INTO public.user_plans (
    user_id,
    stripe_customer_id,
    subscription_id,
    plan_type,
    billing_cycle,
    status,
    current_period_end,
    cancel_at_period_end,
    raw
  ) VALUES (
    _user_id,
    COALESCE(_stripe_customer_id, NULL),
    COALESCE(_subscription_id, NULL),
    COALESCE(_plan_type, 'free'),
    _billing_cycle,
    COALESCE(_status, 'inactive'),
    _current_period_end,
    COALESCE(_cancel_at_period_end, false),
    _raw
  )
  ON CONFLICT (user_id) DO UPDATE SET
    stripe_customer_id = COALESCE(_stripe_customer_id, user_plans.stripe_customer_id),
    subscription_id = COALESCE(_subscription_id, user_plans.subscription_id),
    plan_type = COALESCE(_plan_type, user_plans.plan_type),
    billing_cycle = COALESCE(_billing_cycle, user_plans.billing_cycle),
    status = COALESCE(_status, user_plans.status),
    current_period_end = COALESCE(_current_period_end, user_plans.current_period_end),
    cancel_at_period_end = COALESCE(_cancel_at_period_end, user_plans.cancel_at_period_end),
    raw = COALESCE(_raw, user_plans.raw),
    updated_at = now()
  RETURNING id INTO _plan_id;
  
  RETURN _plan_id;
END;
$$;