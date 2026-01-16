-- Remove overly permissive policy that allows any authenticated user to manage all payments
-- Service role bypasses RLS by default, so this policy is not needed and creates a security vulnerability
DROP POLICY IF EXISTS "Service role can manage payments" ON public.payments;

-- Add policy to deny anonymous access (similar to profiles table fix)
CREATE POLICY "Deny anonymous access to payments"
ON public.payments
FOR SELECT
USING (auth.uid() IS NOT NULL);