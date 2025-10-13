import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.75.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");

interface ProcessRequest {
  documentId: string;
}

// Função para criar chunks semânticos dos blocos
function createSemanticChunks(blocks: any[], tables: any[]): any[] {
  const chunks: any[] = [];
  const MIN_CHUNK_SIZE = 700; // tokens mínimos
  const MAX_CHUNK_SIZE = 1200; // tokens máximos
  const OVERLAP_SIZE = 150; // tokens de overlap
  
  let currentChunk: any = {
    blocks: [],
    content: "",
    tokens: 0,
    pages: new Set<number>(),
    section_title: "",
    block_ids: [],
  };
  
  let currentSection = "";
  
  for (const block of blocks) {
    const blockTokens = Math.ceil(block.content.length / 4);
    
    // Detectar mudança de seção (heading)
    if (block.block_type === 'heading') {
      // Se já temos conteúdo, salvar chunk atual
      if (currentChunk.tokens > MIN_CHUNK_SIZE) {
        chunks.push({...currentChunk});
        // Criar novo chunk com overlap
        const lastBlocks = currentChunk.blocks.slice(-1);
        currentChunk = {
          blocks: lastBlocks,
          content: lastBlocks.map((b: any) => b.content).join('\n\n'),
          tokens: lastBlocks.reduce((sum: number, b: any) => sum + Math.ceil(b.content.length / 4), 0),
          pages: new Set(lastBlocks.map((b: any) => b.page_number)),
          section_title: currentSection,
          block_ids: lastBlocks.map((b: any) => b.block_id),
        };
      }
      currentSection = block.content;
    }
    
    // Se adicionar este bloco ultrapassar o limite e já temos conteúdo mínimo
    if (currentChunk.tokens + blockTokens > MAX_CHUNK_SIZE && currentChunk.tokens >= MIN_CHUNK_SIZE) {
      chunks.push({...currentChunk});
      // Criar novo chunk com overlap
      const lastBlocks = currentChunk.blocks.slice(-2);
      currentChunk = {
        blocks: lastBlocks,
        content: lastBlocks.map((b: any) => b.content).join('\n\n'),
        tokens: lastBlocks.reduce((sum: number, b: any) => sum + Math.ceil(b.content.length / 4), 0),
        pages: new Set(lastBlocks.map((b: any) => b.page_number)),
        section_title: currentSection,
        block_ids: lastBlocks.map((b: any) => b.block_id),
      };
    }
    
    // Adicionar bloco ao chunk atual
    currentChunk.blocks.push(block);
    currentChunk.content += (currentChunk.content ? '\n\n' : '') + block.content;
    currentChunk.tokens += blockTokens;
    currentChunk.pages.add(block.page_number);
    currentChunk.block_ids.push(block.block_id);
    if (!currentChunk.section_title && currentSection) {
      currentChunk.section_title = currentSection;
    }
  }
  
  // Adicionar último chunk se tiver conteúdo
  if (currentChunk.tokens > 0) {
    chunks.push(currentChunk);
  }
  
  // Adicionar tabelas como chunks atômicos
  for (const table of tables) {
    chunks.push({
      blocks: [],
      content: table.markdown,
      tokens: Math.ceil(table.markdown.length / 4),
      pages: new Set([table.page_number]),
      section_title: table.caption || 'Tabela',
      block_ids: [table.table_id],
      is_atomic: true,
      chunk_type: 'table',
      table_data: table
    });
  }
  
  return chunks;
}

// Generate embeddings using OpenAI
async function generateEmbedding(text: string): Promise<number[]> {
  const response = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "text-embedding-3-small",
      input: text,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`OpenAI API error: ${error}`);
  }

  const data = await response.json();
  return data.data[0].embedding;
}

