import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.75.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");

interface AnalyzeImageRequest {
  imageId?: string;
  storagePath?: string;
  question: string;
  context?: string;
  bbox?: { x: number; y: number; width: number; height: number };
}

// Crop image to specific region
async function cropImage(
  imageBlob: Blob,
  bbox: { x: number; y: number; width: number; height: number }
): Promise<string> {
  // Convert blob to base64 for processing
  const arrayBuffer = await imageBlob.arrayBuffer();
  const base64 = btoa(String.fromCharCode(...new Uint8Array(arrayBuffer)));
  
  // For simplicity, return full image
  // In production, you'd use canvas API or image processing library
  return `data:image/png;base64,${base64}`;
}

// Analyze image with GPT-4o Vision
async function analyzeWithVision(
  imageDataUrl: string,
  question: string,
  context?: string
): Promise<string> {
  const messages: any[] = [
    {
      role: "system",
      content: `Você é um especialista em análise de documentos técnicos, especialmente Certificados de Análise (COA) de cannabis medicinal.

Ao analisar imagens:
- Identifique tabelas, gráficos, assinaturas, selos, QR codes
- Extraia dados numéricos com precisão
- Descreva elementos visuais importantes
- Para COAs: foque em valores de THC, CBD, contaminantes, datas, lotes
- Para gráficos: descreva tendências e valores-chave
- Para assinaturas/selos: confirme presença e legitimidade visual

Seja preciso e factual.`
    }
  ];

  if (context) {
    messages.push({
      role: "user",
      content: `Contexto adicional: ${context}`
    });
  }

  messages.push({
    role: "user",
    content: [
      {
        type: "text",
        text: question
      },
      {
        type: "image_url",
        image_url: {
          url: imageDataUrl,
          detail: "high" // High detail for precision
        }
      }
    ]
  });

  const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${LOVABLE_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "google/gemini-2.5-pro",
      messages,
      max_completion_tokens: 8000,
      temperature: 0.2,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Lovable AI Vision error: ${error}`);
  }

  const data = await response.json();
  return data.choices[0].message.content;
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

    const { imageId, storagePath, question, context, bbox }: AnalyzeImageRequest = await req.json();
    
    console.log("🔍 Analyzing image with Gemini 2.5 Pro");

    let imageUrl = "";
    let imageInfo: any = null;

    // Get image info from database if imageId provided
    if (imageId) {
      const { data: image, error } = await supabaseClient
        .from("document_images")
        .select("*, knowledge_documents(title)")
        .eq("image_id", imageId)
        .single();

      if (error || !image) {
        throw new Error(`Image not found: ${imageId}`);
      }

      imageInfo = image;
      console.log("📄 Image found:", image.storage_path);

      // Get signed URL for the image
      const { data: signedUrlData, error: urlError } = await supabaseClient.storage
        .from("document-images")
        .createSignedUrl(image.storage_path, 3600);

      if (urlError || !signedUrlData) {
        throw new Error(`Failed to get signed URL: ${urlError?.message}`);
      }

      imageUrl = signedUrlData.signedUrl;
    } else if (storagePath) {
      // Direct storage path provided
      const { data: signedUrlData, error: urlError } = await supabaseClient.storage
        .from("document-images")
        .createSignedUrl(storagePath, 3600);

      if (urlError || !signedUrlData) {
        throw new Error(`Failed to get signed URL: ${urlError?.message}`);
      }

      imageUrl = signedUrlData.signedUrl;
    } else {
      throw new Error("Either imageId or storagePath must be provided");
    }

    // If bbox provided, we'd crop the image here
    // For now, use full image
    console.log("🖼️ Processing image with Vision API...");

    // Build enriched context
    let enrichedContext = context || "";
    if (imageInfo) {
      enrichedContext += `\nImagem do documento: ${imageInfo.knowledge_documents?.title || 'Documento'}`;
      if (imageInfo.page_number) {
        enrichedContext += `\nPágina: ${imageInfo.page_number}`;
      }
      if (imageInfo.caption) {
        enrichedContext += `\nLegenda: ${imageInfo.caption}`;
      }
      if (imageInfo.image_type) {
        enrichedContext += `\nTipo: ${imageInfo.image_type}`;
      }
    }

    // Analyze with GPT-4o Vision
    const analysis = await analyzeWithVision(imageUrl, question, enrichedContext);

    console.log("✅ Analysis complete");

    // Update image with AI-generated description if not exists
    if (imageId && !imageInfo.description) {
      await supabaseClient
        .from("document_images")
        .update({ description: analysis.substring(0, 500) })
        .eq("image_id", imageId);
    }

    return new Response(
      JSON.stringify({
        success: true,
        analysis,
        image_info: imageInfo ? {
          page_number: imageInfo.page_number,
          image_type: imageInfo.image_type,
          caption: imageInfo.caption,
          document_title: imageInfo.knowledge_documents?.title
        } : null
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );

  } catch (error: any) {
    console.error("❌ Error in analyze-image:", error);
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
