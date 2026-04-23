---
name: Prescription engine
description: Receituário+ — pipeline condicional de catálogo PDF (≤5MB inline base64 direto pro Gemini, >5MB pré-renderiza em JPEG via process-catalog-pdf 1 página/invocação com checkpoint); botão Gerar libera quando pages_count===total_pages; saved_catalogs (atalhos por usuário, limite 3); extracted_metadata é APPEND-ONLY para flags estruturais
type: feature
---

# Receituário+ engine — alinhamento com chat-ai

## Arquitetura
- Modelo: `google/gemini-2.5-pro`
- System: `MEDICAL_SYSTEM_PROMPT` + `PRESCRIPTION_TASK_LAYER` + `ATTACHMENT_PRIORITY_NOTE`
- One-shot (sem histórico)

## Pipeline condicional de catálogo PDF (CRÍTICO)

**Regra de tamanho** (`PDF_SMALL_THRESHOLD = 5MB` no frontend; `PDF_INLINE_THRESHOLD = 5MB` no backend):

- **PDF ≤ 5MB**: pula `process-catalog-pdf` inteiramente. Frontend marca `extracted_metadata = { skip_page_render: true, pages_count: 1, total_pages: 1, size_bytes }` e libera o botão Gerar imediatamente. Backend (`generate-prescription`) detecta `skip_page_render === true`, pula o caminho de páginas e usa `loadFile` que carrega o PDF original como **base64 inline** (PDFs SEMPRE precisam de inline — Gemini rejeita HTTP URL para `application/pdf`).
- **PDF > 5MB**: mantém pipeline original — `process-catalog-pdf` em loop com batch=1, checkpoint por página, retomada manual etc.

**Por que não usar inline para todos**: Gemini tem limite prático de ~7MB no `inline_data`, e edge function tem ~256MB de RAM. Acima de 5MB é mais seguro pré-renderizar em páginas JPEG independentes.

## Catálogo PDF > 5MB: pré-renderização página a página com checkpoint

O Lovable AI Gateway repassa para o Gemini, que **só aceita `image_url` HTTP quando o conteúdo é imagem** (PNG/JPEG/WebP/GIF). Para PDF grande, exige base64 inline — que estoura RAM (256MB) e o limite de ~7MB do `inline_data`. Solução: renderizar cada página como **JPEG** e enviar como signed URL.

### Por que 1 PÁGINA por invocação?
Edge functions Supabase têm CPU time limit observado de **~6s** por invocação (não 10s como esperado). Bootstrap PDFium em base64 leva ~3-4s. Cada página leva ~1-2s (render + encode JPEG + upload). Batch=3 estava morrendo após 2 páginas com `CPU Time exceeded`. Batch=1 → ~5-6s, com folga.

- Body: `{ catalogId, startPage?: number, batchSize?: number }` (default `startPage=0`, `batchSize=1`).
- A cada chamada: inicializa PDFium (~3-4s), renderiza 1 página, encoda JPEG quality 80, faz upload, **persiste checkpoint imediatamente em `extracted_metadata`**, responde.
- Resposta: `{ ok, done, processed, total, next_page }`.
- Frontend chama em loop até `done: true`.

### Checkpoint imediato (anti-perda)
Após cada upload bem-sucedido, `extracted_metadata` é atualizado **antes** da próxima página. Se a função morrer no meio (CPU/timeout), nada é perdido — a próxima invocação retoma exatamente de onde parou.

### Retomada defensiva
A função calcula `effectiveStartPage = max(startPage_recebido, existingPages.length)`. Mesmo se o frontend mandar `startPage` desatualizado, nunca recomeça do zero.

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

## Prontuário (sem mudança)
Continua via `loadFile` normal — base64 inline para < 2MB, signed URL para > 2MB.

## RAG médico
- `searchMedicalKnowledgeBase` com `TERM_ALIASES`, `generateSearchQueries`, `sanitizeSearchTerm`.
- Cada termo sanitizado antes do `.or(content.ilike...)`.
- Top 8 chunks, 8000 chars cada.

## Parâmetros de inferência
- `max_tokens: 8000`, sem `temperature` fixa.

