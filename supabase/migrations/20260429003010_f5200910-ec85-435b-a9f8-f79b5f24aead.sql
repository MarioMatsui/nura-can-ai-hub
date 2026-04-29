-- 1) Quota RPCs: enforce ownership
CREATE OR REPLACE FUNCTION public.consume_receituario_quota(_user_id uuid, _is_free boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _current_month TEXT := to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM');
  _stored_month TEXT;
  _used INT;
  _free_limit INT := 5;
BEGIN
  -- Ownership guard: only the signed-in user can consume their own quota.
  -- Service-role calls have auth.uid() = NULL and are trusted.
  IF auth.uid() IS NOT NULL AND auth.uid() <> _user_id THEN
    RAISE EXCEPTION 'access_denied' USING ERRCODE = '42501';
  END IF;

  SELECT receituario_usage_count, receituario_usage_month
    INTO _used, _stored_month
  FROM public.profiles
  WHERE id = _user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('allowed', false, 'used', 0, 'limit', _free_limit, 'month', _current_month, 'error', 'profile_not_found');
  END IF;

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
$function$;

CREATE OR REPLACE FUNCTION public.refund_receituario_quota(_user_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _current_month TEXT := to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM');
  _stored_month TEXT;
  _used INT;
BEGIN
  IF auth.uid() IS NOT NULL AND auth.uid() <> _user_id THEN
    RAISE EXCEPTION 'access_denied' USING ERRCODE = '42501';
  END IF;

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
$function$;

CREATE OR REPLACE FUNCTION public.get_receituario_quota(_user_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _current_month TEXT := to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM');
  _stored_month TEXT;
  _used INT;
  _free_limit INT := 5;
BEGIN
  IF auth.uid() IS NOT NULL AND auth.uid() <> _user_id THEN
    RAISE EXCEPTION 'access_denied' USING ERRCODE = '42501';
  END IF;

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
$function$;

-- 2) Revoke direct EXECUTE on sensitive SECURITY DEFINER functions from anon/authenticated.
-- Edge functions run as service_role and retain access. The quota RPCs are now only callable
-- via edge functions (generate-prescription) which already pass the validated user_id.
REVOKE EXECUTE ON FUNCTION public.consume_receituario_quota(uuid, boolean) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.refund_receituario_quota(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.get_receituario_quota(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.upsert_user_plan(uuid, text, text, plan_type_enum, billing_cycle_enum, plan_status_enum, timestamptz, boolean, jsonb) FROM PUBLIC, anon, authenticated;

-- 3) Storage: document-images — replace permissive read with subscription-aware policy
DROP POLICY IF EXISTS "Users can view document images" ON storage.objects;

CREATE POLICY "Subscribers can view document images"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'document-images'
  AND EXISTS (
    SELECT 1
    FROM public.document_images di
    JOIN public.knowledge_documents kd ON kd.id = di.document_id
    JOIN public.user_subscriptions us ON us.user_id = auth.uid()
    WHERE di.storage_path = storage.objects.name
      AND us.status = 'active'::subscription_status
      AND (
        us.plan_type = 'specialist'::subscription_plan
        OR (us.plan_type = 'medical'::subscription_plan AND kd.knowledge_type = 'medical'::knowledge_base_type)
        OR (us.plan_type = 'legal'::subscription_plan AND kd.knowledge_type = 'legal'::knowledge_base_type)
        OR (us.plan_type = 'veterinary'::subscription_plan AND kd.knowledge_type = 'veterinary'::knowledge_base_type)
      )
  )
);

-- Admins should still be able to read all document images
CREATE POLICY "Admins can view all document images"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'document-images'
  AND public.has_role(auth.uid(), 'admin'::app_role)
);

-- 4) Storage: prescription-files-pages — add missing UPDATE policy scoped to owner folder
CREATE POLICY "Users can update own prescription pages"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'prescription-files-pages'
  AND (auth.uid())::text = (storage.foldername(name))[1]
)
WITH CHECK (
  bucket_id = 'prescription-files-pages'
  AND (auth.uid())::text = (storage.foldername(name))[1]
);
