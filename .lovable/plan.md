## Objetivo
Corrigir alinhamento entre cards de planos e ajustar exibição do "Grátis".

## Mudanças em `src/components/Pricing.tsx`

### 1. Alinhar títulos e botões entre cards
Atualmente o `CardHeader` usa `flex flex-col justify-center` com `min-h-[160px]`, o que centraliza verticalmente o conteúdo do header. Como o Gratuito tem header menor que o Nura Pro (sem preço riscado), o título e o preço ficam em alturas diferentes.

Trocar para alinhamento ao topo:
- `CardHeader`: remover `justify-center`, manter `min-h-[160px]` e estrutura flex-col padrão (conteúdo começa do topo).
- Resultado: título "Gratuito" e "Nura Pro" alinhados no topo; bloco de preço logo abaixo do título em ambos.

Como o `CardContent` já é `flex flex-col flex-grow` com `flex-grow` na lista e botão no final, os botões alinham automaticamente quando os headers têm a mesma altura.

### 2. Texto "Grátis" centralizado e maior
- Renderizar "Grátis" dentro de `<div className="flex flex-col items-center">` com `<span className="text-xl sm:text-2xl font-bold">Grátis</span>`.
- Tamanho menor que o preço (`text-2xl sm:text-3xl`) e centralizado horizontalmente como os demais preços.

## Arquivos alterados
- `src/components/Pricing.tsx`
