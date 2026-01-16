-- Create table for plan settings (feature flags for plans)
CREATE TABLE public.plan_settings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  plan_code TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  display_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE public.plan_settings ENABLE ROW LEVEL SECURITY;

-- Admins can manage plan settings
CREATE POLICY "Admins can manage plan settings"
ON public.plan_settings
FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Everyone can view active plan settings (for landing page and app)
CREATE POLICY "Anyone can view plan settings"
ON public.plan_settings
FOR SELECT
USING (true);

-- Create trigger for automatic timestamp updates
CREATE TRIGGER update_plan_settings_updated_at
BEFORE UPDATE ON public.plan_settings
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Insert initial plan data with all plans active
INSERT INTO public.plan_settings (plan_code, display_name, is_active, display_order) VALUES
  ('free', 'Gratuito', true, 1),
  ('medico', 'Médico', true, 2),
  ('juridico', 'Jurídico', true, 3),
  ('veterinario', 'Veterinário', true, 4),
  ('especialista', 'Especialista', true, 5);