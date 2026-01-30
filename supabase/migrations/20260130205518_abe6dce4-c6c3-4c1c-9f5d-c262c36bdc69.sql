-- Ensure RLS is enabled
ALTER TABLE public.user_plans ENABLE ROW LEVEL SECURITY;

-- Replace the existing SELECT policy with a policy that also allows admins
DROP POLICY IF EXISTS "Users can view their own plan" ON public.user_plans;
DROP POLICY IF EXISTS "Users and admins can view user plans" ON public.user_plans;

CREATE POLICY "Users and admins can view user plans"
ON public.user_plans
FOR SELECT
TO authenticated
USING (
  auth.uid() = user_id
  OR has_role(auth.uid(), 'admin'::app_role)
);

-- Admin management policies
DROP POLICY IF EXISTS "Admins can insert user plans" ON public.user_plans;
CREATE POLICY "Admins can insert user plans"
ON public.user_plans
FOR INSERT
TO authenticated
WITH CHECK (
  has_role(auth.uid(), 'admin'::app_role)
);

DROP POLICY IF EXISTS "Admins can update user plans" ON public.user_plans;
CREATE POLICY "Admins can update user plans"
ON public.user_plans
FOR UPDATE
TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role)
)
WITH CHECK (
  has_role(auth.uid(), 'admin'::app_role)
);

DROP POLICY IF EXISTS "Admins can delete user plans" ON public.user_plans;
CREATE POLICY "Admins can delete user plans"
ON public.user_plans
FOR DELETE
TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role)
);
