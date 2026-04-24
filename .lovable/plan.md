

## Receituário+ — Acesso Generalista (Free) com limite mensal, restrição por plano, bloqueio de salvar e menu mobile

### Diagnóstico

Hoje o Receituário+ é restrito a **medical/specialist** em três pontos:
1. Sidebar (`ChatSidebar.tsx` linha 68–70): `hasPrescriptionAccess` filtra só `medical|specialist`.
2. Edge function (`generate-prescription/index.ts` linha 18, 1237–1246): `ALLOWED_PLANS = medical|specialist` retorna 403 para os demais.
3. Sem contagem mensal de uso para `free`/`generalista`, sem bloqueio de salvar catálogo para free, e a `PrescriptionView` não tem header com hamburger no mobile (ao contrário de `ChatArea` linhas 362–374).

### Mudanças

#### 1. Backend — contador mensal + permissão para generalista

**Migration nova:**
- Coluna em `profiles`: `receituario_usage_count INT DEFAULT 0`, `receituario_usage_month TEXT` (formato `YYYY-MM`). Mais simples e resiliente que cron — comparamos com mês atual a cada checagem; se diferente, reseta.
- Função `public.consume_receituario_quota(_user_id uuid, _is_free boolean)` (SECURITY DEFINER) que:
  - Lê `usage_count` e `usage_month` da `profiles`.
  - Se `usage_month` ≠ mês atual → reseta para `0` e atualiza `usage_month`.
  - Se `_is_free` e `usage_count >= 5` → retorna `{ allowed: false, used: usage_count, limit: 5 }`.
  - Se permitido e `_is_free` → incrementa para `usage_count + 1` e retorna `{ allowed: true, used: usage_count + 1, limit: 5 }`.
  - Se não-free → retorna `{ allowed: true, used: 0, limit: null }` sem mexer no contador.
- Função `public.get_receituario_quota(_user_id uuid)` (SECURITY DEFINER, READ ONLY) — retorna `{ used, limit, month }` com reset lógico para front exibir "X/5".

**Trigger em `saved_catalogs`** (BEFORE INSERT): se o usuário só tem plano `free`, levanta exception `PLANO_FREE_NAO_PODE_SALVAR_CATALOGO`. Isso bloqueia no DB mesmo se o front for burlado.

**Edge function `generate-prescription`:**
- Trocar `userHasMedicalAccess` por `getUserPlanContext(userId)` que devolve `{ hasPaidMedical, isFreeOnly, hasOtherPaid }`.
- Permitir geração se `hasPaidMedical || isFreeOnly`. **Bloquear** se o único plano pago for jurídico/veterinário sem acesso médico/specialist e sem free → na prática, se `hasOtherPaid && !hasPaidMedical && !isFreeOnly`, retorna 403 `plano_invalido`.
- Antes de criar o job, chamar `consume_receituario_quota(userId, isFreeOnly)`. Se `allowed === false`, retornar 403 com `error: 'limite_mensal'`, `message: 'Você atingiu o limite mensal de 5 receituários no plano gratuito.'`, `used: 5`, `limit: 5`.
- Se a geração falhar **dentro** de `runGeneration`, decrementar de volta o contador (consumo só "vale" quando o job realmente roda; falhas catastróficas não devem queimar quota — best effort).

#### 2. Frontend — sidebar com restrição correta

**`src/components/dashboard/ChatSidebar.tsx`:**
- `hasPrescriptionAccess` agora retorna `true` se o usuário tem **qualquer** subscription cuja `plan_type` ∈ `{ 'medical', 'specialist', 'free' }`. Nota: `free` é o default sempre adicionado em `Dashboard.tsx` linha 199–217 quando não há plano pago, então generalistas entram naturalmente.
- **Esconder** o botão Receituário+ quando o **único** plano ativo do usuário é `legal` ou `veterinary` (sem `medical`, `specialist` ou `free`). Hoje em `Dashboard.tsx` o `free` só é adicionado quando NÃO há plano pago — então usuário só-jurídico/só-veterinário não tem `free` no array. Renderização condicional: `const showPrescription = hasMedicalLike || hasFreeOnly` onde `hasFreeOnly = subscriptions.every(s => s.plan_type === 'free')`. Se `false`, retornar `null` para o botão (não renderiza nada — nem nas duas variantes expanded/collapsed).
- Remover o estado `Lock` / `disabled` — não tem mais bloqueio visual: ou aparece liberado, ou não aparece.

#### 3. Frontend — bloqueio de "Salvar catálogo" para free

