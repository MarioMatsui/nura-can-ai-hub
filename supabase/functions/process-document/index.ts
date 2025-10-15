import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.75.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface ProcessDocumentRequest {
  documentId: string;
}

// Function to split text into chunks
function splitIntoChunks(text: string, chunkSize: number = 800, overlap: number = 150): string[] {
  const chunks: string[] = [];
  let start = 0;

  // Limit total chunks to avoid memory issues
  const maxChunks = 50;
  let chunkCount = 0;

  while (start < text.length && chunkCount < maxChunks) {
    const end = Math.min(start + chunkSize, text.length);
    chunks.push(text.slice(start, end));
    start = end - overlap;
    chunkCount++;
    
    if (start >= text.length) break;
  }

  return chunks;
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

    const { documentId }: ProcessDocumentRequest = await req.json();

    console.log("Starting document processing");

    // Get document
    const { data: document, error: docError } = await supabaseClient
      .from("knowledge_documents")
      .select("id, content")
      .eq("id", documentId)
      .single();

    if (docError || !document) {
      throw new Error(`Document not found: ${docError?.message}`);
    }

    let textContent = document.content;

    if (!textContent || textContent.length < 10) {
      throw new Error("No valid text content found in document");
    }

    // Limit content size to avoid memory issues (first 100KB)
    const maxContentLength = 100000;
    if (textContent.length > maxContentLength) {
      console.log(`Content too long (${textContent.length}), truncating to ${maxContentLength} characters`);
      textContent = textContent.substring(0, maxContentLength);
    }

    console.log("Document found, content length:", textContent.length);

    // Split document into chunks
    const chunks = splitIntoChunks(textContent);
    console.log(`Created ${chunks.length} chunks`);

    // Store chunks without embeddings (we'll use text-based search instead)
    const batchSize = 10;
    for (let i = 0; i < chunks.length; i += batchSize) {
      const batch = chunks.slice(i, Math.min(i + batchSize, chunks.length));
      console.log(`Processing batch ${Math.floor(i/batchSize) + 1}, chunks ${i}-${i + batch.length - 1}`);
      
      // Process batch in parallel
      await Promise.all(
        batch.map(async (chunkContent, batchIndex) => {
          const chunkIndex = i + batchIndex;
          
          try {
            // Store chunk without embedding (relying on Gemini's understanding)
            const { error: chunkError } = await supabaseClient
              .from("document_chunks")
              .insert({
                document_id: documentId,
                chunk_order: chunkIndex,
                content: chunkContent,
              });

            if (chunkError) {
              console.error(`Error storing chunk ${chunkIndex}:`, chunkError);
              throw chunkError;
            }
            
            console.log(`Chunk ${chunkIndex} stored successfully`);
          } catch (error) {
            console.error(`Failed to process chunk ${chunkIndex}:`, error);
            throw error;
          }
        })
      );
    }

    console.log("Document processing completed successfully");

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: `Document processed: ${chunks.length} chunks created`,
        chunks: chunks.length
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );
  } catch (error: any) {
    console.error("Error in process-document function:", error);
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
