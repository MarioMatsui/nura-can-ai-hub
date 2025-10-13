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
          .update({ progress: 60 })
          .eq("id", documentId);
      }

      // Process tables
      if (pdfData.tables && pdfData.tables.length > 0) {
        console.log(`📊 Processing ${pdfData.tables.length} tables...`);
        await processTablesWithBackoff(pdfData.tables, documentId, supabaseClient);
        
        await supabaseClient
          .from("knowledge_documents")
          .update({ progress: 80 })
          .eq("id", documentId);
      }

      // Process images
      if (pdfData.images && pdfData.images.length > 0) {
        console.log(`🖼️ Processing ${pdfData.images.length} images...`);
        await processImages(pdfData.images, documentId, supabaseClient);
        
        await supabaseClient
          .from("knowledge_documents")
          .update({ progress: 90 })
          .eq("id", documentId);
      }

      // Mark as ready
      await supabaseClient
        .from("knowledge_documents")
        .update({ status: "ready", progress: 100 })
        .eq("id", documentId);

      console.log("✅ Document processing completed successfully");

      return new Response(
        JSON.stringify({
          success: true,
          message: `Document processed with structured extraction`,
          stats: {
            blocks: pdfData.blocks?.length || 0,
            tables: pdfData.tables?.length || 0,
            images: pdfData.images?.length || 0
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
