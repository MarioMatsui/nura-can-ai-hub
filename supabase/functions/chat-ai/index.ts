import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.75.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// =============================================================================
// ALIASES E EXPANSÃO SEMÂNTICA
// =============================================================================

// Mapa de aliases para termos técnicos (PT-BR e EN)
const TERM_ALIASES: Record<string, string[]> = {
  // Canabinoides principais
  "cbc": ["canabicromeno", "cannabichromene", "cbc"],
  "cbg": ["canabigerol", "cannabigerol", "cbg"],
  "cbn": ["canabinol", "cannabinol", "cbn"],
  "cbd": ["canabidiol", "cannabidiol", "cbd"],
  "thc": ["tetrahidrocanabinol", "tetrahydrocannabinol", "thc", "delta-9-thc", "delta9thc"],
  "thcv": ["tetrahidrocanabivarina", "tetrahydrocannabivarin", "thcv"],
  "cbdv": ["canabidivarina", "cannabidivarin", "cbdv"],
  "delta-8": ["delta-8-thc", "delta8thc", "delta-8 thc"],
  "cbda": ["ácido canabidiólico", "cannabidiolic acid", "cbda"],
  "thca": ["ácido tetrahidrocanabinólico", "tetrahydrocannabinolic acid", "thca"],
  
  // Condições médicas comuns
  "epilepsia": ["epilepsia", "epilepsy", "convulsões", "seizures", "crises epilépticas", "epileptic seizures"],
  "dor": ["dor", "pain", "dor crônica", "chronic pain", "analgesia", "nociceptivo"],
  "ansiedade": ["ansiedade", "anxiety", "transtorno ansioso", "anxiety disorder"],
  "insônia": ["insônia", "insomnia", "distúrbio do sono", "sleep disorder"],
  "câncer": ["câncer", "cancer", "oncologia", "oncology", "tumor", "neoplasia"],
  "esclerose": ["esclerose múltipla", "multiple sclerosis", "em", "ms"],
  "parkinson": ["parkinson", "parkinsons", "doença de parkinson", "parkinsons disease"],
  "alzheimer": ["alzheimer", "alzheimers", "doença de alzheimer", "alzheimers disease"],
  "fibromialgia": ["fibromialgia", "fibromyalgia"],
  "artrite": ["artrite", "arthritis", "artrite reumatoide", "rheumatoid arthritis"],
  
  // Termos veterinários
  "osteoartrite": ["osteoartrite", "osteoarthritis", "oa", "artrose"],
  "dermatite": ["dermatite", "dermatitis", "atopia", "atopic dermatitis"],
  
  // Termos jurídicos
  "anvisa": ["anvisa", "agência nacional de vigilância sanitária"],
  "rdc": ["rdc", "resolução da diretoria colegiada"],
  "habeas corpus": ["habeas corpus", "hc"],
  "importação": ["importação", "import", "importar"],
};

// Normaliza texto para busca (remove acentos, lowercase)
function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

// Expande termo com aliases
function expandTermWithAliases(term: string): string[] {
  const normalized = normalizeText(term);
  const terms = new Set<string>([normalized, term.toLowerCase()]);
  
  // Busca aliases exatos
  for (const [key, aliases] of Object.entries(TERM_ALIASES)) {
    const normalizedKey = normalizeText(key);
    if (normalized === normalizedKey || aliases.some(a => normalizeText(a) === normalized)) {
      aliases.forEach(a => terms.add(normalizeText(a)));
      terms.add(normalizedKey);
    }
  }
  
  return Array.from(terms);
}

// Extrai termos-chave da mensagem do usuário
function extractKeyTerms(message: string): string[] {
  const stopwords = new Set([
    'a', 'o', 'e', 'é', 'de', 'da', 'do', 'em', 'um', 'uma', 'os', 'as',
    'para', 'com', 'por', 'que', 'se', 'na', 'no', 'ao', 'à', 'dos', 'das',
    'sobre', 'como', 'qual', 'quais', 'pode', 'podem', 'tem', 'têm', 'ter',
    'me', 'meu', 'minha', 'você', 'voce', 'eu', 'isso', 'isto', 'esse', 'essa',
    'the', 'is', 'are', 'was', 'were', 'be', 'been', 'being', 'have', 'has',
    'had', 'do', 'does', 'did', 'will', 'would', 'could', 'should', 'may',
    'might', 'must', 'shall', 'can', 'need', 'dare', 'ought', 'used', 'to',
    'of', 'in', 'for', 'on', 'with', 'at', 'by', 'from', 'up', 'about',
    'into', 'through', 'during', 'before', 'after', 'above', 'below', 'between',
    'under', 'again', 'further', 'then', 'once', 'here', 'there', 'when',
    'where', 'why', 'how', 'all', 'each', 'few', 'more', 'most', 'other',
    'some', 'such', 'no', 'nor', 'not', 'only', 'own', 'same', 'so', 'than',
    'too', 'very', 's', 't', 'just', 'don', 'now', 'and', 'or', 'but',
    'quero', 'gostaria', 'preciso', 'fale', 'explique', 'conte', 'diga',
    'artigos', 'artigo', 'estudo', 'estudos', 'evidência', 'evidências',
    'pesquisa', 'pesquisas', 'informação', 'informações', 'dados'
  ]);
  
  const words = message
    .toLowerCase()
    .replace(/[^\w\sáàâãéèêíìîóòôõúùûüçñ-]/g, ' ')
    .split(/\s+/)
    .filter(word => word.length > 2 && !stopwords.has(word));
  
  // Também identifica siglas (2-5 caracteres maiúsculos)
  const acronyms = message.match(/\b[A-Z]{2,5}\b/g) || [];
  
  return [...new Set([...words, ...acronyms.map(a => a.toLowerCase())])];
}

