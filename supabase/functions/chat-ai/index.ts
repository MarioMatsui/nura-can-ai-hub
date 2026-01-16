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
  
  return Array.from(queries).slice(0, 15); // Limita a 15 queries
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
  
  const allResults: Map<string, ChunkResult> = new Map();
  
  for (const kType of knowledgeTypes) {
    for (const query of searchQueries) {
      try {
        // Busca por texto usando ILIKE com múltiplos termos
        const queryTerms = query.split(' ').filter(t => t.length > 2);
        
        if (queryTerms.length === 0) continue;
        
        // Constrói busca com OR para cada termo
        let queryBuilder = supabase
          .from('document_chunks')
          .select(`
            id,
            content,
            chunk_order,
            knowledge_documents!inner(id, title, knowledge_type)
          `)
          .eq('knowledge_documents.knowledge_type', kType);
        
        // Busca por qualquer termo no conteúdo
        const orConditions = queryTerms.map(term => `content.ilike.%${term}%`).join(',');
        queryBuilder = queryBuilder.or(orConditions);
        
        const { data: chunks, error } = await queryBuilder.limit(5);
        
        if (error) {
          console.error(`Search error for query "${query}":`, error);
          continue;
        }
        
        if (chunks && chunks.length > 0) {
          for (const chunk of chunks) {
            const chunkId = chunk.id;
            
            // Calcula score de relevância baseado em quantos termos aparecem
            let score = 0;
            const contentLower = chunk.content.toLowerCase();
            
            for (const term of queryTerms) {
              const termLower = term.toLowerCase();
              // Conta ocorrências do termo
              const matches = (contentLower.match(new RegExp(termLower, 'g')) || []).length;
              score += matches;
              
              // Bonus para termos expandidos (aliases)
              const expandedTerms = expandTermWithAliases(term);
              for (const expTerm of expandedTerms) {
                if (expTerm !== termLower && contentLower.includes(expTerm)) {
                  score += 0.5;
                }
              }
            }
            
            // Atualiza ou adiciona resultado
            const existing = allResults.get(chunkId);
            if (!existing || existing.relevance_score < score) {
              allResults.set(chunkId, {
                id: chunkId,
                content: chunk.content,
                document_title: chunk.knowledge_documents?.title || 'Documento',
                chunk_order: chunk.chunk_order,
                relevance_score: score,
                knowledge_type: kType
              });
            }
          }
        }
      } catch (err) {
        console.error(`Error in search query "${query}":`, err);
      }
    }
  }
  
  // Ordena por relevância e retorna os melhores
  const results = Array.from(allResults.values())
    .sort((a, b) => b.relevance_score - a.relevance_score)
    .slice(0, 8); // Top 8 chunks mais relevantes
  
  console.log(`RAG search found ${allResults.size} unique chunks, returning top ${results.length}`);
  
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

6. **LIMITAÇÕES**:
   - Se a evidência na base for limitada, comunique naturalmente.
   - NÃO invente estudos, dados ou conclusões.
   - Prefira uma resposta curta e honesta a uma longa sem suporte adequado.
`;

const SYSTEM_PROMPTS = {
  generic: `Você é "NuraAI", um assistente de inteligência artificial de alta especialização, dedicado exclusivamente à cannabis medicinal. Sua expertise abrange as áreas médica, veterinária e jurídica, e você é projetado para atender médicos, pesquisadores, juristas e médicos-veterinários.

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

"Desculpe, mas minha atuação é restrita à cannabis medicinal e seus aspectos científicos, veterinários e legais. Não posso oferecer informações fora desse contexto."`,

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
// HANDLER PRINCIPAL
// =============================================================================

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
    
    if (knowledgeType) {
      try {
        console.log(`\n=== RAG SEARCH ===`);
        console.log(`Model type: ${modelType}, Knowledge type: ${knowledgeType}`);
        console.log(`User message: "${message.substring(0, 100)}..."`);
        
        const relevantChunks = await searchKnowledgeBase(supabase, message, knowledgeType);
        
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
    
    const model = 'google/gemini-2.5-pro';
    const systemPrompt = SYSTEM_PROMPTS[modelType as keyof typeof SYSTEM_PROMPTS] || SYSTEM_PROMPTS.generic;

    let attachmentContext = "";
    const messageContent: any[] = [{ type: "text", text: message }];

    if (attachments && attachments.length > 0) {
      console.log(`Processing ${attachments.length} user attachments`);
      
      for (const attachment of attachments) {
        if (attachment.file_type.startsWith('image/')) {
          console.log(`Adding image to vision: ${attachment.file_name}`);
          
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
              console.log(`Adding PDF for Gemini processing: ${attachment.file_name}`);
              
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
                
                attachmentContext += `\n\n📄 O USUÁRIO ENVIOU o documento "${attachment.file_name}" para análise AGORA.\n`;
              } else {
                console.error('Error getting signed URL for PDF');
                attachmentContext += `\n\n📄 Documento "${attachment.file_name}" anexado (erro no acesso)\n`;
              }
            } else {
              console.log(`Reading text file: ${attachment.file_name}`);
              
              const { data: fileData, error: downloadError } = await supabase.storage
                .from('chat-attachments')
                .download(attachment.file_path);
              
              if (!downloadError && fileData) {
                const text = await fileData.text();
                attachmentContext += `\n\n📄 O USUÁRIO ENVIOU o documento "${attachment.file_name}" com o seguinte conteúdo:\n${text}\n`;
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
        attachmentContext = "\n\n<!-- DOCUMENTOS ENVIADOS PELO USUÁRIO NESTA CONVERSA -->\n" + 
                          "<!-- PRIORIDADE: Estes documentos foram enviados AGORA pelo usuário e devem ter prioridade sobre a base de conhecimento -->\n" +
                          attachmentContext + 
                          "\n<!-- FIM DOS DOCUMENTOS DO USUÁRIO -->\n\n";
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

    // Call Lovable AI Gateway
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
