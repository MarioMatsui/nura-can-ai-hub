-- Tabela de catálogos salvos (atalhos/favoritos por usuário)
CREATE TABLE public.saved_catalogs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  catalog_id UUID NOT NULL REFERENCES public.prescription_catalogs(id) ON DELETE CASCADE,
  display_name TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE (user_id, catalog_id)
);

CREATE INDEX idx_saved_catalogs_user ON public.saved_catalogs(user_id);

ALTER TABLE public.saved_catalogs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own saved catalogs"
  ON public.saved_catalogs FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own saved catalogs"
  ON public.saved_catalogs FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own saved catalogs"
  ON public.saved_catalogs FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own saved catalogs"
  ON public.saved_catalogs FOR DELETE
  USING (auth.uid() = user_id);

CREATE TRIGGER update_saved_catalogs_updated_at
  BEFORE UPDATE ON public.saved_catalogs
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();