# Toggle global: "Exibir seletor de modelo no app"

## 1. Banco de dados (nova migration)

Criar tabela genérica `app_settings` para abrigar feature flags globais (preparada para futuras flags):

```sql
CREATE TABLE public.app_settings (
  key text PRIMARY KEY,
  value jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;

-- Leitura pública (config global, não sensível)
CREATE POLICY "app_settings readable by everyone"
  ON public.app_settings FOR SELECT USING (true);

-- Escrita apenas admin
CREATE POLICY "app_settings writable by admin"
  ON public.app_settings FOR ALL
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Seed: começa OCULTO (fail-safe)
INSERT INTO public.app_settings (key, value)
VALUES ('show_model_selector', 'false'::jsonb)
ON CONFLICT (key) DO NOTHING;

-- Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.app_settings;
```

## 2. Hook `useAppSettings`

`src/hooks/useAppSettings.ts` — fetch + realtime subscribe na tabela `app_settings`, expõe `getFlag(key, fallback)` e `isLoading`.

## 3. Anti-flicker no `/app`

No `src/pages/Dashboard.tsx`:
- Adicionar `appSettingsLoading` ao `Promise.all` em `checkAuth` (junto com profile/conversations/subscriptions). O `setLoading(false)` só ocorre quando todas as configs chegaram → header do `ChatArea` só monta após config carregada. Isso elimina flicker.
- Passar `showModelSelector` como prop para `ChatArea`.

No `src/components/dashboard/ChatArea.tsx` (linhas 344-353):
- Envolver o `<DropdownMenu>` inteiro com `{showModelSelector && (...)}`.
- Default seguro: `false` se config falhar.

## 4. Admin UI

Em `src/components/admin/PlanManagement.tsx`, adicionar um Card no topo (antes do warning amarelo) com título "Configurações Globais" contendo o `Switch`:
- Label: "Exibir seletor de modelo no app"
- Descrição: "Quando desativado, o dropdown de seleção de modelo não aparece no /app."
- Usa `useAppSettings` + função `setFlag('show_model_selector', bool)` (upsert na tabela).

## 5. Fail-safe

- Hook retorna `false` enquanto carrega e em caso de erro.
- RLS pública garante leitura mesmo para usuários não autenticados (caso futuro).
- Migration faz seed com `false` por padrão.

## Arquivos alterados

- nova migration SQL (tabela `app_settings` + RLS + seed + realtime)
- `src/hooks/useAppSettings.ts` (novo)
- `src/pages/Dashboard.tsx` (preload da config + prop)
- `src/components/dashboard/ChatArea.tsx` (render condicional do dropdown + prop)
- `src/components/admin/PlanManagement.tsx` (UI do toggle)
