

## Diagnóstico

Mesmo com `RENDER_SCALE = 1.0` e batch de 8, a função morre após processar **apenas 1 página**:

```
04:12:56 [batch start=0 size=8] Baixando PDF…
04:13:00 PDF carregado: 9.97MB
04:13:00 Inicializando PDFium…
04:13:02 Página 1/85: 1440x810, PNG 1465KB    ← 2s para 1 página
04:13:03 ERROR CPU Time exceeded               ← morre antes da página 2
```

Tempo gasto:
- ~4s para baixar e inicializar PDFium (custo fixo de bootstrap)
- ~2s para renderizar+encodar+uploadar 1 página de 1.4MB
- Total disponível: ~6-7s de CPU → não dá nem para 2 páginas

**Problemas:**
1. PNG ainda está em **1.4MB** — `pngs` (deno.land/x/pngs) faz encode sem compressão eficiente. Cada página toma ~1.5s só de encode.
2. Bootstrap do PDFium em base64 leva ~3-4s (decodifica WASM de 3.7MB toda invocação).
3. Batch de 8 é otimista demais: na realidade está conseguindo 1 página por invocação.

## Solução

### 1) Trocar PNG por **JPEG** com compressão controlada
PNG sem compressão eficiente custa caro de encodar. JPEG quality 75 dá arquivos ~150-300KB (vs 1.4MB do PNG) e encode muito mais rápido. Gemini Pro lê JPEG perfeitamente para texto/produtos.

Usar `https://deno.land/x/jpegts@1.1/mod.ts` ou similar — biblioteca WASM pura sem `createRequire`.

Alternativa mais robusta: **renderizar direto em JPEG via PDFium**, que já suporta render como bitmap e podemos passar para encoder JPEG nativo do Deno (`Deno.core` não disponível, então usar lib WASM).

Recomendo `npm:@jsquash/jpeg` ou `https://deno.land/x/imagescript@1.2.17/mod.ts` (puro TS/WASM, encoda JPEG nativo).

### 2) Reduzir `batchSize` default para **3**
Cada página leva ~1.5-2s real. Com 3 páginas: ~5-6s + 4s bootstrap = ~10s, dentro do limite. Frontend já loop’a, então só significa mais invocações (85/3 ≈ 29 batches), mas cada uma fica safe.

### 3) Reduzir resolução para `RENDER_SCALE = 0.75`
1440×810 vira ~1080×608, ainda legível para Gemini. Reduz tempo de render WASM e tamanho do bitmap em memória.

### 4) Adicionar `disableBase64Warning: true` no init (cosmético — limpa logs)

### 5) Frontend: aceitar `batchSize` menor sem mudar nada
O loop já está pronto — só processa mais batches.

## Arquivos alterados

- `supabase/functions/process-catalog-pdf/index.ts`
  - Trocar `pngs` por encoder JPEG (`imagescript`)
  - `RENDER_SCALE = 0.75`
  - `DEFAULT_BATCH = 3`
  - Upload com `contentType: 'image/jpeg'` e extensão `.jpg`
  - `disableBase64Warning: true`
  - Renomear paths para `page-NNN.jpg`

- `src/components/dashboard/prescription/UploadDropzone.tsx`
  - Mudar `batchSize: 8` → `batchSize: 3` no invoke

- `supabase/functions/generate-prescription/index.ts` (verificar)
  - Confirmar que ao montar `image_url` para o Gemini, o mimeType lido de `extracted_metadata` está correto (já é dinâmico via signed URL — não deve precisar mudar). Se hardcoded `'image/png'`, trocar para `'image/jpeg'`.

- `mem://features/prescription-engine`
  - Atualizar: JPEG quality 80, scale 0.75, batch 3.

## Por que vai funcionar

- **JPEG quality 80** → ~200KB por página (7× menor que PNG atual). Encode ~5× mais rápido.
- **Batch 3** → tempo total estimado: 4s bootstrap + 3×1s = **7s**, com folga sob o limite de ~10s.
- **Scale 0.75** → economia adicional de ~30% no render e encode.
- Logs vão mostrar 3 páginas por invocação consistentemente, sem mais `CPU Time exceeded`.

## Validação

1. Reenviar catálogo de 85 páginas.
2. Esperar ~29 batches sequenciais, cada um logando 3 páginas em ~6-8s.
3. Card mostra progresso real "3/85 → 6/85 → … → 85 páginas prontas".
4. JPEGs no bucket com tamanho ~150-300KB.
5. Botão "Gerar Receituário" habilita ao final, e a geração funciona com signed URLs `image/jpeg`.

## Fora de escopo

- Sem mudanças em schema, RLS, buckets ou auth.
- Sem mudanças no frontend além do `batchSize`.

