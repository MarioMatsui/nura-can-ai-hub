DROP POLICY IF EXISTS "System can insert notifications" ON public.admin_notifications;

CREATE POLICY "Admins can insert notifications"
ON public.admin_notifications
FOR INSERT
TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));