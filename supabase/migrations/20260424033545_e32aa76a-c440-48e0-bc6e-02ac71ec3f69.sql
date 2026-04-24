-- Add new columns to profiles
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS terms_accepted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS profile_completed BOOLEAN NOT NULL DEFAULT false;

-- Backfill existing users: anyone who already has CPF + birth_date is considered complete
UPDATE public.profiles
   SET profile_completed = true,
       terms_accepted_at = COALESCE(terms_accepted_at, created_at)
 WHERE cpf IS NOT NULL
   AND birth_date IS NOT NULL
   AND profile_completed = false;

-- Update handle_new_user to set profile_completed when CPF + birth_date are provided
CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _cpf TEXT := NEW.raw_user_meta_data->>'cpf';
  _birth_date TEXT := NEW.raw_user_meta_data->>'birth_date';
  _is_complete BOOLEAN := false;
BEGIN
  -- Validate CPF if provided
  IF _cpf IS NOT NULL THEN
    IF NOT public.validate_cpf(_cpf) THEN
      RAISE EXCEPTION 'Invalid CPF format or check digits';
    END IF;
  END IF;

  -- Determine if profile is already complete (traditional signup with CPF + birth_date)
  IF _cpf IS NOT NULL AND _birth_date IS NOT NULL AND _birth_date <> '' THEN
    _is_complete := true;
  END IF;

  INSERT INTO public.profiles (
    id,
    full_name,
    phone,
    email,
    birth_date,
    cpf,
    crm_crv,
    profile_completed,
    terms_accepted_at
  )
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1)),
    NEW.raw_user_meta_data->>'phone',
    NEW.email,
    NULLIF(_birth_date, '')::DATE,
    _cpf,
    NEW.raw_user_meta_data->>'crm_crv',
    _is_complete,
    CASE WHEN _is_complete THEN now() ELSE NULL END
  );
  RETURN NEW;
END;
$function$;