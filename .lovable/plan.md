## Problema

`isPlanActive` em `src/hooks/usePlanSettings.ts` retorna `true` enquanto `isLoading`, fazendo todos os planos serem renderizados antes do fetch terminar. Quando os dados chegam, os ocultos somem — causando flicker.

Além disso, `Pricing.tsx` renderiza o grid imediatamente sem considerar o loading.

## Correção

### 1. `src/hooks/usePlanSettings.ts`
- Mudar `isPlanActive`: enquanto `isLoading`, retornar `false` (não exibir nada até saber a verdade). Se plano não existe no map após loading, retornar `false` (fail-safe — não vazar plano novo não configurado).

### 2. `src/components/Pricing.tsx`
- Usar `isLoading` do hook para bloquear o render do grid.
- Enquanto `isLoadingPlanSettings === true`, exibir skeleton loaders no lugar do grid (4 cards skeleton usando `@/components/ui/skeleton`).
- Filtrar `visiblePlans` só após loading completo (já filtrado por `isPlanActive` que agora retorna false durante loading).
- Manter resto da lógica intacta (toggle anual/mensal, fetch de user_plans, etc.).

### Detalhes técnicos do skeleton
- Renderizar grid placeholder com mesma estrutura responsiva (`grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 max-w-6xl`) contendo 4 `<Skeleton className="h-[480px] w-full rounded-lg" />` — evita salto de layout (CLS).
- O header da seção ("Escolha o Plano Ideal", toggle Mensal/Anual) continua visível normalmente.

## Resultado
- Nenhum plano oculto aparece em frame algum.
- Sem fallback mockado.
- Skeleton suave durante o fetch, sem CLS.
