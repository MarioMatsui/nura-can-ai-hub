# Corrigir erros de CSP e headers de segurança

## Problema

O console mostra três tipos de erros em `index.html`:

1. **`X-Frame-Options may only be set via HTTP header`** — A tag `<meta http-equiv="X-Frame-Options" content="DENY">` é inválida. Esse header só funciona via resposta HTTP, não via `<meta>`.
2. **`ERR_BLOCKED_BY_CLIENT` em `connect.facebook.net/fbevents.js`** — geralmente bloqueador de anúncios do usuário (não corrigível via código), mas a CSP atual também precisa de `script-src-elem` explícito.
3. **`Refused to load https://www.clarity.ms/...` violando CSP** — o Microsoft Clarity não está na whitelist da CSP atual, e como `script-src-elem` não está definido, o navegador faz fallback para `script-src` e bloqueia.

## Mudanças em `index.html`

### 1. Remover meta inválida
Excluir a linha:
```html
<meta http-equiv="X-Frame-Options" content="DENY">
```
(Mantemos `X-Content-Type-Options` e `referrer`, que são válidos via meta.)

### 2. Atualizar Content-Security-Policy

Adicionar `script-src-elem` explicitamente (espelhando `script-src`) e incluir `https://www.clarity.ms` e `https://*.clarity.ms` nas diretivas relevantes. Também adicionar Clarity em `connect-src` (envia dados via XHR/beacon) e em `img-src` já está coberto por `https:`.

Nova CSP:
```
default-src 'self';
script-src 'self' 'unsafe-inline' 'unsafe-eval' https://connect.facebook.net https://*.supabase.co https://www.googletagmanager.com https://www.clarity.ms https://*.clarity.ms;
script-src-elem 'self' 'unsafe-inline' https://connect.facebook.net https://*.supabase.co https://www.googletagmanager.com https://www.clarity.ms https://*.clarity.ms;
style-src 'self' 'unsafe-inline' https://fonts.googleapis.com;
font-src 'self' https://fonts.gstatic.com data:;
img-src 'self' data: blob: https: http:;
connect-src 'self' https://*.supabase.co wss://*.supabase.co https://api.brevo.com https://connect.facebook.net https://www.facebook.com https://*.lovableai.com https://*.lovable.app https://www.googletagmanager.com https://www.google-analytics.com https://www.clarity.ms https://*.clarity.ms;
frame-src 'self' https://js.stripe.com https://checkout.stripe.com https://www.googletagmanager.com;
object-src 'none';
base-uri 'self';
```

## Notas técnicas

- `ERR_BLOCKED_BY_CLIENT` em `fbevents.js` é tipicamente causado por bloqueadores de anúncios/privacidade do navegador do usuário e **não pode ser resolvido via código**. Após o fix da CSP, o script será carregado normalmente para usuários sem bloqueador.
- `X-Frame-Options` real (anti-clickjacking) precisa ser configurado no servidor de hospedagem (Lovable/CDN) — não é possível via tag `<meta>`. A CSP `frame-ancestors` seria a alternativa moderna, mas removeria a possibilidade de preview no editor Lovable, então deixaremos sem.
- Nenhuma alteração necessária em código React, edge functions ou banco de dados.

## Arquivos afetados
- `index.html`
