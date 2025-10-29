-- Fix storage policies to use security definer function instead of direct table queries
-- This prevents potential infinite recursion issues and maintains consistency

-- Drop old policies that directly query user_roles table
DROP POLICY IF EXISTS "Admins can upload documents" ON storage.objects;
DROP POLICY IF EXISTS "Admins can view documents" ON storage.objects;
DROP POLICY IF EXISTS "Admins can delete documents" ON storage.objects;

-- Recreate policies using the has_role() security definer function
CREATE POLICY "Admins can upload documents"
ON storage.objects
FOR INSERT
WITH CHECK (
  bucket_id = 'knowledge-documents' AND
  public.has_role(auth.uid(), 'admin'::app_role)
);

CREATE POLICY "Admins can view documents"
ON storage.objects
FOR SELECT
USING (
  bucket_id = 'knowledge-documents' AND
  public.has_role(auth.uid(), 'admin'::app_role)
);

CREATE POLICY "Admins can delete documents"
ON storage.objects
FOR DELETE
USING (
  bucket_id = 'knowledge-documents' AND
  public.has_role(auth.uid(), 'admin'::app_role)
);