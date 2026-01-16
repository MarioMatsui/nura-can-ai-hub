-- Fix ai_usage table INSERT policy to restrict to user's own records
-- This addresses the permissive RLS issue where any authenticated user could insert records

-- Drop the existing overly permissive policy
DROP POLICY IF EXISTS "Service can insert ai_usage" ON public.ai_usage;

-- Create new policy that restricts INSERT to user's own records
CREATE POLICY "Users can insert their own ai_usage"
ON public.ai_usage
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);