-- Remove the overly permissive "Deny anonymous access to profiles" policy
-- This policy only checked auth.uid() IS NOT NULL, which allows ANY authenticated user to see ANY profile
-- The existing policies are sufficient:
-- - "Users can view their own profile" (auth.uid() = id)
-- - "Admins can view all profiles" (has_role check)
DROP POLICY IF EXISTS "Deny anonymous access to profiles" ON public.profiles;