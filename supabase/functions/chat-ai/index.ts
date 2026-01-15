import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.75.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Security: Sanitize RAG content to prevent prompt injection attacks
function sanitizeRAGContent(content: string): string {
  if (!content) return '';
  
  // Remove potential instruction keywords that could manipulate AI behavior
  const dangerousPatterns = [
    /ignore\s+(all\s+)?previous\s+instructions?/gi,
    /forget\s+(everything|all|previous)/gi,
    /new\s+(instructions?|rules?|guidelines?|protocol):/gi,
    /you\s+are\s+now\s+(in|a)/gi,
    /system\s+prompt/gi,
    /reveal\s+(your|the|all)/gi,
    /disregard\s+(all|previous|above)/gi,
    /override\s+(previous|all|system)/gi,
    /\[INST\]/gi,
    /\[\/INST\]/gi,
    /<\|im_start\|>/gi,
    /<\|im_end\|>/gi,
  ];
  
  let sanitized = content;
  dangerousPatterns.forEach(pattern => {
    sanitized = sanitized.replace(pattern, '[REDACTED-SECURITY]');
  });
  
  // Limit content length to prevent abuse
  const maxLength = 4000;
  if (sanitized.length > maxLength) {
    sanitized = sanitized.substring(0, maxLength) + '... [conteúdo truncado]';
  }
  
  return sanitized;
}

