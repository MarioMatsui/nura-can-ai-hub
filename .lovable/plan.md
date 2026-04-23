
## Diagnóstico

O erro atual já não é de bundle nem de autenticação. O backend chega a este ponto:

```text
PDF carregado: 9.97MB
Inicializando PDFium…
PDFium WASM carregado: 3.72MB
process-catalog-pdf fatal Error: createRequire only supports 'file://' URLs
Received 'https://esm.sh/@hyzyla/pdfium@2.1.7/deno/pdfium.mjs'
```

**Problema exato:** a função está importando o PDFium por URL remota do `esm.sh`:

```ts
import { PDFiumLibrary } from "https://esm.sh/@hyzyla/pdfium@2.1.7?target=deno";
```

Esse build remoto entra num caminho interno que usa `createRequire(import.meta.url)`. Em edge runtime, `import.meta.url` vira uma URL `https://...`, não `file://...`, então o módulo quebra antes de carregar o documento. Ou seja: o WASM até baixa, mas a lib falha no bootstrap.

## Solução

### 1) Trocar o entrypoint do PDFium para a variante base64
Em vez do build remoto `?target=deno`, usar o entrypoint próprio que já embute o WASM e não depende de `createRequire` nem de fetch manual do binário.

**Arquivo:** `supabase/functions/process-catalog-pdf/index.ts`

Trocar a importação do PDFium para o entrypoint equivalente a:

```ts
import { PDFiumLibrary } from "@hyzyla/pdfium/browser/base64";
```

No contexto da função, isso deve ser feito via um specifier compatível com o runtime de edge, evitando o módulo remoto atual.

### 2) Remover toda a lógica manual de `wasmBinary`
Como o entrypoint base64 já traz o binário embutido, remover:
- `PDFIUM_WASM_URL`
- `cachedWasm`
- `getPdfiumWasm()`
- `const wasmBinary = await getPdfiumWasm()`
- `PDFiumLibrary.init({ wasmBinary })`

E simplificar para:

```ts
const library = await PDFiumLibrary.init();
```

### 3) Manter o restante do pipeline igual
Não mudar:
- auth da função
- leitura do PDF do bucket
- render por página
- upload das páginas em `prescription-files-pages`
- persistência em `extracted_metadata.pages`

A arquitetura está correta; o problema está só no bootstrap da biblioteca de renderização.

### 4) Melhorar o erro exibido no frontend
Hoje o usuário só vê:

```text
Falha ao processar páginas do catálogo. Tente reenviar.
```

**Arquivo:** `src/components/dashboard/prescription/UploadDropzone.tsx`

Ajustar o catch do `process-catalog-pdf` para tentar mostrar a mensagem real retornada pela função (`message`/`error`) quando existir. Isso não corrige o bug principal, mas evita outro ciclo cego se surgir um próximo erro.

## Por que essa abordagem é a correta

- Elimina a causa real do erro atual: uso de `createRequire` em módulo remoto `https://...`
- Remove a dependência do fetch manual do `.wasm`
- Evita voltar ao problema anterior de “wasmBinary required”
- Mantém a solução de páginas renderizadas, que continua sendo a estratégia certa para catálogos PDF grandes

## Arquivos a alterar

- `supabase/functions/process-catalog-pdf/index.ts`
- `src/components/dashboard/prescription/UploadDropzone.tsx`

## Validação após implementar

1. Reenviar o mesmo catálogo.
2. Logs esperados:
   ```text
   Baixando PDF do catálogo …
   PDF carregado: 9.97MB
   Inicializando PDFium…
   PDF tem N páginas — processando N.
   Página 1/N: ...
   …
   ✓ Catálogo ... processado: N páginas
   ```
3. No frontend:
   - some o toast de falha
   - o card do catálogo passa a mostrar `N páginas prontas`
   - o botão `Gerar Receituário` fica habilitado

## Fora de escopo
- Sem mudanças em schema
- Sem mudanças em RLS
- Sem mudanças em `generate-prescription`
- Sem mudanças no fluxo de upload além da melhora de mensagem de erro