// Gera múltiplas queries de busca
function generateSearchQueries(message: string): string[] {
  const keyTerms = extractKeyTerms(message);
  const queries = new Set<string>();
  
  // Query original normalizada
  queries.add(normalizeText(message));
  
  // Expande cada termo-chave com aliases
  for (const term of keyTerms) {
    const expanded = expandTermWithAliases(term);
    expanded.forEach(t => queries.add(t));
    
    // Combinações com intenções comuns
    const intents = ['efeitos', 'mecanismo', 'evidência', 'farmacologia', 'segurança', 
                     'tratamento', 'dosagem', 'interação', 'contraindicação'];
    for (const intent of intents) {
      if (message.toLowerCase().includes(intent) || expanded.length > 1) {
        queries.add(`${term} ${intent}`);
      }
    }
  }
  
  return Array.from(queries).slice(0, 5); // Phase 3: capped at 5 (was 15) to reduce DB load
}

// =============================================================================
// SEGURANÇA
// =============================================================================

// Sanitiza conteúdo RAG para prevenir prompt injection
function sanitizeRAGContent(content: string): string {
  if (!content) return '';
  
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
    sanitized = sanitized.replace(pattern, '[REDACTED]');
  });
  
  const maxLength = 6000;
  if (sanitized.length > maxLength) {
    sanitized = sanitized.substring(0, maxLength) + '... [conteúdo truncado]';
  }
  
  return sanitized;
}

