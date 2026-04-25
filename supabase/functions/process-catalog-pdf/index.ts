// Pré-processa o PDF do catálogo: renderiza páginas como JPEG e armazena
// no bucket `prescription-files-pages`. Roda EM LOTES (batch) para evitar
// estourar o CPU time limit (~10s) das edge functions.
//
// O frontend chama esta função em loop, passando `startPage`/`batchSize`,
// até receber `done: true`. Cada batch:
//  - inicializa o PDFium (~1s, base64 embutido),
//  - renderiza N páginas (default 3),
//  - encoda em JPEG quality 80 (muito mais rápido e leve que PNG),
//  - faz upload no bucket,
//  - persiste o progresso em `extracted_metadata`.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.75.0";
import { PDFiumLibrary } from "https://esm.sh/@hyzyla/pdfium@2.1.7/browser/base64";
import { Image } from "https://deno.land/x/imagescript@1.2.17/mod.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const SOURCE_BUCKET = 'prescription-files';
const PAGES_BUCKET = 'prescription-files-pages';
const RENDER_SCALE = 0.75;   // ~54 DPI — JPEGs ~150-300KB, suficiente para Gemini ler texto
const JPEG_QUALITY = 80;     // bom equilíbrio nitidez/tamanho
const MAX_PAGES = 200;       // hard cap defensivo
const DEFAULT_BATCH = 1;     // 1 página por invocação — runtime real ~6s, bootstrap PDFium ~4s

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Não autenticado' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const authClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userError } = await authClient.auth.getUser();
    if (userError || !userData?.user) {
      return new Response(JSON.stringify({ error: 'Não autenticado' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const userId = userData.user.id;

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const body = await req.json().catch(() => ({}));
    const catalogId = body?.catalogId;
    const startPage = Math.max(0, Number(body?.startPage) || 0);
    const batchSize = Math.min(20, Math.max(1, Number(body?.batchSize) || DEFAULT_BATCH));

    if (!catalogId || typeof catalogId !== 'string') {
      return new Response(JSON.stringify({ error: 'catalogId é obrigatório' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: catalog, error: catErr } = await supabase
      .from('prescription_catalogs')
      .select('id, user_id, file_name, file_path, file_type, file_size, extracted_metadata')
      .eq('id', catalogId)
      .eq('user_id', userId)
      .maybeSingle();

    if (catErr || !catalog) {
      return new Response(JSON.stringify({ error: 'Catálogo não encontrado' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const existingMeta: any = catalog.extracted_metadata || {};
    const existingPages: string[] = Array.isArray(existingMeta.pages) ? existingMeta.pages : [];

    // Já completou em chamadas anteriores
    if (existingMeta.processing_complete && existingPages.length > 0) {
      return new Response(JSON.stringify({
        ok: true,
        done: true,
        cached: true,
        processed: existingPages.length,
        total: existingPages.length,
        next_page: existingPages.length,
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Só processamos PDFs.
    const isPdf = (catalog.file_type || '').toLowerCase().includes('pdf')
      || (catalog.file_name || '').toLowerCase().endsWith('.pdf');

    if (!isPdf) {
      return new Response(JSON.stringify({
        ok: true,
        done: true,
        skipped: true,
        reason: 'not_pdf',
        processed: 0,
        total: 0,
        next_page: 0,
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    console.log(`[batch start=${startPage} size=${batchSize}] Baixando PDF ${catalogId}…`);
    const { data: dl, error: dlErr } = await supabase.storage
      .from(SOURCE_BUCKET)
      .download(catalog.file_path);
    if (dlErr || !dl) {
      console.error('Download error', dlErr);
      return new Response(JSON.stringify({ error: 'Falha ao baixar PDF' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const ab = await dl.arrayBuffer();
    const pdfBytes = new Uint8Array(ab);
    console.log(`PDF carregado: ${(pdfBytes.length / 1024 / 1024).toFixed(2)}MB`);

    console.log('Inicializando PDFium…');
    const library = await PDFiumLibrary.init({ disableBase64Warning: true } as any);
    const document = await library.loadDocument(pdfBytes);

    const pageObjs = Array.from(document.pages());
    const totalPages = Math.min(pageObjs.length, MAX_PAGES);

    // Retomada defensiva: nunca recomeçar do zero se já houver progresso salvo.
    const effectiveStartPage = Math.max(startPage, existingPages.length);
    const endPage = Math.min(effectiveStartPage + batchSize, totalPages);

    console.log(`PDF tem ${pageObjs.length} páginas. Processando ${effectiveStartPage + 1}–${endPage} de ${totalPages} (já processadas: ${existingPages.length}).`);

    let accumulatedPages: string[] = [...existingPages];

    for (let i = effectiveStartPage; i < endPage; i++) {
      const page = pageObjs[i];
      const pageNumber = i + 1;
      try {
        const rendered = await page.render({
          scale: RENDER_SCALE,
          render: 'bitmap',
        });

        // PDFium retorna RGBA bitmap. imagescript aceita Uint8Array RGBA direto.
        const img = new Image(rendered.width, rendered.height);
        img.bitmap.set(rendered.data);
        const jpeg = await img.encodeJPEG(JPEG_QUALITY);

        const path = `${userId}/${catalogId}/page-${String(pageNumber).padStart(3, '0')}.jpg`;
        const { error: upErr } = await supabase.storage
          .from(PAGES_BUCKET)
          .upload(path, jpeg, {
            contentType: 'image/jpeg',
            upsert: true,
          });

        if (upErr) {
          console.error(`Upload falhou na página ${pageNumber}:`, upErr);
          continue;
        }

        // CHECKPOINT: salva progresso IMEDIATAMENTE após cada página.
        // Garante que se a função morrer no meio, nada é perdido.
        if (!accumulatedPages.includes(path)) {
          accumulatedPages.push(path);
        }
        const isLast = (i + 1) >= totalPages;
        const checkpointMeta = {
          ...existingMeta,
          pages: accumulatedPages,
          pages_count: accumulatedPages.length,
          total_pages: totalPages,
          processing_complete: isLast,
          pages_render_scale: RENDER_SCALE,
          pages_format: 'image/jpeg',
          ...(isLast ? { pages_processed_at: new Date().toISOString() } : {}),
        };
        const { error: cpErr } = await supabase
          .from('prescription_catalogs')
          .update({ extracted_metadata: checkpointMeta })
          .eq('id', catalogId);
        if (cpErr) {
          console.error(`Checkpoint falhou na página ${pageNumber}:`, cpErr);
        }

        console.log(`Página ${pageNumber}/${totalPages}: ${rendered.width}x${rendered.height}, JPEG ${(jpeg.length / 1024).toFixed(0)}KB ✓ checkpoint salvo`);
      } catch (e) {
        console.error(`Erro renderizando página ${pageNumber}:`, e);
      }
    }

    document.destroy();
    library.destroy();

    const nextPage = endPage;
    const done = nextPage >= totalPages;

    console.log(`[batch ok] processed=${accumulatedPages.length}/${totalPages} done=${done}`);

    return new Response(JSON.stringify({
      ok: true,
      done,
      processed: accumulatedPages.length,
      total: totalPages,
      next_page: nextPage,
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (e) {
    console.error('process-catalog-pdf fatal', e);
    return new Response(JSON.stringify({
      error: 'erro_interno',
      message: e instanceof Error ? e.message : String(e),
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
