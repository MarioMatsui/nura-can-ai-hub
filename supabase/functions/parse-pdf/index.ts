import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.75.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface ParsePdfRequest {
  filePath: string;
  bucket?: string; // Optional bucket name, defaults to trying both
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

    const { filePath, bucket }: ParsePdfRequest = await req.json();
    console.log("Parsing PDF:", filePath, "from bucket:", bucket || "auto-detect");

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

    console.log("PDF downloaded, size:", fileData.size);

    // Convert to ArrayBuffer for parsing
    const arrayBuffer = await fileData.arrayBuffer();
    const uint8Array = new Uint8Array(arrayBuffer);

    // Use a simple text extraction approach
    // For production, you'd want to use a proper PDF parsing library
    const text = new TextDecoder('utf-8', { fatal: false }).decode(uint8Array);
    
    // Clean up the extracted text
    const cleanedText = text
      .replace(/[^\x20-\x7E\n\r\t]/g, ' ') // Remove non-printable characters
      .replace(/\s+/g, ' ') // Normalize whitespace
      .trim();

    console.log("Text extracted, length:", cleanedText.length);

    if (cleanedText.length < 100) {
      throw new Error("Could not extract meaningful text from PDF. The file may be image-based or corrupted.");
    }

    return new Response(
      JSON.stringify({ 
        success: true,
        text: cleanedText,
        length: cleanedText.length
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