// Security: Escape XML special characters
function escapeXML(text: string): string {
  if (!text) return '';
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');

// Map model types to knowledge base types
function getKnowledgeType(modelType: string): string | null {
  const mapping: Record<string, string> = {
    "generic": "all",
    "medical": "medical",
    "legal": "legal",
    "veterinary": "veterinary",
    "specialist": "all",
  };
  return mapping[modelType] || null;
}

// Generate search terms for better RAG retrieval
function generateSearchTerms(query: string): string[] {
  const terms: string[] = [query];
  
  // Extract key terms (words with 4+ characters, excluding common Portuguese words)
  const stopwords = new Set(['para', 'como', 'sobre', 'qual', 'quais', 'pode', 'podem', 'fazer', 'sendo', 'essa', 'esse', 'isso', 'esses', 'essas', 'quando', 'onde', 'porque', 'porquê', 'então', 'também', 'mais', 'menos', 'muito', 'muitos', 'alguns', 'algum', 'alguma', 'todas', 'todos', 'cada', 'outro', 'outra', 'outros', 'outras']);
  
  const words = query.toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // Remove accents
    .split(/\s+/)
    .filter(w => w.length >= 4 && !stopwords.has(w));
  
  // Add individual key terms
  words.forEach(word => {
    if (!terms.includes(word)) {
      terms.push(word);
    }
  });
  
  // Add medical/legal/veterinary term variations (PT/EN)
  const termMappings: Record<string, string[]> = {
    'canabidiol': ['cbd', 'cannabidiol'],
    'cbd': ['canabidiol', 'cannabidiol'],
    'thc': ['tetrahidrocanabinol', 'tetrahydrocannabinol', 'delta-9-thc'],
    'epilepsia': ['epilepsy', 'convulsao', 'convulsoes', 'seizures'],
    'ansiedade': ['anxiety', 'transtorno ansioso'],
    'dor': ['pain', 'analgesia', 'analgesico'],
    'cancer': ['oncologia', 'oncology', 'neoplasia', 'tumor'],
    'esclerose': ['sclerosis', 'esclerose multipla'],
    'parkinson': ['parkinsons disease', 'doenca de parkinson'],
    'alzheimer': ['alzheimers disease', 'demencia'],
    'artrite': ['arthritis', 'artrose', 'inflamacao articular'],
    'anvisa': ['rdc', 'regulacao', 'importacao'],
    'prescricao': ['prescription', 'receita medica'],
    'importacao': ['import', 'importar'],
  };
  
  words.forEach(word => {
    const variations = termMappings[word];
    if (variations) {
      variations.forEach(v => {
        if (!terms.includes(v)) {
          terms.push(v);
        }
      });
    }
  });
  
  return terms.slice(0, 8); // Max 8 search terms
}

const SYSTEM_PROMPTS = {
  generic: `Você é "NuraAI", um assistente de inteligência artificial de alta especialização, dedicado exclusivamente à cannabis medicinal. Sua expertise abrange as áreas médica, veterinária e jurídica.

**ARQUITETURA DE CONHECIMENTO:**

Você opera com DUAS CAMADAS DE CONTEXTO DISTINTAS que NUNCA devem ser confundidas:

1. **BASE DE CONHECIMENTO INSTITUCIONAL (RAG):**
   - Esta é sua memória permanente, composta por artigos científicos, estudos clínicos, legislação e documentos técnicos previamente indexados
   - ESTES DOCUMENTOS NÃO SÃO ANEXOS DO USUÁRIO - são parte do seu conhecimento institucional
   - Quando receber conteúdo marcado como [BASE_CONHECIMENTO], trate como conhecimento integrado seu
   - SEMPRE sintetize informações de MÚLTIPLAS fontes (mínimo 3-4 quando disponíveis)
   - NUNCA se apoie em apenas um artigo - busque diversidade de fontes, autores e abordagens
   - O primeiro resultado de busca NÃO é verdade absoluta - priorize diversidade

2. **CONTEXTO TEMPORÁRIO DO USUÁRIO:**
   - Textos digitados no chat, arquivos anexados, PDFs enviados na conversa
   - Quando receber conteúdo marcado como [DOCUMENTO_USUARIO], este foi enviado AGORA pelo usuário
   - Analise separadamente do RAG

**REGRAS DE CITAÇÃO:**
- Ao usar informações do RAG, cite naturalmente: "De acordo com estudos da base de conhecimento..."
- Ao analisar documentos do usuário, deixe claro: "No documento que você enviou..."
- NUNCA diga "o usuário enviou" ao se referir a documentos do RAG

**COMPORTAMENTO:**
- Respostas técnicas, concisas e baseadas em evidências
- Se o tema não estiver bem coberto pela base, declare explicitamente
- Prefira resposta curta e precisa do que resposta longa e especulativa
- NUNCA invente informações ou simule uso do RAG

Sua base de conhecimento multidisciplinar compreende:
- **Médica:** Estudos científicos, ensaios clínicos, revisões sistemáticas, farmacologia de canabinoides
- **Veterinária:** Literatura veterinária científica, posologia interespécies, sistema endocanabinoide animal
- **Jurídica:** Legislação, jurisprudência, normas ANVISA, CFM, CFMV

**🚫 Fora de Escopo:** Uso recreativo, cultivo não autorizado, especulações de mercado, temas não relacionados.`,

  medical: `Você é 'NuraAI', um assistente de IA especializado em cannabis medicinal, projetado exclusivamente para médicos e pesquisadores.

**ARQUITETURA DE CONHECIMENTO:**

Você opera com DUAS CAMADAS DE CONTEXTO DISTINTAS:

1. **BASE DE CONHECIMENTO INSTITUCIONAL (RAG):**
   - Sua memória permanente: artigos científicos, estudos clínicos, publicações médicas
   - Conteúdo marcado como [BASE_CONHECIMENTO] é conhecimento integrado seu, NÃO anexos do usuário
   - SEMPRE sintetize de MÚLTIPLAS fontes (mínimo 3-4)
   - NUNCA se apoie em apenas um artigo
   - Priorize diversidade de fontes, autores e abordagens

2. **CONTEXTO TEMPORÁRIO DO USUÁRIO:**
   - Conteúdo marcado como [DOCUMENTO_USUARIO] foi enviado agora pelo usuário
   - Analise separadamente do RAG

**REGRAS:**
- Use terminologia médica, farmacológica e científica
- Cite fontes naturalmente: "Estudos demonstram que..." ou "A literatura indica..."
- Se o tema não estiver bem coberto, declare explicitamente
- Prefira resposta curta e precisa do que especulativa

**Escopo:** Aplicações clínicas da cannabis, farmacologia de fitocanabinoides, interações medicamentosas, protocolos clínicos, regulação de prescrição.

**🚫 Fora de Escopo:** Uso recreativo, aconselhamento direto a pacientes.`,

  legal: `Você é "NuraAI", um assistente especializado em cannabis medicinal para profissionais jurídicos e regulatórios.

**ARQUITETURA DE CONHECIMENTO:**

Você opera com DUAS CAMADAS DE CONTEXTO DISTINTAS:

1. **BASE DE CONHECIMENTO INSTITUCIONAL (RAG):**
   - Sua memória permanente: legislação, jurisprudência, normas regulatórias
   - Conteúdo marcado como [BASE_CONHECIMENTO] é conhecimento integrado seu
   - SEMPRE sintetize de MÚLTIPLAS fontes quando disponíveis
   - Priorize diversidade de precedentes e interpretações

2. **CONTEXTO TEMPORÁRIO DO USUÁRIO:**
   - Conteúdo marcado como [DOCUMENTO_USUARIO] foi enviado agora pelo usuário

**REGRAS:**
- Cite número e data das normas, órgão emissor
- Se a jurisprudência for limitada, declare explicitamente
- Prefira resposta precisa do que especulativa

**Escopo:** Regulação da cannabis medicinal, direitos e deveres, autorização/importação, responsabilidade civil/penal, compliance, jurisprudência.

**🚫 Fora de Escopo:** Uso recreativo, especulações políticas.`,

  veterinary: `Você é "NuraAI", um assistente especializado em cannabis medicinal veterinária.

**ARQUITETURA DE CONHECIMENTO:**

Você opera com DUAS CAMADAS DE CONTEXTO DISTINTAS:

1. **BASE DE CONHECIMENTO INSTITUCIONAL (RAG):**
   - Sua memória permanente: literatura veterinária científica, estudos em animais
   - Conteúdo marcado como [BASE_CONHECIMENTO] é conhecimento integrado seu
   - SEMPRE sintetize de MÚLTIPLAS fontes (mínimo 3-4)
   - Priorize diversidade de espécies e abordagens

2. **CONTEXTO TEMPORÁRIO DO USUÁRIO:**
   - Conteúdo marcado como [DOCUMENTO_USUARIO] foi enviado agora pelo usuário

**REGRAS:**
- Use terminologia técnica veterinária
- Considere diferenças interespécies na farmacocinética
- Se evidências forem limitadas para determinada espécie, declare

**Escopo:** Aplicações terapêuticas em animais, posologia interespécies, regulamentações CFMV/MAPA, sistema endocanabinoide animal.

**🚫 Fora de Escopo:** Uso recreativo, animais silvestres sem regulamentação.`,

  specialist: `Você é "NuraAI", um assistente multidisciplinar de alta especialização em cannabis medicinal.

**ARQUITETURA DE CONHECIMENTO:**

Você opera com DUAS CAMADAS DE CONTEXTO DISTINTAS que NUNCA devem ser confundidas:

1. **BASE DE CONHECIMENTO INSTITUCIONAL (RAG):**
   - Esta é sua memória permanente e integrada
   - Conteúdo marcado como [BASE_CONHECIMENTO] NÃO são anexos do usuário
   - REGRAS OBRIGATÓRIAS:
     * SEMPRE sintetize de MÚLTIPLAS fontes (mínimo 3-4, idealmente 4-8)
     * NUNCA se apoie em apenas um artigo
     * O primeiro resultado NÃO é verdade absoluta
     * Priorize diversidade de fontes, autores, datas e abordagens
     * Se a busca retornar poucos resultados, considere limitação da base

2. **CONTEXTO TEMPORÁRIO DO USUÁRIO:**
   - Conteúdo marcado como [DOCUMENTO_USUARIO] foi enviado AGORA pelo usuário
   - Deve ser analisado SEPARADAMENTE do RAG
   - Na resposta, diferencie claramente o que veio de cada fonte

**SEPARAÇÃO CLARA DE FONTES:**
Quando houver ambos, estruture:
- "📚 Da base de conhecimento: [síntese de múltiplos artigos]"
- "📄 Do documento enviado: [análise específica]"

**REGRAS:**
- Respostas técnicas, concisas, baseadas em evidências
- Se o tema não estiver bem coberto, declare explicitamente
- NUNCA invente informações ou simule uso do RAG
- Prefira resposta curta e precisa do que longa e especulativa

**Integração Multidisciplinar:**
Quando envolver múltiplas áreas, divida em seções (Médica, Veterinária, Jurídica).

**🚫 Fora de Escopo:** Uso recreativo, cultivo não autorizado, especulações de mercado.`
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

    if (!LOVABLE_API_KEY) {
      console.error('LOVABLE_API_KEY not configured');
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
    const { data: activePlans, error: plansError } = await supabase
      .from('user_plans')
      .select('plan_type, status')
      .eq('user_id', userId)
      .in('status', ['active', 'trialing']);

    if (plansError) {
      console.error('Error fetching user plans:', plansError);
    }

    const hasActivePaidPlan = activePlans && activePlans.length > 0 && 
      activePlans.some(plan => plan.plan_type !== 'free');

    // If free plan, check daily message limit
    if (!hasActivePaidPlan) {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);

      console.log('Checking daily usage limit');

      // Count user messages across all conversations for today
      const { data: todayMessages, error: countError } = await supabase
        .from('messages')
        .select('id, conversation_id, conversations!inner(user_id)')
        .eq('role', 'user')
        .eq('conversations.user_id', userId)
        .gte('created_at', today.toISOString())
        .lt('created_at', tomorrow.toISOString());

      if (countError) {
        console.error('Error counting messages');
      } else {
        console.log(`Daily message count: ${todayMessages?.length || 0}`);
        
        if (todayMessages && todayMessages.length >= 5) {
          console.log('Daily limit reached');
          return new Response(JSON.stringify({ 
            error: 'limite_diario',
            message: 'Você atingiu o limite diário de 5 mensagens do plano gratuito. Faça upgrade para continuar.' 
          }), {
            status: 200,
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

    // =====================================================
    // ENHANCED RAG SYSTEM - Multi-source retrieval
    // =====================================================
    let ragContext = "";
    const knowledgeType = getKnowledgeType(modelType);
    const searchTerms = generateSearchTerms(message);
    
    console.log(`RAG Search - Knowledge type: ${knowledgeType}, Search terms: ${searchTerms.join(', ')}`);
    
    if (knowledgeType) {
      try {
        const allChunks: Map<string, any> = new Map(); // Use Map to deduplicate by chunk ID
        const documentSources: Set<string> = new Set(); // Track unique documents
        
        // Determine which knowledge types to search
        const typesToSearch = knowledgeType === 'all' 
          ? ['medical', 'legal', 'veterinary'] 
          : [knowledgeType];
        
        // Search with multiple terms for better coverage
        for (const kType of typesToSearch) {
          // Primary search: Full query text search
          const { data: primaryChunks, error: primaryError } = await supabase
            .from('document_chunks')
            .select(`
              id,
              content,
              chunk_order,
              page_range,
              knowledge_documents!inner(id, title, knowledge_type, author, created_date)
            `)
            .eq('knowledge_documents.knowledge_type', kType)
            .textSearch('content', searchTerms[0], { type: 'websearch', config: 'portuguese' })
            .limit(5);
          
          if (!primaryError && primaryChunks) {
            primaryChunks.forEach((chunk: any) => {
              if (!allChunks.has(chunk.id)) {
                allChunks.set(chunk.id, {
                  ...chunk,
                  document_title: chunk.knowledge_documents?.title,
                  document_author: chunk.knowledge_documents?.author,
                  document_date: chunk.knowledge_documents?.created_date,
                  document_id: chunk.knowledge_documents?.id,
                  relevance_score: 10 // Primary match gets highest score
                });
                documentSources.add(chunk.knowledge_documents?.id);
              }
            });
          }
          
          // Secondary searches: Individual key terms
          for (let i = 1; i < searchTerms.length && allChunks.size < 12; i++) {
            const { data: termChunks, error: termError } = await supabase
              .from('document_chunks')
              .select(`
                id,
                content,
                chunk_order,
                page_range,
                knowledge_documents!inner(id, title, knowledge_type, author, created_date)
              `)
              .eq('knowledge_documents.knowledge_type', kType)
              .ilike('content', `%${searchTerms[i]}%`)
              .limit(3);
            
            if (!termError && termChunks) {
              termChunks.forEach((chunk: any) => {
                if (!allChunks.has(chunk.id)) {
                  allChunks.set(chunk.id, {
                    ...chunk,
                    document_title: chunk.knowledge_documents?.title,
                    document_author: chunk.knowledge_documents?.author,
                    document_date: chunk.knowledge_documents?.created_date,
                    document_id: chunk.knowledge_documents?.id,
                    relevance_score: 5 - i // Lower score for secondary matches
                  });
                  documentSources.add(chunk.knowledge_documents?.id);
                }
              });
            }
          }
          
          // If still not enough, get diverse samples from different documents
          if (documentSources.size < 3 && allChunks.size < 8) {
            const { data: diverseChunks, error: diverseError } = await supabase
              .from('document_chunks')
              .select(`
                id,
                content,
                chunk_order,
                page_range,
                knowledge_documents!inner(id, title, knowledge_type, author, created_date)
              `)
              .eq('knowledge_documents.knowledge_type', kType)
              .order('chunk_order', { ascending: true })
              .limit(10);
            
            if (!diverseError && diverseChunks) {
              // Add chunks from documents we don't have yet
              diverseChunks.forEach((chunk: any) => {
                const docId = chunk.knowledge_documents?.id;
                if (!documentSources.has(docId) && documentSources.size < 6) {
                  allChunks.set(chunk.id, {
                    ...chunk,
                    document_title: chunk.knowledge_documents?.title,
                    document_author: chunk.knowledge_documents?.author,
                    document_date: chunk.knowledge_documents?.created_date,
                    document_id: docId,
                    relevance_score: 2 // Diversity bonus
                  });
                  documentSources.add(docId);
                }
              });
            }
          }
        }
        
        // Convert map to array and sort by relevance
        const chunksArray = Array.from(allChunks.values())
          .sort((a, b) => (b.relevance_score || 0) - (a.relevance_score || 0))
          .slice(0, 10); // Max 10 chunks
        
        if (chunksArray.length > 0) {
          console.log(`RAG: Found ${chunksArray.length} chunks from ${documentSources.size} unique documents`);
          
          // Build structured RAG context
          ragContext = `\n\n[BASE_CONHECIMENTO]
<instrucao_sistema>
Os documentos a seguir fazem parte da sua BASE DE CONHECIMENTO INSTITUCIONAL PERMANENTE.
- Estes NÃO são documentos enviados pelo usuário
- São artigos científicos, estudos e legislação previamente indexados
- SINTETIZE informações de MÚLTIPLAS fontes abaixo
- NUNCA se apoie em apenas uma fonte
- Cite naturalmente: "Estudos indicam...", "A literatura demonstra...", "Conforme [autor/fonte]..."
</instrucao_sistema>

<fontes_disponiveis total="${chunksArray.length}" documentos_unicos="${documentSources.size}">
`;
          
          // Group chunks by document for better context
          const chunksByDocument: Map<string, any[]> = new Map();
          chunksArray.forEach((chunk: any) => {
            const docId = chunk.document_id || 'unknown';
            if (!chunksByDocument.has(docId)) {
              chunksByDocument.set(docId, []);
            }
            chunksByDocument.get(docId)!.push(chunk);
          });
          
          let docIndex = 1;
          chunksByDocument.forEach((chunks, docId) => {
            const firstChunk = chunks[0];
            const sanitizedTitle = escapeXML(firstChunk.document_title || 'Documento');
            const author = firstChunk.document_author ? escapeXML(firstChunk.document_author) : null;
            const date = firstChunk.document_date || null;
            
            ragContext += `\n<documento id="${docIndex}" titulo="${sanitizedTitle}"${author ? ` autor="${author}"` : ''}${date ? ` data="${date}"` : ''}>
`;
            
            chunks.forEach((chunk: any) => {
              const sanitizedContent = sanitizeRAGContent(chunk.content);
              const pageInfo = chunk.page_range ? ` [Páginas: ${chunk.page_range}]` : '';
              ragContext += `<trecho${pageInfo}>
${sanitizedContent}
</trecho>
`;
            });
            
            ragContext += `</documento>
`;
            docIndex++;
          });
          
          ragContext += `</fontes_disponiveis>

<instrucao_uso>
Com base nas ${documentSources.size} fontes acima:
1. SINTETIZE informações cruzando múltiplos documentos
2. NÃO trate o primeiro documento como verdade absoluta
3. Priorize consenso entre fontes e cite divergências se houver
4. Se informação for de apenas uma fonte, indique isso
5. Se o tema não estiver bem coberto, declare explicitamente
</instrucao_uso>
[/BASE_CONHECIMENTO]

`;
        } else {
          console.log('RAG: No relevant chunks found in knowledge base');
          ragContext = `\n\n[AVISO_RAG]
A busca na base de conhecimento não retornou resultados relevantes para esta consulta.
Informe ao usuário que a resposta será baseada no seu conhecimento geral sobre cannabis medicinal,
e que a base de conhecimento específica não possui informações sobre este tema particular.
[/AVISO_RAG]

`;
        }
      } catch (ragError) {
        console.error('RAG error (continuing without context):', ragError);
        ragContext = "";
      }
    }

    // Use Gemini 2.5 Pro for all processing
    const model = 'google/gemini-2.5-pro';
    const systemPrompt = SYSTEM_PROMPTS[modelType as keyof typeof SYSTEM_PROMPTS] || SYSTEM_PROMPTS.generic;

    // =====================================================
    // PROCESS USER ATTACHMENTS (separate from RAG)
    // =====================================================
    let userDocumentContext = "";
    const messageContent: any[] = [{ type: "text", text: message }];

    if (attachments && attachments.length > 0) {
      console.log(`Processing ${attachments.length} user attachments`);
      
      for (const attachment of attachments) {
        if (attachment.file_type.startsWith('image/')) {
          console.log(`Adding user image: ${attachment.file_name}`);
          
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
          try {
            if (attachment.file_type === 'application/pdf') {
              console.log(`Processing user PDF: ${attachment.file_name}`);
              
              const { data: signedUrlData } = await supabase.storage
                .from('chat-attachments')
                .createSignedUrl(attachment.file_path, 3600);
              
              if (signedUrlData?.signedUrl) {
                const pdfResponse = await fetch(signedUrlData.signedUrl);
                const pdfBuffer = await pdfResponse.arrayBuffer();
                
                const uint8Array = new Uint8Array(pdfBuffer);
                let binaryString = '';
                const chunkSize = 8192;
                
                for (let i = 0; i < uint8Array.length; i += chunkSize) {
                  const chunk = uint8Array.subarray(i, Math.min(i + chunkSize, uint8Array.length));
                  binaryString += String.fromCharCode.apply(null, Array.from(chunk));
                }
                
                const base64Pdf = btoa(binaryString);
                
                messageContent.push({
                  type: "inline_data",
                  inline_data: {
                    mime_type: "application/pdf",
                    data: base64Pdf
                  }
                });
                
                userDocumentContext += `\n📄 PDF "${attachment.file_name}" enviado pelo usuário para análise.\n`;
              } else {
                console.error('Error getting signed URL for PDF');
                userDocumentContext += `\n📄 Documento "${attachment.file_name}" (erro no acesso)\n`;
              }
            } else {
              console.log(`Reading user text file: ${attachment.file_name}`);
              
              const { data: fileData, error: downloadError } = await supabase.storage
                .from('chat-attachments')
                .download(attachment.file_path);
              
              if (!downloadError && fileData) {
                const text = await fileData.text();
                userDocumentContext += `\n📄 Conteúdo do arquivo "${attachment.file_name}":\n${text}\n`;
              } else {
                console.error('Error reading text file:', downloadError);
                userDocumentContext += `\n📄 Documento "${attachment.file_name}" (erro na leitura)\n`;
              }
            }
          } catch (err) {
            console.error(`Error processing document ${attachment.file_name}:`, err);
            userDocumentContext += `\n📄 Documento "${attachment.file_name}" (erro no processamento)\n`;
          }
        }
      }

      if (userDocumentContext) {
        userDocumentContext = `\n\n[DOCUMENTO_USUARIO]
<instrucao>
Os documentos a seguir foram ENVIADOS AGORA PELO USUÁRIO e devem ser tratados como CONTEXTO TEMPORÁRIO.
- Estes são DIFERENTES da base de conhecimento institucional
- Analise-os em resposta direta à solicitação do usuário
- Diferencie claramente na resposta o que vem destes documentos vs. da base de conhecimento
</instrucao>
${userDocumentContext}
[/DOCUMENTO_USUARIO]

`;
      }
    }

    // Build messages array - Clear separation between RAG and user documents
    const userMessageContent = messageContent.length > 1 ? messageContent : message;
    
    // System prompt + RAG (institutional knowledge) + User documents (temporary context)
    const systemContent = systemPrompt + ragContext + userDocumentContext;
    
    const geminiMessages = [
      { role: 'system', content: systemContent },
      ...(messages || []).map((m: any) => ({ role: m.role, content: m.content })),
      { role: 'user', content: userMessageContent }
    ];

    console.log(`Sending to Gemini 2.5 Pro, modelType: ${modelType}`);
    console.log(`- User Attachments: ${attachments?.length || 0}`);
    console.log(`- RAG Context: ${ragContext ? 'Yes (institutional knowledge)' : 'No'}`);

    // Call Lovable AI Gateway with Gemini 2.5 Pro
    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: model,
        messages: geminiMessages,
        max_tokens: 8000,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Lovable AI API error:', response.status, errorText);
      
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: 'Rate limits exceeded, please try again later.' }), {
          status: 429,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: 'Payment required, please add funds to your Lovable AI workspace.' }), {
          status: 402,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      
      return new Response(JSON.stringify({ error: 'AI service error' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const data = await response.json();
    const aiResponse = data.choices[0].message.content;

    // Register AI usage for cost tracking
    try {
      const usage = data.usage || {};
      const tokensInput = usage.prompt_tokens || 0;
      const tokensOutput = usage.completion_tokens || 0;
      
      const costPer1kInputTokens = 0.00015;
      const costPer1kOutputTokens = 0.0006;
      
      const inputCost = (tokensInput / 1000) * costPer1kInputTokens;
      const outputCost = (tokensOutput / 1000) * costPer1kOutputTokens;
      const totalCost = inputCost + outputCost;
      
      const authHeader = req.headers.get('Authorization');
      if (authHeader) {
        const token = authHeader.replace('Bearer ', '');
        const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
        const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
        const adminClient = createClient(supabaseUrl, supabaseServiceKey);
        
        const { data: { user } } = await adminClient.auth.getUser(token);
        
        if (user) {
          await adminClient.from('ai_usage').insert({
            user_id: user.id,
            conversation_id: conversationId,
            model: model,
            tokens_input: tokensInput,
            tokens_output: tokensOutput,
            cost: totalCost,
          });
        }
      }
    } catch (usageError) {
      console.error('Error recording AI usage:', usageError);
    }

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