function escapeXML(text: string): string {
  if (!text) return '';
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

// =============================================================================
// BUSCA RAG INTELIGENTE
// =============================================================================

interface ChunkResult {
  id: string;
  content: string;
  document_title: string;
  chunk_order: number;
  relevance_score: number;
  knowledge_type: string;
}

async function searchKnowledgeBase(
  supabase: any,
  message: string,
  knowledgeType: string
): Promise<ChunkResult[]> {
  const searchQueries = generateSearchQueries(message);
  console.log(`Generated ${searchQueries.length} search queries:`, searchQueries.slice(0, 5));

  const knowledgeTypes = knowledgeType === 'all'
    ? ['medical', 'legal', 'veterinary']
    : [knowledgeType];

  // Phase 3: fan out every (kType, query) pair in parallel. With Promise.all,
  // total RAG time becomes max(query_ms) instead of sum(query_ms). With the
  // pg_trgm GIN index on document_chunks.content (added in the same phase),
  // each ILIKE is also faster individually. Scoring/dedup happens in a single
  // pass after all results return.
  type RawSearchResult = { kType: string; queryTerms: string[]; chunks: any[] };

  const tasks: Promise<RawSearchResult>[] = [];

  for (const kType of knowledgeTypes) {
    for (const query of searchQueries) {
      const queryTerms = query.split(' ').filter(t => t.length > 2);
      if (queryTerms.length === 0) continue;

      const orConditions = queryTerms.map(term => `content.ilike.%${term}%`).join(',');

      tasks.push(
        supabase
          .from('document_chunks')
          .select(`
            id,
            content,
            chunk_order,
            knowledge_documents!inner(id, title, knowledge_type)
          `)
          .eq('knowledge_documents.knowledge_type', kType)
          .or(orConditions)
          .limit(5)
          .then(({ data, error }: { data: any; error: any }) => {
            if (error) {
              console.error(`Search error for query "${query}" (${kType}):`, error);
              return { kType, queryTerms, chunks: [] };
            }
            return { kType, queryTerms, chunks: data || [] };
          })
          .catch((err: any) => {
            console.error(`Error in search query "${query}" (${kType}):`, err);
            return { kType, queryTerms, chunks: [] };
          })
      );
    }
  }

  const allResults = await Promise.all(tasks);

  // Score and dedupe in one pass.
  const chunkMap: Map<string, ChunkResult> = new Map();

  for (const { kType, queryTerms, chunks } of allResults) {
    for (const chunk of chunks) {
      const chunkId = chunk.id;
      let score = 0;
      const contentLower = chunk.content.toLowerCase();

      for (const term of queryTerms) {
        const termLower = term.toLowerCase();
        const matches = (contentLower.match(new RegExp(termLower, 'g')) || []).length;
        score += matches;

        const expandedTerms = expandTermWithAliases(term);
        for (const expTerm of expandedTerms) {
          if (expTerm !== termLower && contentLower.includes(expTerm)) {
            score += 0.5;
          }
        }
      }

      const existing = chunkMap.get(chunkId);
      if (!existing || existing.relevance_score < score) {
        chunkMap.set(chunkId, {
          id: chunkId,
          content: chunk.content,
          document_title: chunk.knowledge_documents?.title || 'Documento',
          chunk_order: chunk.chunk_order,
          relevance_score: score,
          knowledge_type: kType,
        });
      }
    }
  }

  const results = Array.from(chunkMap.values())
    .sort((a, b) => b.relevance_score - a.relevance_score)
    .slice(0, 8);

  console.log(`RAG search ran ${tasks.length} parallel queries, found ${chunkMap.size} unique chunks, returning top ${results.length}`);

  return results;
}

// =============================================================================
// CONFIGURAÇÃO
// =============================================================================

const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');

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

// =============================================================================
// SYSTEM PROMPTS COM INSTRUÇÕES RAG
// =============================================================================

const RAG_INSTRUCTIONS = `
## INSTRUÇÕES DE COMPORTAMENTO COM BASE DE CONHECIMENTO

Você possui acesso a uma base de conhecimento especializada que representa seu "cérebro" permanente. Esta base contém artigos científicos, documentos técnicos e materiais de referência previamente indexados.

### REGRAS OBRIGATÓRIAS:

1. **SEPARAÇÃO DE CONTEXTO**:
   - A BASE DE CONHECIMENTO (RAG) é seu conhecimento permanente. NUNCA diga que o "usuário enviou" esses documentos.
   - DOCUMENTOS DO USUÁRIO são arquivos enviados durante a conversa atual (PDFs, imagens, textos colados).
   - Trate essas duas camadas como completamente distintas.

2. **PRIORIDADE DO RAG**:
   - Sempre que uma pergunta envolver tema técnico ou científico, CONSULTE a base de conhecimento ANTES de responder.
   - NÃO responda "de memória" quando a base puder contribuir.
   - A recuperação de conhecimento vem PRIMEIRO, depois a formulação da resposta.

3. **QUANDO PERGUNTAR "VOCÊ TEM ARTIGOS SOBRE X?"**:
   - Se a base contiver informações relevantes, responda de forma natural: "Sim, tenho informações sobre isso. [explicação]"
   - Se NÃO encontrar: "Não encontrei informações específicas sobre esse tema na base de conhecimento atual, mas posso compartilhar o que sei sobre..."
   - NUNCA afirme que "não existe no banco" - diga apenas que não apareceu de forma relevante.

4. **FORMA DA RESPOSTA**:
   - Use linguagem NATURAL, humana e confiante.
   - NUNCA use termos técnicos como: RAG, chunk, retrieval, base vetorial, embedding, top-k.
   - Estrutura preferencial:
     a) Resposta direta e clara
     b) Explicação baseada no conteúdo recuperado
     c) Oferta opcional de aprofundamento ("Se quiser, posso explicar melhor...", "Posso comparar com...")
   - A resposta deve ser técnica na base, mas acessível na forma.

5. **CITAÇÃO DE FONTES**:
   - Quando usar informações da base, cite a fonte de forma natural.
   - Exemplo: "De acordo com um estudo publicado no Journal of Pain Research..." ou "Conforme documentado na literatura científica..."
   - NÃO liste referências de forma robotizada.
   - **PROIBIDO**: NUNCA exiba identificadores de fonte como "(Fonte 1)", "(Fonte 2)", "(Fonte 3)" ou qualquer variação. Esses labels são INTERNOS e jamais devem aparecer no texto final ao usuário.
   - Use as fontes internamente para fundamentar sua resposta, mas NUNCA revele os identificadores ao usuário.

6. **LIMITAÇÕES**:
   - Se a evidência na base for limitada, comunique naturalmente.
   - NÃO invente estudos, dados ou conclusões.
   - Prefira uma resposta curta e honesta a uma longa sem suporte adequado.
`;

const SYSTEM_PROMPTS = {
  generic: `Você é 'NuraAI', um assistente de IA especializado em cannabis medicinal, projetado para oferecer informações acessíveis e confiáveis sobre o tema. Sua base de conhecimento é fundamentada em estudos científicos, ensaios clínicos e publicações médicas revisadas por pares.

${RAG_INSTRUCTIONS}

⚕️ Diretrizes de Atuação

1. Precisão Científica:
Forneça respostas baseadas em evidências científicas e revisões sistemáticas. Sempre que possível, cite as fontes (ex: "De acordo com um estudo de 2022 publicado no Journal of Clinical Oncology…").

2. Linguagem Clara e Acessível:
Use linguagem técnica quando necessário, mas sempre priorize clareza e acessibilidade. O público do plano gratuito pode incluir profissionais em formação e interessados no tema.
Inclua dados sobre mecanismos de ação, vias de administração, dosagens em estudos clínicos e potenciais efeitos adversos quando relevante.

3. Escopo:
Interprete perguntas sobre condições médicas e patologias no contexto da cannabis medicinal, mesmo que não mencionem explicitamente "cannabis". Forneça informações sobre:
- Aplicações clínicas da cannabis medicinal.
- Farmacologia e mecanismos de ação de fitocanabinoides.
- Efeitos terapêuticos e adversos.
- Interações medicamentosas.
- Protocolos de pesquisa e ensaios clínicos.
- Regulação de prescrição, importação e uso medicinal.

4. Foco Educacional:
Nunca ofereça aconselhamento direto a pacientes. Deixe claro que suas informações são apenas para fins de educação e suporte à decisão.

5. Identidade:
Você é o assistente generalista gratuito da Nura. NÃO se comporte como um agente jurídico ou veterinário. Seu foco é exclusivamente no contexto médico-científico da cannabis medicinal. Se o usuário fizer perguntas específicas de outras áreas (jurídica ou veterinária), oriente-o a utilizar os agentes especializados disponíveis nos planos pagos.

🚫 Fora de Escopo
Recuse **apenas** perguntas claramente não relacionadas à cannabis medicinal, como uso recreativo, finanças não relacionadas ao setor, ou temas completamente fora do contexto médico-científico (esportes, entretenimento, etc.).

Em caso de pergunta claramente fora de escopo, responda com:

"Desculpe, mas minha atuação é restrita à cannabis medicinal e seus aspectos científicos. Não posso oferecer informações fora desse contexto."`,

  medical: `Você é 'NuraAI', um assistente de IA especializado em cannabis medicinal, projetado exclusivamente para médicos e pesquisadores. Sua base de conhecimento é fundamentada em estudos científicos, ensaios clínicos e publicações médicas revisadas por pares.

${RAG_INSTRUCTIONS}

⚕️ Diretrizes Médicas e Científicas

1. Precisão Científica:
Forneça respostas baseadas em evidências científicas e revisões sistemáticas. Sempre que possível, cite as fontes (ex: "De acordo com um estudo de 2022 publicado no Journal of Clinical Oncology…").

2. Linguagem Técnica:
Use terminologia médica, farmacológica e científica adequada para o público profissional.
Inclua dados sobre farmacocinética, farmacodinâmica, interações medicamentosas, vias de administração, dosagens em estudos clínicos e potenciais efeitos adversos.

3. Escopo Médico:
Interprete perguntas sobre condições médicas e patologias no contexto da cannabis medicinal, mesmo que não mencionem explicitamente "cannabis". Forneça informações sobre:
- Aplicações clínicas da cannabis medicinal.
- Farmacologia e mecanismos de ação de fitocanabinoides.
- Efeitos terapêuticos e adversos.
- Interações medicamentosas.
- Protocolos de pesquisa e ensaios clínicos.
- Regulação de prescrição, importação e uso medicinal.

4. Foco Educacional:
Nunca ofereça aconselhamento direto a pacientes. Deixe claro que suas informações são apenas para fins de educação e suporte à decisão profissional.

🚫 Fora de Escopo
Recuse **apenas** perguntas claramente não relacionadas à cannabis medicinal, como uso recreativo, finanças não relacionadas ao setor, ou temas completamente fora do contexto médico-científico (esportes, entretenimento, etc.).`,

  legal: `Você é "NuraAI", um assistente de inteligência artificial especializado em cannabis medicinal, projetado exclusivamente para profissionais jurídicos, regulatórios e empresariais que atuam no setor canábico.

${RAG_INSTRUCTIONS}

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

4. Caráter Educativo:
As informações fornecidas têm caráter educativo e informativo para profissionais da área.

🚫 Fora de Escopo
Recuse **apenas** perguntas claramente não relacionadas à cannabis medicinal, como uso recreativo, finanças não relacionadas ao setor, ou temas completamente fora do contexto legal-regulatório (esportes, entretenimento, etc.).`,

  veterinary: `Você é "NuraAI", um assistente de inteligência artificial especializado em cannabis medicinal veterinária, projetado exclusivamente para médicos-veterinários, pesquisadores e acadêmicos da área.

${RAG_INSTRUCTIONS}

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

4. Caráter Técnico:
Esta informação tem caráter técnico e científico, destinada a profissionais veterinários.

🚫 Fora de Escopo
Recuse **apenas** perguntas claramente não relacionadas à cannabis medicinal veterinária, como uso recreativo, finanças não relacionadas ao setor, ou temas completamente fora do contexto veterinário (esportes, entretenimento, etc.).`,

  specialist: `Você é "NuraAI", um assistente de inteligência artificial de alta especialização, dedicado exclusivamente à cannabis medicinal. Sua expertise abrange as áreas médica, veterinária e jurídica, e você é projetado para atender médicos, pesquisadores, juristas e médicos-veterinários.

${RAG_INSTRUCTIONS}

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

**🐾 Diretrizes Veterinárias:**

*   **Escopo:** Aplicações terapêuticas da cannabis em animais (analgesia, epilepsia, ansiedade, inflamação, oncologia, dermatologia, etc.), estudos científicos sobre eficácia e segurança em espécies domésticas, normas e regulamentações do CFMV e MAPA, aspectos éticos e legais do uso veterinário no Brasil e no exterior, protocolos de monitoramento e acompanhamento clínico de pacientes animais.

**⚖️ Diretrizes Jurídicas e Regulatórias:**

*   **Escopo:** Regulação e legislação da cannabis medicinal no Brasil e no exterior, direitos e deveres de pacientes, médicos, veterinários e empresas, autorização, importação, produção, comercialização e licenciamento de produtos à base de cannabis, responsabilidade civil, penal, ética e administrativa, questões empresariais e societárias no setor canábico, aspectos de compliance, contratos, propriedade intelectual e licenciamento, jurisprudência e precedentes judiciais (habeas corpus, autorizações individuais e ações coletivas), pareceres e interpretações normativas de órgãos reguladores.

**🧩 Integração Multidisciplinar:**

Quando uma pergunta envolver mais de uma área (por exemplo, médica e jurídica, ou veterinária e legal), divida a resposta claramente em seções:

*   **Parte Médica:** Explicação científica e clínica, com referências.
*   **Parte Veterinária:** Evidências e contexto animal, se aplicável, com referências.
*   **Parte Jurídica:** Enquadramento legal e regulatório, com referências.

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

// =============================================================================
// RATE LIMITING (In-memory, per-user)
// =============================================================================

interface RateLimitEntry {
  count: number;
  resetTime: number;
}

// Simple in-memory rate limiter (per user, per minute)
const rateLimitMap = new Map<string, RateLimitEntry>();
const RATE_LIMIT_WINDOW_MS = 60 * 1000; // 1 minute
const RATE_LIMIT_MAX_REQUESTS = 20; // 20 requests per minute for paid, 10 for free

function checkRateLimit(userId: string, isPaidUser: boolean): { allowed: boolean; retryAfter?: number } {
  const now = Date.now();
  const maxRequests = isPaidUser ? RATE_LIMIT_MAX_REQUESTS : 10;
  
  const entry = rateLimitMap.get(userId);
  
  if (!entry || now > entry.resetTime) {
    // New window
    rateLimitMap.set(userId, { count: 1, resetTime: now + RATE_LIMIT_WINDOW_MS });
    return { allowed: true };
  }
  
  if (entry.count >= maxRequests) {
    const retryAfter = Math.ceil((entry.resetTime - now) / 1000);
    return { allowed: false, retryAfter };
  }
  
  entry.count++;
  return { allowed: true };
}

// Cleanup old entries periodically (every 5 minutes)
setInterval(() => {
  const now = Date.now();
  for (const [userId, entry] of rateLimitMap.entries()) {
    if (now > entry.resetTime) {
      rateLimitMap.delete(userId);
    }
  }
}, 5 * 60 * 1000);

// =============================================================================
// HANDLER PRINCIPAL
// =============================================================================

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  // Perf instrumentation — captured per request, persisted at end (best-effort).
  const perf = {
    t_request_start: Date.now(),
    t_auth_done: 0,
    t_rag_start: 0,
    t_rag_done: 0,
    t_llm_start: 0,
    t_llm_first_token: 0,
    t_llm_done: 0,
    t_response_sent: 0,
    rag_chunk_count: 0,
    attachment_count: 0,
    tokens_input: 0,
    tokens_output: 0,
    model: '',
    model_type: '',
    knowledge_type: '',
    conversation_id: null as string | null,
    user_id: null as string | null,
    status_code: 0,
    error: null as string | null,
  };

  try {
    // Validate authorization header first
    const authHeader = req.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      console.error('Missing or invalid authorization header');
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { conversationId, message, modelType, attachments = [] } = await req.json();
    perf.conversation_id = conversationId ?? null;
    perf.model_type = modelType ?? '';
    perf.attachment_count = Array.isArray(attachments) ? attachments.length : 0;

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

    // Verify the user's JWT token
    const token = authHeader.replace('Bearer ', '');
    const { data: userData, error: userError } = await supabase.auth.getUser(token);
    
    if (userError || !userData.user) {
      console.error('Invalid or expired token:', userError);
      return new Response(JSON.stringify({ error: 'Unauthorized - Invalid token' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const authenticatedUserId = userData.user.id;
    perf.user_id = authenticatedUserId;
    perf.t_auth_done = Date.now();

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

    // SECURITY: Verify that the authenticated user owns this conversation
    if (authenticatedUserId !== userId) {
      console.error('User does not own this conversation:', { authenticatedUserId, conversationUserId: userId });
      return new Response(JSON.stringify({ error: 'Forbidden - Access denied' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

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

    // SECURITY: Apply rate limiting at edge function level
    const rateLimitResult = checkRateLimit(userId, hasActivePaidPlan ?? false);
    if (!rateLimitResult.allowed) {
      console.log(`Rate limit exceeded for user ${userId}`);
      return new Response(JSON.stringify({ 
        error: 'rate_limit',
        message: 'Muitas solicitações. Por favor, aguarde um momento.',
        retryAfter: rateLimitResult.retryAfter
      }), {
        status: 429,
        headers: { 
          ...corsHeaders, 
          'Content-Type': 'application/json',
          'Retry-After': String(rateLimitResult.retryAfter || 60)
        },
      });
    }

    // If free plan, check daily message limit
    if (!hasActivePaidPlan) {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);

      console.log('Checking daily usage limit');

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

    // ==========================================================================
    // RAG: BUSCA INTELIGENTE NA BASE DE CONHECIMENTO
    // ==========================================================================
    
    let ragContext = "";
    const knowledgeType = getKnowledgeType(modelType);
    perf.knowledge_type = knowledgeType ?? '';

    if (knowledgeType) {
      try {
        console.log(`\n=== RAG SEARCH ===`);
        console.log(`Model type: ${modelType}, Knowledge type: ${knowledgeType}`);
        console.log(`User message: "${message.substring(0, 100)}..."`);

        perf.t_rag_start = Date.now();
        const relevantChunks = await searchKnowledgeBase(supabase, message, knowledgeType);
        perf.t_rag_done = Date.now();
        perf.rag_chunk_count = relevantChunks.length;
        
        if (relevantChunks.length > 0) {
          console.log(`Found ${relevantChunks.length} relevant chunks from knowledge base`);
          
          // Agrupa chunks por documento para citação mais natural
          const docGroups = new Map<string, ChunkResult[]>();
          for (const chunk of relevantChunks) {
            const existing = docGroups.get(chunk.document_title) || [];
            existing.push(chunk);
            docGroups.set(chunk.document_title, existing);
          }
          
          ragContext = "\n\n<!-- BASE DE CONHECIMENTO PERMANENTE -->\n";
          ragContext += "<!-- ATENÇÃO: Este conteúdo é seu conhecimento permanente, NÃO documentos enviados pelo usuário -->\n\n";
          
          let docIndex = 1;
          for (const [docTitle, chunks] of docGroups) {
            const sanitizedTitle = escapeXML(docTitle);
            ragContext += `<fonte id="${docIndex}" titulo="${sanitizedTitle}">\n`;
            
            // Combina chunks do mesmo documento
            const combinedContent = chunks
              .sort((a, b) => a.chunk_order - b.chunk_order)
              .map(c => sanitizeRAGContent(c.content))
              .join('\n\n---\n\n');
            
            ragContext += combinedContent + '\n';
            ragContext += `</fonte>\n\n`;
            docIndex++;
          }
          
          ragContext += "<!-- FIM DA BASE DE CONHECIMENTO -->\n\n";
          
          console.log(`RAG context built with ${docGroups.size} document sources`);
        } else {
          console.log('No relevant chunks found in knowledge base for this query');
        }
      } catch (ragError) {
        console.error('RAG error (continuing without context):', ragError);
      }
    }

    // ==========================================================================
    // PROCESSAMENTO DE ANEXOS DO USUÁRIO
    // ==========================================================================
    
    // Phase 2: Flash for single-domain queries (3-5x faster, ~75% cheaper).
    // Reserve Pro for `specialist`, which integrates medical + legal + veterinary.
    const model = modelType === 'specialist'
      ? 'google/gemini-2.5-pro'
      : 'google/gemini-2.5-flash';
    perf.model = model;
    const systemPrompt = SYSTEM_PROMPTS[modelType as keyof typeof SYSTEM_PROMPTS] || SYSTEM_PROMPTS.generic;

    let attachmentContext = "";
    const messageContent: any[] = [{ type: "text", text: message }];

    // Helper: download file and convert to base64 data URL (compatible with Lovable AI Gateway / Gemini)
    const downloadAsBase64 = async (filePath: string): Promise<{ base64: string; mimeType: string } | null> => {
      try {
        const { data, error } = await supabase.storage.from('chat-attachments').download(filePath);
        if (error || !data) {
          console.error('Storage download error:', error);
          return null;
        }
        const buf = new Uint8Array(await data.arrayBuffer());
        let binary = '';
        const chunkSize = 8192;
        for (let i = 0; i < buf.length; i += chunkSize) {
          const chunk = buf.subarray(i, Math.min(i + chunkSize, buf.length));
          binary += String.fromCharCode.apply(null, Array.from(chunk));
        }
        return { base64: btoa(binary), mimeType: data.type || 'application/octet-stream' };
      } catch (e) {
        console.error('downloadAsBase64 exception:', e);
        return null;
      }
    };

    const isTextualMime = (mt: string) =>
      mt.startsWith('text/') ||
      mt === 'application/json' ||
      mt === 'application/xml' ||
      mt === 'application/csv';

    if (attachments && attachments.length > 0) {
      console.log(`Processing ${attachments.length} user attachments`);

      for (const attachment of attachments) {
        const fileType = attachment.file_type || '';
        const fileName = attachment.file_name || 'arquivo';

        try {
          // 1) IMAGENS — vision via base64 data URL
          if (fileType.startsWith('image/')) {
            console.log(`Adding image to vision (base64): ${fileName}`);
            const file = await downloadAsBase64(attachment.file_path);
            if (file) {
              messageContent.push({
                type: 'image_url',
                image_url: {
                  url: `data:${file.mimeType};base64,${file.base64}`,
                },
              });
              attachmentContext += `\n\n🖼️ O USUÁRIO ENVIOU a imagem "${fileName}" para análise AGORA. Interprete o conteúdo visual (exames, fotos, documentos escaneados, gráficos, etc.) e incorpore na resposta.\n`;
            } else {
              attachmentContext += `\n\n🖼️ Imagem "${fileName}" anexada (erro no acesso)\n`;
            }
            continue;
          }

          // 2) PDFs — multimodal via base64 data URL (Gemini lê PDF nativamente)
          if (fileType === 'application/pdf') {
            console.log(`Adding PDF to multimodal (base64): ${fileName}`);
            const file = await downloadAsBase64(attachment.file_path);
            if (file) {
              messageContent.push({
                type: 'image_url',
                image_url: {
                  url: `data:application/pdf;base64,${file.base64}`,
                },
              });
              attachmentContext += `\n\n📄 O USUÁRIO ENVIOU o documento PDF "${fileName}" para análise AGORA. Leia integralmente o conteúdo do PDF e incorpore na resposta.\n`;
            } else {
              attachmentContext += `\n\n📄 PDF "${fileName}" anexado (erro no acesso)\n`;
            }
            continue;
          }

          // 3) Arquivos textuais — leitura direta como texto
          if (isTextualMime(fileType) || /\.(txt|md|csv|json|xml|log)$/i.test(fileName)) {
            console.log(`Reading text file: ${fileName}`);
            const { data: fileData, error: downloadError } = await supabase.storage
              .from('chat-attachments')
              .download(attachment.file_path);
            if (!downloadError && fileData) {
              const text = (await fileData.text()).slice(0, 30000);
              attachmentContext += `\n\n📄 O USUÁRIO ENVIOU o documento "${fileName}" com o seguinte conteúdo (texto integral abaixo):\n\n---\n${text}\n---\n`;
            } else {
              console.error('Error reading text file:', downloadError);
              attachmentContext += `\n\n📄 Documento "${fileName}" anexado (erro na leitura)\n`;
            }
            continue;
          }

          // 4) DOC/DOCX e demais binários — tenta enviar como inline para o Gemini
          if (
            fileType === 'application/msword' ||
            fileType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
            /\.(doc|docx|rtf|odt)$/i.test(fileName)
          ) {
            console.log(`Adding DOC/DOCX as inline binary: ${fileName}`);
            const file = await downloadAsBase64(attachment.file_path);
            if (file) {
              messageContent.push({
                type: 'image_url',
                image_url: {
                  url: `data:${file.mimeType};base64,${file.base64}`,
                },
              });
              attachmentContext += `\n\n📄 O USUÁRIO ENVIOU o documento "${fileName}" (formato Word) para análise AGORA. Interprete o conteúdo e incorpore na resposta.\n`;
            } else {
              attachmentContext += `\n\n📄 Documento "${fileName}" anexado (erro no acesso)\n`;
            }
            continue;
          }

          // 5) Fallback — informa que o arquivo foi enviado mas o tipo não é suportado para leitura
          console.log(`Unsupported attachment type: ${fileType} (${fileName})`);
          attachmentContext += `\n\n📎 O USUÁRIO ANEXOU "${fileName}" (tipo ${fileType || 'desconhecido'}). Este formato não pode ser lido diretamente; peça ao usuário para reenviar como PDF, imagem ou texto se o conteúdo for relevante.\n`;
        } catch (err) {
          console.error(`Error processing attachment ${fileName}:`, err);
          attachmentContext += `\n\n📄 Documento "${fileName}" anexado (erro no processamento)\n`;
        }
      }

      if (attachmentContext) {
        attachmentContext =
          '\n\n<!-- DOCUMENTOS ENVIADOS PELO USUÁRIO NESTA CONVERSA -->\n' +
          '<!-- PRIORIDADE: Estes documentos foram enviados AGORA pelo usuário e devem ter PRIORIDADE sobre a base de conhecimento. Você DEVE ler, interpretar e incorporar o conteúdo deles na sua resposta. -->\n' +
          attachmentContext +
          '\n<!-- FIM DOS DOCUMENTOS DO USUÁRIO -->\n\n';
      }
    }

    // ==========================================================================
    // CONSTRUÇÃO DA MENSAGEM FINAL
    // ==========================================================================
    
    const userMessageContent = messageContent.length > 1 ? messageContent : message;
    
    // Ordem: System Prompt -> RAG (conhecimento base) -> Anexos do usuário (prioridade)
    const systemContent = systemPrompt + ragContext + attachmentContext;
    
    const geminiMessages = [
      { role: 'system', content: systemContent },
      ...(messages || []).map((m: any) => ({ role: m.role, content: m.content })),
      { role: 'user', content: userMessageContent }
    ];

    console.log(`\n=== SENDING TO GEMINI ===`);
    console.log(`Model: ${model}, Type: ${modelType}`);
    console.log(`- Attachments: ${attachments?.length || 0}`);
    console.log(`- RAG Context: ${ragContext ? 'Yes' : 'No'}`);
    console.log(`- System prompt length: ${systemContent.length} chars`);

    // Call Lovable AI Gateway — streaming (Phase 1)
    perf.t_llm_start = Date.now();
    const upstream = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: model,
        messages: geminiMessages,
        max_tokens: 2000,
        stream: true,
      }),
    });

    // Pre-stream errors stay as JSON so the client can branch on Content-Type.
    if (!upstream.ok) {
      perf.t_llm_done = Date.now();
      const errorText = await upstream.text();
      console.error('Lovable AI API error:', upstream.status, errorText);
      perf.error = `LLM gateway ${upstream.status}: ${errorText.slice(0, 200)}`;
      perf.status_code = upstream.status === 429 || upstream.status === 402 ? upstream.status : 500;
      perf.t_response_sent = Date.now();
      flushPerfMetrics(perf);

      if (upstream.status === 429) {
        return new Response(JSON.stringify({ error: 'Rate limits exceeded, please try again later.' }), {
          status: 429,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      if (upstream.status === 402) {
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

    // Stream the LLM response back to the client as Server-Sent Events.
    // Once the stream completes we own persistence: we INSERT the assistant
    // message and the ai_usage row. The frontend used to do the message INSERT
    // (Dashboard.tsx:431); with streaming that responsibility moves here so the
    // record is preserved even if the client disconnects mid-stream.
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        const sendEvent = (data: object) => {
          try {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
          } catch (e) {
            console.error('Failed to enqueue SSE event:', e);
          }
        };

        let fullContent = '';
        let usage: { prompt_tokens?: number; completion_tokens?: number } | null = null;
        let firstTokenSent = false;
        let assistantMessageId: string | null = null;

        try {
          const reader = upstream.body!.getReader();
          const decoder = new TextDecoder();
          let buffer = '';

          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop() ?? '';

            for (const line of lines) {
              const trimmed = line.trim();
              if (!trimmed.startsWith('data:')) continue;
              const dataStr = trimmed.slice(5).trim();
              if (!dataStr || dataStr === '[DONE]') continue;

              try {
                const json = JSON.parse(dataStr);
                const delta = json.choices?.[0]?.delta?.content;
                if (delta) {
                  if (!firstTokenSent) {
                    perf.t_llm_first_token = Date.now();
                    firstTokenSent = true;
                  }
                  fullContent += delta;
                  sendEvent({ delta });
                }
                if (json.usage) usage = json.usage;
              } catch (parseErr) {
                console.error('SSE chunk parse error:', parseErr, 'chunk:', trimmed.slice(0, 200));
              }
            }
          }

          perf.t_llm_done = Date.now();

          // Persist assistant message — backend now owns this.
          if (fullContent.length > 0) {
            const { data: insertedMsg, error: insertErr } = await supabase
              .from('messages')
              .insert({
                conversation_id: conversationId,
                role: 'assistant',
                content: fullContent,
              })
              .select('id')
              .single();

            if (insertErr) {
              console.error('Failed to persist assistant message:', insertErr);
            } else {
              assistantMessageId = insertedMsg.id;
            }
          } else {
            console.error('Empty AI response — not persisting');
          }

          // Record AI usage. Reuses authenticatedUserId from outer scope (no
          // duplicate auth.getUser — task 1.8).
          if (usage) {
            const tokensInput = usage.prompt_tokens || 0;
            const tokensOutput = usage.completion_tokens || 0;
            perf.tokens_input = tokensInput;
            perf.tokens_output = tokensOutput;

            const costPer1kInputTokens = 0.00015;
            const costPer1kOutputTokens = 0.0006;
            const totalCost = (tokensInput / 1000) * costPer1kInputTokens
                            + (tokensOutput / 1000) * costPer1kOutputTokens;

            try {
              await supabase.from('ai_usage').insert({
                user_id: authenticatedUserId,
                conversation_id: conversationId,
                model: model,
                tokens_input: tokensInput,
                tokens_output: tokensOutput,
                cost: totalCost,
              });
            } catch (usageErr) {
              console.error('Error recording AI usage:', usageErr);
            }
          }

          // Final event — signals completion and gives the client the persisted
          // messageId so it can replace the streaming bubble with the saved row.
          sendEvent({
            done: true,
            messageId: assistantMessageId,
            usage,
          });

          perf.t_response_sent = Date.now();
          perf.status_code = 200;
          flushPerfMetrics(perf);
        } catch (streamErr) {
          console.error('Stream processing error:', streamErr);
          perf.t_response_sent = Date.now();
          perf.status_code = 500;
          perf.error = streamErr instanceof Error ? streamErr.message : 'stream error';
          flushPerfMetrics(perf);
          sendEvent({
            error: streamErr instanceof Error ? streamErr.message : 'Unknown stream error',
          });
        } finally {
          try { controller.close(); } catch { /* already closed */ }
        }
      },
      cancel() {
        // Client disconnected before stream completed.
        console.log('Stream cancelled by client');
        try { upstream.body?.cancel(); } catch { /* ignore */ }
      },
    });

    return new Response(stream, {
      status: 200,
      headers: {
        ...corsHeaders,
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        // Disable any intermediate buffering (e.g. nginx) so chunks reach the
        // client as soon as we enqueue them.
        'X-Accel-Buffering': 'no',
      },
    });

  } catch (error) {
    console.error('Error in chat-ai function:', error);
    perf.t_response_sent = Date.now();
    perf.status_code = 500;
    perf.error = error instanceof Error ? error.message : 'Unknown error';
    flushPerfMetrics(perf);
    return new Response(JSON.stringify({
      error: error instanceof Error ? error.message : 'Unknown error'
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

// =============================================================================
// PERF METRICS FLUSH (Phase 0 instrumentation)
// =============================================================================

interface PerfPayload {
  t_request_start: number;
  t_auth_done: number;
  t_rag_start: number;
  t_rag_done: number;
  t_llm_start: number;
  t_llm_first_token: number;
  t_llm_done: number;
  t_response_sent: number;
  rag_chunk_count: number;
  attachment_count: number;
  tokens_input: number;
  tokens_output: number;
  model: string;
  model_type: string;
  knowledge_type: string;
  conversation_id: string | null;
  user_id: string | null;
  status_code: number;
  error: string | null;
}

// Fire-and-forget. Logs a structured summary line and persists to chat_perf_metrics.
// Never throws — failure to log perf must not affect user response.
function flushPerfMetrics(p: PerfPayload): void {
  const total = p.t_response_sent ? p.t_response_sent - p.t_request_start : 0;
  const auth = p.t_auth_done ? p.t_auth_done - p.t_request_start : 0;
  const rag = p.t_rag_start && p.t_rag_done ? p.t_rag_done - p.t_rag_start : 0;
  const llm = p.t_llm_start && p.t_llm_done ? p.t_llm_done - p.t_llm_start : 0;
  const ttft = p.t_llm_start && p.t_llm_first_token ? p.t_llm_first_token - p.t_llm_start : 0;
  const responsePhase = p.t_llm_done && p.t_response_sent ? p.t_response_sent - p.t_llm_done : 0;

  console.log(JSON.stringify({
    perf: 'chat-ai',
    total_ms: total,
    auth_ms: auth,
    rag_ms: rag,
    llm_ms: llm,
    ttft_ms: ttft,
    response_ms: responsePhase,
    rag_chunks: p.rag_chunk_count,
    attachments: p.attachment_count,
    tokens_in: p.tokens_input,
    tokens_out: p.tokens_output,
    model_type: p.model_type,
    status: p.status_code,
    error: p.error,
  }));

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!supabaseUrl || !supabaseServiceKey) return;
    const client = createClient(supabaseUrl, supabaseServiceKey);
    // Don't await — fire and forget
    client.from('chat_perf_metrics').insert({
      conversation_id: p.conversation_id,
      user_id: p.user_id,
      model: p.model || null,
      model_type: p.model_type || null,
      knowledge_type: p.knowledge_type || null,
      t_request_start: new Date(p.t_request_start).toISOString(),
      duration_total_ms: total || null,
      duration_auth_ms: auth || null,
      duration_rag_ms: rag || null,
      duration_llm_ms: llm || null,
      duration_ttft_ms: ttft || null,
      duration_response_ms: responsePhase || null,
      rag_chunk_count: p.rag_chunk_count,
      attachment_count: p.attachment_count,
      tokens_input: p.tokens_input,
      tokens_output: p.tokens_output,
      status_code: p.status_code || null,
      error: p.error,
    }).then(({ error }) => {
      if (error) console.error('perf insert error:', error.message);
    });
  } catch (e) {
    console.error('perf flush exception:', e);
  }
}
