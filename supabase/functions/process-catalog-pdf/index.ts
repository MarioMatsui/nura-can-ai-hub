// Pré-processa o PDF do catálogo: renderiza cada página como PNG e armazena
// no bucket `prescription-files-pages`. Roda UMA vez logo após o upload.
//
// Por que isso existe: o Gemini (via Lovable AI Gateway) só aceita `image_url`
// apontando para uma URL HTTP quando o conteúdo é IMAGEM (PNG/JPEG/WebP/GIF).
// Para PDF, exige base64 inline — que estoura RAM (256MB) e o limite de ~7MB
// do `inline_data` em catálogos médios. Convertendo páginas em PNG, cada página
// vira uma imagem pequena (< 7MB), enviada como signed URL na geração.
//
// Tamanhos típicos: render escala 1.5 → ~1240px largura → 200-500KB por página.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.75.0";
import { PDFiumLibrary } from "npm:@hyzyla/pdfium@2.1.7";
import { encode as encodePng } from "https://deno.land/x/pngs@0.1.1/mod.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const SOURCE_BUCKET = 'prescription-files';
const PAGES_BUCKET = 'prescription-files-pages';
const RENDER_SCALE = 1.5; // ~108 DPI — suficiente para o Gemini ler texto/produtos
const MAX_PAGES = 120;    // hard cap defensivo

// O specifier `npm:` no Deno Edge resolve o `.wasm` adjacente automaticamente,
// dispensando carregamento manual e evitando o build "browser" do esm.sh que
// detectava incorretamente o ambiente como browser.

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

    // Se já tem páginas processadas, retorna imediatamente.
    const existingMeta = catalog.extracted_metadata || {};
    if (Array.isArray(existingMeta.pages) && existingMeta.pages.length > 0) {
      console.log(`Catálogo ${catalogId} já processado (${existingMeta.pages.length} páginas).`);
      return new Response(JSON.stringify({
        ok: true,
        cached: true,
        pages_count: existingMeta.pages.length,
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Só processamos PDFs. Imagens já são imagens — nem precisam de conversão.
    const isPdf = (catalog.file_type || '').toLowerCase().includes('pdf')
      || (catalog.file_name || '').toLowerCase().endsWith('.pdf');

    if (!isPdf) {
      console.log(`Catálogo ${catalogId} não é PDF (${catalog.file_type}) — sem processamento.`);
      return new Response(JSON.stringify({
        ok: true,
        skipped: true,
        reason: 'not_pdf',
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    console.log(`Baixando PDF do catálogo ${catalogId} (${catalog.file_path})…`);
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
    const wasmBinary = await getPdfiumWasm();
    console.log(`PDFium WASM carregado: ${(wasmBinary.byteLength / 1024 / 1024).toFixed(2)}MB`);
    const library = await PDFiumLibrary.init({ wasmBinary });
    const document = await library.loadDocument(pdfBytes);

    const pageObjs = Array.from(document.pages());
    const totalPages = Math.min(pageObjs.length, MAX_PAGES);
    console.log(`PDF tem ${pageObjs.length} páginas — processando ${totalPages}.`);

    const uploadedPaths: string[] = [];

    for (let i = 0; i < totalPages; i++) {
      const page = pageObjs[i];
      const pageNumber = i + 1;
      try {
        // Render → bitmap RGBA cru
        const rendered = await page.render({
          scale: RENDER_SCALE,
          render: 'bitmap',
        });

        // RGBA → PNG (pure-wasm, sem deps nativas)
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

        uploadedPaths.push(path);
        console.log(`Página ${pageNumber}/${totalPages}: ${rendered.width}x${rendered.height}, PNG ${(png.length / 1024).toFixed(0)}KB`);
      } catch (e) {
        console.error(`Erro renderizando página ${pageNumber}:`, e);
      }
    }

    document.destroy();
    library.destroy();

    if (uploadedPaths.length === 0) {
      return new Response(JSON.stringify({ error: 'Nenhuma página processada' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Persiste os paths em metadata para a função de geração consumir.
    const newMeta = {
      ...existingMeta,
      pages: uploadedPaths,
      pages_count: uploadedPaths.length,
      pages_processed_at: new Date().toISOString(),
      pages_render_scale: RENDER_SCALE,
    };

    const { error: updErr } = await supabase
      .from('prescription_catalogs')
      .update({ extracted_metadata: newMeta })
      .eq('id', catalogId);

    if (updErr) {
      console.error('Update metadata error', updErr);
      return new Response(JSON.stringify({ error: 'Falha ao salvar páginas' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(`✓ Catálogo ${catalogId} processado: ${uploadedPaths.length} páginas`);

    return new Response(JSON.stringify({
      ok: true,
      pages_count: uploadedPaths.length,
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
