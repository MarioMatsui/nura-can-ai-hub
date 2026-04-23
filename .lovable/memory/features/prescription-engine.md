---
name: Prescription engine
description: Receituário+ — catálogo PDF é pré-renderizado em páginas JPEG no upload (process-catalog-pdf, EM LOTES de 3); geração anexa cada página como image_url via signed URL
type: feature
---

# Receituário+ engine — alinhamento com chat-ai

## Arquitetura
- Modelo: `google/gemini-2.5-pro`
- System: `MEDICAL_SYSTEM_PROMPT` + `PRESCRIPTION_TASK_LAYER` + `ATTACHMENT_PRIORITY_NOTE`
- One-shot (sem histórico)

## Catálogo PDF: pré-renderização em LOTES (CRÍTICO)

O Lovable AI Gateway repassa para o Gemini, que **só aceita `image_url` HTTP quando o conteúdo é imagem** (PNG/JPEG/WebP/GIF). Para PDF, exige base64 inline — que estoura RAM (256MB) e o limite de ~7MB do `inline_data`. Solução: renderizar cada página como **JPEG** e enviar como signed URL.

### Por que LOTES de 3?
Edge functions do Supabase têm CPU time limit de ~10s. Bootstrap PDFium em base64 leva ~3-4s. Cada página leva ~1-2s (render + encode JPEG + upload). Batch=3 → ~7-9s, com folga. PNG era inviável: ~1.5s só de encode + 1.4MB upload = batch=1 efetivo, estourava CPU.

- Body: `{ catalogId, startPage?: number, batchSize?: number }` (default `startPage=0`, `batchSize=3`).
- A cada chamada: inicializa PDFium (~3-4s), renderiza N páginas, encoda JPEG quality 80, faz upload, persiste progresso em `extracted_metadata`.
- Resposta: `{ ok, done, processed, total, next_page }`.
- Frontend chama em loop até `done: true`.

### Render
- `@hyzyla/pdfium@2.1.7/browser/base64` (WASM embutido — evita `createRequire` e fetch externo). `disableBase64Warning: true`.
- `RENDER_SCALE = 0.75` (~54 DPI, ~1080×608 em A4 horizontal). Suficiente para Gemini ler texto/produtos.
- Encode via `imagescript@1.2.17` (`Image.encodeJPEG(80)`). PDFium devolve bitmap RGBA → setado direto em `img.bitmap`.
- JPEGs ~150-300KB cada (vs PNG ~1.5MB).
- Cap defensivo: `MAX_PAGES = 200`.

### Persistência de progresso (`extracted_metadata`)
- `pages: string[]` — paths acumulados em `prescription-files-pages/{userId}/{catalogId}/page-NNN.jpg`
- `pages_count: number`
- `total_pages: number`
- `processing_complete: boolean` — gravado quando `next_page >= total_pages`
- `pages_render_scale: number`
- `pages_format: 'image/jpeg'` (legados podem ter `image/png` em paths `.png`)

Se `processing_complete && pages.length > 0` na entrada, retorna `done: true` imediatamente (cached).

### Bucket `prescription-files-pages`
- Privado, RLS por pasta `{user_id}/...` (mesmo padrão do `prescription-files`).
- Admins têm SELECT global.

### Geração (`generate-prescription`)
- Se `extracted_metadata.pages` existe, monta `LoadedFile.pages = [{ signedUrl, mimeType, path }]`. **mimeType detectado pela extensão**: `.png` → `image/png`, demais → `image/jpeg` (compat com catálogos antigos).
- `attachIfMultimodal`: quando há `pages`, faz push de **uma `image_url` por página** no `userContent`.
- Fallback: se não-PDF ou ainda não processado, cai no caminho legado de `loadFile`.

### Frontend
- `UploadDropzone`: após upload de catálogo PDF, chama `process-catalog-pdf` em **loop** (`while (!done)`) com `batchSize: 3`, atualizando `pages_count`/`total_pages`/`isProcessing` em cada batch. Mostra "Processando páginas (X/Y)…".
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
