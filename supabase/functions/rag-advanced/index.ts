import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.75.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");

interface RagRequest {
  question: string;
  knowledgeType: string;
  documentId?: string;
  maxResults?: number;
}

interface Evidence {
  type: 'text' | 'table' | 'image';
  content: string;
  page_number?: number;
  page_range?: string;
  similarity: number;
  document_title: string;
  section_title?: string;
  block_id?: string;
  table_data?: any;
  image_data?: any;
}

// Detectar intenção da query usando Gemini
async function detectIntent(question: string): Promise<{
  type: string;
  needs_table: boolean;
  needs_image: boolean;
  needs_comparison: boolean;
  focus_areas: string[];
}> {
  try {
    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-pro",
        messages: [
          {
            role: "system",
            content: `Analise a pergunta e identifique:
1. Tipo de consulta: geral, numérica, conformidade, explicação, comparação
2. Se precisa de tabelas (valores numéricos, comparações)
3. Se precisa de imagens (gráficos, assinaturas, QR codes)
4. Se é uma comparação entre documentos
5. Áreas de foco (ex: THC, CBD, densidade, datas, lotes)

Retorne apenas JSON puro sem markdown.`
          },
          {
            role: "user",
            content: question
          }
        ],
        temperature: 0.3,
        max_completion_tokens: 1000
      }),
    });

    const data = await response.json();
    const content = data.choices[0].message.content;
    return JSON.parse(content.replace(/```json\n?|\n?```/g, ''));
  } catch (error) {
    console.error("Intent detection error:", error);
    // Fallback intent
    return {
      type: "geral",
      needs_table: false,
      needs_image: false,
      needs_comparison: false,
      focus_areas: []
    };
  }
}

// Busca simplificada (apenas texto e keyword, sem embeddings)
async function hybridSearch(
  question: string,
  knowledgeType: string,
  documentId: string | undefined,
  intentNeedsImage: boolean,
  supabaseClient: any
): Promise<Evidence[]> {
  const evidences: Evidence[] = [];

  // 1. Busca em documentos completos
  const { data: documents, error: docsError } = await supabaseClient
    .from('knowledge_documents')
    .select('id, title, content')
    .eq('knowledge_type', knowledgeType)
    .eq('status', 'ready')
    .limit(5);

  if (!docsError && documents) {
    evidences.push(...documents.map((doc: any) => ({
      type: 'text' as const,
      content: doc.content.substring(0, 5000),
      similarity: 0.8,
      document_title: doc.title
    })));
  }

  // 2. Busca em tabelas
  const { data: tablesData, error: tablesError } = await supabaseClient
    .from('document_tables')
    .select('*')
    .limit(5);

  if (!tablesError && tablesData) {
    evidences.push(...tablesData.map((t: any) => ({
      type: 'table' as const,
      content: t.markdown,
      page_number: t.page_number,
      similarity: 0.75,
      document_title: 'Document',
      table_data: t.structured_data
    })));
  }

  // 3. Busca em imagens (quando intenção requer análise visual)
  if (intentNeedsImage) {
    console.log("🖼️ Fetching relevant images for visual analysis...");
    
    const { data: images, error: imagesError } = await supabaseClient
      .from('document_images')
      .select('*, knowledge_documents(title)')
      .limit(3);

    if (!imagesError && images) {
      evidences.push(...images.map((img: any) => ({
        type: 'image' as const,
        content: img.description || img.caption || 'Imagem disponível para análise',
        page_number: img.page_number,
        similarity: 0.7,
        document_title: img.knowledge_documents?.title || 'Document',
        image_data: {
          image_id: img.image_id,
          storage_path: img.storage_path,
          image_type: img.image_type,
          bbox: img.bbox
        }
      })));
    }
  }

  return evidences;
}

