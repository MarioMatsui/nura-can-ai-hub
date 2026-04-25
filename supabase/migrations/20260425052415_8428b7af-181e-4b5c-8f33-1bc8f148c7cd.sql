DROP POLICY IF EXISTS "Service role can manage processed webhooks" ON public.processed_webhooks;

CREATE POLICY "Service role can manage processed webhooks"
ON public.processed_webhooks
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);