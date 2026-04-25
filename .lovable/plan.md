

## Corrigir falha de segurança: INSERT público em `admin_notifications`

### Causa raiz

A política atual permite `INSERT` para qualquer um (`WITH CHECK (true)` no role `public`). Qualquer cliente — inclusive não autenticado — pode poluir a fila de notificações administrativas com payloads arbitrários.

### Estratégia

1. **Substituir a política permissiva** por uma que só permite INSERT a administradores autenticados. Edge functions que usam `SERVICE_ROLE_KEY` continuam funcionando porque o service role **bypassa RLS** por padrão.
2. **Ajustar `activate-specialist`** — única função que insere em `admin_notifications` usando a sessão do usuário comum (não-admin). Vou criar um segundo cliente com `SERVICE_ROLE_KEY` apenas para a inserção da notificação, mantendo o cliente autenticado para validar o usuário.

### Mudanças

**1. Migração SQL** (via migration tool)

```sql
-- Remover a política aberta
DROP POLICY IF EXISTS "System can insert notifications" ON public.admin_notifications;

-- Permitir INSERT apenas a admins autenticados
-- (service_role bypassa RLS, então edge functions internas continuam funcionando)
CREATE POLICY "Admins can insert notifications"
ON public.admin_notifications
FOR INSERT
TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));
```

As políticas existentes de `SELECT` (admins) e `UPDATE` (admins) ficam intactas.

**2. `supabase/functions/activate-specialist/index.ts`**

- Adicionar um segundo cliente com `SERVICE_ROLE_KEY` (`adminClient`) usado **somente** para:
  - `update` em `user_subscriptions` (já feito hoje com sessão do usuário, mas é mais seguro com service role)
  - `update` em `user_subscriptions` para `scheduled_cancellation`
  - `insert` em `cancellation_requests`
  - `insert` em `admin_notifications` ← essencial após a nova RLS
- Manter o cliente anon apenas para `auth.getUser()` (validação do solicitante).

Justificativa: o usuário não é admin, então com a nova RLS o `insert` em `admin_notifications` falharia. Usar service role é o padrão correto para "ações administrativas iniciadas pelo usuário".

### Impacto

- ✅ `request-cancellation` — já usa service role, sem mudanças.
- ✅ `revert-cancellation` — já usa service role, sem mudanças.
- ✅ `activate-specialist` — ajustado para usar service role nas escritas administrativas.
- ✅ Cliente do app (`CancellationRequests.tsx`) — só faz `select`/`update`, sem mudanças.
- 🔒 Brecha fechada: usuários não autenticados (e usuários autenticados não-admin) não conseguem mais inserir lixo em `admin_notifications` via REST direto.

### Arquivos editados

- **Migração SQL** — substituir política `INSERT` em `admin_notifications`.
- `supabase/functions/activate-specialist/index.ts` — usar `SERVICE_ROLE_KEY` para escritas administrativas.

