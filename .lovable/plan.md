## Objetivo
Reservar espaço fixo do texto "(R$ X cobrados anualmente)" para evitar deslocamento dos cards ao alternar Mensal/Anual.

## Mudança em `src/components/Pricing.tsx`
Trocar o render condicional do texto por um elemento sempre presente, com visibilidade controlada:
- Sempre renderizar o `<div>` abaixo do card.
- Quando `isAnnual && plan.monthlyPrice > 0`: visível (`text-muted-foreground`).
- Caso contrário: `invisible` (mantém espaço, esconde conteúdo) + `aria-hidden`.

Isso reserva a mesma altura nos dois estados, alinhando os cards no toggle Mensal.

## Arquivos alterados
- `src/components/Pricing.tsx`
