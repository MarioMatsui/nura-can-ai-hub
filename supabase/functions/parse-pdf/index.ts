import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.75.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");

interface ParsePdfRequest {
  filePath: string;
  documentId: string;
  bucket?: string;
}

interface DocumentBlock {
  page_number: number;
  block_id: string;
  block_type: string;
  content: string;
  markdown?: string;
  bbox?: {x: number; y: number; width: number; height: number};
  section_title?: string;
}

interface DocumentTable {
  page_number: number;
  table_id: string;
  markdown: string;
  structured_data: {
    headers: string[];
    rows: string[][];
  };
  bbox?: {x: number; y: number; width: number; height: number};
  caption?: string;
}

interface DocumentImage {
  page_number: number;
  image_id: string;
  image_type?: string;
  storage_path: string;
  thumbnail_path?: string;
  bbox?: {x: number; y: number; width: number; height: number};
  caption?: string;
  description?: string;
}

// Função auxiliar para gerar hash SHA-256
async function generateHash(data: Uint8Array): Promise<string> {
  const buffer = new ArrayBuffer(data.length);
  const view = new Uint8Array(buffer);
  view.set(data);
  const hashBuffer = await crypto.subtle.digest("SHA-256", buffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

// Função para extrair estrutura usando Lovable Document Parser
async function parseDocumentStructure(fileData: Blob): Promise<any> {
  console.log("🔍 Using Lovable Document Parser for structured extraction...");
  
  const formData = new FormData();
  formData.append('file', fileData, 'document.pdf');
  
  const response = await fetch('https://api.lovable.app/v1/parse-document', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${LOVABLE_API_KEY}`,
    },
    body: formData,
  });
  
  if (!response.ok) {
    throw new Error(`Document parser failed: ${response.statusText}`);
  }
  
  return await response.json();
}

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );

    const { filePath, documentId, bucket }: ParsePdfRequest = await req.json();
    console.log("📄 Parsing PDF with structured extraction:", filePath);

    // Try to download from the specified bucket, or try both buckets
    let fileData: Blob | null = null;
    let downloadError: any = null;

    if (bucket) {
      // If bucket is specified, use it
      const result = await supabaseClient.storage.from(bucket).download(filePath);
      fileData = result.data;
      downloadError = result.error;
    } else {
      // Try chat-attachments first (most common for user uploads)
      const chatResult = await supabaseClient.storage.from("chat-attachments").download(filePath);
      
      if (!chatResult.error && chatResult.data) {
        fileData = chatResult.data;
        console.log("Downloaded from chat-attachments bucket");
      } else {
        // Fallback to knowledge-documents
        const knowledgeResult = await supabaseClient.storage.from("knowledge-documents").download(filePath);
        fileData = knowledgeResult.data;
        downloadError = knowledgeResult.error;
        
        if (!downloadError && fileData) {
          console.log("Downloaded from knowledge-documents bucket");
        }
      }
    }

    if (downloadError || !fileData) {
      throw new Error(`Failed to download file from storage: ${downloadError?.message || 'File not found in any bucket'}`);
    }

    console.log("✅ PDF downloaded, size:", fileData.size, "bytes");

    // Gerar hash do arquivo para deduplicação
    const arrayBuffer = await fileData.arrayBuffer();
    const uint8Array = new Uint8Array(arrayBuffer);
    const fileHash = await generateHash(uint8Array);
    
    console.log("📊 File hash generated:", fileHash);

    // Atualizar metadados do documento
    await supabaseClient
      .from('knowledge_documents')
      .update({
        file_hash: fileHash,
        file_size_bytes: fileData.size,
        status: 'processing'
      })
      .eq('id', documentId);

    // Usar Document Parser do Lovable para extração estruturada
    let parsedData;
    try {
      parsedData = await parseDocumentStructure(fileData);
      console.log("✅ Document parsed successfully");
    } catch (parseError: any) {
      console.error("❌ Failed to parse with document parser, falling back to basic extraction");
      
      // Fallback: extração básica de texto
      let text = '';
      let buffer = '';
      
      for (let i = 0; i < uint8Array.length; i++) {
        const char = String.fromCharCode(uint8Array[i]);
        
        if (char === '(' && uint8Array[i - 1] !== 92) {
          buffer = '';
        } else if (char === ')' && uint8Array[i - 1] !== 92) {
          if (buffer.length > 0) {
            text += buffer + ' ';
            buffer = '';
          }
        } else if (buffer !== null) {
          if (char.charCodeAt(0) >= 32 && char.charCodeAt(0) <= 126) {
            buffer += char;
          } else if (char === '\n' || char === '\r') {
            buffer += ' ';
          }
        }
      }
      
      const cleanedText = text
        .replace(/\\n/g, ' ')
        .replace(/\\r/g, ' ')
        .replace(/\\t/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();

      if (cleanedText.length < 100) {
        throw new Error("Could not extract meaningful text from PDF. The file may be image-based or corrupted.");
      }

      // Retornar estrutura básica
      return new Response(
        JSON.stringify({ 
          success: true,
          basic_extraction: true,
          text: cleanedText,
          metadata: {
            total_pages: 1,
            file_hash: fileHash,
            file_size_bytes: fileData.size
          }
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        }
      );
    }

    // Processar dados estruturados
    const blocks: DocumentBlock[] = [];
    const tables: DocumentTable[] = [];
    const images: DocumentImage[] = [];
    let fullMarkdown = "";
    let totalPages = 0;

    // Processar páginas
    if (parsedData.pages) {
      totalPages = parsedData.pages.length;
      
      for (const page of parsedData.pages) {
        const pageNum = page.page_number || 1;
        
        // Processar blocos de texto
        if (page.blocks) {
          for (const block of page.blocks) {
            blocks.push({
              page_number: pageNum,
              block_id: `p${pageNum}_b${block.block_id || blocks.length}`,
              block_type: block.type || 'paragraph',
              content: block.text || block.content || '',
              markdown: block.markdown,
              bbox: block.bbox,
              section_title: block.section_title
            });
            
            // Adicionar ao markdown consolidado
            if (block.markdown) {
              fullMarkdown += block.markdown + "\n\n";
            }
          }
        }
        
        // Processar tabelas
        if (page.tables) {
          for (const table of page.tables) {
            tables.push({
              page_number: pageNum,
              table_id: `p${pageNum}_t${table.table_id || tables.length}`,
              markdown: table.markdown || '',
              structured_data: table.data || { headers: [], rows: [] },
              bbox: table.bbox,
              caption: table.caption
            });
            
            if (table.markdown) {
              fullMarkdown += "\n" + table.markdown + "\n\n";
            }
          }
        }
        
        // Processar imagens
        if (page.images) {
          for (const img of page.images) {
            const imageId = `p${pageNum}_img${images.length}`;
            
            // Salvar imagem no storage (se houver dados base64)
            let storagePath = '';
            if (img.data) {
              const imageBuffer = Uint8Array.from(atob(img.data), c => c.charCodeAt(0));
              const imageBlob = new Blob([imageBuffer], { type: img.mime_type || 'image/png' });
              
              storagePath = `${documentId}/${imageId}.${img.format || 'png'}`;
              
              await supabaseClient.storage
                .from('document-images')
                .upload(storagePath, imageBlob, {
                  contentType: img.mime_type || 'image/png',
                  upsert: true
                });
            }
            
            images.push({
              page_number: pageNum,
              image_id: imageId,
              image_type: img.type,
              storage_path: storagePath,
              bbox: img.bbox,
              caption: img.caption,
              description: img.description
            });
          }
        }
      }
    }

    // Atualizar documento com metadados
    await supabaseClient
      .from('knowledge_documents')
      .update({
        total_pages: totalPages,
        content: fullMarkdown || parsedData.markdown || '',
        extracted_metadata: parsedData.metadata || {}
      })
      .eq('id', documentId);

    console.log(`✅ Extracted: ${blocks.length} blocks, ${tables.length} tables, ${images.length} images`);

    return new Response(
      JSON.stringify({ 
        success: true,
        structured: true,
        metadata: {
          total_pages: totalPages,
          file_hash: fileHash,
          file_size_bytes: fileData.size,
          blocks_count: blocks.length,
          tables_count: tables.length,
          images_count: images.length
        },
        blocks,
        tables,
        images,
        markdown: fullMarkdown,
        raw_metadata: parsedData.metadata
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );
  } catch (error: any) {
    console.error("Error in parse-pdf function:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );
  }
};

serve(handler);
