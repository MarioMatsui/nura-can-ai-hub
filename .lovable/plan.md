

## Diagnóstico

Encontrei a causa exata. O problema está no `SavedCatalogs.tsx`, linhas 122–123:

```ts
pages_count: Number(meta.pages_count ?? pages.length) || 0,
total_pages: Number(meta.total_pages ?? 0) || 0,
```

O operador `|| 0` **transforma o valor `1` em `1` (ok), mas o problema é outro**: quando o catálogo foi salvo via pipeline rápido (≤5MB), o `extracted_metadata` tem:
```json
{ "skip_page_render": true, "pages_count": 1, "total_pages": 1, "size_bytes": 3145728 }
```

A leitura está correta (`pages_count=1, total_pages=1`). Mas o `UploadedFile` retornado **não inclui** a flag `skip_page_render`, e isso quebra a UX no card.

**Mas o bug real que você relatou ("não estão carregando")** está em outro lugar:

Olhando `PrescriptionView.tsx` linha 56–65, a condição `catalogReady` exige `catalog.pages_count === catalog.total_pages` para PDFs. Para o ZELENO (85MB), os valores são `85===85` → libera. Para os pequenos, deveria ser `1===1` → libera. **A condição passa.**

Porém, o card no `UploadDropzone` mostra "1 páginas prontas" para os pequenos, o que parece "não carregado" visualmente. Pior: como o `total_pages=1` mas o PDF real tem dezenas de páginas, **se houver qualquer hidratação que tente recontar, o estado fica inconsistente**.

O caso mais provável do "não carrega": o toast aparece (`"Catálogo X carregado"`), o estado interno é setado, **mas o card do catálogo no topo não reflete porque o `UploadedFile` retornado tem `pages_count=1, total_pages=1` que é interpretado como um catálogo qualquer, sem o sinal de "modo rápido"**. Visualmente o usuário vê "1 páginas prontas" e acha que carregou errado/não carregou.

## Correção

### 1) `SavedCatalogs.tsx` — propagar a flag `skip_page_render`
Em `handleUse`, ler `meta.skip_page_render` e:
- Se `true`: garantir `pages_count: 1, total_pages: 1` (sinais técnicos do modo rápido) e adicionar `isProcessing: false`.
- Se `false`/ausente: manter lógica atual com os valores reais do banco.

### 2) `UploadDropzone.tsx` — exibir rótulo correto para modo rápido
Adicionar campo opcional `skipPageRender?: boolean` em `UploadedFile`.
Quando setado:
- Substituir "1 páginas prontas" por **"✓ Pronto para uso (modo rápido)"**.
- Não mostrar barra de progresso.

### 3) `SavedCatalogs.tsx` — passar `skipPageRender: true` no objeto retornado
Quando `meta.skip_page_render === true`, retornar `{ ...file, skipPageRender: true }`.

### 4) `UploadDropzone.tsx` (handleUpload) — setar a flag também no upload novo
Linha 287: adicionar `skipPageRender: true` ao `onChange` do branch ≤5MB, para consistência.

### 5) `PrescriptionView.tsx` — texto auxiliar
Não mostrar "Processando páginas do catálogo (0/1)…" quando `catalog.skipPageRender === true`.

## O que NÃO muda
- Backend (`process-catalog-pdf`, `generate-prescription`).
- Schema do banco / RLS.
- Lógica de `catalogReady` (já funciona com `1===1`).
- Pipeline pesado para PDFs > 5MB.

## Resultado esperado
- Clicar em "Usar" no Canfy rápido (3MB) → card mostra **"✓ Pronto para uso (modo rápido)"**, botão "Gerar Receituário" habilita imediatamente.
- ZELENO de 10MB continua mostrando **"85 páginas prontas"** como hoje.
- Sem mais confusão visual.

## Arquivos a alterar
- `src/components/dashboard/prescription/SavedCatalogs.tsx`
- `src/components/dashboard/prescription/UploadDropzone.tsx`
- `src/components/dashboard/prescription/PrescriptionView.tsx`

