-- Add RLS policies for admins to manage user subscriptions
CREATE POLICY "Admins can insert subscriptions"
ON public.user_subscriptions
FOR INSERT
TO authenticated
WITH CHECK (has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update subscriptions"
ON public.user_subscriptions
FOR UPDATE
TO authenticated
USING (has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete subscriptions"
ON public.user_subscriptions
FOR DELETE
TO authenticated
USING (has_role(auth.uid(), 'admin'));