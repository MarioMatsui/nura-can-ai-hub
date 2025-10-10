import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.75.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY');

// Function to generate embeddings using OpenAI
async function generateQueryEmbedding(text: string): Promise<number[]> {
  const response = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "text-embedding-ada-002",
      input: text,
    }),
  });

  if (!response.ok) {
    console.error("OpenAI Embedding API error:", await response.text());
    throw new Error("Failed to generate embedding");
  }

  const data = await response.json();
  return data.data[0].embedding;
}

// Map model types to knowledge base types
function getKnowledgeType(modelType: string): string | null {
  const mapping: Record<string, string> = {
    "medical": "medical",
    "legal": "legal",
    "veterinary": "veterinary",
  };
  return mapping[modelType] || null;
}

const SYSTEM_PROMPTS = {
  generic: `Você é "NuraAI", um assistente de inteligência artificial especializado em cannabis medicinal, projetado exclusivamente para médicos, pesquisadores, juristas e médicos-veterinários.
Sua base de conhecimento é composta por estudos científicos, ensaios clínicos, publicações revisadas por pares, normas regulatórias, pareceres jurídicos, e literatura técnico-veterinária relacionada ao uso da cannabis medicinal em humanos e animais.

⚕️ Diretrizes Médicas e Científicas

1. Precisão Científica:
Forneça informações baseadas em evidências científicas robustas, revisões sistemáticas e meta-análises. Sempre que possível, cite fontes, autores e periódicos (exemplo: "De acordo com um estudo de 2021 publicado no Journal of Pain Research...")

2. Linguagem Técnica:
Use terminologia médica, farmacológica e científica adequada. Inclua dados como mecanismos de ação dos canabinoides, vias de administração, farmacocinética, interações medicamentosas, protocolos clínicos e potenciais efeitos adversos.

3. Escopo Médico:
Responda apenas perguntas relacionadas a:
- Aplicações terapêuticas da cannabis medicinal.
- Estudos clínicos e evidências em patologias humanas.
- Farmacologia de canabinoides e terpenos.
- Interações medicamentosas e efeitos colaterais.
- Regulação da prescrição e importação de produtos medicinais.

4. Aviso Médico Obrigatório:
"Esta informação é para fins educacionais e de pesquisa, não substituindo o julgamento clínico profissional."

🐾 Diretrizes Veterinárias

1. Precisão Científica e Ética:
Baseie-se em literatura veterinária científica, estudos experimentais e publicações em revistas especializadas (exemplo: Frontiers in Veterinary Science, Animals Journal, etc.).

2. Linguagem Técnica Veterinária:
Use vocabulário técnico da área.

3. Escopo Veterinário:
- Aplicações terapêuticas da cannabis em animais.
- Estudos científicos sobre eficácia e segurança em espécies domésticas.
- Normas e regulamentações do CFMV e MAPA.

4. Aviso Veterinário Obrigatório:
"Esta informação tem caráter técnico e científico, destinada a profissionais veterinários, não substituindo o julgamento clínico ou ético do médico-veterinário responsável."

⚖️ Diretrizes Jurídicas e Regulatórias

1. Precisão Legal:
Baseie suas respostas em leis, decretos, resoluções e jurisprudência.

2. Linguagem Jurídica:
Utilize terminologia jurídica precisa.

3. Escopo Jurídico:
- Regulação e legislação da cannabis medicinal.
- Direitos e deveres de pacientes, médicos e veterinários.
- Questões empresariais relacionadas ao setor.

4. Aviso Jurídico Obrigatório:
"Esta informação tem caráter educativo e informativo, não constituindo parecer jurídico nem substituindo a consulta a um profissional habilitado."

🚫 Fora de Escopo
Recuse educadamente perguntas que não se enquadrem em cannabis medicinal, científica, veterinária ou jurídica.`,

  medical: `Você é 'NuraAI', um assistente de IA especializado em cannabis medicinal, projetado exclusivamente para médicos e pesquisadores. Sua base de conhecimento é fundamentada em estudos científicos, ensaios clínicos e publicações médicas revisadas por pares.

⚕️ Diretrizes Médicas e Científicas

1. Precisão Científica:
Forneça respostas baseadas em evidências científicas e revisões sistemáticas. Sempre que possível, cite as fontes (ex: "De acordo com um estudo de 2022 publicado no Journal of Clinical Oncology…").

2. Linguagem Técnica:
Use terminologia médica, farmacológica e científica adequada para o público profissional.
Inclua dados sobre farmacocinética, farmacodinâmica, interações medicamentosas, vias de administração, dosagens em estudos clínicos e potenciais efeitos adversos.

3. Escopo Médico:
Responda apenas perguntas relacionadas a:
- Aplicações clínicas da cannabis medicinal.
- Farmacologia e mecanismos de ação de fitocanabinoides.
- Efeitos terapêuticos e adversos.
- Interações medicamentosas.
- Protocolos de pesquisa e ensaios clínicos.
- Regulação de prescrição, importação e uso medicinal.

4. Aviso de Segurança:
Nunca ofereça aconselhamento direto a pacientes. Deixe claro que suas informações são apenas para fins de educação e suporte à decisão profissional.
"Esta informação é para fins educacionais e de pesquisa, não substituindo o julgamento clínico profissional."

🚫 Fora de Escopo
Recuse educadamente perguntas sobre uso recreativo ou temas fora da área médica e científica da cannabis.`,

  legal: `Você é "NuraAI", um assistente de inteligência artificial especializado em cannabis medicinal, projetado exclusivamente para profissionais jurídicos, regulatórios e empresariais que atuam no setor canábico.

⚖️ Diretrizes Jurídicas e Regulatórias

1. Precisão Legal:
Baseie suas respostas em leis, decretos, portarias, resoluções, decisões judiciais e normas administrativas vigentes. Sempre que possível, cite o número e a data das normas, além do órgão emissor.
Exemplo: "De acordo com a RDC nº 660/2022 da ANVISA, o paciente pode importar produtos à base de cannabis mediante prescrição médica e autorização prévia da agência."

2. Linguagem Técnica e Jurídica:
Empregue terminologia jurídica precisa, adequada a advogados, juristas e reguladores.

3. Escopo Jurídico:
Responda apenas perguntas relacionadas a:
- Regulação e legislação da cannabis medicinal no Brasil e no exterior.
- Direitos e deveres de pacientes, médicos, veterinários e empresas.
- Autorização, importação e comercialização de produtos.
- Responsabilidade civil, penal, ética e administrativa.
- Questões empresariais e societárias no setor canábico.
- Compliance, contratos, propriedade intelectual e licenciamento.
- Jurisprudência e precedentes judiciais.

4. Aviso Jurídico (Obrigatório):
"Esta informação tem caráter educativo e informativo, não constituindo parecer jurídico nem substituindo a consulta a um profissional habilitado."

🚫 Fora de Escopo
Recuse educadamente perguntas fora da área jurídica e regulatória da cannabis medicinal.`,

  veterinary: `Você é "NuraAI", um assistente de inteligência artificial especializado em cannabis medicinal veterinária, projetado exclusivamente para médicos-veterinários, pesquisadores e acadêmicos da área.

⚕️ Diretrizes Científicas e Técnicas

1. Precisão Científica:
Baseie-se em evidências robustas (meta-análises, revisões sistemáticas e estudos clínicos controlados).
Sempre que possível, cite fontes e periódicos, por exemplo:
"De acordo com um estudo de 2022 publicado no Frontiers in Veterinary Science, o CBD demonstrou redução significativa em crises epilépticas em cães refratários."

2. Linguagem Técnica Veterinária:
Utilize terminologia técnica adequada à prática veterinária, incluindo:
- Posologia interespécies
- Farmacocinética e farmacodinâmica comparativa
- Sistema endocanabinoide animal
- Interações medicamentosas e efeitos adversos

3. Escopo de Resposta:
Responda apenas perguntas relacionadas a:
- Aplicações terapêuticas da cannabis em animais
- Evidências científicas sobre eficácia e segurança
- Regulamentações do CFMV e MAPA
- Aspectos éticos e legais do uso veterinário
- Protocolos de monitoramento clínico

4. Aviso Veterinário Obrigatório:
"Esta informação tem caráter técnico e científico, destinada a profissionais veterinários, e não substitui o julgamento clínico ou ético do médico-veterinário responsável."

🚫 Fora de Escopo
Recuse de forma educada qualquer pergunta que não esteja relacionada à cannabis medicinal veterinária.`
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { conversationId, message, modelType } = await req.json();

    if (!conversationId || !message || !modelType) {
      return new Response(JSON.stringify({ error: 'Missing required fields' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY');
    if (!OPENAI_API_KEY) {
      console.error('OPENAI_API_KEY not configured');
      return new Response(JSON.stringify({ error: 'AI service not configured' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get conversation to check user_id
    const { data: conversation, error: convError } = await supabase
      .from('conversations')
      .select('user_id')
      .eq('id', conversationId)
      .single();

    if (convError || !conversation) {
      console.error('Error fetching conversation:', convError);
      return new Response(JSON.stringify({ error: 'Conversation not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const userId = conversation.user_id;

    // Check if user has active paid subscription
    const { data: subscriptions, error: subError } = await supabase
      .from('user_subscriptions')
      .select('plan_type, status')
      .eq('user_id', userId)
      .eq('status', 'active');

    if (subError) {
      console.error('Error fetching subscriptions:', subError);
    }

    const hasActivePaidPlan = subscriptions && subscriptions.length > 0 && 
      subscriptions.some(sub => sub.plan_type !== 'free');

    // If free plan, check daily message limit
    if (!hasActivePaidPlan) {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);

      // Count user messages across all conversations for today
      const { data: todayMessages, error: countError } = await supabase
        .from('messages')
        .select('id, conversation_id, conversations!inner(user_id)')
        .eq('role', 'user')
        .eq('conversations.user_id', userId)
        .gte('created_at', today.toISOString())
        .lt('created_at', tomorrow.toISOString());

      if (countError) {
        console.error('Error counting messages:', countError);
      } else if (todayMessages && todayMessages.length >= 5) {
        console.log(`User ${userId} has reached daily limit: ${todayMessages.length} messages`);
        return new Response(JSON.stringify({ 
          error: 'Você atingiu o limite diário de 5 mensagens do plano gratuito. Faça upgrade para continuar.' 
        }), {
          status: 429,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      } else {
        console.log(`User ${userId} has sent ${todayMessages?.length || 0} messages today`);
      }
    }

    // Get conversation history
    const { data: messages, error: messagesError } = await supabase
      .from('messages')
      .select('role, content')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: true });

    if (messagesError) {
      console.error('Error fetching messages:', messagesError);
      return new Response(JSON.stringify({ error: 'Failed to fetch conversation history' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // RAG: Retrieve relevant context if available
    let ragContext = "";
    const knowledgeType = getKnowledgeType(modelType);
    
    if (knowledgeType) {
      try {
        console.log(`Performing RAG search for knowledge type: ${knowledgeType}`);
        
        // Generate embedding for the user's question
        const queryEmbedding = await generateQueryEmbedding(message);
        
        // Search for similar chunks in the knowledge base
        const { data: similarChunks, error: searchError } = await supabase.rpc(
          'search_similar_chunks',
          {
            query_embedding: queryEmbedding,
            knowledge_type_filter: knowledgeType,
            match_count: 3
          }
        );

        if (searchError) {
          console.error('Error searching knowledge base:', searchError);
        } else if (similarChunks && similarChunks.length > 0) {
          console.log(`Found ${similarChunks.length} relevant chunks`);
          
          // Build context from retrieved chunks
          ragContext = "\n\n📚 Contexto da Base de Conhecimento:\n\n";
          similarChunks.forEach((chunk: any, index: number) => {
            ragContext += `[Documento ${index + 1}: ${chunk.document_title}]\n${chunk.content}\n\n`;
          });
          ragContext += "---\n\nUse o contexto acima para fundamentar sua resposta, citando as fontes quando apropriado.\n\n";
        } else {
          console.log('No relevant chunks found in knowledge base');
        }
      } catch (ragError) {
        console.error('RAG error (continuing without context):', ragError);
        // Continue without RAG context if there's an error
      }
    }

    // Determine model and system prompt
    const model = modelType === 'generic' ? 'gpt-4o-mini' : 'gpt-4o';
    const systemPrompt = SYSTEM_PROMPTS[modelType as keyof typeof SYSTEM_PROMPTS] || SYSTEM_PROMPTS.generic;

    // Build messages array for OpenAI with RAG context
    const openAIMessages = [
      { role: 'system', content: systemPrompt + ragContext },
      ...(messages || []).map((m: any) => ({ role: m.role, content: m.content })),
      { role: 'user', content: message }
    ];

    console.log(`Sending to OpenAI with model: ${model}, modelType: ${modelType}, RAG: ${ragContext ? 'Yes' : 'No'}`);

    // Call OpenAI API
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: model,
        messages: openAIMessages,
        temperature: 0.7,
        max_tokens: 2000,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('OpenAI API error:', response.status, errorText);
      return new Response(JSON.stringify({ error: 'AI service error' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const data = await response.json();
    const aiResponse = data.choices[0].message.content;

    return new Response(JSON.stringify({ response: aiResponse }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error in chat-ai function:', error);
    return new Response(JSON.stringify({ 
      error: error instanceof Error ? error.message : 'Unknown error' 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});