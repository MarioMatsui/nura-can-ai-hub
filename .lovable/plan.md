## Objetivo
Três ajustes visuais nos cards de `/planos` e landing (componente `src/components/Pricing.tsx`):
1. Alinhar verticalmente o conteúdo entre cards (checklist começa na mesma altura)
2. Remover badge "-15%" e substituir por preço antigo riscado (39,99 mensal / 27,90 anual no Nura Pro)
3. Mover texto "(R$ X cobrados anualmente)" para fora do card

## Mudanças em `src/components/Pricing.tsx`

### 1. Alinhamento dos cards
- Dar ao `CardHeader` uma altura mínima fixa para que o bloco título+preço ocupe sempre o mesmo espaço, independente do plano ser "Grátis" ou ter preço com riscado.
- Aplicar `min-h-[140px]` ao `CardHeader` (suficiente para acomodar título + preço de duas linhas + riscado).
- Garantir `flex flex-col justify-center` no header para centralizar verticalmente quando o conteúdo for menor (ex.: Gratuito).
- O `CardContent` já usa `flex flex-col flex-grow`, então a checklist alinhará automaticamente após o header padronizado.

### 2. Remover badge "-15%" e adicionar preço antigo riscado
Na função `getDisplayPrice`, em ambos os branches (anual e mensal):
- Remover o `<span>` da badge "-15%" (com pseudo-elemento ::after rotacionado).
- Renderizar acima ou ao lado do preço principal um preço antigo:
  - Para Nura Pro (`medico`): mensal R$ 39,90 / anual R$ 27,90 mês
  - Para os outros planos: usar `monthlyOriginalPrice` (mensal) e `annualOriginalPrice` (mês equivalente anual) que já existem no objeto
- Estilo do preço antigo: `text-white/50 line-through decoration-red-500 decoration-2`
- Posicionamento: pequeno, próximo ao preço principal, no mesmo local onde estava a badge (canto superior direito do preço, ou logo acima — escolher pequeno acima do preço para melhor leitura).

Atualizar valores no objeto `plans.medico`:
- `monthlyOriginalPrice: 39.90`
- `annualOriginalPrice: 27.90` (já é interpretado como "mês equivalente original")

Lógica do display:
- Se `originalPrice > currentPrice`: mostra riscado
- Se igual: não mostra nada (evita "39,90 riscado em cima de 39,90")

### 3. Mover texto "cobrados anualmente" para fora do card
Atualmente o texto está dentro do `CardContent`. Mover para fora:
- Envolver cada `<Card>` em um `<div className="flex flex-col">`
- Mover o bloco `{isAnnual && plan.monthlyPrice > 0 && (...)}` para fora do `<Card>`, logo abaixo
- Ajustar estilos: `mt-2 text-[11px] text-muted-foreground text-center` (1px menor que `text-xs` que é 12px)

## Validação
- Card Gratuito e Nura Pro com checklist alinhada na mesma altura
- Preço antigo R$ 39,90 (mensal) / R$ 27,90 (anual) em branco/50% com risco vermelho no card Nura Pro
- Sem badge "-15%" em nenhum card
- Texto "(R$ 119,90 cobrados anualmente)" abaixo do card, fora dele, fonte menor

## Arquivos alterados
- `src/components/Pricing.tsx` (apenas)
