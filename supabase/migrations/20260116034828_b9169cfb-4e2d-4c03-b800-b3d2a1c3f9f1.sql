-- Fix webhook_events table security: restrict SELECT access to admin and service roles only
-- Drop any existing policies first to start fresh
DROP POLICY IF EXISTS "Service role can manage webhook events" ON public.webhook_events;
DROP POLICY IF EXISTS "Admins can view webhook events" ON public.webhook_events;
DROP POLICY IF EXISTS "Service can insert webhook events" ON public.webhook_events;
DROP POLICY IF EXISTS "Service can update webhook events" ON public.webhook_events;
DROP POLICY IF EXISTS "Service can delete webhook events" ON public.webhook_events;

-- Create admin-only SELECT policy (RESTRICTIVE - uses AND logic with other policies)
CREATE POLICY "Admins can view webhook events"
ON public.webhook_events AS RESTRICTIVE
FOR SELECT
USING (public.has_role(auth.uid(), 'admin'::app_role));

-- Service role INSERT policy for webhook processing
CREATE POLICY "Service can insert webhook events"
ON public.webhook_events AS RESTRICTIVE
FOR INSERT
WITH CHECK (true);

-- Service role UPDATE policy
CREATE POLICY "Service can update webhook events"
ON public.webhook_events AS RESTRICTIVE
FOR UPDATE
USING (true);

-- Service role DELETE policy  
CREATE POLICY "Service can delete webhook events"
ON public.webhook_events AS RESTRICTIVE
FOR DELETE
USING (true);