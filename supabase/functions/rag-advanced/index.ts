import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.75.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");

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

// Gerar embedding para a query
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
    const error = await response.text();
    throw new Error(`OpenAI API error: ${error}`);
  }

  const data = await response.json();
  return data.data[0].embedding;
}

// Detectar intenção da query
async function detectIntent(question: string): Promise<{
  type: string;
  needs_table: boolean;
  needs_image: boolean;
  needs_comparison: boolean;
  focus_areas: string[];
}> {
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: `Analise a pergunta e identifique:
1. Tipo de consulta: geral, numérica, conformidade, explicação, comparação
2. Se precisa de tabelas (valores numéricos, comparações)
3. Se precisa de imagens (gráficos, assinaturas, QR codes)
4. Se é uma comparação entre documentos
5. Áreas de foco (ex: THC, CBD, densidade, datas, lotes)

Retorne JSON puro sem markdown.`
        },
        {
          role: "user",
          content: question
        }
      ],
      response_format: { type: "json_object" },
      temperature: 0.3,
    }),
  });

  const data = await response.json();
  return JSON.parse(data.choices[0].message.content);
}

// Busca híbrida (vetorial + BM25-like)
async function hybridSearch(
  embedding: number[],
  question: string,
  knowledgeType: string,
  documentId: string | undefined,
  intentNeedsImage: boolean,
  supabaseClient: any
): Promise<Evidence[]> {
  const evidences: Evidence[] = [];

  // 1. Busca semântica em chunks
  const { data: chunks, error: chunksError } = await supabaseClient.rpc(
    'search_semantic_chunks',
    {
      query_embedding: embedding,
      knowledge_type_filter: knowledgeType,
      match_count: 10
    }
  );

  if (chunksError) {
    console.error("Error searching chunks:", chunksError);
  } else if (chunks) {
    evidences.push(...chunks.map((c: any) => ({
      type: 'text' as const,
      content: c.content,
      page_range: c.page_range,
      similarity: c.similarity,
      document_title: c.document_title,
      section_title: c.section_title
    })));
  }

  // 2. Busca em blocos estruturados
  const { data: blocks, error: blocksError } = await supabaseClient.rpc(
    'search_structured_blocks',
    {
      query_embedding: embedding,
      document_id_filter: documentId || null,
      match_count: 10
    }
  );

  if (blocksError) {
    console.error("Error searching blocks:", blocksError);
  } else if (blocks) {
    evidences.push(...blocks.map((b: any) => ({
      type: 'text' as const,
      content: b.content,
      page_number: b.page_number,
      similarity: b.similarity,
      document_title: 'Document',
      section_title: b.section_title,
      block_id: b.block_id
    })));
  }

  // 3. Busca em tabelas
  const { data: tablesData, error: tablesError2 } = await supabaseClient.rpc(
    'search_tables',
    {
      query_embedding: embedding,
      document_id_filter: documentId || null,
      match_count: 5
    }
  );

  if (tablesError2) {
    console.error("Error searching tables:", tablesError2);
  } else if (tablesData) {
    evidences.push(...tablesData.map((t: any) => ({
      type: 'table' as const,
      content: t.markdown,
      page_number: t.page_number,
      similarity: t.similarity,
      document_title: 'Document',
      table_data: t.structured_data
    })));
  }

  // 4. Busca em imagens (quando intenção requer análise visual)
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
        similarity: 0.8, // Base score for images
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

  // 5. BM25-like: busca por palavras-chave
  const keywords = question.toLowerCase().split(' ')
    .filter(w => w.length > 3 && !['qual', 'onde', 'como', 'quando', 'para'].includes(w));

  if (keywords.length > 0) {
    const keywordQuery = keywords.join(' | ');
    const { data: keywordMatches } = await supabaseClient
      .from('document_blocks')
      .select('content, page_number, section_title, block_id')
      .textSearch('content', keywordQuery, { type: 'websearch' })
      .limit(5);

    if (keywordMatches) {
      evidences.push(...keywordMatches.map((k: any) => ({
        type: 'text' as const,
        content: k.content,
        page_number: k.page_number,
        similarity: 0.7, // Score base para keyword matches
        document_title: 'Document',
        section_title: k.section_title,
        block_id: k.block_id
      })));
    }
  }

  return evidences;
}

// Reranking usando modelo barato
async function rerankEvidences(
  question: string,
  evidences: Evidence[],
  maxResults: number
): Promise<Evidence[]> {
  if (evidences.length === 0) return [];

  // Criar contextos curtos para reranking
  const candidates = evidences.slice(0, 20).map((e, idx) => ({
    index: idx,
    text: e.content.substring(0, 500) // Apenas primeiros 500 chars
  }));

  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content: `Você é um sistema de reranking. Dada uma pergunta e uma lista de trechos, retorne os índices dos ${maxResults} trechos mais relevantes em ordem de relevância.
Considere:
- Relevância direta para a pergunta
- Informações factuais e específicas
- Diversidade de fontes

Retorne JSON puro: {"ranked_indices": [0, 3, 1, ...]}`
          },
          {
            role: "user",
            content: `Pergunta: ${question}\n\nTrechos:\n${candidates.map((c, i) => `[${i}] ${c.text}`).join('\n\n')}`
          }
        ],
        response_format: { type: "json_object" },
        temperature: 0.2,
      }),
    });

    const data = await response.json();
    const result = JSON.parse(data.choices[0].message.content);
    const rankedIndices = result.ranked_indices || [];

    // Reordenar evidências
    return rankedIndices.slice(0, maxResults).map((idx: number) => evidences[idx]);

  } catch (error) {
    console.error("Reranking failed, using similarity order:", error);
    // Fallback: ordenar por similaridade
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

    // 2. Gerar embedding
    console.log("🔢 Generating embedding...");
    const embedding = await generateEmbedding(question);

    // 3. Busca híbrida
    console.log("🔎 Performing hybrid search...");
    const rawEvidences = await hybridSearch(
      embedding,
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
