

## Corrigir erro "Não foi possível fazer logout" após completar cadastro com Google

### Causa raiz

Os logs do auth confirmam: o servidor está respondendo `403 session_not_found` ao `POST /logout`. Isso acontece porque a edge function `complete-profile`, ao chamar `auth.admin.updateUserById(userId, { password })` para definir a senha, **revoga todas as sessões existentes do usuário** (comportamento padrão do GoTrue ao alterar senha via admin API). O navegador continua com tokens antigos no `localStorage`, mas a sessão já não existe no servidor — então qualquer chamada autenticada (inclusive logout) retorna 403, e o `supabase.auth.signOut()` propaga esse erro como falha.

### Correção em duas frentes

**1. `supabase/functions/complete-profile/index.ts` — manter o usuário logado após definir senha**

Após o `auth.admin.updateUserById(userId, { password })` rodar com sucesso, gerar uma nova sessão válida usando `auth.admin.generateLink({ type: 'magiclink', email })` ou, mais direto, criar tokens via `auth.admin.createSession`-equivalente. Como a API admin do supabase-js v2 expõe `generateLink`, vamos:

- Chamar `supabase.auth.admin.generateLink({ type: 'magiclink', email: user.email })` para obter `properties.hashed_token`.
- Trocar esse token por uma sessão chamando o endpoint `/auth/v1/verify?token=...&type=magiclink` server-side e devolver `{ access_token, refresh_token }` no response da edge function.
- No frontend (`CompletarCadastro.tsx`), após receber sucesso, chamar `supabase.auth.setSession({ access_token, refresh_token })` antes de redirecionar para `/app`. Isso substitui os tokens revogados pelos novos válidos e garante que o próximo logout funcione.

**2. `handleLogout` defensivo — 3 arquivos**

Mesmo com a correção acima, qualquer cenário em que a sessão do servidor seja invalidada (expiração, troca de senha por outro caminho, revogação manual) causaria o mesmo bug. Tornar o logout resiliente:

```ts
const handleLogout = async () => {
  // Tenta logout no servidor primeiro
  const { error } = await supabase.auth.signOut();
  
  // Se a sessão já não existe no servidor, limpa só localmente
  if (error && (error as any).code === 'session_not_found') {
    await supabase.auth.signOut({ scope: 'local' });
    navigate('/');
    return;
  }
  
  if (error) {
    toast({ title: 'Erro', description: 'Não foi possível fazer logout', variant: 'destructive' });
    return;
  }
  
  navigate('/');
};
```

Aplicar em:
- `src/components/dashboard/UserProfileHeader.tsx`
- `src/components/dashboard/SettingsModal.tsx`
- `src/components/Header.tsx`

### Arquivos editados

- `supabase/functions/complete-profile/index.ts` — gerar e devolver nova sessão após atualizar senha.
- `src/pages/auth/CompletarCadastro.tsx` — aplicar nova sessão via `setSession` antes de redirecionar.
- `src/components/dashboard/UserProfileHeader.tsx` — logout defensivo.
- `src/components/dashboard/SettingsModal.tsx` — logout defensivo.
- `src/components/Header.tsx` — logout defensivo.

### Resultado

- Mario consegue sair normalmente agora (logout local limpa o storage mesmo se o servidor disser que a sessão não existe).
- Próximos usuários que completarem cadastro pelo Google ficam com sessão válida e não enfrentam o problema novamente.

