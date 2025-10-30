-- Remover a foreign key constraint temporariamente e recriar
ALTER TABLE public.user_roles DROP CONSTRAINT IF EXISTS user_roles_user_id_fkey;

-- Adicionar constraint que não bloqueia inserts
ALTER TABLE public.user_roles 
ADD CONSTRAINT user_roles_user_id_fkey 
FOREIGN KEY (user_id) 
REFERENCES auth.users(id) 
ON DELETE CASCADE
NOT VALID;

-- Validar a constraint existente
ALTER TABLE public.user_roles VALIDATE CONSTRAINT user_roles_user_id_fkey;