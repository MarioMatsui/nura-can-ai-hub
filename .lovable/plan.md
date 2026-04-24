

## Adicionar criação de senha no Completar Cadastro + Login híbrido

### Visão geral

Adicionar campo de senha no formulário de Completar Cadastro. Ao finalizar, além de salvar CPF/data/termos, definir uma senha no usuário (via `auth.admin.updateUserById`), o que habilita login por email+senha mantendo o mesmo `user_id` da conta Google. Sem tabela própria, sem hash manual — o Supabase Auth já cuida do hash com bcrypt.

### Como funciona o login híbrido

O Supabase Auth permite que um único usuário (mesmo `auth.users.id`) tenha múltiplas identidades vinculadas — neste caso `google` (criada no OAuth) e `email` (criada quando setamos a senha). O vínculo é automático pelo mesmo `id`. Resultado:
- Login Google → continua funcionando.
- Login email+senha → passa a funcionar com o mesmo email do Google e a senha definida no Completar Cadastro.
- É o mesmo usuário no banco, sem duplicação.

### Mudanças no frontend

**`src/pages/auth/CompletarCadastro.tsx`**

1. Adicionar campo `password` no schema Zod com regras:
   - Obrigatório (mínimo 1 caractere).
   - Pelo menos 1 letra maiúscula (`/[A-Z]/`).
   - Pelo menos 1 número (`/[0-9]/`).
   - Mensagens de erro no padrão atual (FormMessage).

2. Adicionar novo `<FormField name="password">` posicionado **abaixo de "Nº de celular"** e **acima do checkbox de termos**.

3. Input de senha customizado:
   - Wrapper `<div className="relative">`.
   - `<Input type={showPassword ? "text" : "password"} className="pr-10" />` — mantém visual idêntico aos demais inputs.
   - Botão ícone absoluto à direita (`absolute right-2 top-1/2 -translate-y-1/2`) com ícones `Eye` / `EyeOff` do `lucide-react`.
   - Estado inicial: `showPassword = true` (olho aberto, senha visível).
   - Ao clicar, alterna `showPassword`.

4. Enviar `password` no body do `invoke("complete-profile", ...)`.

### Mudanças no backend

**`supabase/functions/complete-profile/index.ts`**

1. Adicionar `password: string` na interface `CompleteProfileData`.
2. Validar no servidor:
   - `typeof password === "string"` e não vazia.
   - Regex `/[A-Z]/` e `/[0-9]/`.
   - Retornar 400 com mensagem clara se falhar.
3. **Após** o `UPDATE` em `profiles` ter sucesso, chamar:
   ```ts
   await supabase.auth.admin.updateUserById(userId, { password: data.password });
   ```
   Isso usa o `service_role` client já criado e cria/atualiza a credencial email+password do usuário, vinculando a identidade `email` ao mesmo `auth.users.id` (que já tem a identidade `google`). O Supabase faz o hash bcrypt internamente.
4. Se `updateUserById` falhar, retornar 500 com mensagem "Erro ao definir senha. Tente novamente." e fazer rollback do `profile_completed = false` para o usuário poder tentar de novo.

### Banco de dados

**Nenhuma migration necessária.** O Supabase Auth já tem `auth.users.encrypted_password` e gerencia a vinculação de identidades automaticamente via `auth.identities`. Não criamos coluna `password_hash` na tabela `profiles` (seria insegurança e duplicação).

### Segurança

- Senha trafega via HTTPS, validada cliente + servidor.
- Hash gerado pelo Supabase Auth (bcrypt) — nunca tocamos texto puro depois do `updateUserById`.
- A função usa `service_role` apenas no backend, autenticada pelo JWT do usuário (já implementado).
- Senha não é logada em nenhum `console.log`.

### Validações recapituladas

Frontend e backend bloqueiam o submit se faltar:
- CPF válido
- Data de nascimento (≥18)
- Senha com maiúscula + número
- Checkbox de termos marcado

### Arquivos editados

- `src/pages/auth/CompletarCadastro.tsx` — campo senha + ícone olho + envio do password.
- `supabase/functions/complete-profile/index.ts` — validação de senha + `auth.admin.updateUserById`.

### Resultado

Usuário Google entra em Completar Cadastro, define CPF/data/celular/senha/termos, finaliza. A partir desse momento pode logar tanto com Google quanto com email+senha — mesmo `user_id`, mesma conta.