// Process blocks with rate limit control
async function processBlocksWithBackoff(
  blocks: any[],
  documentId: string,
  supabaseClient: any
): Promise<void> {
  const batchSize = 3;
  const MAX_RETRIES = 3;

  for (let i = 0; i < blocks.length; i += batchSize) {
    const batch = blocks.slice(i, Math.min(i + batchSize, blocks.length));
    let attempt = 0;

    while (attempt < MAX_RETRIES) {
      try {
        await Promise.all(
          batch.map(async (block) => {
            // Generate embedding for the block content
            const embedding = await generateEmbedding(block.content);

            // Insert block with embedding
            const { error: blockError } = await supabaseClient
              .from("document_blocks")
              .insert({
                document_id: documentId,
                page_number: block.page_number,
                block_id: block.block_id,
                block_type: block.block_type,
                content: block.content,
                markdown: block.markdown,
                bbox: block.bbox,
                section_title: block.section_title,
                token_count: Math.ceil(block.content.length / 4),
                embedding: embedding,
              });

            if (blockError) {
              console.error(`Error storing block ${block.block_id}:`, blockError);
              throw blockError;
            }
          })
        );

        console.log(`✅ Processed blocks ${i}-${Math.min(i + batchSize - 1, blocks.length - 1)}`);
        break; // Success

      } catch (error: any) {
        attempt++;
        if (error.message?.includes("429") && attempt < MAX_RETRIES) {
          const delay = Math.pow(2, attempt) * 1000;
          console.log(`⏳ Rate limit hit, retrying in ${delay}ms (attempt ${attempt}/${MAX_RETRIES})`);
          await new Promise(resolve => setTimeout(resolve, delay));
        } else {
          throw error;
        }
      }
    }

    // Delay between batches
    if (i + batchSize < blocks.length) {
      await new Promise(resolve => setTimeout(resolve, 1500));
    }
  }
}

// Process tables with embeddings
async function processTablesWithBackoff(
  tables: any[],
  documentId: string,
  supabaseClient: any
): Promise<void> {
  for (const table of tables) {
    try {
      // Generate embedding for table markdown
      const embedding = await generateEmbedding(table.markdown);

      const { error: tableError } = await supabaseClient
        .from("document_tables")
        .insert({
          document_id: documentId,
          page_number: table.page_number,
          table_id: table.table_id,
          markdown: table.markdown,
          structured_data: table.structured_data,
          bbox: table.bbox,
          caption: table.caption,
          embedding: embedding,
        });

      if (tableError) {
        console.error(`Error storing table ${table.table_id}:`, tableError);
        throw tableError;
      }

      console.log(`✅ Processed table ${table.table_id}`);
      
      // Delay to avoid rate limits
      await new Promise(resolve => setTimeout(resolve, 1000));

    } catch (error: any) {
      console.error(`Failed to process table ${table.table_id}:`, error);
      throw error;
    }
  }
}

