-- Fix search_path for existing functions
ALTER FUNCTION public.search_semantic_chunks(vector, knowledge_base_type, integer, text) SET search_path = public;
ALTER FUNCTION public.search_structured_blocks(vector, uuid, integer, text) SET search_path = public;
ALTER FUNCTION public.search_tables(vector, uuid, integer) SET search_path = public;
ALTER FUNCTION public.has_role(uuid, app_role) SET search_path = public;