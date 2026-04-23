// Pré-processa o PDF do catálogo: renderiza páginas como PNG e armazena
// no bucket `prescription-files-pages`. Roda EM LOTES (batch) para evitar
// estourar o CPU time limit (~10s) das edge functions.
//
// O frontend chama esta função em loop, passando `startPage`/`batchSize`,
// até receber `done: true`. Cada batch:
//  - inicializa o PDFium (~1s),
//  - renderiza N páginas (default 8),
//  - faz upload no bucket,
//  - persiste o progresso em `extracted_metadata`.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { PDFiumLibrary } from "https://esm.sh/@hyzyla/pdfium@2.1.7/browser/base64";
import { encode as encodePng } from "https://deno.land/x/pngs@0.1.1/mod.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const SOURCE_BUCKET = 'prescription-files';
const PAGES_BUCKET = 'prescription-files-pages';
const RENDER_SCALE = 1.0; // ~72 DPI — PNGs ~300-700KB, suficiente para Gemini ler texto
const MAX_PAGES = 200;    // hard cap defensivo
const DEFAULT_BATCH = 8;

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
    const endPage = Math.min(startPage + batchSize, totalPages);

    console.log(`PDF tem ${pageObjs.length} páginas. Processando ${startPage + 1}–${endPage} de ${totalPages}.`);

    const newlyUploaded: string[] = [];

    for (let i = startPage; i < endPage; i++) {
      const page = pageObjs[i];
      const pageNumber = i + 1;
      try {
        const rendered = await page.render({
          scale: RENDER_SCALE,
          render: 'bitmap',
        });
        const png = encodePng(rendered.data, rendered.width, rendered.height);

        const path = `${userId}/${catalogId}/page-${String(pageNumber).padStart(3, '0')}.png`;
        const { error: upErr } = await supabase.storage
          .from(PAGES_BUCKET)
          .upload(path, png, {
            contentType: 'image/png',
            upsert: true,
          });

        if (upErr) {
          console.error(`Upload falhou na página ${pageNumber}:`, upErr);
          continue;
        }

        newlyUploaded.push(path);
        console.log(`Página ${pageNumber}/${totalPages}: ${rendered.width}x${rendered.height}, PNG ${(png.length / 1024).toFixed(0)}KB`);
      } catch (e) {
        console.error(`Erro renderizando página ${pageNumber}:`, e);
      }
    }

    document.destroy();
    library.destroy();

    // Mescla com o que já existia (sem duplicar)
    const allPages = Array.from(new Set([...existingPages, ...newlyUploaded]));
    const nextPage = endPage;
    const done = nextPage >= totalPages;

    const newMeta = {
      ...existingMeta,
      pages: allPages,
      pages_count: allPages.length,
      total_pages: totalPages,
      processing_complete: done,
      pages_render_scale: RENDER_SCALE,
      ...(done ? { pages_processed_at: new Date().toISOString() } : {}),
    };

    const { error: updErr } = await supabase
      .from('prescription_catalogs')
      .update({ extracted_metadata: newMeta })
      .eq('id', catalogId);

    if (updErr) {
      console.error('Update metadata error', updErr);
      return new Response(JSON.stringify({ error: 'Falha ao salvar progresso' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(`[batch ok] processed=${allPages.length}/${totalPages} done=${done}`);

    return new Response(JSON.stringify({
      ok: true,
      done,
      processed: allPages.length,
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
