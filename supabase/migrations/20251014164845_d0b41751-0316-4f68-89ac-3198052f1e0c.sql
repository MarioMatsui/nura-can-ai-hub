-- Add admin policies for profiles table to allow secure management
-- while maintaining strict user-level isolation

-- Policy: Allow admins to view all profiles (needed for UserManagement)
CREATE POLICY "Admins can view all profiles"
ON public.profiles
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

-- Policy: Allow admins to update any profile (needed for UserDialog)
CREATE POLICY "Admins can update all profiles"
ON public.profiles
FOR UPDATE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

-- Add comment to document sensitive nature of this table
COMMENT ON TABLE public.profiles IS 'Contains sensitive personal data (CPF, email, phone, birth_date, medical credentials). Protected by RLS - users can only access their own data, admins can access all for management purposes.';