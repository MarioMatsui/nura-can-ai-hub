-- Add server-side CPF validation function
CREATE OR REPLACE FUNCTION public.validate_cpf(cpf_input text)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  clean_cpf text;
  sum int;
  remainder int;
  i int;
BEGIN
  -- Remove all non-digit characters
  clean_cpf := regexp_replace(cpf_input, '\D', '', 'g');
  
  -- Check if has 11 digits
  IF length(clean_cpf) != 11 THEN
    RETURN false;
  END IF;
  
  -- Check for known invalid CPFs (all same digits)
  IF clean_cpf ~ '^(\d)\1{10}$' THEN
    RETURN false;
  END IF;
  
  -- Validate first check digit
  sum := 0;
  FOR i IN 1..9 LOOP
    sum := sum + (substring(clean_cpf, i, 1)::int * (11 - i));
  END LOOP;
  
  remainder := (sum * 10) % 11;
  IF remainder IN (10, 11) THEN
    remainder := 0;
  END IF;
  
  IF remainder != substring(clean_cpf, 10, 1)::int THEN
    RETURN false;
  END IF;
  
  -- Validate second check digit
  sum := 0;
  FOR i IN 1..10 LOOP
    sum := sum + (substring(clean_cpf, i, 1)::int * (12 - i));
  END LOOP;
  
  remainder := (sum * 10) % 11;
  IF remainder IN (10, 11) THEN
    remainder := 0;
  END IF;
  
  IF remainder != substring(clean_cpf, 11, 1)::int THEN
    RETURN false;
  END IF;
  
  RETURN true;
END;
$$;

-- Update the handle_new_user function to validate CPF
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Validate CPF if provided
  IF NEW.raw_user_meta_data->>'cpf' IS NOT NULL THEN
    IF NOT public.validate_cpf(NEW.raw_user_meta_data->>'cpf') THEN
      RAISE EXCEPTION 'Invalid CPF format or check digits';
    END IF;
  END IF;

  INSERT INTO public.profiles (
    id,
    full_name,
    phone,
    email,
    birth_date,
    cpf,
    crm_crv
  )
  VALUES (
    NEW.id,
    NEW.raw_user_meta_data->>'full_name',
    NEW.raw_user_meta_data->>'phone',
    NEW.email,
    (NEW.raw_user_meta_data->>'birth_date')::DATE,
    NEW.raw_user_meta_data->>'cpf',
    NEW.raw_user_meta_data->>'crm_crv'
  );
  RETURN NEW;
END;
$$;