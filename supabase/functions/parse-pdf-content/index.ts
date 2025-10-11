import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");

interface ParsePdfRequest {
  fileContent: string;
  fileName: string;
}

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { fileContent, fileName }: ParsePdfRequest = await req.json();
    
    if (!fileContent) {
      throw new Error("No file content provided");
    }

    console.log("Parsing PDF:", fileName, "size:", fileContent.length);

    // Use OpenAI to extract text from PDF using vision API
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o",
        messages: [
          {
            role: "user",
            content: [
              {
                type: "text",
                text: "Extract ALL the text content from this PDF document. Return ONLY the extracted text without any additional commentary, formatting, or explanations. Include all paragraphs, headings, and important information."
              },
              {
                type: "image_url",
                image_url: {
                  url: `data:application/pdf;base64,${fileContent}`,
                  detail: "high"
                }
              }
            ]
          }
        ],
        max_tokens: 4000
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("OpenAI API error:", response.status, errorText);
      throw new Error(`Failed to parse PDF: ${errorText}`);
    }

    const data = await response.json();
    const extractedText = data.choices[0].message.content;

    console.log("Text extracted successfully, length:", extractedText.length);

    return new Response(
      JSON.stringify({ 
        success: true,
        text: extractedText,
        length: extractedText.length
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );
  } catch (error: any) {
    console.error("Error in parse-pdf-content function:", error);
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
