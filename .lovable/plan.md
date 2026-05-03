## Objetivo
Renomear o plano "Médico" para "Nura Pro" (apenas título visível na landing/`/planos`) e atualizar preços para R$ 14,90 mensal / R$ 9,99 mês (anual) com total anual R$ 119,90.

## Escopo da mudança

### 1. `src/components/Pricing.tsx` — fonte única dos valores exibidos

No objeto `plans.medico`, alterar:
- `name: "Médico"` → `name: "Nura Pro"` (afeta landing + `/planos`, ambos usam este componente)
- `monthlyPrice: 84.99` → `14.90`
- `monthlyOriginalPrice: 99.90` → remover badge "-15%" deste card OU manter consistente (ver decisão abaixo)
- `annualPrice: 922.99` → `119.90` (total anual cobrado)
- `annualTotalPrice: 922.99` → `119.90`
- `annualOriginalPrice: 89.90` → não é usado no render, pode ficar

A função `getDisplayPrice` já calcula `annualPrice / 12` → `119.90 / 12 = 9.991...` → exibe `R$ 9,99`. ✓
O texto abaixo do botão usa `annualTotalPrice.toFixed(2)` → `R$ 119,90 cobrados anualmente`. ✓

### 2. Backend / lógica de plano — NÃO alterar
- A chave interna `medico` permanece (DB usa termo PT, ver memória `plan-type-mapping`).
- `plan_type` no checkout, webhook, dashboard, admin, edge functions: tudo intacto.
- Stripe Price IDs: intactos (já atualizados anteriormente).

### 3. Badge "-15%" no card
O badge "-15%" em `getDisplayPrice` é hardcoded e aplicado a todos os planos pagos. Com o novo preço Nura Pro (14,90 → 9,99 = ~33% off no anual), o "-15%" fica incorreto especificamente para este card.

**Decisão necessária:** manter o badge "-15%" como está (aplica a todos uniformemente) ou calcular dinamicamente por plano? Para evitar scope creep, **manter como está** — a HARD RULE pede consistência de preço, não do badge. Confirmo isso na execução salvo orientação contrária.

### 4. Consistência sem flicker
- O componente já usa `isAnnual` state com Switch — toggle é síncrono, sem flicker.
- Skeleton durante `isLoadingPlanSettings` já protege contra flash inicial.
- Como mudamos apenas constantes do objeto `plans`, não há risco novo de inconsistência.

### 5. Validação pós-mudança
- Card exibe "Nura Pro"
- Toggle Mensal → R$ 14,90 /mês
- Toggle Anual → R$ 9,99 /mês + "(R$ 119,90 cobrados anualmente)"
- Checkout continua usando `VITE_PRICE_MEDICO_MENSAL` / `VITE_PRICE_MEDICO_ANUAL` (Stripe é fonte de verdade do valor cobrado — confirmar que os Price IDs no Stripe refletem 14,90 e 119,90)

## Atenção — Stripe
Os preços exibidos na UI devem bater com os Price IDs do Stripe. O Price ID anual atual (`price_1TSo3YK5Zr0li1N8MJJ4xfVs`) foi configurado recentemente para R$ 922,99. **Você precisa criar/confirmar no Stripe os novos Price IDs**:
- Mensal R$ 14,90
- Anual R$ 119,90

Se os Price IDs precisarem ser trocados, me envie os novos `price_...` para atualizar `VITE_PRICE_MEDICO_MENSAL` e `VITE_PRICE_MEDICO_ANUAL`.

## Arquivos alterados
- `src/components/Pricing.tsx` (apenas constantes do objeto `plans.medico`)
