

## Diagnóstico

O problema **não está no `SavedCatalogs.tsx` nem na UI** — o código que propaga `skip_page_render` está correto. O problema está no **backend** (`generate-prescription/index.ts`): toda vez que o usuário clica em "Gerar Receituário" pela primeira vez com um catálogo do modo rápido, a função sobrescreve `extracted_metadata` no banco e **apaga a flag `skip_page_render`**.

### Evidência no banco

Consulta na tabela `prescription_catalogs`:

| file_name | skip_page_render | total_pages | pages_count | catalog_name |
|---|---|---|---|---|
| ACAMP (recém salvo) | **null** ❌ | null | null | "Catálogo ACAMP" |
| Canfy (salvo antes) | **null** ❌ | null | null | "CATÁLOGO Canfy" |
| Canfy (não usado ainda) | **true** ✅ | 1 | 1 | null |
| ZELENO 85 páginas | null | 85 | 85 | null |

Os que têm `catalog_name` foram processados pelo extrator de produtos do `generate-prescription`, que **substituiu** `extracted_metadata = { skip_page_render: true, ... }` por `extracted_metadata = { products: [...], catalog_name: "..." }`.

### Sequência do bug

1. Upload de PDF Canfy ≤ 5MB → `extracted_metadata = { skip_page_render: true, pages_count: 1, total_pages: 1 }` ✅
2. Usuário clica **"Salvar"** → cria atalho em `saved_catalogs`. Funciona.
3. Usuário clica **"Gerar Receituário"** → `generate-prescription` roda `ensureExtraction` → como `loadedFile.pages` é vazio (modo rápido) e `cacheValid` é false (sem `products`), entra no extrator → linha 480: **`extracted_metadata: metadata` sobrescreve tudo**, perde `skip_page_render`.
4. Usuário recarrega a página, clica em "Usar" no catálogo salvo → `SavedCatalogs.handleUse` lê `meta.skip_page_render === undefined` → `isFastPath = false` → `pages_count = 0, total_pages = 0` (não há `pages[]` nem valores no metadata).
5. `PrescriptionView.catalogReady` exige `total_pages > 0 && pages_count === total_pages` → **falha** → botão fica desabilitado, mostra "Processando páginas do catálogo…" eternamente.

Por isso o ZELENO (85 páginas) carrega — ele tem `pages[]` real e `pages_count=85, total_pages=85`. Os pequenos perderam a flag e ficaram com metadata sem página nenhuma.

## Correção

### 1) `generate-prescription/index.ts` — preservar `skip_page_render`

**Em `ensureExtraction` (linha 411–491)**:

a) Adicionar early-return logo após a leitura do `meta`, **antes** da validação de cache:
```typescript
if (meta.skip_page_render === true) {
  console.log(`[ensureExtraction] Pulando — modo rápido (skip_page_render).`);
  return row;
}
```
Isso preserva o comportamento do modo rápido: o PDF inteiro vai inline pro Gemini Pro, sem extração estruturada de produtos. O Pro lê o catálogo direto.

b) **Defensivo**: caso a extração rode por outro motivo no futuro, fazer **merge** em vez de overwrite na linha 480:
```typescript
extracted_metadata: { ...meta, ...metadata },
```
Assim, qualquer flag preexistente (`skip_page_render`, `size_bytes`, etc.) sobrevive.

### 2) `generate-prescription/index.ts` — garantir leitura inline no modo rápido

Confirmar que o trecho que monta `LoadedFile` para o catálogo (perto da linha 855, onde já existe `const skipPageRender = cMeta.skip_page_render === true;`) está forçando `loadFile` a baixar o PDF como base64 inline mesmo acima do threshold padrão. Se não estiver, ajustar para que `skipPageRender === true` force `forceInline: true` até o limite de 5MB.

### 3) Migração de dados — recuperar catálogos já corrompidos

Os catálogos ACAMP e Canfy salvos pelo usuário já perderam `skip_page_render`. Como eles são PDFs ≤ 5MB e o `file_size` está armazenado em `prescription_catalogs.file_size`, posso restaurar a flag via migração SQL pontual:

```sql
UPDATE prescription_catalogs
SET extracted_metadata = extracted_metadata 
  || jsonb_build_object(
       'skip_page_render', true,
       'pages_count', 1,
       'total_pages', 1,
       'size_bytes', file_size
     )
WHERE file_type ILIKE '%pdf%'
  AND file_size <= 5242880
  AND (extracted_metadata->>'skip_page_render') IS NULL
  AND (extracted_metadata->'pages') IS NULL;
```

Isso só toca em catálogos PDF ≤ 5MB que **não foram** rasterizados (sem array `pages`) e **não têm** a flag — exatamente os corrompidos. ZELENO e outros grandes ficam intactos.

### 4) Memória — registrar a regra

Atualizar `mem://features/prescription-engine` com:
- `extracted_metadata` deve ser tratado como **append-only** para flags estruturais (`skip_page_render`, `size_bytes`, `pages`, `pages_count`, `total_pages`).
- `ensureExtraction` deve fazer early-return quando `skip_page_render === true`.

## O que NÃO muda

- `SavedCatalogs.tsx`, `UploadDropzone.tsx`, `PrescriptionView.tsx` — código frontend já está correto.
- `process-catalog-pdf` (pipeline pesado intacto).
- Schema, RLS, buckets.

## Resultado esperado

- Após a correção + migração: catálogos ACAMP e Canfy salvos voltam a carregar instantaneamente ao clicar em "Usar", botão "Gerar Receituário" libera no ato.
- Novos uploads ≤ 5MB nunca mais perdem a flag, mesmo após múltiplas gerações.
- ZELENO continua funcionando como antes (85 páginas).

## Arquivos a alterar

- `supabase/functions/generate-prescription/index.ts`
- `supabase/migrations/` (nova migração SQL para recuperar dados)
- `mem://features/prescription-engine`

