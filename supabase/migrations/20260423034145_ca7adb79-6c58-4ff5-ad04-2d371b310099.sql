
-- Create private bucket for catalog page images
INSERT INTO storage.buckets (id, name, public)
VALUES ('prescription-files-pages', 'prescription-files-pages', false)
ON CONFLICT (id) DO NOTHING;

-- RLS policies for the new bucket (folder structure: {user_id}/{catalog_id}/page-N.webp)
CREATE POLICY "Users can view own catalog pages"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'prescription-files-pages'
  AND auth.uid()::text = (storage.foldername(name))[1]
);

CREATE POLICY "Users can insert own catalog pages"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'prescription-files-pages'
  AND auth.uid()::text = (storage.foldername(name))[1]
);

CREATE POLICY "Users can delete own catalog pages"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'prescription-files-pages'
  AND auth.uid()::text = (storage.foldername(name))[1]
);

CREATE POLICY "Admins can view all catalog pages"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'prescription-files-pages'
  AND has_role(auth.uid(), 'admin'::app_role)
);
