

## Corrigir hover do texto do perfil disparando ao passar pela sidebar inteira

### Diagnóstico

O componente `Sidebar` (em `src/components/ui/sidebar.tsx`, linha 176) usa `className="group peer hidden text-sidebar-foreground md:block"` — um **`group` sem nome** que envolve toda a barra lateral.

No `UserProfileHeader.tsx`, o texto do nome e o texto do plano usam:
```tsx
className="... group-hover:text-black dark:group-hover:text-black ..."
```

`group-hover:` (sem nome) casa com o **ancestral mais próximo com classe `group`**. Como o `<Sidebar>` tem `group` sem nome **acima** do botão do perfil (que também tem `group`, mas o Tailwind aplica utilitários `group-hover:` baseado no estado hover de qualquer ancestral marcado), o resultado é que **passar o cursor em qualquer lugar da sidebar** (lista de chats, área vazia, etc.) já dispara `:hover` no `<Sidebar>` e ativa `group-hover:text-black` nos textos do perfil.

Por isso o nome do usuário e o nome do plano mudam de cor mesmo sem o cursor estar sobre o card do perfil.

### Solução

Usar um **grupo nomeado** isolado no próprio botão do perfil, para que `group-hover:` só dispare quando o hover acontecer sobre o botão e não sobre qualquer ancestral.

#### `src/components/dashboard/UserProfileHeader.tsx`

No bloco expandido (linhas 177–190):

- Trocar no botão: `group` → `group/profile`
- Trocar no Avatar: `group-hover:ring-primary/20` → `group-hover/profile:ring-primary/20`
- Trocar no nome (linha 183): `group-hover:text-black dark:group-hover:text-black` → `group-hover/profile:text-black dark:group-hover/profile:text-black`
- Trocar no plano (linha 186): `group-hover:text-black/70 dark:group-hover:text-black/70` → `group-hover/profile:text-black/70 dark:group-hover/profile:text-black/70`

O modo collapsed (avatar como ícone) não tem esse problema porque não usa `group-hover:` em texto, mas vou auditar para confirmar e manter consistência.

### Garantias

- **Hover do texto do perfil:** só muda de cor quando o cursor está literalmente sobre o card do perfil (background do botão + texto + avatar ring mudam juntos, como esperado).
- **Hover em outras áreas da sidebar (lista de chats, área vazia, botões "Nova Consulta", "Buscar em chats", "Receituário +"):** zero efeito sobre o perfil.
- **Modo collapsed:** sem mudança visual.
- **Zero impacto** em qualquer outro componente — a mudança é local ao `UserProfileHeader.tsx`.

### Arquivo

- **Editado:** `src/components/dashboard/UserProfileHeader.tsx` — converter `group` / `group-hover:` em `group/profile` / `group-hover/profile:` no bloco do botão expandido (linhas 177–190).

