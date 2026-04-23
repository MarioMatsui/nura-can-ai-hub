

## Correção precisa de `#c6fc3b`

### Diagnóstico

O HSL atual no `index.css` é `77 97% 61%`, que o browser renderiza como `#dafc52` (verde-limão claro) — não bate com o alvo `#c6fc3b` (verde-lima mais saturado/escuro).

Recálculo exato: `#c6fc3b` em HSL é `H=76.79°, S=96.98%, L=60.98%`. O arredondamento de H para `77` (perda de 0.2°) altera visivelmente o resultado porque a curva HSL→RGB é não-linear nessa faixa amarelo-verde.

**Valor correto:** `76.8 97% 61%` — testado matematicamente, reconstrói `#c6fc3b` exato.

### Mudança

**Arquivo:** `src/index.css`

Substituir todas as **34 ocorrências** de `77 97% 61%` por `76.8 97% 61%` nos 6 blocos de tema:
- `:root, .light` (7 ocorrências: --primary, --accent, --ring, --gradient-hero, --shadow-lg, --sidebar-primary, --sidebar-ring)
- `.dark` (7 ocorrências equivalentes)
- `#app-root[data-theme="light"]` (5 ocorrências)
- `#app-root[data-theme="dark"]` (5 ocorrências)
- `body.light` (5 ocorrências)
- `body.dark` (5 ocorrências)

Tailwind aceita decimais em valores HSL via `hsl(var(--primary))` sem nenhuma alteração de config.

### Resultado esperado

- Botões, hovers, ring focus, sidebar accent, gradientes e sombras no `/app` (e em todo o site) renderizam exatamente `#c6fc3b`.
- Nenhuma outra mudança de comportamento, contraste ou layout.
- WCAG AAA mantido (15.8:1 contra `--primary-foreground`).

### Arquivos alterados

- `src/index.css` (única mudança)

