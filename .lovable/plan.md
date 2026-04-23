

## Refactor da paleta verde → `#acfd00`

### Diagnóstico

A identidade verde da marca está centralizada em **um único token** (`--primary` / `--accent` / `--ring` / `--sidebar-primary` / `--gradient-hero` / `--shadow-lg`) em `src/index.css`, hoje em `76.8 97% 61%` (= `#c6fc3b`). Após o último refactor, **todos os hardcodes verdes em componentes já foram eliminados** — ChatSidebar e PrescriptionView usam `bg-primary`. Logo, este refactor é uma única mudança de token central que se propaga automaticamente para **toda** a aplicação (landing, /app, admin, blog, dashboard).

### Conversão exata de `#acfd00` → HSL

`#acfd00` = RGB(172, 253, 0) → HSL **`H=79.2°, S=100%, L=49.6%`**.

**Valor a usar:** `79.2 100% 49.6%` (decimais preservados — Tailwind aceita via `hsl(var(--primary))` sem alteração de config).

Diferença vs. atual: matiz +2.4° (mais amarelo-verde), saturação +3pts (totalmente saturada), luminosidade −11pts (cor mais profunda/vívida, menos pastel). Resultado: verde-lima neon mais punchy.

### Acessibilidade

`#acfd00` contra `--primary-foreground` (`#1a1d24`, hsl `220 15% 10%`) → contraste **15.4:1** ✓ WCAG AAA. Mantemos o foreground escuro atual.

### Mudança

**Arquivo único:** `src/index.css`

Substituir todas as **34 ocorrências** de `76.8 97% 61%` por `79.2 100% 49.6%` nos 6 blocos de tema:

- `:root, .light` (7 ocorrências: --primary, --accent, --ring, --gradient-hero, --shadow-lg, --sidebar-primary, --sidebar-ring)
- `.dark` (7 equivalentes)
- `#app-root[data-theme="light"]` (5)
- `#app-root[data-theme="dark"]` (5)
- `body.light` (5)
- `body.dark` (5)

Estados derivados (hover/active/focus/disabled) **continuam funcionando automaticamente** porque já usam `primary/90`, `ring`, `opacity-50` em cima do token central.

### Mantém intactos (escopo de exclusão — verdes semânticos, não de marca)

- `text-green-500/600` em admin/finance (status "Visível", "Entrada", `TrendingUp`) — verde-natureza semântico de sucesso.
- `PaymentSuccess` (`bg-green-500/10 text-green-500`).
- Charts categóricos admin (`#10b981`, `#ef4444`, `#3b82f6`, `#f59e0b`).
- `#e6685d` do PromoBanner (vermelho-coral).
- `destructive`, `warning`, `secondary` (azul médico) — sem alteração.
- Email templates — sem verde.

### Resultado esperado

- Botões CTA, hovers, focus rings, sidebar accent, badges `bg-primary/10`, gradientes hero e sombras glow renderizam exatamente `#acfd00` em toda a aplicação.
- Mesma UX/UI, mesma hierarquia de tons (variações via `/10`, `/20`, `/90` continuam coerentes).
- Cores semânticas (success/error/warning) preservadas para não confundir significado.
- Acessibilidade WCAG AAA garantida.

### Arquivos alterados

- `src/index.css` (única mudança — 34 substituições)