## Catálogos salvos (atalhos/favoritos)
- Tabela `saved_catalogs` (user_id, catalog_id → prescription_catalogs, display_name). UNIQUE(user_id, catalog_id). RLS por `auth.uid() = user_id`.
- Limite **3 por usuário** (constante `SAVED_CATALOGS_LIMIT` em `SavedCatalogs.tsx`).
- Botão "Salvar" no `UploadDropzone` (apenas `kind='catalog'`) cria o atalho — **não duplica arquivo** no storage nem em `prescription_catalogs`. Apenas insere row em `saved_catalogs` apontando pro catálogo já existente.
- Componente `SavedCatalogs` (em `prescription/SavedCatalogs.tsx`) renderiza grid abaixo dos uploads. Cada item: clicar no card OU no botão "Usar" preenche `catalog` no `PrescriptionView` reaproveitando `extracted_metadata.pages` já processado (zero reprocessamento).
- Renomear: edita só `display_name` no atalho, não afeta o `prescription_catalogs.file_name` global.
- Excluir: remove só a row em `saved_catalogs` (com confirmação via AlertDialog). Catálogo original preservado.
- `handleRemove` no `UploadDropzone`: se `kind='catalog' && isSaved`, apenas deseleciona (não apaga arquivo); caso contrário, apaga storage + row como antes.

## Regras críticas de `extracted_metadata` (NÃO QUEBRAR)

`prescription_catalogs.extracted_metadata` é **append-only** para flags estruturais. NUNCA sobrescrever com `update({ extracted_metadata: novoObj })` — sempre fazer **merge**: `{ ...metaAntigo, ...novaMeta }`.

Flags que precisam sobreviver a qualquer atualização:
- `skip_page_render` (boolean) — modo rápido ≤5MB
- `size_bytes` (number)
- `pages` (string[]) — paths das páginas rasterizadas
- `pages_count`, `total_pages` (number)
- `processing_complete`, `pages_render_scale`, `pages_format`

### `ensureExtraction` (generate-prescription)
- **Early-return** quando `isCatalog && meta.skip_page_render === true`. Catálogos em modo rápido NÃO passam pela extração estruturada com Flash — o Pro multimodal lê o PDF inteiro inline. Rodar a extração apagaria a flag.
- Quando a extração roda (catálogos sem `skip_page_render`, ou prontuários), o update é `extracted_metadata: { ...meta, ...metadata }` (merge defensivo).

### Bug histórico (corrigido)
Antes da correção, `ensureExtraction` sobrescrevia `extracted_metadata` com `{ products, catalog_name, ... }`, apagando `skip_page_render`. Resultado: ao recarregar a página e clicar em "Usar" no catálogo salvo, `SavedCatalogs.handleUse` lia `meta.skip_page_render === undefined`, calculava `pages_count=0/total_pages=0`, e `PrescriptionView.catalogReady` falhava — botão eternamente desabilitado mostrando "Processando páginas do catálogo…". Migração pontual restaurou as flags em catálogos PDF ≤5MB sem `pages[]`.

## Frontend
- `UploadDropzone`: após upload de catálogo PDF, chama `process-catalog-pdf` em **loop** (`while (!done)`) com `batchSize: 1`, atualizando `pages_count`/`total_pages`/`isProcessing` em cada batch. Mostra "Processando páginas (X/Y)…".
- **Retry automático por batch**: até 3 tentativas com `sleep(1500ms)` entre elas. Antes de cada retry, sincroniza `pages_count`/`total_pages` direto da tabela `prescription_catalogs` (o backend pode ter salvo checkpoint mesmo com a resposta HTTP falhando) e ajusta `startPage` para o real progresso. Como o backend é reentrante, retentar nunca duplica página.
- **Retomada manual**: quando catálogo fica em `pages_count < total_pages` sem estar processando, o card mostra `X/Y páginas processadas` + botão **"Continuar processamento"** (`PlayCircle`). Clicar dispara `runCatalogProcessing` a partir de `pages_count` real do banco — sem reupload.
- Toast de pausa: `"Processamento pausado em X/Y páginas. Clique em Continuar processamento para retomar."`
- `PrescriptionView`: botão "Gerar Receituário" só habilita quando catálogo PDF está **100% processado** (`!isProcessing && pages_count === total_pages && total_pages > 0`). Não-PDF não exige processamento.
- Tipo `UploadedFile` inclui `total_pages?: number`.

## Não tocar
- `chat-ai` permanece intacto.
- RLS dos buckets `prescription-files`, `prescription-files-pages` e tabelas `prescription_*`.
- Contrato de leitura de `extracted_metadata.pages` em `generate-prescription`.
