import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.75.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface ParsePdfRequest {
  filePath: string;
  bucket?: string;
  convertToImages?: boolean; // If true, return base64 images of each page
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

    const { filePath, bucket, convertToImages = false }: ParsePdfRequest = await req.json();
    console.log("Parsing PDF:", filePath, "from bucket:", bucket || "auto-detect", "Convert to images:", convertToImages);

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

    if (convertToImages) {
      console.log("Converting PDF to images using external API...");
      
      // Convert blob to base64 for API submission
      const arrayBuffer = await fileData.arrayBuffer();
      const base64Pdf = btoa(String.fromCharCode(...new Uint8Array(arrayBuffer)));
      
      // Use LlamaParse or similar API to convert PDF pages to images
      // For now, we'll use a simpler approach with pdf.js rendering on the backend
      const pdfJsUrl = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js";
      
      return new Response(
        JSON.stringify({
          success: true,
          message: "PDF to image conversion requires client-side processing with pdf.js",
          pdfBase64: base64Pdf,
          useClientSideConversion: true
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        }
      );
    } else {
      // Original text extraction logic
      const arrayBuffer = await fileData.arrayBuffer();
      const uint8Array = new Uint8Array(arrayBuffer);
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

      console.log("Text extracted, length:", cleanedText.length);
      console.log("First 500 chars:", cleanedText.substring(0, 500));

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
    }
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
