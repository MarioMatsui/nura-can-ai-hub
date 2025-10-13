import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.75.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );

    const { question, doc_id, knowledge_type } = await req.json();

    if (!question) {
      return new Response(
        JSON.stringify({ error: "question is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("RAG Query:", question);
    
    // Search using text-based search instead of embeddings
    const { data: documents, error: searchError } = await supabaseClient
      .from('knowledge_documents')
      .select('id, title, content')
      .eq('knowledge_type', knowledge_type || 'medical')
      .eq('status', 'ready')
      .limit(5);

    if (searchError) {
      console.error("Search error:", searchError);
      throw searchError;
    }

    console.log(`Found ${documents?.length || 0} documents`);

    // Build context from documents (max 50k chars for Gemini's large context)
    let context = "";
    const maxChars = 50000;
    const citations: any[] = [];

    for (const doc of documents || []) {
      if (context.length + doc.content.length > maxChars) break;
      
      citations.push({
        document_id: doc.id,
        document_title: doc.title,
      });
      
      context += `\n\n[Documento: ${doc.title}]\n${doc.content}`;
    }

    console.log(`Context built: ${context.length} chars`);

    // Build anti-hallucination prompt
    const systemPrompt = `Você é um assistente médico especializado. Responda APENAS com base nos trechos fornecidos abaixo.

REGRAS CRÍTICAS:
- Se a informação NÃO estiver nos trechos, diga "Não encontrei essa informação nos documentos fornecidos."
- NÃO invente, deduza ou assuma informações
- Cite os documentos quando possível
- Seja preciso e objetivo

TRECHOS DOS DOCUMENTOS:
${context}`;

    // Call Gemini 2.5 Pro for response
    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-pro",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: question }
        ],
        max_completion_tokens: 8000,
        temperature: 0.3,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      console.error("Lovable AI error:", error);
      throw new Error(`Lovable AI error: ${error}`);
    }

    const data = await response.json();
    const answer = data.choices[0].message.content;

    return new Response(
      JSON.stringify({
        answer,
        citations,
        documents_used: documents?.length || 0,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error: any) {
    console.error("Error in rag-ask:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
