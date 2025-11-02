-- Fix overly permissive RLS policy on user_plans table
-- This policy was allowing ANY authenticated user to modify subscription plans
-- which could lead to privilege escalation

-- Drop the overly permissive policy
DROP POLICY IF EXISTS "Service role can manage all plans" ON public.user_plans;

-- Note: The existing "Users can view their own plan" policy is correct and remains:
-- CREATE POLICY "Users can view their own plan" ON user_plans FOR SELECT USING (auth.uid() = user_id);

-- Edge functions using SUPABASE_SERVICE_ROLE_KEY automatically bypass RLS,
-- so they can still manage plans without needing an overly permissive policy