-- Add monthly quota tracking columns to profiles
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS receituario_usage_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS receituario_usage_month TEXT;

-- Function: consume_receituario_quota
-- Returns jsonb { allowed, used, limit, month }
CREATE OR REPLACE FUNCTION public.consume_receituario_quota(_user_id uuid, _is_free boolean)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _current_month TEXT := to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM');
  _stored_month TEXT;
  _used INT;
  _free_limit INT := 5;
BEGIN
  SELECT receituario_usage_count, receituario_usage_month
    INTO _used, _stored_month
  FROM public.profiles
  WHERE id = _user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('allowed', false, 'used', 0, 'limit', _free_limit, 'month', _current_month, 'error', 'profile_not_found');
  END IF;

  -- Lazy reset on month change
  IF _stored_month IS DISTINCT FROM _current_month THEN
    _used := 0;
    UPDATE public.profiles
       SET receituario_usage_count = 0,
           receituario_usage_month = _current_month
     WHERE id = _user_id;
  END IF;

  IF NOT _is_free THEN
    RETURN jsonb_build_object('allowed', true, 'used', _used, 'limit', NULL, 'month', _current_month);
  END IF;

  IF _used >= _free_limit THEN
    RETURN jsonb_build_object('allowed', false, 'used', _used, 'limit', _free_limit, 'month', _current_month);
  END IF;

  UPDATE public.profiles
     SET receituario_usage_count = _used + 1,
         receituario_usage_month = _current_month
   WHERE id = _user_id;

  RETURN jsonb_build_object('allowed', true, 'used', _used + 1, 'limit', _free_limit, 'month', _current_month);
END;
$$;

-- Function: refund_receituario_quota (best-effort decrement on failure)
CREATE OR REPLACE FUNCTION public.refund_receituario_quota(_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _current_month TEXT := to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM');
  _stored_month TEXT;
  _used INT;
BEGIN
  SELECT receituario_usage_count, receituario_usage_month
    INTO _used, _stored_month
  FROM public.profiles
  WHERE id = _user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  IF _stored_month = _current_month AND _used > 0 THEN
    UPDATE public.profiles
       SET receituario_usage_count = _used - 1
     WHERE id = _user_id;
  END IF;
END;
$$;

-- Function: get_receituario_quota (read-only with lazy reset)
CREATE OR REPLACE FUNCTION public.get_receituario_quota(_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _current_month TEXT := to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM');
  _stored_month TEXT;
  _used INT;
  _free_limit INT := 5;
BEGIN
  SELECT receituario_usage_count, receituario_usage_month
    INTO _used, _stored_month
  FROM public.profiles
  WHERE id = _user_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('used', 0, 'limit', _free_limit, 'month', _current_month);
  END IF;

  IF _stored_month IS DISTINCT FROM _current_month THEN
    _used := 0;
  END IF;

  RETURN jsonb_build_object('used', _used, 'limit', _free_limit, 'month', _current_month);
END;
$$;

-- Trigger: block saved_catalogs insert for free-only users
CREATE OR REPLACE FUNCTION public.block_saved_catalog_for_free()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _has_paid BOOLEAN;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM public.user_subscriptions
    WHERE user_id = NEW.user_id
      AND status = 'active'::subscription_status
      AND plan_type IN ('medical'::subscription_plan, 'specialist'::subscription_plan, 'legal'::subscription_plan, 'veterinary'::subscription_plan)
  ) INTO _has_paid;

  IF NOT _has_paid THEN
    RAISE EXCEPTION 'PLANO_FREE_NAO_PODE_SALVAR_CATALOGO' USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_block_saved_catalog_for_free ON public.saved_catalogs;
CREATE TRIGGER trg_block_saved_catalog_for_free
BEFORE INSERT ON public.saved_catalogs
FOR EACH ROW EXECUTE FUNCTION public.block_saved_catalog_for_free();