## Mudança
Em `src/components/Pricing.tsx` (span do preço antigo riscado dentro de `getDisplayPrice`):
- Trocar `text-white/50` por `text-muted-foreground dark:text-white/50` para que no light mode apareça em cinza e no dark mode mantenha o branco translúcido atual.

## Arquivos alterados
- `src/components/Pricing.tsx`
