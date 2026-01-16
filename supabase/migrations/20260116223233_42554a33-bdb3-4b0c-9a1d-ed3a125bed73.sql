-- Add policy to deny anonymous access to profiles table
-- This ensures only authenticated users can access profile data

CREATE POLICY "Deny anonymous access to profiles"
ON public.profiles
FOR SELECT
USING (auth.uid() IS NOT NULL);