## Objetivo
Alinhar os botões dos cards de planos mesmo quando a lista de features tem tamanhos diferentes.

## Causa
O grid coloca os cards lado a lado com mesma altura, mas o wrapper `<div className="flex flex-col">` que envolve cada Card não tem `h-full`, então o Card não estica para ocupar toda a altura disponível. Resultado: card com menos features (Gratuito) fica menor e o botão sobe.

## Mudança em `src/components/Pricing.tsx`
- Wrapper externo de cada card: `flex flex-col` → `flex flex-col h-full`
- `<Card>`: adicionar `flex-grow` à className para esticar até o fim do wrapper
- O `CardContent` já usa `flex flex-col flex-grow` com `<ul className="flex-grow">`, então a lista ocupa o espaço extra e o botão alinha no fundo automaticamente.

## Arquivos alterados
- `src/components/Pricing.tsx`
