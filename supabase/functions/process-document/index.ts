import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.75.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const securityHeaders = {
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Referrer-Policy": "strict-origin-when-cross-origin",
};

interface ProcessDocumentRequest {
  documentId: string;
}

// Function to split text into chunks
function splitIntoChunks(text: string, chunkSize: number = 800, overlap: number = 150): string[] {
  const chunks: string[] = [];
  let start = 0;
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

  const responseHeaders = { "Content-Type": "application/json", ...corsHeaders, ...securityHeaders };

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";

    // --- AUTH: Verify caller is admin ---
    const authHeader = req.headers.get("Authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: responseHeaders }
      );
    }

    const anonClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: userError } = await anonClient.auth.getUser();
    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: responseHeaders }
      );
    }

    // Check admin role
    const serviceClient = createClient(supabaseUrl, supabaseServiceKey);
    const { data: roleData } = await serviceClient
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .eq("role", "admin")
      .maybeSingle();

    if (!roleData) {
      return new Response(
        JSON.stringify({ error: "Forbidden" }),
        { status: 403, headers: responseHeaders }
      );
    }
    // --- END AUTH ---

    const { documentId }: ProcessDocumentRequest = await req.json();

    // Input validation
    if (!documentId || typeof documentId !== "string" || documentId.length > 100) {
      return new Response(
        JSON.stringify({ error: "Invalid documentId" }),
        { status: 400, headers: responseHeaders }
      );
    }

    console.log("Starting document processing");

    // Get document
    const { data: document, error: docError } = await serviceClient
      .from("knowledge_documents")
      .select("id, content")
      .eq("id", documentId)
      .single();

    if (docError || !document) {
      throw new Error(`Document not found`);
    }

    let textContent = document.content;

    if (!textContent || textContent.length < 10) {
      throw new Error("No valid text content found in document");
    }

    const maxContentLength = 100000;
    if (textContent.length > maxContentLength) {
      console.log(`Content too long (${textContent.length}), truncating to ${maxContentLength} characters`);
      textContent = textContent.substring(0, maxContentLength);
    }

    console.log("Document found, content length:", textContent.length);

    const chunks = splitIntoChunks(textContent);
    console.log(`Created ${chunks.length} chunks`);

    const batchSize = 10;
    for (let i = 0; i < chunks.length; i += batchSize) {
      const batch = chunks.slice(i, Math.min(i + batchSize, chunks.length));
      console.log(`Processing batch ${Math.floor(i/batchSize) + 1}, chunks ${i}-${i + batch.length - 1}`);
      
      await Promise.all(
        batch.map(async (chunkContent, batchIndex) => {
          const chunkIndex = i + batchIndex;
          
          try {
            const { error: chunkError } = await serviceClient
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
      { status: 200, headers: responseHeaders }
    );
  } catch (error: any) {
    console.error("Error in process-document function:", error);
    return new Response(
      JSON.stringify({ error: "Erro ao processar documento." }),
      { status: 500, headers: responseHeaders }
    );
  }
};

serve(handler);
