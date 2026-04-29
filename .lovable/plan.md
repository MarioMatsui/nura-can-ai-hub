## Remover console.logs restantes do Dashboard

### Causa
Os logs `[Dashboard] Mapping plan type: ...` e `[Dashboard] Active plans found: ...` que ainda aparecem no console do `/app` vêm de `src/pages/Dashboard.tsx`, dentro de `fetchSubscriptions` — não foram removidos nas iterações anteriores porque só limpamos `Pricing.tsx` e `ChatArea.tsx`.

### Mudanças
**`src/pages/Dashboard.tsx`** — remover 2 chamadas em `fetchSubscriptions`:
- `console.log('[Dashboard] Mapping plan type:', plan.plan_type, '->', mappedPlanType);` (dentro do `.map`)
- `console.log('[Dashboard] Active plans found:', activePlans.length);` (após o filter/map)

Toda a lógica de mapeamento de planos (`planTypeMap`, detecção de cancelamento, fallback para `free`) é preservada. Os `console.error` permanecem.

### Arquivos editados
- `src/pages/Dashboard.tsx`