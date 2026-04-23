

## Diagnóstico

A função `process-catalog-pdf` está falhando com:

```
@hyzyla/pdfium: wasmUrl, wasmBinary is required for browser environment.
```

**Causa:** o `esm.sh` serve o `@hyzyla/pdfium` no build "browser" para o Deno edge runtime. Esse build **não auto-carrega** o `.wasm` — exige que a gente passe `wasmUrl` ou `wasmBinary` explicitamente em `PDFiumLibrary.init()`. Como chamamos `init()` sem argumentos, ele aborta antes de processar qualquer página, e o frontend mostra "Falha ao processar páginas do catálogo. Tente reenviar."

A documentação oficial (`pdfium.js.org/docs/init-library`) deixa claro: em ambientes browser-like (incluindo Deno edge), é obrigatório fornecer o WASM.

## Solução

Carregar o binário `.wasm` do CDN do esm.sh **uma única vez por cold-start** da função e passá-lo como `wasmBinary` para o `init()`. Sem dependência adicional, sem mudança de biblioteca.

### Mudanças em `supabase/functions/process-catalog-pdf/index.ts`

1. Adicionar uma constante com a URL pública do `.wasm` da mesma versão fixada (`@hyzyla/pdfium@2.1.7`):
   ```ts
   const PDFIUM_WASM_URL = 'https://esm.sh/@hyzyla/pdfium@2.1.7/pdfium.wasm';
   ```
2. Cachear o binário em escopo de módulo para reaproveitar entre invocações no mesmo worker:
   ```ts
   let cachedWasm: ArrayBuffer | null = null;
   async function getPdfiumWasm(): Promise<ArrayBuffer> {
     if (cachedWasm) return cachedWasm;
     const res = await fetch(PDFIUM_WASM_URL);
     if (!res.ok) throw new Error(`Falha ao baixar PDFium WASM: ${res.status}`);
     cachedWasm = await res.arrayBuffer();
     return cachedWasm;
   }
   ```
3. Trocar a inicialização:
   ```ts
   const wasmBinary = await getPdfiumWasm();
   const library = await PDFiumLibrary.init({ wasmBinary });
   ```
4. Adicionar log claro: `console.log('PDFium WASM carregado: ', (wasmBinary.byteLength/1024/1024).toFixed(2), 'MB')`.

### Por que essa é a abordagem certa
- **Mínimo invasivo**: não troca biblioteca, não muda arquitetura, só corrige o init.
- **Estável em produção**: o esm.sh serve o `.wasm` da versão pinada — mesma origem do JS da lib, evitando incompatibilidade.
- **Performance**: o cache de módulo evita re-download a cada invocação dentro do mesmo cold-start. WASM tem ~3MB; download de uma vez por worker é trivial vs renderizar 50 páginas.
- **Memória**: 3MB de WASM cabe folgado nos 256MB do edge.

### Alternativas consideradas e descartadas
- `@hyzyla/pdfium/browser/cdn`: import alternativo que faz o auto-load do CDN. Funciona, mas o esm.sh às vezes serve esse subpath de forma inconsistente em Deno. Carregar o `.wasm` manualmente é mais previsível.
- Trocar para `pdfjs-serverless` (PDF.js): renderizar PDF para imagem com PDF.js em Deno exige um polyfill de `OffscreenCanvas` (`@napi-rs/canvas` ou similar) que não funciona em edge runtime. Descartado.

## Validação pós-deploy

Reenviar o catálogo de 9.97MB. Logs esperados:
```
PDF carregado: 9.97MB
PDFium WASM carregado: 2.95MB
PDF tem N páginas — processando N.
Página 1/N: 1240x1754, PNG XXKKB
…
✓ Catálogo {id} processado: N páginas
```

E no frontend, o botão "Gerar Receituário" passa de "Aguardando o processamento das páginas do catálogo…" para `N páginas prontas` e habilita.

## Arquivo alterado
- `supabase/functions/process-catalog-pdf/index.ts` — fornecer `wasmBinary` no `PDFiumLibrary.init()`.

Sem mudanças no frontend, no `generate-prescription`, no schema ou em RLS.