**`src/components/dashboard/prescription/UploadDropzone.tsx`** (botão Salvar, dentro do dropzone do catálogo):
- Receber nova prop `canSave: boolean` (true para medical/specialist, false para free puro).
- Se `!canSave`: botão fica visível mas com `opacity-50 cursor-not-allowed`; ao clicar dispara `toast.info('Disponível apenas para planos pagos.')`.

**`src/components/dashboard/prescription/PrescriptionView.tsx`:**
- Receber nova prop `subscriptions` do `Dashboard.tsx`.
- Computar `isFreeOnly = subscriptions.every(s => s.plan_type === 'free')`.
- Passar `canSave={!isFreeOnly}` para o `UploadDropzone` do catálogo.
- Esconder o componente `<SavedCatalogs />` inteiro se `isFreeOnly` (não há catálogos salvos pra mostrar e não pode criar — limpa a UI).

**`src/pages/Dashboard.tsx`:** passar `subscriptions={subscriptions}` para `<PrescriptionView />`.

#### 4. Frontend — header hamburger mobile no Receituário+

**`PrescriptionView.tsx`:**
- Importar `useSidebar` de `@/components/ui/sidebar`, `useIsMobile`, `Menu` de `lucide-react`, `Button`.
- Adicionar header acima do `<ScrollArea>` com mesma estrutura do `ChatArea` (linhas 362–374): no mobile, botão `<Button variant="ghost" size="icon" onClick={toggleSidebar}><Menu /></Button>`. Reutiliza o mesmo `toggleSidebar` do `SidebarProvider` global.
- Garantir que o header fica **fora** do `ScrollArea` (sticky na verdade não é necessário, o layout flex já cobre).

#### 5. Frontend — feedback visual do limite

**`PrescriptionView.tsx`:**
- Novo estado `quota: { used: number; limit: number | null }`.
- `useEffect` no mount chama `supabase.rpc('get_receituario_quota')` se `isFreeOnly`. Recarrega após cada geração bem-sucedida.
- Exibir abaixo do botão "Gerar Receituário", quando `isFreeOnly && quota.limit`:
  - `<p className="text-xs text-muted-foreground mt-2">Usos restantes este mês: {quota.limit - quota.used}/{quota.limit}</p>`
- Se `quota.used >= quota.limit`: desabilitar botão "Gerar Receituário" e mostrar mensagem destacada `'Você atingiu o limite mensal de 5 receituários no plano gratuito.'`.
- No `handleGenerate`, se a edge retornar `error: 'limite_mensal'`, atualizar `quota` localmente e exibir toast.

### Garantias

- **Generalista (free):** vê o Receituário+, gera até 5/mês, vê contador, NÃO vê catálogos salvos, NÃO consegue salvar (bloqueio frontend + DB).
- **Médico/Especialista:** comportamento atual preservado, sem contador, salva catálogos normalmente.
- **Jurídico/Veterinário (sem médico):** botão Receituário+ não aparece na sidebar; rota direta também é bloqueada pela edge (403).
- **Reset mensal:** lazy — verificado a cada uso/leitura, baseado em `YYYY-MM` atual vs salvo. Sem cron.
- **Bypass via API:** trigger no `saved_catalogs` + checagem de quota na edge garantem que mesmo chamando direto via SDK não funciona.
- **Mobile UX:** hamburger reutiliza `toggleSidebar` do `SidebarProvider` global, mesmo padrão do chat.
- **Zero impacto** em chat-ai, sidecar, RAG, upload pipeline.

### Arquivos

- **Nova migration:** `add_receituario_quota_and_free_save_block.sql` — colunas em `profiles`, RPCs `consume_receituario_quota` / `get_receituario_quota`, trigger BEFORE INSERT em `saved_catalogs`.
- **Editado:** `supabase/functions/generate-prescription/index.ts` — `getUserPlanContext`, consumo de quota antes do job, decremento em falha.
- **Editado:** `src/components/dashboard/ChatSidebar.tsx` — `showPrescription` baseado em medical/specialist/free; remove estado bloqueado.
- **Editado:** `src/components/dashboard/prescription/PrescriptionView.tsx` — header mobile com hamburger, quota state + display, prop `subscriptions`, esconde SavedCatalogs para free.
- **Editado:** `src/components/dashboard/prescription/UploadDropzone.tsx` — prop `canSave`, botão Salvar bloqueado com toast para free.
- **Editado:** `src/pages/Dashboard.tsx` — passa `subscriptions` para `PrescriptionView`.

