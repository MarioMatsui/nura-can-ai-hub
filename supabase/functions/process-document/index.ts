import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.75.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");

interface ProcessDocumentRequest {
  documentId: string;
}

// Function to split text into chunks (optimized for TPM)
function splitIntoChunks(text: string, chunkSize: number = 2000, overlap: number = 200): string[] {
  const chunks: string[] = [];
  let start = 0;

  while (start < text.length) {
    const end = Math.min(start + chunkSize, text.length);
    const chunk = text.slice(start, end);
    chunks.push(chunk);
    start = end - overlap;
    
    if (start >= text.length) break;
  }

  return chunks;
}

// Generate hash for chunk
function generateChunkHash(content: string, order: number): string {
  const prefix = content.substring(0, 200);
  const hashInput = `${prefix}:${content.length}:${order}`;
  return btoa(hashInput).substring(0, 40);
}

// Function to generate embeddings using OpenAI (optimized model)
async function generateEmbedding(text: string): Promise<number[]> {
  const response = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "text-embedding-3-small", // Cheaper and faster
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

// Batch processing with TPM control
async function processBatchWithBackoff(
  batch: Array<{content: string, order: number}>,
  documentId: string,
  supabaseClient: any,
  batchIndex: number
): Promise<void> {
  const MAX_RETRIES = 3;
  let attempt = 0;
  
  while (attempt < MAX_RETRIES) {
    try {
      await Promise.all(
        batch.map(async ({ content, order }) => {
          const embedding = await generateEmbedding(content);
          const hash = generateChunkHash(content, order);

          const { error: chunkError } = await supabaseClient
            .from("document_chunks")
            .insert({
              document_id: documentId,
              chunk_order: order,
              content: content,
              embedding: embedding,
              hash: hash,
            });

          if (chunkError) {
            console.error(`Error storing chunk ${order}:`, chunkError);
            throw chunkError;
          }
          
          console.log(`Chunk ${order} processed successfully`);
        })
      );
      
      return; // Success, exit retry loop
    } catch (error: any) {
      attempt++;
      if (error.message?.includes("429") || error.message?.includes("rate_limit")) {
        const backoffTime = Math.pow(2, attempt) * 1000; // Exponential backoff
        console.log(`Rate limit hit, backing off for ${backoffTime}ms (attempt ${attempt}/${MAX_RETRIES})`);
        await new Promise(resolve => setTimeout(resolve, backoffTime));
      } else {
        throw error; // Non-retryable error
      }
    }
  }
  
  throw new Error(`Failed to process batch ${batchIndex} after ${MAX_RETRIES} attempts`);
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

    console.log("Processing document:", documentId);

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

    // Update status to processing
    await supabaseClient
      .from("knowledge_documents")
      .update({ status: "processing", progress: 10 })
      .eq("id", documentId);

    // Split document into chunks (2000 tokens ~= 8000 chars)
    const chunks = splitIntoChunks(textContent);
    console.log(`Created ${chunks.length} chunks`);

    // Update progress after chunking
    await supabaseClient
      .from("knowledge_documents")
      .update({ progress: 30 })
      .eq("id", documentId);

    // Process chunks in small batches with TPM control
    // TPM = 30k, chunk ~2k tokens, safe concurrency = 3-4
    const batchSize = 3;
    const totalBatches = Math.ceil(chunks.length / batchSize);
    
    for (let i = 0; i < chunks.length; i += batchSize) {
      const batchNum = Math.floor(i / batchSize) + 1;
      const batch = chunks.slice(i, Math.min(i + batchSize, chunks.length))
        .map((content, idx) => ({ content, order: i + idx }));
      
      console.log(`Processing batch ${batchNum}/${totalBatches}, chunks ${i}-${i + batch.length - 1}`);
      
      // Process batch with exponential backoff on rate limits
      await processBatchWithBackoff(batch, documentId, supabaseClient, batchNum);
      
      // Update progress
      const progress = Math.min(30 + Math.floor((batchNum / totalBatches) * 60), 90);
      await supabaseClient
        .from("knowledge_documents")
        .update({ progress })
        .eq("id", documentId);
      
      // Delay between batches to avoid rate limiting (1.5s)
      if (i + batchSize < chunks.length) {
        await new Promise(resolve => setTimeout(resolve, 1500));
      }
    }

    // Mark as ready
    await supabaseClient
      .from("knowledge_documents")
      .update({ status: "ready", progress: 100 })
      .eq("id", documentId);

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
    
    // Update document status to error
    try {
      const { documentId } = await req.json();
      if (documentId) {
        const supabaseClient = createClient(
          Deno.env.get("SUPABASE_URL") ?? "",
          Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
        );
        await supabaseClient
          .from("knowledge_documents")
          .update({ 
            status: "error", 
            error_message: error.message,
            progress: 0
          })
          .eq("id", documentId);
      }
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
