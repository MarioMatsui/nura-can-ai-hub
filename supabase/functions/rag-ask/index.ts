import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.75.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");

// Generate embedding for query
async function generateEmbedding(text: string): Promise<number[]> {
  const response = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "text-embedding-3-small",
      input: text,
    }),
  });

  if (!response.ok) {
    throw new Error(`OpenAI embeddings error: ${await response.text()}`);
  }

  const data = await response.json();
  return data.data[0].embedding;
}

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
    
    // Generate embedding for the question
    const queryEmbedding = await generateEmbedding(question);
    console.log("Query embedding generated");

    // Search for similar chunks
    const { data: similarChunks, error: searchError } = await supabaseClient.rpc(
      'search_similar_chunks',
      {
        query_embedding: JSON.stringify(queryEmbedding),
        knowledge_type_filter: knowledge_type || 'medical',
        match_count: 8
      }
    );

    if (searchError) {
      console.error("Search error:", searchError);
      throw searchError;
    }

    console.log(`Found ${similarChunks?.length || 0} similar chunks`);

    // Build context from similar chunks (max 12k chars)
    let context = "";
    const maxChars = 12000;
    const citations: any[] = [];

    for (const chunk of similarChunks || []) {
      if (context.length + chunk.content.length > maxChars) break;
      
      citations.push({
        order: chunk.id,
        similarity: chunk.similarity,
        document_title: chunk.document_title,
      });
      
      context += `\n\n[Documento: ${chunk.document_title}]\n${chunk.content}`;
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

    // Call GPT-4.1-mini for fast, cheap response
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4.1-mini-2025-04-14",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: question }
        ],
        max_completion_tokens: 1000,
        temperature: 0.3,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      console.error("OpenAI error:", error);
      throw new Error(`OpenAI API error: ${error}`);
    }

    const data = await response.json();
    const answer = data.choices[0].message.content;

    return new Response(
      JSON.stringify({
        answer,
        citations,
        chunks_used: similarChunks?.length || 0,
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
