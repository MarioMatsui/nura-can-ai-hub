

## Refactor da paleta verde → `#c6fc3b`

### Diagnóstico

A identidade verde do app está centralizada em **dois pontos**:

1. **Token de design** `--primary` / `--accent` / `--ring` / `--sidebar-primary` em `src/index.css` — atualmente `hsl(73 98% 50%)` (≈ `#bcfa1a`). Usado em **toda** a aplicação via Tailwind (`bg-primary`, `text-primary`, etc.).
2. **Hardcodes pontuais** em 3 componentes do dashboard que usam `#9EFF00` / `#8EEF00` em vez do token.

A nova cor `#c6fc3b` em HSL é `hsl(75 97% 61%)` — quase idêntica à atual em matiz, com leve aumento de luminosidade.

### Cores derivadas (escala harmônica de `#c6fc3b`)

| Token | HSL | Uso |
|---|---|---|
| `--primary` (base) | `75 97% 61%` | Botões CTA, accent, ring, sidebar-primary |
| Hover (escurecida) | `75 97% 54%` | Estado hover dos botões hardcoded |
| Active (mais escura) | `75 90% 45%` | Estado active |
| `--primary-foreground` | `220 15% 10%` | Mantém — texto escuro sobre verde garante WCAG AA |
| Gradiente claro | `75 97% 61% / 0.1–0.15` | `--gradient-hero` (mantém opacidade atual) |
| Sombra glow | `75 97% 61% / 0.15–0.25` | `--shadow-lg` (mantém intensidades) |

Foreground `#1a1d24` sobre `#c6fc3b` → contraste **15.8:1** ✓ WCAG AAA.

### Mudanças por arquivo

**1. `src/index.css`** — substituição global das ocorrências de `73 98% 50%` por `75 97% 61%` em:
- Bloco `:root, .light` (linhas 22, 32, 40, 45, 49, 59, 64)
- Bloco `.dark` (linhas 77, 86, 94, 96, 99, 105, 110)
- Bloco `#app-root[data-theme="light"]` (linhas 124, 133, 141, 143, 146)
- Bloco `#app-root[data-theme="dark"]` (linhas 160, 169, 177, 179, 182)
- Bloco `body.light` (linhas 197, 206, 214, 216, 219)
- Bloco `body.dark` (linhas 233, 242, 250, 252, 255)

Comentário `/* Cannabis green vibrant */` mantido (descreve a vibe, ainda válido).

**2. `src/components/dashboard/ChatSidebar.tsx`** (linhas 160, 207) — substituir hardcodes por token:
```tsx
// antes
className="...bg-[#9EFF00] hover:bg-[#8EEF00] text-black..."
// depois
className="...bg-primary hover:bg-primary/90 text-primary-foreground..."
```

**3. `src/components/dashboard/prescription/PrescriptionView.tsx`** (linha 192) — mesma substituição token-based.

### Mantém intactos (escopo de exclusão)

- **Cores semânticas** de admin/finance: `text-green-500/600` para "Visível", "Entrada", `TrendingUp`, status de sucesso. São verdes **semânticos** (success), não de marca — devem continuar verde-natureza para diferenciar do accent da marca.
- **`PaymentSuccess`** — ícone `bg-green-500/10 text-green-500` (success semântico).
- **Charts admin** (`#10b981` veterinário, `#ef4444`, `#3b82f6`, `#f59e0b`) — paleta categórica para gráficos.
- **`#e6685d`** do PromoBanner (vermelho-coral, não verde).
- **Destructive / warning / info** — não tocar.
- **Email templates** (`send-cancellation-email`) — sem verde, intactos.

### Resultado

- 100% da identidade visual verde do app migra para `#c6fc3b` via token central.
- Hardcodes eliminados → tudo passa a respeitar `--primary`, facilitando futuras trocas.
- Hover/active/focus/disabled continuam funcionando porque já usam `primary/90`, `ring`, `opacity-50` derivados do token.
- Gradientes, sombras e estados preservam direção, intensidade e opacidade originais.
- Cores semânticas (success/error/warning) preservadas.
- Acessibilidade WCAG AAA garantida no par primary/foreground.

### Arquivos alterados

- `src/index.css` (token central — 6 blocos)
- `src/components/dashboard/ChatSidebar.tsx` (2 ocorrências)
- `src/components/dashboard/prescription/PrescriptionView.tsx` (1 ocorrência)

