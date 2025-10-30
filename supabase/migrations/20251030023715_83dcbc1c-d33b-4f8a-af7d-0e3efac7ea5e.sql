-- Adicionar role admin ao usuário atual
-- Nota: Este insert funcionará porque é executado como superuser durante a migration

INSERT INTO public.user_roles (user_id, role)
SELECT '74f96059-bf84-4e03-88a8-688686156422', 'admin'::app_role
WHERE EXISTS (SELECT 1 FROM auth.users WHERE id = '74f96059-bf84-4e03-88a8-688686156422')
ON CONFLICT (user_id, role) DO NOTHING;