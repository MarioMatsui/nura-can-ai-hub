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

// Function to split text into chunks
function splitIntoChunks(text: string, chunkSize: number = 1000, overlap: number = 200): string[] {
  const chunks: string[] = [];
  let start = 0;

  while (start < text.length) {
    const end = Math.min(start + chunkSize, text.length);
    chunks.push(text.slice(start, end));
    start = end - overlap;
    
    if (start >= text.length) break;
  }

  return chunks;
}

// Function to generate embeddings using OpenAI
async function generateEmbedding(text: string): Promise<number[]> {
  const response = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "text-embedding-ada-002",
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
      .select("*")
      .eq("id", documentId)
      .single();

    if (docError || !document) {
      throw new Error(`Document not found: ${docError?.message}`);
    }

    const textContent = document.content;

    if (!textContent || textContent.length < 10) {
      throw new Error("No valid text content found in document");
    }

    console.log("Document found, splitting into chunks...");

    // Split document into chunks
    const chunks = splitIntoChunks(textContent);
    console.log(`Created ${chunks.length} chunks`);

    // Process each chunk
    for (let i = 0; i < chunks.length; i++) {
      console.log(`Processing chunk ${i + 1}/${chunks.length}...`);
      
      // Generate embedding
      const embedding = await generateEmbedding(chunks[i]);

      // Store chunk with embedding
      const { error: chunkError } = await supabaseClient
        .from("document_chunks")
        .insert({
          document_id: documentId,
          chunk_index: i,
          content: chunks[i],
          embedding: embedding,
        });

      if (chunkError) {
        console.error(`Error storing chunk ${i}:`, chunkError);
        throw chunkError;
      }
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
