---
name: Prescription engine
description: Receituário+ — catálogo PDF é pré-renderizado em páginas PNG no upload (process-catalog-pdf); geração anexa cada página como image_url via signed URL
type: feature
---

# Receituário+ engine — alinhamento com chat-ai

## Arquitetura
- Modelo: `google/gemini-2.5-pro`
- System: `MEDICAL_SYSTEM_PROMPT` + `PRESCRIPTION_TASK_LAYER` + `ATTACHMENT_PRIORITY_NOTE`
- One-shot (sem histórico)

## Catálogo PDF: pré-renderização obrigatória (CRÍTICO)

O Lovable AI Gateway repassa para o Gemini, que **só aceita `image_url` HTTP quando o conteúdo é imagem** (PNG/JPEG/WebP/GIF). Para PDF, exige `data:application/pdf;base64,...` — que estoura RAM (256MB) e o limite de ~7MB do `inline_data` em catálogos médios. Resultado: PDFs de catálogo entre 7MB e 16MB ficam numa "zona morta" sem solução inline.

**Solução:** ao subir um catálogo PDF, o frontend dispara `process-catalog-pdf` (edge function), que:
1. Baixa o PDF do bucket `prescription-files`.
2. Usa `@hyzyla/pdfium` (WASM) para renderizar cada página como bitmap RGBA em escala 1.5 (~108 DPI).
3. Codifica via `deno.land/x/pngs` (WASM puro) e faz upload de cada página em `prescription-files-pages/{userId}/{catalogId}/page-NNN.png`.
4. Persiste a lista em `prescription_catalogs.extracted_metadata.pages: string[]` + `pages_count`.

Cap de segurança: 120 páginas por catálogo. Se já há páginas processadas, retorna cached.

### Bucket `prescription-files-pages`
- Privado, RLS por pasta `{user_id}/...` (mesmo padrão do `prescription-files`).
- Admins têm SELECT global.

### Geração (`generate-prescription`)
- Se `extracted_metadata.pages` existe, monta `LoadedFile.pages = [{ signedUrl, mimeType: 'image/png', path }]` e pula extração via Flash.
- `attachIfMultimodal`: quando há `pages`, faz push de **uma `image_url` por página** no `userContent` — cada uma é uma imagem independente sob o limite do provider.
- Fallback: se o catálogo não for PDF (ex: imagem direta) ou ainda não foi processado, cai no caminho legado de `loadFile`.
- Para arquivos não-PDF: imagens grandes podem ir como signed URL HTTP; outros mimes (DOC/DOCX) ainda exigem base64 inline.

### Frontend
- `UploadDropzone`: após upload de catálogo PDF, invoca `process-catalog-pdf` e mostra "Processando páginas…". Marca `isProcessing` no `UploadedFile`.
- `PrescriptionView`: botão "Gerar Receituário" só habilita quando `pages_count > 0` (ou quando o catálogo não é PDF).

## Prontuário (sem mudança)
Continua via `loadFile` normal — base64 inline para < 2MB, signed URL para > 2MB.
Atenção: signed URL HTTP só funciona para mime image/*. Prontuários PDF grandes seguem a mesma limitação que motivou a pré-renderização do catálogo; tipicamente são pequenos (< 1MB) e não atingem isso.

## RAG médico
- `searchMedicalKnowledgeBase` com `TERM_ALIASES`, `generateSearchQueries`, `sanitizeSearchTerm`.
- Cada termo sanitizado antes do `.or(content.ilike...)` — sem acentos/pontuação.
- Top 8 chunks, 8000 chars cada.

## Parâmetros de inferência
- `max_tokens: 8000`, sem `temperature` fixa.

## Cache de extração
- Cache só reutilizado se "de qualidade" (catálogo: products.length > 0; prontuário: main_complaint ou symptoms).
- Páginas pré-renderizadas → pula extração com Flash (Pro vê as imagens direto).
- Arquivos > 6MB também pulam extração.
- `uint8ToBase64`: chunks de 8KB, **um único `btoa()`** no final.

## Não tocar
- `chat-ai` permanece intacto.
- RLS dos buckets `prescription-files`, `prescription-files-pages` e tabelas `prescription_*`.