// Reranking usando Gemini
async function rerankEvidences(
  question: string,
  evidences: Evidence[],
  maxResults: number
): Promise<Evidence[]> {
  if (evidences.length === 0) return [];

  // Criar contextos curtos para reranking
  const candidates = evidences.slice(0, 20).map((e, idx) => ({
    index: idx,
    text: e.content.substring(0, 500)
  }));

  try {
    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-pro",
        messages: [
          {
            role: "system",
            content: `Você é um sistema de reranking. Dada uma pergunta e uma lista de trechos, retorne os índices dos ${maxResults} trechos mais relevantes em ordem de relevância.
Considere:
- Relevância direta para a pergunta
- Informações factuais e específicas
- Diversidade de fontes

Retorne apenas JSON: {"ranked_indices": [0, 3, 1, ...]}`
          },
          {
            role: "user",
            content: `Pergunta: ${question}\n\nTrechos:\n${candidates.map((c, i) => `[${i}] ${c.text}`).join('\n\n')}`
          }
        ],
        temperature: 0.2,
        max_completion_tokens: 1000
      }),
    });

    const data = await response.json();
    const content = data.choices[0].message.content;
    const result = JSON.parse(content.replace(/```json\n?|\n?```/g, ''));
    const rankedIndices = result.ranked_indices || [];

    return rankedIndices.slice(0, maxResults).map((idx: number) => evidences[idx]);

  } catch (error) {
    console.error("Reranking failed, using similarity order:", error);
    return evidences
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, maxResults);
  }
}

// Garantir diversidade de fontes
function ensureDiversity(evidences: Evidence[]): Evidence[] {
  const diverse: Evidence[] = [];
  const seenPages = new Set<string>();
  const seenSections = new Set<string>();

  for (const evidence of evidences) {
    const pageKey = `${evidence.document_title}_${evidence.page_number || evidence.page_range}`;
    const sectionKey = `${evidence.document_title}_${evidence.section_title}`;

    // Sempre incluir tabelas e imagens
    if (evidence.type === 'table' || evidence.type === 'image') {
      diverse.push(evidence);
      continue;
    }

    // Para texto, evitar duplicatas de mesma página/seção
    if (!seenPages.has(pageKey) || !seenSections.has(sectionKey)) {
      diverse.push(evidence);
      seenPages.add(pageKey);
      if (evidence.section_title) {
        seenSections.add(sectionKey);
      }
    }

    if (diverse.length >= 10) break;
  }

  return diverse;
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

    const { question, knowledgeType, documentId, maxResults = 5 }: RagRequest = await req.json();
    
    console.log("🔍 Advanced RAG Query:", question);

    // 1. Detectar intenção
    console.log("🧠 Detecting intent...");
    const intent = await detectIntent(question);
    console.log("Intent detected:", intent);

    // 2. Busca híbrida (sem embeddings)
    console.log("🔎 Performing search...");
    const rawEvidences = await hybridSearch(
      question,
      knowledgeType,
      documentId,
      intent.needs_image,
      supabaseClient
    );

    console.log(`✅ Found ${rawEvidences.length} raw evidences`);

    // 4. Reranking
    console.log("📊 Reranking evidences...");
    const rerankedEvidences = await rerankEvidences(
      question,
      rawEvidences,
      maxResults * 2 // Pegar mais para garantir diversidade
    );

    // 5. Garantir diversidade
    console.log("🎯 Ensuring diversity...");
    const diverseEvidences = ensureDiversity(rerankedEvidences);

    console.log(`✅ Final evidence count: ${diverseEvidences.length}`);

    // Retornar evidências estruturadas
    return new Response(
      JSON.stringify({
        success: true,
        intent,
        evidences: diverseEvidences.slice(0, maxResults),
        total_found: rawEvidences.length,
        stats: {
          text_blocks: diverseEvidences.filter(e => e.type === 'text').length,
          tables: diverseEvidences.filter(e => e.type === 'table').length,
          images: diverseEvidences.filter(e => e.type === 'image').length
        }
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );

  } catch (error: any) {
    console.error("❌ Error in rag-advanced:", error);
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
