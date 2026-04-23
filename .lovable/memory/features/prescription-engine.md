---
name: Prescription engine
description: Receituário+ — catálogo PDF é pré-renderizado em páginas PNG no upload (process-catalog-pdf, EM LOTES); geração anexa cada página como image_url via signed URL
type: feature
---

# Receituário+ engine — alinhamento com chat-ai

## Arquitetura
- Modelo: `google/gemini-2.5-pro`
- System: `MEDICAL_SYSTEM_PROMPT` + `PRESCRIPTION_TASK_LAYER` + `ATTACHMENT_PRIORITY_NOTE`
- One-shot (sem histórico)

## Catálogo PDF: pré-renderização em LOTES (CRÍTICO)

O Lovable AI Gateway repassa para o Gemini, que **só aceita `image_url` HTTP quando o conteúdo é imagem** (PNG/JPEG/WebP/GIF). Para PDF, exige base64 inline — que estoura RAM (256MB) e o limite de ~7MB do `inline_data`. Solução: renderizar cada página como PNG e enviar como signed URL.

### Por que LOTES?
Edge functions do Supabase têm CPU time limit de ~10s. Renderizar 80+ páginas numa única invocação estoura o limite (`CPU Time exceeded`) e a função morre na 2ª/3ª página. Por isso `process-catalog-pdf` virou **incremental**:

- Body: `{ catalogId, startPage?: number, batchSize?: number }` (default `startPage=0`, `batchSize=8`).
- A cada chamada: inicializa PDFium (~1s), renderiza N páginas, faz upload, persiste progresso em `extracted_metadata`.
- Resposta: `{ ok, done, processed, total, next_page }`.
- Frontend chama em loop até `done: true`.

### Render
- `@hyzyla/pdfium@2.1.7/browser/base64` (WASM embutido — evita `createRequire` e fetch externo).
- `RENDER_SCALE = 1.0` (~72 DPI). PNGs ~300-700KB. Suficiente para Gemini ler texto/produtos. Antes era 1.5 → PNGs de 3MB → batches estouravam.
- Encode via `deno.land/x/pngs` (WASM puro).
- Cap defensivo: `MAX_PAGES = 200`.

### Persistência de progresso (`extracted_metadata`)
- `pages: string[]` — paths acumulados em `prescription-files-pages/{userId}/{catalogId}/page-NNN.png`
- `pages_count: number`
- `total_pages: number`
- `processing_complete: boolean` — gravado quando `next_page >= total_pages`
- `pages_render_scale: number`

Se `processing_complete && pages.length > 0` na entrada, retorna `done: true` imediatamente (cached).

### Bucket `prescription-files-pages`
- Privado, RLS por pasta `{user_id}/...` (mesmo padrão do `prescription-files`).
- Admins têm SELECT global.

### Geração (`generate-prescription`)
- Se `extracted_metadata.pages` existe, monta `LoadedFile.pages = [{ signedUrl, mimeType: 'image/png', path }]` e pula extração via Flash.
- `attachIfMultimodal`: quando há `pages`, faz push de **uma `image_url` por página** no `userContent`.
- Fallback: se não-PDF ou ainda não processado, cai no caminho legado de `loadFile`.

### Frontend
- `UploadDropzone`: após upload de catálogo PDF, chama `process-catalog-pdf` em **loop** (`while (!done)`), atualizando `pages_count`/`total_pages`/`isProcessing` em cada batch. Mostra "Processando páginas (X/Y)…".
- `PrescriptionView`: botão "Gerar Receituário" só habilita quando `pages_count > 0` (e não-isProcessing). Texto auxiliar mostra progresso real "Processando páginas do catálogo (X/Y)…".
- Tipo `UploadedFile` inclui `total_pages?: number`.

## Prontuário (sem mudança)
Continua via `loadFile` normal — base64 inline para < 2MB, signed URL para > 2MB.

## RAG médico
- `searchMedicalKnowledgeBase` com `TERM_ALIASES`, `generateSearchQueries`, `sanitizeSearchTerm`.
- Cada termo sanitizado antes do `.or(content.ilike...)`.
- Top 8 chunks, 8000 chars cada.

## Parâmetros de inferência
- `max_tokens: 8000`, sem `temperature` fixa.

## Não tocar
- `chat-ai` permanece intacto.
- RLS dos buckets `prescription-files`, `prescription-files-pages` e tabelas `prescription_*`.
- Contrato de leitura de `extracted_metadata.pages` em `generate-prescription`.
