-- Drop the existing unique constraint on user_id in user_plans if it exists
-- and modify the upsert function to handle multiple plans per user

-- First, let's recreate the upsert_user_plan function to handle multiple subscriptions
-- The conflict should be on subscription_id, not user_id
CREATE OR REPLACE FUNCTION public.upsert_user_plan(
  _user_id uuid,
  _stripe_customer_id text DEFAULT NULL::text,
  _subscription_id text DEFAULT NULL::text,
  _plan_type plan_type_enum DEFAULT NULL::plan_type_enum,
  _billing_cycle billing_cycle_enum DEFAULT NULL::billing_cycle_enum,
  _status plan_status_enum DEFAULT NULL::plan_status_enum,
  _current_period_end timestamp with time zone DEFAULT NULL::timestamp with time zone,
  _cancel_at_period_end boolean DEFAULT NULL::boolean,
  _raw jsonb DEFAULT NULL::jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _plan_id UUID;
BEGIN
  -- If subscription_id is provided, use it as the conflict key
  -- This allows multiple plans per user
  IF _subscription_id IS NOT NULL THEN
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
      _subscription_id,
      COALESCE(_plan_type, 'free'),
      _billing_cycle,
      COALESCE(_status, 'inactive'),
      _current_period_end,
      COALESCE(_cancel_at_period_end, false),
      _raw
    )
    ON CONFLICT (subscription_id) 
    WHERE subscription_id IS NOT NULL
    DO UPDATE SET
      stripe_customer_id = COALESCE(_stripe_customer_id, user_plans.stripe_customer_id),
      plan_type = COALESCE(_plan_type, user_plans.plan_type),
      billing_cycle = COALESCE(_billing_cycle, user_plans.billing_cycle),
      status = COALESCE(_status, user_plans.status),
      current_period_end = COALESCE(_current_period_end, user_plans.current_period_end),
      cancel_at_period_end = COALESCE(_cancel_at_period_end, user_plans.cancel_at_period_end),
      raw = COALESCE(_raw, user_plans.raw),
      updated_at = now()
    RETURNING id INTO _plan_id;
  ELSE
    -- For free plans or plans without subscription_id, use user_id conflict
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
      NULL,
      COALESCE(_plan_type, 'free'),
      _billing_cycle,
      COALESCE(_status, 'inactive'),
      _current_period_end,
      COALESCE(_cancel_at_period_end, false),
      _raw
    )
    ON CONFLICT (user_id)
    WHERE subscription_id IS NULL
    DO UPDATE SET
      plan_type = COALESCE(_plan_type, user_plans.plan_type),
      billing_cycle = COALESCE(_billing_cycle, user_plans.billing_cycle),
      status = COALESCE(_status, user_plans.status),
      current_period_end = COALESCE(_current_period_end, user_plans.current_period_end),
      cancel_at_period_end = COALESCE(_cancel_at_period_end, user_plans.cancel_at_period_end),
      raw = COALESCE(_raw, user_plans.raw),
      updated_at = now()
    RETURNING id INTO _plan_id;
  END IF;
  
  RETURN _plan_id;
END;
$function$;

-- Add a unique constraint on subscription_id where it's not null
-- This prevents duplicate subscription entries
CREATE UNIQUE INDEX IF NOT EXISTS user_plans_subscription_id_key 
ON user_plans(subscription_id) 
WHERE subscription_id IS NOT NULL;

-- Add a unique constraint on user_id where subscription_id is null
-- This ensures only one free plan per user
CREATE UNIQUE INDEX IF NOT EXISTS user_plans_user_id_free_key 
ON user_plans(user_id) 
WHERE subscription_id IS NULL;