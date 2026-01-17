-- Remove the overly permissive policy that allows any authenticated user to see all payments
DROP POLICY IF EXISTS "Deny anonymous access to payments" ON public.payments;