import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.75.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface ParsePdfRequest {
  filePath: string;
  bucket?: string;
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

    const { filePath, bucket = "knowledge-documents" }: ParsePdfRequest = await req.json();
    console.log("Parsing PDF from bucket:", bucket, "path:", filePath);

    // Download the PDF from storage
    const { data: fileData, error: downloadError } = await supabaseClient
      .storage
      .from(bucket)
      .download(filePath);

    if (downloadError || !fileData) {
      throw new Error(`Failed to download file: ${downloadError?.message}`);
    }

    console.log("PDF downloaded, size:", fileData.size);

    // Convert to ArrayBuffer for parsing
    const arrayBuffer = await fileData.arrayBuffer();
    
    // Use pdfjs to extract text
    const pdfjsLib = await import("https://esm.sh/pdfjs-dist@4.0.379/legacy/build/pdf.mjs");
    
    // Load the PDF document
    const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
    const pdfDocument = await loadingTask.promise;
    
    console.log("PDF loaded, pages:", pdfDocument.numPages);
    
    let extractedText = "";
    
    // Extract text from each page
    for (let pageNum = 1; pageNum <= pdfDocument.numPages; pageNum++) {
      const page = await pdfDocument.getPage(pageNum);
      const textContent = await page.getTextContent();
      const pageText = textContent.items
        .map((item: any) => item.str)
        .join(" ");
      extractedText += pageText + "\n\n";
    }
    
    console.log("Text extracted, length:", extractedText.length);

    // Clean up the extracted text
    const cleanedText = extractedText
      .replace(/\s+/g, ' ') // Normalize whitespace
      .trim();

    // Limit text size to avoid token limits (max ~100k characters = ~25k tokens)
    const maxLength = 100000;
    let finalText = cleanedText;
    if (cleanedText.length > maxLength) {
      console.log(`Text too long (${cleanedText.length} chars), truncating to ${maxLength} chars`);
      finalText = cleanedText.substring(0, maxLength) + "\n\n[...documento truncado devido ao tamanho...]";
    }

    if (finalText.length < 100) {
      throw new Error("Could not extract meaningful text from PDF. The file may be image-based or corrupted.");
    }

    return new Response(
      JSON.stringify({ 
        success: true,
        text: finalText,
        length: finalText.length,
        truncated: cleanedText.length > maxLength
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
