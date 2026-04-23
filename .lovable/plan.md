

## Diagnóstico — `Unsupported image format for URL`

O log do erro é literal:

```
Unsupported image format for URL: https://...catalog.pdf
Supported formats: PNG, JPEG, WebP, GIF
For other formats, use a data URL with the MIME type specified.
```

**Causa raiz:** o Google AI Studio (provider do Gemini através do Lovable AI Gateway) aceita o tipo `image_url` apontando para uma **URL HTTP só quando o conteúdo é imagem** (PNG/JPEG/WebP/GIF). Para **PDF**, o provider exige `data:application/pdf;base64,...` — ou seja, base64 inline. Não existe equivalente "URL pública" para PDFs no provider via OpenAI-compatible layer.

A solução de signed URL funcionaria perfeitamente se o catálogo fosse imagem. Como é PDF, voltamos ao impasse:

| Tamanho do PDF | Problema |
|---|---|
| < 7 MB | Funciona via base64 inline |
| 7 MB – 16 MB | Estoura limite do `inline_data` do Gemini (erro 400 "Base64 decoding failed") |
| > 16 MB | Estoura RAM do edge function (256MB) ao gerar base64 |

O catálogo do usuário tem **9.97 MB** — exatamente na zona morta entre os dois limites.

## Solução definitiva — converter PDF do catálogo em imagens (uma por página) e mandar como `image_url` via signed URL

Como o provider aceita `image_url` apontando pra URL HTTP **quando é imagem**, vamos:

1. **No upload do catálogo** (não na hora de gerar receituário), processar o PDF e renderizar cada página como **WebP** (ou PNG) num bucket separado `prescription-files-pages/`.
2. Salvar a lista de paths das páginas no registro `prescription_catalogs.metadata.pages: string[]`.
3. Na hora de gerar receituário, em vez de anexar o PDF inteiro, **anexar cada página como `image_url` via signed URL**. Cada página renderizada em WebP fica em ~150–400 KB, então 50 páginas ≈ 15 MB, mas distribuídas em 50 partes pequenas — o Gemini aceita sem problema porque cada parte é uma imagem válida sob o limite de 7 MB.

### Por que isso é a solução certa
- Resolve **definitivamente** o problema do PDF grande sem depender de inline_data nem de URL pra PDF.
- O Gemini Pro multimodal entende imagens de páginas de PDF nativamente — qualidade de leitura é essencialmente idêntica ao PDF original.
- Memória do edge function fica constante: nunca materializa base64 do PDF inteiro de novo.
- Funciona pra catálogos de qualquer tamanho.
- Conversão acontece **uma única vez** no upload, não a cada geração de receituário.

### Alternativa considerada e descartada
Renderizar páginas no edge function de geração (sob demanda) — descartado porque:
- Renderizar PDF em runtime Deno é caro e instável (precisa de pdfium ou similar via WASM, ~30–60s para 30 páginas).
- Cada chamada de receituário pagaria esse custo de novo.
- Fazer no upload é "uma vez e pronto".

### Para o PRONTUÁRIO
Como o prontuário tipicamente é pequeno (< 1 MB), continua usando base64 inline normal. **Sem mudança.** Só o caminho do catálogo grande muda.

## Implementação

### 1. Nova edge function `process-catalog-pdf`
- Trigger: chamada pelo frontend logo após o upload do catálogo (antes de o usuário clicar em "Gerar Receituário").
- Lê o PDF do bucket `prescription-files`.
- Usa `pdfium-wasm` (`https://esm.sh/@hyzyla/pdfium`) para renderizar cada página em WebP a 150 DPI (~1200x1600 px, ~200 KB cada).
- Faz upload de cada página para `prescription-files-pages/{userId}/{catalogId}/page-{N}.webp`.
- Atualiza `prescription_catalogs.metadata = { pages: ['path1', 'path2', ...], pages_count: N, processed_at: timestamp }`.
- Para PDFs muito grandes (> 80 páginas), processa em batches sequenciais para não estourar memória.

### 2. Bucket novo
- `prescription-files-pages` (privado, mesmo padrão de RLS do `prescription-files`).

### 3. Mudança no frontend (`UploadDropzone.tsx`)
- Após upload do catálogo bem-sucedido, dispara `supabase.functions.invoke('process-catalog-pdf', { body: { catalogId } })`.
- Mostra estado "Processando catálogo..." enquanto roda.
- Bloqueia botão "Gerar Receituário" até `metadata.pages` existir.

### 4. Mudança em `generate-prescription/index.ts`
- Em `loadFile` para o catálogo: se `metadata.pages` existe, gera signed URL de cada página e devolve `LoadedFile` novo formato `{ pages: Array<{ signedUrl, mimeType: 'image/webp' }> }`.
- Em `attachIfMultimodal`: se o file tem `pages`, faz push de **uma `image_url` por página** no `userContent`.
- Remove a lógica de mandar PDF do catálogo via signed URL (que era o que quebrava).

### 5. Memória atualizada
- Atualizar `mem://features/prescription-engine` documentando: catálogo PDF é pré-processado em páginas WebP no upload; geração apenas anexa as páginas via signed URL.

## Validação pós-deploy

Testar com o catálogo de 9.97MB do log:
- Upload dispara `process-catalog-pdf` → gera N páginas WebP no novo bucket.
- "Gerar Receituário" anexa N `image_url` (signed URLs de WebP) ao payload.
- Logs esperados:
  ```
  Anexado CATÁLOGO multimodal — 47 páginas via signed URL (WebP)
  AI status: 200, finish_reason: stop
  ```
- Sem erro 400 do provider.
- Sem `Memory limit exceeded`.

## Arquivos alterados/criados

- **CRIAR** `supabase/functions/process-catalog-pdf/index.ts` — render PDF → WebP por página
- **CRIAR** bucket `prescription-files-pages` via migration + RLS
- **EDITAR** `supabase/functions/generate-prescription/index.ts` — usar páginas WebP em vez de PDF inline
- **EDITAR** `src/components/dashboard/prescription/UploadDropzone.tsx` — disparar processamento pós-upload
- **EDITAR** `src/components/dashboard/prescription/PrescriptionView.tsx` — desabilitar botão até processamento concluir
- **EDITAR** `mem://features/prescription-engine` — documentar nova arquitetura

