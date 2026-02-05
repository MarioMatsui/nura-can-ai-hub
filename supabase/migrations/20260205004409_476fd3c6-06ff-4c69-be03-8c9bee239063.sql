
-- ============================================
-- SECURITY FIX: Restrict profiles and payments tables to authenticated users only
-- This explicitly denies anonymous access to sensitive PII and financial data
-- ============================================

-- ============================================
-- FIX PROFILES TABLE POLICIES
-- Contains sensitive PII: CPF, email, phone, birth_date
-- ============================================

-- Drop existing policies on profiles table
DROP POLICY IF EXISTS "Users can view their own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can update their own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can insert their own profile" ON public.profiles;
DROP POLICY IF EXISTS "Admins can view all profiles" ON public.profiles;
DROP POLICY IF EXISTS "Admins can update all profiles" ON public.profiles;

-- Recreate policies with explicit authenticated role restriction
CREATE POLICY "Users can view their own profile"
ON public.profiles
FOR SELECT
TO authenticated
USING (auth.uid() = id);

CREATE POLICY "Users can update their own profile"
ON public.profiles
FOR UPDATE
TO authenticated
USING (auth.uid() = id)
WITH CHECK (auth.uid() = id);

CREATE POLICY "Users can insert their own profile"
ON public.profiles
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = id);

CREATE POLICY "Admins can view all profiles"
ON public.profiles
FOR SELECT
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can update all profiles"
ON public.profiles
FOR UPDATE
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- ============================================
-- FIX PAYMENTS TABLE POLICIES
-- Contains sensitive financial data: amounts, Stripe IDs, charge IDs
-- ============================================

-- Drop existing policies on payments table
DROP POLICY IF EXISTS "Users can view their own payments" ON public.payments;
DROP POLICY IF EXISTS "Admins can view all payments" ON public.payments;

-- Recreate policies with explicit authenticated role restriction
CREATE POLICY "Users can view their own payments"
ON public.payments
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Admins can view all payments"
ON public.payments
FOR SELECT
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));
