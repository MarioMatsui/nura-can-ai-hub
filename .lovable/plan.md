

## Diagnóstico real

Os logs mostram o erro continuando **mesmo com a correção anterior aplicada**:

```
PDF carregado: 9.97MB
Inicializando PDFium…
ERROR @hyzyla/pdfium: wasmUrl, wasmBinary is required for browser environment.
```

Note que o log `PDFium WASM carregado: …MB` **não aparece** entre `Inicializando PDFium…` e o erro. Isso é decisivo: significa que `await getPdfiumWasm()` nem chega a retornar antes do `PDFiumLibrary.init()` estourar — porque o erro não vem do nosso `init({ wasmBinary })`, vem do **import do módulo** (`PDFiumLibrary.initBase` em `pdfium.mjs:6:329`), que executa código de bootstrap antes mesmo da nossa primeira chamada.

### Causa raiz

O build `denonext/pdfium.mjs` que o `esm.sh` serve detecta o ambiente como "browser" por causa de duas coisas combinadas:

1. **`import "https://deno.land/x/xhr@0.1.0/mod.ts";`** na linha 12 — esse polyfill antigo injeta globals tipo `XMLHttpRequest` no escopo. O `pdfium.mjs` faz `typeof XMLHttpRequest !== 'undefined'` para decidir se está em browser.
2. Mesmo passando `{ wasmBinary }` em `init()`, o caminho "browser" do `initBase` reage à presença desses globals **antes** de checar nossas opções, abortando.

A correção anterior (`wasmBinary`) era necessária mas **não suficiente** — ela só vale se o módulo aceitar entrar no caminho "Deno". Enquanto o polyfill `xhr` estiver carregado, o pdfium acha que é browser e cobra `wasmUrl`.

### Por que o `xhr` polyfill está aí

É herança de templates antigos do Supabase Edge Functions (Deno 1.x). No runtime atual (Deno 2.x usado pelo edge), `fetch` e tudo mais já existe nativamente. O polyfill é **inútil** e está ativamente prejudicando.

## Solução

Duas mudanças mínimas em `supabase/functions/process-catalog-pdf/index.ts`:

### 1. Remover o polyfill `xhr`
Apagar a linha:
```ts
import "https://deno.land/x/xhr@0.1.0/mod.ts";
```
Sem ele, `typeof XMLHttpRequest === 'undefined'`, o pdfium entra no caminho Deno e aceita `wasmBinary` normalmente.

### 2. Trocar o specifier do pdfium para `npm:` (mais estável)
Trocar:
```ts
import { PDFiumLibrary } from "https://esm.sh/@hyzyla/pdfium@2.1.7";
```
Por:
```ts
import { PDFiumLibrary } from "npm:@hyzyla/pdfium@2.1.7";
```

Por quê: o specifier `npm:` no Deno Edge usa o resolver oficial do Deno, que escolhe automaticamente o build server-side correto da lib (não o `denonext/` do esm.sh, que é ambíguo) e empacota o `.wasm` adjacente. Isso elimina inclusive a necessidade do `getPdfiumWasm()` manual — o `init()` sem argumentos passa a funcionar.

### 3. Simplificar `init()` 
Como o `npm:` resolve o WASM nativamente, podemos voltar ao mais simples:
```ts
const library = await PDFiumLibrary.init();
```

E **remover** as constantes `PDFIUM_WASM_URL`, `cachedWasm` e a função `getPdfiumWasm()` — ficam mortas.

### Fallback se `npm:` falhar
Se por algum motivo o specifier `npm:` não funcionar no edge runtime do Lovable, voltamos a `https://esm.sh/...` mas mantemos o `xhr` removido e o `getPdfiumWasm()` no lugar — só a remoção do polyfill já deve destravar o erro.

## Validação pós-deploy

Reenviar o catálogo de 9.97MB. Logs esperados:
```
Baixando PDF do catálogo …
PDF carregado: 9.97MB
Inicializando PDFium…
PDF tem N páginas — processando N.
Página 1/N: 1240x1754, PNG XXX KB
…
✓ Catálogo {id} processado: N páginas
```

Frontend: o card do catálogo passa de "Processando páginas…" para "N páginas prontas" e o botão "Gerar Receituário" habilita.

## Arquivo alterado

- `supabase/functions/process-catalog-pdf/index.ts` — remover polyfill `xhr`, trocar specifier para `npm:`, simplificar `init()`.

Sem mudanças em frontend, schema, RLS ou em outras edge functions.

