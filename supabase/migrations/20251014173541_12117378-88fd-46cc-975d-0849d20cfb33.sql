-- Fix 1: Implement subscription-based RLS policies for knowledge documents
-- Drop existing overly permissive policies
DROP POLICY IF EXISTS "Users can view all documents" ON public.knowledge_documents;
DROP POLICY IF EXISTS "Users can view all chunks" ON public.document_chunks;
DROP POLICY IF EXISTS "Users can view all blocks" ON public.document_blocks;
DROP POLICY IF EXISTS "Users can view all tables" ON public.document_tables;
DROP POLICY IF EXISTS "Users can view all images" ON public.document_images;

-- Create subscription-based policy for knowledge_documents
CREATE POLICY "Users can view documents based on subscription"
ON public.knowledge_documents
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.user_subscriptions
    WHERE user_id = auth.uid()
    AND status = 'active'
    AND (
      plan_type = 'specialist'  -- Specialist has access to all
      OR (plan_type = 'medical' AND knowledge_documents.knowledge_type = 'medical')
      OR (plan_type = 'legal' AND knowledge_documents.knowledge_type = 'legal')
      OR (plan_type = 'veterinary' AND knowledge_documents.knowledge_type = 'veterinary')
    )
  )
);

-- Create subscription-based policy for document_chunks
CREATE POLICY "Users can view chunks based on subscription"
ON public.document_chunks
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.knowledge_documents kd
    INNER JOIN public.user_subscriptions us ON us.user_id = auth.uid()
    WHERE kd.id = document_chunks.document_id
    AND us.status = 'active'
    AND (
      us.plan_type = 'specialist'
      OR (us.plan_type = 'medical' AND kd.knowledge_type = 'medical')
      OR (us.plan_type = 'legal' AND kd.knowledge_type = 'legal')
      OR (us.plan_type = 'veterinary' AND kd.knowledge_type = 'veterinary')
    )
  )
);

-- Create subscription-based policy for document_blocks
CREATE POLICY "Users can view blocks based on subscription"
ON public.document_blocks
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.knowledge_documents kd
    INNER JOIN public.user_subscriptions us ON us.user_id = auth.uid()
    WHERE kd.id = document_blocks.document_id
    AND us.status = 'active'
    AND (
      us.plan_type = 'specialist'
      OR (us.plan_type = 'medical' AND kd.knowledge_type = 'medical')
      OR (us.plan_type = 'legal' AND kd.knowledge_type = 'legal')
      OR (us.plan_type = 'veterinary' AND kd.knowledge_type = 'veterinary')
    )
  )
);

-- Create subscription-based policy for document_tables
CREATE POLICY "Users can view tables based on subscription"
ON public.document_tables
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.knowledge_documents kd
    INNER JOIN public.user_subscriptions us ON us.user_id = auth.uid()
    WHERE kd.id = document_tables.document_id
    AND us.status = 'active'
    AND (
      us.plan_type = 'specialist'
      OR (us.plan_type = 'medical' AND kd.knowledge_type = 'medical')
      OR (us.plan_type = 'legal' AND kd.knowledge_type = 'legal')
      OR (us.plan_type = 'veterinary' AND kd.knowledge_type = 'veterinary')
    )
  )
);

-- Create subscription-based policy for document_images
CREATE POLICY "Users can view images based on subscription"
ON public.document_images
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.knowledge_documents kd
    INNER JOIN public.user_subscriptions us ON us.user_id = auth.uid()
    WHERE kd.id = document_images.document_id
    AND us.status = 'active'
    AND (
      us.plan_type = 'specialist'
      OR (us.plan_type = 'medical' AND kd.knowledge_type = 'medical')
      OR (us.plan_type = 'legal' AND kd.knowledge_type = 'legal')
      OR (us.plan_type = 'veterinary' AND kd.knowledge_type = 'veterinary')
    )
  )
);

-- Fix 2: Implement audit logging for admin access to profiles
-- Create audit_logs table
CREATE TABLE IF NOT EXISTS public.audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  timestamp timestamptz NOT NULL DEFAULT now(),
  admin_user_id uuid NOT NULL,
  action text NOT NULL,
  table_name text NOT NULL,
  record_id uuid NOT NULL,
  old_values jsonb,
  new_values jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Enable RLS on audit_logs
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- Only admins can view audit logs
CREATE POLICY "Admins can view audit logs"
ON public.audit_logs
FOR SELECT
USING (public.has_role(auth.uid(), 'admin'));

-- Create audit trigger function
CREATE OR REPLACE FUNCTION public.audit_profile_access()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Only log admin actions on other users' profiles
  IF public.has_role(auth.uid(), 'admin') AND auth.uid() != COALESCE(NEW.id, OLD.id) THEN
    INSERT INTO public.audit_logs (
      admin_user_id,
      action,
      table_name,
      record_id,
      old_values,
      new_values
    ) VALUES (
      auth.uid(),
      TG_OP,
      TG_TABLE_NAME,
      COALESCE(NEW.id, OLD.id),
      CASE WHEN TG_OP IN ('UPDATE', 'DELETE') THEN row_to_json(OLD) ELSE NULL END,
      CASE WHEN TG_OP IN ('INSERT', 'UPDATE') THEN row_to_json(NEW) ELSE NULL END
    );
  END IF;
  
  RETURN COALESCE(NEW, OLD);
END;
$$;

-- Apply audit trigger to profiles table for UPDATE and DELETE
CREATE TRIGGER audit_profiles_changes
AFTER UPDATE OR DELETE ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.audit_profile_access();