// Process images
async function processImages(
  images: any[],
  documentId: string,
  supabaseClient: any
): Promise<void> {
  for (const image of images) {
    try {
      const { error: imageError } = await supabaseClient
        .from("document_images")
        .insert({
          document_id: documentId,
          page_number: image.page_number,
          image_id: image.image_id,
          image_type: image.image_type,
          storage_path: image.storage_path,
          thumbnail_path: image.thumbnail_path,
          bbox: image.bbox,
          caption: image.caption,
          description: image.description,
        });

      if (imageError) {
        console.error(`Error storing image ${image.image_id}:`, imageError);
        throw imageError;
      }

      console.log(`✅ Processed image ${image.image_id}`);

    } catch (error: any) {
      console.error(`Failed to process image ${image.image_id}:`, error);
      throw error;
    }
  }
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

    const { documentId }: ProcessRequest = await req.json();
    console.log("📄 Processing structured document:", documentId);

    // Update status
    await supabaseClient
      .from("knowledge_documents")
      .update({ status: "processing", progress: 10 })
      .eq("id", documentId);

    // Get document
    const { data: document, error: docError } = await supabaseClient
      .from("knowledge_documents")
      .select("*")
      .eq("id", documentId)
      .single();

    if (docError || !document) {
      throw new Error(`Document not found: ${docError?.message}`);
    }

    console.log("✅ Document fetched:", document.title);

    // Parse PDF with structured extraction
    if (document.file_path && document.file_path.includes('.pdf')) {
      console.log("🔍 Parsing PDF with structured extraction...");

      const { data: pdfData, error: pdfError } = await supabaseClient.functions.invoke('parse-pdf', {
        body: {
          filePath: document.file_path,
          documentId: documentId
        }
      });

      if (pdfError) {
        throw new Error(`Failed to parse PDF: ${pdfError.message}`);
      }

      if (!pdfData || !pdfData.success) {
        throw new Error("PDF parsing failed");
      }

      console.log("✅ PDF parsed successfully");

      // Update progress
      await supabaseClient
        .from("knowledge_documents")
        .update({ progress: 20 })
        .eq("id", documentId);

      // Process blocks if structured extraction succeeded
      if (pdfData.structured && pdfData.blocks && pdfData.blocks.length > 0) {
        console.log(`📝 Processing ${pdfData.blocks.length} blocks...`);
        await processBlocksWithBackoff(pdfData.blocks, documentId, supabaseClient);
        
        await supabaseClient
          .from("knowledge_documents")
          .update({ progress: 50 })
          .eq("id", documentId);

        // Criar chunks semânticos
        console.log(`🧩 Creating semantic chunks...`);
        const semanticChunks = createSemanticChunks(
          pdfData.blocks || [],
          pdfData.tables || []
        );
        
        console.log(`✅ Created ${semanticChunks.length} semantic chunks`);
        
        // Processar chunks semânticos
        const chunkBatchSize = 3;
        for (let i = 0; i < semanticChunks.length; i += chunkBatchSize) {
          const batch = semanticChunks.slice(i, Math.min(i + chunkBatchSize, semanticChunks.length));
          
          for (const chunk of batch) {
            try {
              const embedding = await generateEmbedding(chunk.content);
              
              const pages = Array.from(chunk.pages).sort((a: any, b: any) => a - b);
              const pageRange = pages.length === 1 
                ? `${pages[0]}` 
                : `${pages[0]}-${pages[pages.length - 1]}`;
              
              const { error: chunkError } = await supabaseClient
                .from("document_chunks")
                .insert({
                  document_id: documentId,
                  chunk_order: i,
                  content: chunk.content,
                  embedding: embedding,
                  page_range: pageRange,
                  block_ids: chunk.block_ids,
                  section_title: chunk.section_title || null,
                  is_atomic: chunk.is_atomic || false,
                  chunk_type: chunk.chunk_type || 'mixed',
                  hash: `chunk_${i}_${chunk.tokens}`,
                });

              if (chunkError) {
                console.error(`Error storing semantic chunk ${i}:`, chunkError);
                throw chunkError;
              }
            } catch (error: any) {
              console.error(`Failed to process semantic chunk ${i}:`, error);
              throw error;
            }
          }
          
          // Delay entre batches
          if (i + chunkBatchSize < semanticChunks.length) {
            await new Promise(resolve => setTimeout(resolve, 1500));
          }
        }
        
        await supabaseClient
          .from("knowledge_documents")
          .update({ progress: 70 })
          .eq("id", documentId);
      }

      // Process tables
      if (pdfData.tables && pdfData.tables.length > 0) {
        console.log(`📊 Processing ${pdfData.tables.length} tables...`);
        await processTablesWithBackoff(pdfData.tables, documentId, supabaseClient);
        
        await supabaseClient
          .from("knowledge_documents")
          .update({ progress: 85 })
          .eq("id", documentId);
      }

      // Process images
      if (pdfData.images && pdfData.images.length > 0) {
        console.log(`🖼️ Processing ${pdfData.images.length} images...`);
        await processImages(pdfData.images, documentId, supabaseClient);
        
        await supabaseClient
          .from("knowledge_documents")
          .update({ progress: 95 })
          .eq("id", documentId);
      }

      // Mark as ready
      await supabaseClient
        .from("knowledge_documents")
        .update({ status: "ready", progress: 100 })
        .eq("id", documentId);

      console.log("✅ Document processing completed successfully");

      // Get final stats
      const { data: chunks } = await supabaseClient
        .from("document_chunks")
        .select("chunk_type, is_atomic")
        .eq("document_id", documentId);

      const chunkStats = {
        total: chunks?.length || 0,
        semantic: chunks?.filter((c: any) => c.chunk_type === 'mixed').length || 0,
        tables: chunks?.filter((c: any) => c.chunk_type === 'table').length || 0,
        atomic: chunks?.filter((c: any) => c.is_atomic).length || 0
      };

      return new Response(
        JSON.stringify({
          success: true,
          message: `Document processed with semantic chunking`,
          stats: {
            blocks: pdfData.blocks?.length || 0,
            tables: pdfData.tables?.length || 0,
            images: pdfData.images?.length || 0,
            chunks: chunkStats
          }
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        }
      );

    } else {
      throw new Error("Only PDF files are supported for structured processing");
    }

  } catch (error: any) {
    console.error("❌ Error in process-structured-document:", error);

    // Try to update document status
    try {
      const supabaseClient = createClient(
        Deno.env.get("SUPABASE_URL") ?? "",
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      );

      const { documentId } = await req.clone().json();
      await supabaseClient
        .from("knowledge_documents")
        .update({
          status: "error",
          error_message: error.message
        })
        .eq("id", documentId);
    } catch (updateError) {
      console.error("Failed to update error status:", updateError);
    }

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
