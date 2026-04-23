

## Diagnóstico

Os logs novos mostram o cenário diferente dos anteriores:

```
PDF carregado: 9.97MB
Inicializando PDFium (base64)…
PDF tem 85 páginas — processando 85.
Página 1/85: 2160x1215, PNG 2943KB
Página 2/85: 2160x1215, PNG 2793KB
[error] CPU Time exceeded
```

A inicialização e o render funcionam — o problema agora é **volume**. Cada página leva ~1s entre render WASM + encode PNG + upload no bucket. 85 páginas × 1s = ~85s, muito acima do **CPU time limit** das edge functions do Supabase (≈10s para functions sem `verify_jwt = false` em planos sem boost). A função morre na página 2/85 e devolve 500.

Isso explica o toast no frontend: **"Falha ao processar catálogo: Edge Function returned a non-2xx status code"**.

Bonus: cada PNG está com **2.9MB**. No `RENDER_SCALE = 1.5` (~108 DPI) em página A4 horizontal vira 2160×1215. Para o Gemini "ler" produtos num catálogo, **não precisa** dessa resolução — 800–1000px no lado maior já é suficiente e reduz o PNG para ~300–500KB, cortando upload time pela metade.

## Solução: processamento em lotes com retomada

Em vez de tentar processar 85 páginas numa só invocação, a função passa a aceitar `startPage`/`pageBatch` e devolve `{ done, nextPage, processed, total }`. O frontend chama em loop até `done: true`.

### 1) Backend: `process-catalog-pdf` vira incremental

**Arquivo:** `supabase/functions/process-catalog-pdf/index.ts`

Mudanças principais:

- Aceitar no body: `{ catalogId, startPage?: number, batchSize?: number }`. Default `startPage=0`, `batchSize=8`.
- Reler `extracted_metadata` no início para retomar de onde parou (paths já uploadados ficam em `metadata.pages` e a contagem total em `metadata.total_pages`).
- Reduzir `RENDER_SCALE` de `1.5` para `1.0` (~72 DPI). Em catálogo médico, o tamanho do produto e texto continuam perfeitamente legíveis para o Gemini Pro, e o PNG cai de ~3MB para ~500KB.
- Após cada batch, fazer `update` em `extracted_metadata` com:
  - `pages: string[]` acumulado
  - `pages_count: number` acumulado
  - `total_pages: number` (total real do PDF)
  - `processing_complete: boolean`
- Resposta JSON:
  ```json
  {
    "ok": true,
    "done": false,
    "processed": 8,
    "total": 85,
    "next_page": 8
  }
  ```
  Quando `processed === total`, `done: true` e o `processing_complete` é gravado.

Detalhe técnico: PDFium precisa ser inicializado e o documento carregado a cada invocação (estado não persiste entre chamadas). O custo de bootstrap é ~1s — aceitável dentro de um batch.

### 2) Frontend: loop de batches no upload

**Arquivo:** `src/components/dashboard/prescription/UploadDropzone.tsx`

No `handleUpload` do catálogo PDF:

- Substituir a única chamada `supabase.functions.invoke('process-catalog-pdf', { body: { catalogId } })` por um **loop**:
  ```text
  startPage = 0
  loop:
    resp = invoke({ catalogId, startPage, batchSize: 8 })
    if resp.error → toast erro, break
    atualiza onChange com { pages_count: resp.processed, isProcessing: !resp.done }
    se resp.done → break
    startPage = resp.next_page
  ```
- Mostrar progresso real: "Processando páginas (X/Y)…" no card e no botão.
- Tratar erro de batch intermediário sem perder o que já foi processado (o backend já persistiu).

### 3) Botão "Gerar Receituário": estado de loading correto

**Arquivo:** `src/components/dashboard/prescription/PrescriptionView.tsx` (já existe a regra `pages_count > 0`)

Pequeno ajuste no texto:
- "Aguardando o processamento das páginas do catálogo…" → "Processando páginas do catálogo (X/Y)…" usando `value.pages_count` e `value.total_pages` quando disponíveis.

Habilitação do botão só quando `processing_complete === true` ou `pages_count === total_pages`.

### 4) Sem mudanças em `generate-prescription`
O contrato de leitura (`extracted_metadata.pages: string[]`) continua igual. Só passamos a popular ele incrementalmente em vez de "tudo de uma vez".

## Por que essa abordagem

- **Resolve a causa raiz** (CPU time exceeded) sem precisar mudar o plano da Cloud nem a infra do PDFium.
- **Tolerante a falhas**: se uma invocação morrer no meio, a próxima retoma do `next_page` correto.
- **UX honesta**: o usuário vê progresso real ("12/85 páginas processadas"), não um spinner cego que pode estourar timeout.
- **Reduz custo total** com a mudança de `RENDER_SCALE` para `1.0` — menos bytes para uploadar e menos memória por página.

## Validação após implementar

1. Reenviar o mesmo catálogo de 85 páginas / 9.97MB.
2. Logs esperados — uma sequência de invocações:
   ```text
   [batch 1] Inicializando PDFium… páginas 1–8 processadas. next=8
   [batch 2] Inicializando PDFium… páginas 9–16 processadas. next=16
   …
   [batch 11] páginas 81–85 processadas. done=true
   ```
3. No frontend: card do catálogo mostra progresso "8/85 → 16/85 → … → 85 páginas prontas", botão "Gerar Receituário" habilita ao final.
4. PNGs no bucket `prescription-files-pages` com tamanho ~300–700KB (não mais 3MB).

## Arquivos a alterar

- `supabase/functions/process-catalog-pdf/index.ts` — batch + retomada + scale 1.0
- `src/components/dashboard/prescription/UploadDropzone.tsx` — loop de chamadas + progresso real
- `src/components/dashboard/prescription/PrescriptionView.tsx` — texto/condição de habilitação do botão
- `mem://features/prescription-engine` — documentar processamento incremental

## Fora de escopo
- Sem mudanças em schema, RLS, buckets, `generate-prescription` ou `chat-ai`.

