

## Adicionar item de receituário aos blocos Gratuito e Médico

### Mudança

Em `src/components/Pricing.tsx`, adicionar um novo item ao final da lista `features` de dois planos:

- **`free`**: adicionar `"Até 5 receituários por mês"` após `"Respostas mais diretas"`.
- **`medico`**: adicionar `"Geração de receituário ilimitado"` após `"Respostas baseadas em evidências científicas"`.

Os itens serão renderizados automaticamente pelo `.map()` existente (linhas 411-416), com o mesmo ícone `Check` verde, mesmo espaçamento (`space-y-3`) e mesma tipografia (`text-sm`) dos demais itens. Nenhum estilo, preço ou comportamento será alterado.

### Arquivos editados

- `src/components/Pricing.tsx` — duas linhas adicionadas nos arrays `features` dos planos `free` e `medico`.

