

## Corrigir falha: acesso público à tabela `processed_webhooks`

### Causa raiz

A política atual `Service role can manage processed webhooks` está aplicada ao role `public` com `USING (true)` e `WITH CHECK (true)`. Apesar do nome, ela permite que **qualquer cliente** (incluindo anônimo) leia, insira, atualize e delete registros. Isso permite:
- Deletar entradas → webhooks legítimos podem ser reprocessados (replay attack).
- Inserir entradas falsas → webhooks legítimos do Stripe são ignorados como "duplicados".

### Quem realmente usa a tabela

Verifiquei `supabase/functions/stripe-webhook/index.ts` (linhas 81-99): a função usa `SUPABASE_SERVICE_ROLE_KEY` para SELECT e INSERT na tabela. **Service role bypassa RLS por padrão**, então restringir a política para `service_role` apenas não quebra nada.

Nenhum código do cliente (`src/`) acessa `processed_webhooks` — confirmado pela ausência de referências.

### Mudança

**Migração SQL** (única alteração necessária):

```sql
-- Remover política permissiva aplicada ao public
DROP POLICY IF EXISTS "Service role can manage processed webhooks" ON public.processed_webhooks;

-- Criar política restrita ao service_role
-- (edge functions com SERVICE_ROLE_KEY continuam funcionando; clientes anon/authenticated ficam bloqueados)
CREATE POLICY "Service role can manage processed webhooks"
ON public.processed_webhooks
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);
```

RLS já está habilitado na tabela — sem alteração necessária aí.

### Impacto

- ✅ `stripe-webhook` (usa service role) → continua funcionando sem mudanças.
- ✅ `cleanup_old_webhooks()` (SECURITY DEFINER) → continua funcionando, pois roda com privilégios do owner.
- 🔒 Anônimos e usuários autenticados **não conseguem mais** ler, inserir, atualizar ou deletar registros via REST API.
- 🔒 Replay attacks e supressão de webhooks legítimos ficam bloqueados.

### Arquivos editados

- **Migração SQL** — substituir política `FOR ALL` em `processed_webhooks` para escopar ao role `service_role`.

