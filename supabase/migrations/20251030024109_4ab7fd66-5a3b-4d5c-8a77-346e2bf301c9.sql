-- Adicionar role admin com o ID correto do usuário
INSERT INTO public.user_roles (user_id, role)
VALUES ('74f96059-bf84-4e03-88a8-68868615642a'::uuid, 'admin'::app_role)
ON CONFLICT (user_id, role) DO NOTHING;