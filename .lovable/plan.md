## Remover logs de debug do console

### Causa
Existem `console.log` de debug em dois componentes que aparecem em `/`, `/planos` e `/app`:

- `src/components/Pricing.tsx` — 5 logs (`Pricing - ...`)
- `src/components/dashboard/ChatArea.tsx` — 10 logs (`[ChatArea] ...`)

### Mudanças
1. **`src/components/Pricing.tsx`** — remover as 5 chamadas `console.log('Pricing - ...')` (linhas 138, 146, 147, 152, 379), mantendo a lógica de fetch/set state intacta.
2. **`src/components/dashboard/ChatArea.tsx`** — remover as 10 chamadas `console.log('[ChatArea] ...')` mantendo toda a lógica de seleção de modelo e `hasAccess`.

Nenhum `console.error` será removido (esses são úteis para erros reais). Nenhuma lógica de negócio é alterada.

### Arquivos editados
- `src/components/Pricing.tsx`
- `src/components/dashboard/ChatArea.tsx`