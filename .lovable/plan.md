

## Corrigir exibição de mensagens de erro no Completar Cadastro

### Problema

Quando a edge function `complete-profile` retorna status 400 (CPF duplicado, CPF inválido, menor de 18, etc.), o frontend exibe apenas "Edge Function returned a non-2xx status code" em vez da mensagem real ("Este CPF já está cadastrado.", etc.).

Causa: `supabase.functions.invoke` envolve respostas não-2xx em um `FunctionsHttpError` genérico e o corpo JSON com o campo `error` precisa ser lido via `error.context.json()`.

Caso concreto: o CPF `02510905821` digitado pelo usuário Mario já pertence à conta `luis.claudio.azevedo.silva@gmail.com`. A função retornou corretamente 400 — só a UX que ficou ruim.

### Mudanças

**`src/pages/auth/CompletarCadastro.tsx`** — no `onSubmit`, ao detectar erro do `invoke`, ler o corpo da resposta para extrair a mensagem real:

```ts
if (error) {
  let message = "Erro ao finalizar cadastro.";
  try {
    const ctx: any = (error as any).context;
    if (ctx && typeof ctx.json === "function") {
      const body = await ctx.json();
      if (body?.error) message = body.error;
    } else if (ctx?.body) {
      const body = JSON.parse(ctx.body);
      if (body?.error) message = body.error;
    }
  } catch {/* ignore */}
  toast.error(message);
  return;
}
```

Isso garante que mensagens como "Este CPF já está cadastrado.", "CPF inválido. Por favor, verifique o número informado.", "Você deve ter pelo menos 18 anos." sejam exibidas corretamente no toast.

### Observação para o usuário

O erro que você está vendo é real: o CPF `02510905821` já está em uso por outra conta no sistema. Após esta correção, você verá a mensagem clara "Este CPF já está cadastrado." e poderá:
- Conferir se digitou seu CPF correto, ou
- Caso aquela outra conta seja sua, fazer login nela em vez de completar este novo cadastro.

### Arquivos editados

- `src/pages/auth/CompletarCadastro.tsx`

