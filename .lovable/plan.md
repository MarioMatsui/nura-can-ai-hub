

## Login e Cadastro com Google + Tela de Completar Cadastro

### Visão geral

Adicionar Google OAuth nas telas de Login e Cadastro, mantendo o formulário tradicional como está. Usuários que entrarem pelo Google passam por uma tela `/auth/completar-cadastro` para coletar CPF, data de nascimento e aceite dos termos. Enquanto não completarem, ficam bloqueados de usar o `/app` com uma barra fixa no topo direcionando para a tela de completar.

### Mudanças no banco

Migration nova adicionando ao `profiles`:
- `terms_accepted_at` (timestamptz, null) — registra aceite dos Termos + Privacidade.
- `profile_completed` (boolean, default false) — flag computada no momento do "Finalizar Cadastro".
- Atualizar `handle_new_user()` para popular `profile_completed = true` quando o cadastro tradicional já enviar CPF + birth_date (mantém usuários antigos e novos cadastros padrão sem ver a tela). Para signups via Google (sem CPF nos metadados), fica `false`.

### Google OAuth

Habilitar Google na Lovable Cloud usando o módulo gerenciado (`src/integrations/lovable`). Botão "Continuar com Google" será adicionado em:
- `src/pages/auth/Login.tsx`
- `src/pages/auth/SignUp.tsx`

Visual: botão `outline` largura total, ícone oficial do Google à esquerda, mesma altura `lg` dos botões atuais, separador "ou" entre o botão Google e o formulário, mantendo o gradient-card e identidade verde da Nuracan.

Após sucesso do OAuth: redirect para `/auth/login-callback` que decide:
- Se `profile.profile_completed === true` → `/app`.
- Caso contrário → `/auth/completar-cadastro`.

### Tela `/auth/completar-cadastro`

Nova página `src/pages/auth/CompletarCadastro.tsx`, mesmo wrapper visual de Login/SignUp (`gradient-card`, max-w-md, logo NuraCan no topo).

Conteúdo:
- Título "Completar Cadastro" + subtítulo de boas-vindas ("Olá, {primeiro_nome}! Faltam só alguns dados para você começar.").
- Campos:
  - **CPF** (obrigatório) — máscara `000.000.000-00`, validação cliente + servidor (mesma regra do SignUp).
  - **Data de nascimento** (obrigatório) — `<Input type="date">`, exige 18+.
  - **Nº de celular** (sem rótulo "opcional", sem asterisco) — input tel, salvo só se preenchido.
  - **Checkbox obrigatório**: "Aceito os Termos de Serviço e Política de Privacidade" com os dois textos como `<a>` para `#` (placeholders) abrindo em nova aba.
- Botão "Finalizar Cadastro" (`bg-primary`, mesmo estilo do "Criar Conta").

Submit chama nova edge function `complete-profile` (verify_jwt = true) que:
1. Valida CPF (formato + dígitos + unicidade vs outros profiles).
2. Valida idade ≥ 18.
3. Valida `accept_terms === true`.
4. UPDATE em `profiles`: `cpf`, `birth_date`, `phone` (se houver), `terms_accepted_at = now()`, `profile_completed = true`.
5. Sincroniza com Brevo (mesmo payload do `validate-signup`).
6. Retorna sucesso → frontend redireciona para `/app`.

### Bloqueio global de perfil incompleto

Criar hook `src/hooks/useProfileCompletion.ts` que carrega `profiles.profile_completed` para o usuário logado.

Em `src/pages/Dashboard.tsx`:
- No `checkAuth`, após `fetchProfile`, se `profile.profile_completed === false`, renderizar uma barra fixa no topo (acima do conteúdo do `/app`) com:
  - Texto: "Para iniciar seu uso da Nuracan você precisa **Completar seu cadastro**".
  - "Completar seu cadastro" como botão/link sublinhado que navega para `/auth/completar-cadastro`.
  - Estilo: `bg-primary text-primary-foreground`, fonte semi-bold, h-12, fixa no topo (z-50).
- Bloquear interações: o conteúdo do dashboard fica em um overlay desabilitado (`pointer-events-none opacity-50`) impedindo uso de chat, receituário, etc. A sidebar permanece visível mas seus botões ficam desabilitados.

### Validações e mensagens

- Mesmas mensagens de erro do SignUp atual (CPF inválido, menor de 18, CPF já cadastrado).
- Toast de sucesso "Cadastro finalizado com sucesso!" ao concluir.

### Arquivos

**Novos:**
- `src/pages/auth/CompletarCadastro.tsx`
- `src/pages/auth/LoginCallback.tsx` (decide rota pós-OAuth)
- `src/hooks/useProfileCompletion.ts`
- `supabase/functions/complete-profile/index.ts`
- Migration: adiciona `terms_accepted_at` + `profile_completed` em `profiles`, atualiza `handle_new_user()`.

**Editados:**
- `src/pages/auth/Login.tsx` — adicionar botão Google + separador.
- `src/pages/auth/SignUp.tsx` — adicionar botão Google + separador (formulário continua igual).
- `src/pages/Dashboard.tsx` — barra fixa de bloqueio quando `profile_completed === false`.
- `src/App.tsx` — rotas `/auth/completar-cadastro` e `/auth/login-callback`.
- `supabase/config.toml` — entrada `[functions.complete-profile] verify_jwt = true`.

### Nota sobre OAuth gerenciado

A integração será feita via `lovable.auth.signInWithOAuth("google", { redirect_uri: window.location.origin + "/auth/login-callback" })` usando o módulo gerenciado. Não precisa que você crie credenciais no Google Cloud — funciona out-of-the-box.

