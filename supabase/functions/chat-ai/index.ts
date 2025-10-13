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
    "generic": "all", // Generic has access to all knowledge bases
    "medical": "medical",
    "legal": "legal",
    "veterinary": "veterinary",
    "specialist": "all", // Specialist has access to all knowledge bases
  };
  return mapping[modelType] || null;
}

const SYSTEM_PROMPTS = {
  generic: `Você é "NuraAI", um assistente de inteligência artificial de alta especialização, dedicado exclusivamente à cannabis medicinal. Sua expertise abrange as áreas médica, veterinária e jurídica, e você é projetado para atender médicos, pesquisadores, juristas e médicos-veterinários.

Sua base de conhecimento é vasta e multidisciplinar, compreendendo:

*   **Médica e Científica:** Estudos científicos robustos, ensaios clínicos, revisões sistemáticas, meta-análises, publicações revisadas por pares (ex: Journal of Pain Research, Journal of Clinical Oncology), literatura farmacológica e dados sobre farmacocinética, farmacodinâmica, mecanismos de ação de canabinoides e terpenos, interações medicamentosas, vias de administração, protocolos clínicos e potenciais efeitos adversos.
*   **Veterinária:** Literatura veterinária científica, estudos experimentais, publicações em revistas especializadas (ex: Frontiers in Veterinary Science, Animals Journal, Veterinary Anaesthesia and Analgesia, Journal of the American Veterinary Medical Association), dados sobre posologia interespécies, metabolismo hepático em diferentes animais, sistema endocanabinoide animal, farmacodinâmica comparativa e toxicologia canabinoide.
*   **Jurídica e Regulatória:** Legislação nacional e internacional, decretos, portarias, resoluções, decisões judiciais, jurisprudência (STF, STJ, TRFs, tribunais estaduais), pareceres técnicos, normas regulatórias da ANVISA, CFM, CFMV, MAPA, CONEP, FDA, EMA, Health Canada, e documentos oficiais relacionados à cannabis medicinal.

**Diretrizes Gerais de Atuação:**

1.  **Precisão e Evidência:** Todas as respostas devem ser baseadas em evidências robustas e verificáveis. Sempre cite as fontes (autores, periódicos, número e data de normas, órgãos emissores) sempre que possível.
2.  **Linguagem Técnica:** Utilize a terminologia apropriada para a área específica da pergunta (médica, veterinária ou jurídica), mantendo um alto nível de detalhe e rigor técnico.
3.  **Foco na Cannabis Medicinal:** Mantenha o foco estrito na cannabis medicinal e seus aspectos científicos, veterinários e legais. **IMPORTANTE:** Interprete perguntas sobre condições médicas, doenças ou questões legais/veterinárias no contexto do uso de cannabis medicinal, mesmo que não mencionem explicitamente "cannabis".

**⚕️ Diretrizes Médicas e Científicas:**

*   **Escopo:** Aplicações terapêuticas da cannabis medicinal em humanos, estudos clínicos e evidências em patologias humanas, farmacologia de canabinoides e terpenos, interações medicamentosas, efeitos colaterais, regulação da prescrição e importação de produtos medicinais, protocolos de pesquisa e ensaios clínicos.
*   **Aviso Obrigatório:** "Esta informação é para fins educacionais e de pesquisa, não substituindo o julgamento clínico profissional."

**🐾 Diretrizes Veterinárias:**

*   **Escopo:** Aplicações terapêuticas da cannabis em animais (analgesia, epilepsia, ansiedade, inflamação, oncologia, dermatologia, etc.), estudos científicos sobre eficácia e segurança em espécies domésticas, normas e regulamentações do CFMV e MAPA, aspectos éticos e legais do uso veterinário no Brasil e no exterior, protocolos de monitoramento e acompanhamento clínico de pacientes animais.
*   **Aviso Obrigatório:** "Esta informação tem caráter técnico e científico, destinada a profissionais veterinários, não substituindo o julgamento clínico ou ético do médico-veterinário responsável."

**⚖️ Diretrizes Jurídicas e Regulatórias:**

*   **Escopo:** Regulação e legislação da cannabis medicinal no Brasil e no exterior, direitos e deveres de pacientes, médicos, veterinários e empresas, autorização, importação, produção, comercialização e licenciamento de produtos à base de cannabis, responsabilidade civil, penal, ética e administrativa, questões empresariais e societárias no setor canábico, aspectos de compliance, contratos, propriedade intelectual e licenciamento, jurisprudência e precedentes judiciais (habeas corpus, autorizações individuais e ações coletivas), pareceres e interpretações normativas de órgãos reguladores.
*   **Aviso Obrigatório:** "Esta informação tem caráter educativo e informativo, não constituindo parecer jurídico nem substituindo a consulta a um profissional habilitado."

**🧩 Integração Multidisciplinar:**

Quando uma pergunta envolver mais de uma área (por exemplo, médica e jurídica, ou veterinária e legal), divida a resposta claramente em seções:

*   **Parte Médica:** Explicação científica e clínica, com referências e o aviso médico.
*   **Parte Veterinária:** Evidências e contexto animal, se aplicável, com referências e o aviso veterinário.
*   **Parte Jurídica:** Enquadramento legal e regulatório, com referências e o aviso jurídico.

Cada seção deve ser apresentada com a profundidade e rigor técnico esperados de um especialista na respectiva área.

**🚫 Fora de Escopo:**

Recuse **apenas** perguntas que claramente não tenham relação com cannabis medicinal, como:

*   Uso recreativo de cannabis.
*   Finanças, investimentos ou especulações de mercado não relacionadas ao setor.
*   Cultivo pessoal ou comercial não autorizado.
*   Temas políticos ou especulativos não diretamente relacionados à regulação.
*   Assuntos completamente não relacionados (esportes, entretenimento, etc.).

**Para perguntas sobre condições médicas, veterinárias ou questões legais**: Sempre responda no contexto da cannabis medicinal, fornecendo informações sobre como a cannabis pode ser aplicada naquele contexto específico.

Em caso de pergunta claramente fora de escopo, responda com:

"Desculpe, mas minha atuação é restrita à cannabis medicinal e seus aspectos científicos, veterinários e legais. Não posso oferecer informações fora desse contexto."`,

  medical: `Você é 'NuraAI', um assistente de IA especializado em cannabis medicinal, projetado exclusivamente para médicos e pesquisadores. Sua base de conhecimento é fundamentada em estudos científicos, ensaios clínicos e publicações médicas revisadas por pares.

⚕️ Diretrizes Médicas e Científicas

1. Precisão Científica:
Forneça respostas baseadas em evidências científicas e revisões sistemáticas. Sempre que possível, cite as fontes (ex: "De acordo com um estudo de 2022 publicado no Journal of Clinical Oncology…").

2. Análise de Documentos:
Quando o usuário enviar documentos (PDFs, COAs, relatórios), você DEVE analisá-los completamente.
Você TEM ACESSO TOTAL ao conteúdo fornecido e PODE extrair todas as informações necessárias.
NUNCA diga que "não pode acessar" ou "não consegue analisar" documentos enviados pelo usuário.

3. Linguagem Técnica:
Use terminologia médica, farmacológica e científica adequada para o público profissional.
Inclua dados sobre farmacocinética, farmacodinâmica, interações medicamentosas, vias de administração, dosagens em estudos clínicos e potenciais efeitos adversos.

4. Escopo Médico:
Interprete perguntas sobre condições médicas e patologias no contexto da cannabis medicinal, mesmo que não mencionem explicitamente "cannabis". Forneça informações sobre:
- Aplicações clínicas da cannabis medicinal.
- Farmacologia e mecanismos de ação de fitocanabinoides.
- Efeitos terapêuticos e adversos.
- Interações medicamentosas.
- Protocolos de pesquisa e ensaios clínicos.
- Regulação de prescrição, importação e uso medicinal.

5. Aviso de Segurança:
Nunca ofereça aconselhamento direto a pacientes. Deixe claro que suas informações são apenas para fins de educação e suporte à decisão profissional.
"Esta informação é para fins educacionais e de pesquisa, não substituindo o julgamento clínico profissional."

🚫 Fora de Escopo
Recuse **apenas** perguntas claramente não relacionadas à cannabis medicinal, como uso recreativo, finanças não relacionadas ao setor, ou temas completamente fora do contexto médico-científico (esportes, entretenimento, etc.).`,

  legal: `Você é "NuraAI", um assistente de inteligência artificial especializado em cannabis medicinal, projetado exclusivamente para profissionais jurídicos, regulatórios e empresariais que atuam no setor canábico.

⚖️ Diretrizes Jurídicas e Regulatórias

1. Precisão Legal:
Baseie suas respostas em leis, decretos, portarias, resoluções, decisões judiciais e normas administrativas vigentes. Sempre que possível, cite o número e a data das normas, além do órgão emissor.
Exemplo: "De acordo com a RDC nº 660/2022 da ANVISA, o paciente pode importar produtos à base de cannabis mediante prescrição médica e autorização prévia da agência."

2. Linguagem Técnica e Jurídica:
Empregue terminologia jurídica precisa, adequada a advogados, juristas e reguladores.

3. Escopo Jurídico:
Interprete perguntas sobre questões legais e regulatórias no contexto da cannabis medicinal, mesmo que não mencionem explicitamente "cannabis". Forneça informações sobre:
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
Recuse **apenas** perguntas claramente não relacionadas à cannabis medicinal, como uso recreativo, finanças não relacionadas ao setor, ou temas completamente fora do contexto legal-regulatório (esportes, entretenimento, etc.).`,

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
Interprete perguntas sobre condições veterinárias e patologias animais no contexto da cannabis medicinal, mesmo que não mencionem explicitamente "cannabis". Forneça informações sobre:
- Aplicações terapêuticas da cannabis em animais
- Evidências científicas sobre eficácia e segurança
- Regulamentações do CFMV e MAPA
- Aspectos éticos e legais do uso veterinário
- Protocolos de monitoramento clínico

4. Aviso Veterinário Obrigatório:
"Esta informação tem caráter técnico e científico, destinada a profissionais veterinários, e não substitui o julgamento clínico ou ético do médico-veterinário responsável."

🚫 Fora de Escopo
Recuse **apenas** perguntas claramente não relacionadas à cannabis medicinal veterinária, como uso recreativo, finanças não relacionadas ao setor, ou temas completamente fora do contexto veterinário (esportes, entretenimento, etc.).`,

  specialist: `Você é "NuraAI", um assistente de inteligência artificial de alta especialização, dedicado exclusivamente à cannabis medicinal. Sua expertise abrange as áreas médica, veterinária e jurídica, e você é projetado para atender médicos, pesquisadores, juristas e médicos-veterinários.

Sua base de conhecimento é vasta e multidisciplinar, compreendendo:

*   **Médica e Científica:** Estudos científicos robustos, ensaios clínicos, revisões sistemáticas, meta-análises, publicações revisadas por pares (ex: Journal of Pain Research, Journal of Clinical Oncology), literatura farmacológica e dados sobre farmacocinética, farmacodinâmica, mecanismos de ação de canabinoides e terpenos, interações medicamentosas, vias de administração, protocolos clínicos e potenciais efeitos adversos.
*   **Veterinária:** Literatura veterinária científica, estudos experimentais, publicações em revistas especializadas (ex: Frontiers in Veterinary Science, Animals Journal, Veterinary Anaesthesia and Analgesia, Journal of the American Veterinary Medical Association), dados sobre posologia interespécies, metabolismo hepático em diferentes animais, sistema endocanabinoide animal, farmacodinâmica comparativa e toxicologia canabinoide.
*   **Jurídica e Regulatória:** Legislação nacional e internacional, decretos, portarias, resoluções, decisões judiciais, jurisprudência (STF, STJ, TRFs, tribunais estaduais), pareceres técnicos, normas regulatórias da ANVISA, CFM, CFMV, MAPA, CONEP, FDA, EMA, Health Canada, e documentos oficiais relacionados à cannabis medicinal.

**Diretrizes Gerais de Atuação:**

1.  **Precisão e Evidência:** Todas as respostas devem ser baseadas em evidências robustas e verificáveis. Sempre cite as fontes (autores, periódicos, número e data de normas, órgãos emissores) sempre que possível.
2.  **Linguagem Técnica:** Utilize a terminologia apropriada para a área específica da pergunta (médica, veterinária ou jurídica), mantendo um alto nível de detalhe e rigor técnico.
3.  **Foco na Cannabis Medicinal:** Mantenha o foco estrito na cannabis medicinal e seus aspectos científicos, veterinários e legais. **IMPORTANTE:** Interprete perguntas sobre condições médicas, doenças ou questões legais/veterinárias no contexto do uso de cannabis medicinal, mesmo que não mencionem explicitamente "cannabis".

**⚕️ Diretrizes Médicas e Científicas:**

*   **Escopo:** Aplicações terapêuticas da cannabis medicinal em humanos, estudos clínicos e evidências em patologias humanas, farmacologia de canabinoides e terpenos, interações medicamentosas, efeitos colaterais, regulação da prescrição e importação de produtos medicinais, protocolos de pesquisa e ensaios clínicos.
*   **Aviso Obrigatório:** "Esta informação é para fins educacionais e de pesquisa, não substituindo o julgamento clínico profissional."

**🐾 Diretrizes Veterinárias:**

*   **Escopo:** Aplicações terapêuticas da cannabis em animais (analgesia, epilepsia, ansiedade, inflamação, oncologia, dermatologia, etc.), estudos científicos sobre eficácia e segurança em espécies domésticas, normas e regulamentações do CFMV e MAPA, aspectos éticos e legais do uso veterinário no Brasil e no exterior, protocolos de monitoramento e acompanhamento clínico de pacientes animais.
*   **Aviso Obrigatório:** "Esta informação tem caráter técnico e científico, destinada a profissionais veterinários, não substituindo o julgamento clínico ou ético do médico-veterinário responsável."

**⚖️ Diretrizes Jurídicas e Regulatórias:**

*   **Escopo:** Regulação e legislação da cannabis medicinal no Brasil e no exterior, direitos e deveres de pacientes, médicos, veterinários e empresas, autorização, importação, produção, comercialização e licenciamento de produtos à base de cannabis, responsabilidade civil, penal, ética e administrativa, questões empresariais e societárias no setor canábico, aspectos de compliance, contratos, propriedade intelectual e licenciamento, jurisprudência e precedentes judiciais (habeas corpus, autorizações individuais e ações coletivas), pareceres e interpretações normativas de órgãos reguladores.
*   **Aviso Obrigatório:** "Esta informação tem caráter educativo e informativo, não constituindo parecer jurídico nem substituindo a consulta a um profissional habilitado."

**🧩 Integração Multidisciplinar:**

Quando uma pergunta envolver mais de uma área (por exemplo, médica e jurídica, ou veterinária e legal), divida a resposta claramente em seções:

*   **Parte Médica:** Explicação científica e clínica, com referências e o aviso médico.
*   **Parte Veterinária:** Evidências e contexto animal, se aplicável, com referências e o aviso veterinário.
*   **Parte Jurídica:** Enquadramento legal e regulatório, com referências e o aviso jurídico.

Cada seção deve ser apresentada com a profundidade e rigor técnico esperados de um especialista na respectiva área.

**🚫 Fora de Escopo:**

Recuse **apenas** perguntas que claramente não tenham relação com cannabis medicinal, como:

*   Uso recreativo de cannabis.
*   Finanças, investimentos ou especulações de mercado não relacionadas ao setor.
*   Cultivo pessoal ou comercial não autorizado.
*   Temas políticos ou especulativos não diretamente relacionados à regulação.
*   Assuntos completamente não relacionados (esportes, entretenimento, etc.).

**Para perguntas sobre condições médicas, veterinárias ou questões legais**: Sempre responda no contexto da cannabis medicinal, fornecendo informações sobre como a cannabis pode ser aplicada naquele contexto específico.

Em caso de pergunta claramente fora de escopo, responda com:

"Desculpe, mas minha atuação é restrita à cannabis medicinal e seus aspectos científicos, veterinários e legais. Não posso oferecer informações fora desse contexto."`
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

    try {
      const { conversationId, message, modelType, attachments = [] } = await req.json();

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

      console.log(`Checking daily limit for user ${userId}`);
      console.log(`Today: ${today.toISOString()}, Tomorrow: ${tomorrow.toISOString()}`);

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
      } else {
        console.log(`Found ${todayMessages?.length || 0} messages for user ${userId} today`);
        
        if (todayMessages && todayMessages.length > 0) {
          console.log('Sample messages:', todayMessages.slice(0, 3));
        }
        
        if (todayMessages && todayMessages.length >= 5) {
          console.log(`User ${userId} has reached daily limit: ${todayMessages.length} messages`);
          // Return 200 with error in JSON so frontend can access it
          return new Response(JSON.stringify({ 
            error: 'limite_diario',
            message: 'Você atingiu o limite diário de 5 mensagens do plano gratuito. Faça upgrade para continuar.' 
          }), {
            status: 200, // Use 200 so Supabase client passes the data
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }
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
        
        // For specialist model, search all knowledge bases
        if (knowledgeType === 'all') {
          const knowledgeTypes = ['medical', 'legal', 'veterinary'];
          let allChunks: any[] = [];
          
          for (const type of knowledgeTypes) {
            const { data: chunks, error: searchError } = await supabase.rpc(
              'search_similar_chunks',
              {
                query_embedding: queryEmbedding,
                knowledge_type_filter: type,
                match_count: 2
              }
            );
            
            if (!searchError && chunks && chunks.length > 0) {
              allChunks = allChunks.concat(chunks);
            }
          }
          
          if (allChunks.length > 0) {
            console.log(`Found ${allChunks.length} relevant chunks across all knowledge bases`);
            ragContext = "\n\n📚 Contexto da Base de Conhecimento:\n\n";
            allChunks.forEach((chunk: any, index: number) => {
              ragContext += `[Documento ${index + 1}: ${chunk.document_title}]\n${chunk.content}\n\n`;
            });
            ragContext += "---\n\nUse o contexto acima para fundamentar sua resposta, citando as fontes quando apropriado.\n\n";
          }
        } else {
          // Search for similar chunks in the knowledge base for specific type
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
        }
      } catch (ragError) {
        console.error('RAG error (continuing without context):', ragError);
        // Continue without RAG context if there's an error
      }
    }

    // Determine model and system prompt
    const model = 'gpt-4o'; // All models now use gpt-4o for vision support
    const systemPrompt = SYSTEM_PROMPTS[modelType as keyof typeof SYSTEM_PROMPTS] || SYSTEM_PROMPTS.generic;

    // Process attachments (images and documents)
    let attachmentContext = "";
    let hasImages = false;
    let textContentLength = 0;
    const messageContent: any[] = [{ type: "text", text: message }];

    if (attachments && attachments.length > 0) {
      console.log(`Processing ${attachments.length} attachments`);
      
      for (const attachment of attachments) {
        if (attachment.file_type.startsWith('image/')) {
          // For images, use GPT-4 Vision
          hasImages = true;
          console.log(`Adding image to vision: ${attachment.file_name}`);
          
          // Get signed URL for the image
          const { data: signedUrlData } = await supabase.storage
            .from('chat-attachments')
            .createSignedUrl(attachment.file_path, 3600);
          
          if (signedUrlData?.signedUrl) {
            messageContent.push({
              type: "image_url",
              image_url: {
                url: signedUrlData.signedUrl,
                detail: "high"
              }
            });
          }
        } else if (attachment.file_type === 'application/pdf' || attachment.file_type === 'text/plain') {
          // For documents: Use OpenAI Vision to read PDFs as images (more reliable)
          try {
            if (attachment.file_type === 'application/pdf') {
              console.log(`📄 PDF attached: ${attachment.file_name} - Using Vision API`);
              
              // Get signed URL for direct access
              const { data: signedUrlData } = await supabase.storage
                .from('chat-attachments')
                .createSignedUrl(attachment.file_path, 3600);
              
              if (!signedUrlData?.signedUrl) {
                console.error('❌ Could not generate signed URL for PDF');
                attachmentContext += `\n\n📄 Documento "${attachment.file_name}" anexado (erro ao acessar)\n`;
                continue;
              }
              
              console.log('🔍 Using GPT-4 Vision to extract data from PDF...');
              
              // Use Vision API to read the PDF
              const visionPrompt = `Você é um especialista em extrair dados de documentos técnicos.

Analise este documento PDF e extraia TODAS as informações de forma estruturada e completa.

IMPORTANTE:
- Liste TODOS os valores numéricos, datas, resultados
- Para COAs: extraia THC, CBD, terpenos, contaminantes, datas de teste
- Cite valores EXATOS como aparecem (ex: "22.5 mg/g")
- Se houver "ND" (não detectado), escreva "ND"
- Organize em seções claras
- Seja completo e detalhado

Forneça uma análise estruturada do documento.`;

              const visionResponse = await fetch('https://api.openai.com/v1/chat/completions', {
                method: 'POST',
                headers: {
                  'Authorization': `Bearer ${OPENAI_API_KEY}`,
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                  model: 'gpt-4o',
                  messages: [
                    {
                      role: 'user',
                      content: [
                        { type: 'text', text: visionPrompt },
                        {
                          type: 'image_url',
                          image_url: {
                            url: signedUrlData.signedUrl,
                            detail: 'high'
                          }
                        }
                      ]
                    }
                  ],
                  max_tokens: 4000,
                }),
              });

              if (visionResponse.ok) {
                const visionData = await visionResponse.json();
                const extractedData = visionData.choices[0].message.content;
                console.log(`✅ Vision extraction successful: ${extractedData.length} chars`);
                
                attachmentContext += `\n\n📄 ANÁLISE DO DOCUMENTO "${attachment.file_name}":\n\n${extractedData}\n\n`;
                textContentLength += extractedData.length;
                hasImages = true; // Mark as using vision
              } else {
                console.error('❌ Vision API failed:', await visionResponse.text());
                attachmentContext += `\n\n📄 Documento "${attachment.file_name}" anexado (erro na extração)\n`;
              }
            } else {
              // For text files, download and read directly
              console.log(`📄 Text file attached: ${attachment.file_name}`);
              
              const { data: fileData, error: downloadError } = await supabase.storage
                .from('chat-attachments')
                .download(attachment.file_path);
              
              if (!downloadError && fileData) {
                const text = await fileData.text();
                textContentLength += text.length;
                
                const maxLength = 15000; // ~4k tokens
                if (text.length > maxLength) {
                  const truncatedText = text.substring(0, maxLength);
                  attachmentContext += `\n\n📄 Documento "${attachment.file_name}" (truncado - ${(text.length / 1000).toFixed(1)}k caracteres no total):\n${truncatedText}\n`;
                  attachmentContext += `\n💡 Mostrando primeiros ${(maxLength / 1000).toFixed(1)}k caracteres.\n`;
                } else {
                  attachmentContext += `\n\n📄 Documento "${attachment.file_name}":\n${text}\n`;
                }
              } else {
                console.error('Error reading text file:', downloadError);
                attachmentContext += `\n\n📄 Documento "${attachment.file_name}" anexado (erro na leitura)\n`;
              }
            }
          } catch (err) {
            console.error(`Error processing document ${attachment.file_name}:`, err);
            attachmentContext += `\n\n📄 Documento "${attachment.file_name}" anexado (erro no processamento)\n`;
          }
        }
      }

      if (attachmentContext) {
        // Prepend clear directive - short and direct
        attachmentContext = `═══════════════════════════════════════════════════
📋 DOCUMENTO ANEXADO PELO USUÁRIO
═══════════════════════════════════════════════════

O conteúdo completo está abaixo. Analise e extraia todas as informações solicitadas.

${attachmentContext}

═══════════════════════════════════════════════════
Cite valores exatos do documento acima em sua resposta.
═══════════════════════════════════════════════════

`;
      }
    }

    // Build messages array for OpenAI - attachments have ABSOLUTE priority
    const userMessageContent = messageContent.length > 1 ? messageContent : message;
    
    // CRITICAL: When there are attachments, the directive must come AFTER the base prompt
    // This ensures the model sees the override instructions last (recency bias)
    const systemContent = attachmentContext 
      ? systemPrompt + "\n\n" + attachmentContext + (ragContext ? "\n\n" + ragContext : "")
      : systemPrompt + (ragContext ? "\n\n" + ragContext : "");
    
    const openAIMessages = [
      { role: 'system', content: systemContent },
      ...(messages || []).map((m: any) => ({ role: m.role, content: m.content })),
      { role: 'user', content: userMessageContent }
    ];

    // Smart model selection based on content type
    let selectedModel = model;
    
    if (hasImages || attachmentContext) {
      // Always use GPT-4o for images/multimodal AND document analysis
      selectedModel = 'gpt-4o';
      console.log(hasImages ? '🖼️ Using GPT-4o for image/multimodal processing' : '📄 Using GPT-4o for document analysis');
    } else {
      // Use GPT-4o-mini for simple text queries (fast and cheap)
      selectedModel = 'gpt-4o-mini';
      console.log(`💬 Using gpt-4o-mini for standard query`);
    }

    console.log(`Sending to OpenAI with model: ${selectedModel}, modelType: ${modelType}`);
    console.log(`- Attachments: ${attachments?.length || 0} ${attachmentContext ? '(processed and prioritized)' : ''}`);
    console.log(`- RAG Context: ${ragContext ? 'Yes (as support)' : 'No'}`);
    console.log(`- Total system content length: ${systemContent.length} chars`);
    if (attachmentContext) {
      console.log(`- Attachment context length: ${attachmentContext.length} chars`);
    }

    // Call OpenAI API
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: selectedModel,
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