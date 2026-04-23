import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.75.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

// =============================================================================
// PLANOS PERMITIDOS
// =============================================================================

const ALLOWED_PLANS = new Set(['medical', 'medico', 'specialist', 'especialista']);

async function userHasMedicalAccess(supabase: any, userId: string): Promise<boolean> {
  const { data, error } = await supabase
    .from('user_plans')
    .select('plan_type, status')
    .eq('user_id', userId);

  if (error || !data) return false;

  return data.some((p: any) =>
    p.status === 'active' && ALLOWED_PLANS.has(String(p.plan_type).toLowerCase())
  );
}

// =============================================================================
// ALIASES E EXPANSÃO SEMÂNTICA (mesma lógica do chat-ai medical)
// =============================================================================

const TERM_ALIASES: Record<string, string[]> = {
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
  "epilepsia": ["epilepsia", "epilepsy", "convulsões", "seizures", "crises epilépticas", "epileptic seizures"],
  "dor": ["dor", "pain", "dor crônica", "chronic pain", "analgesia", "nociceptivo"],
  "ansiedade": ["ansiedade", "anxiety", "transtorno ansioso", "anxiety disorder"],
  "insônia": ["insônia", "insomnia", "distúrbio do sono", "sleep disorder"],
  "câncer": ["câncer", "cancer", "oncologia", "oncology", "tumor", "neoplasia"],
  "esclerose": ["esclerose múltipla", "multiple sclerosis", "em", "ms"],
  "parkinson": ["parkinson", "parkinsons", "doença de parkinson"],
  "alzheimer": ["alzheimer", "alzheimers", "doença de alzheimer"],
  "fibromialgia": ["fibromialgia", "fibromyalgia"],
  "artrite": ["artrite", "arthritis", "artrite reumatoide", "rheumatoid arthritis"],
};

function normalizeText(text: string): string {
  return text.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
}

function expandTermWithAliases(term: string): string[] {
  const normalized = normalizeText(term);
  const terms = new Set<string>([normalized, term.toLowerCase()]);
  for (const [key, aliases] of Object.entries(TERM_ALIASES)) {
    const normalizedKey = normalizeText(key);
    if (normalized === normalizedKey || aliases.some(a => normalizeText(a) === normalized)) {
      aliases.forEach(a => terms.add(normalizeText(a)));
      terms.add(normalizedKey);
    }
  }
  return Array.from(terms);
}

function extractKeyTerms(message: string): string[] {
  const stopwords = new Set([
    'a','o','e','é','de','da','do','em','um','uma','os','as','para','com','por','que','se','na','no','ao','à','dos','das',
    'sobre','como','qual','quais','pode','podem','tem','têm','ter','me','meu','minha','você','voce','eu','isso','isto','esse','essa',
    'paciente','queixa','principal','sintoma','sintomas','prontuário','prontuario','observação','observacoes',
    'the','is','are','was','were','be','been','being','have','has','had','do','does','did','will','would','could','should',
    'and','or','but','to','of','in','for','on','with','at','by','from','about'
  ]);
  const words = message.toLowerCase()
    .replace(/[^\w\sáàâãéèêíìîóòôõúùûüçñ-]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 2 && !stopwords.has(w));
  const acronyms = message.match(/\b[A-Z]{2,5}\b/g) || [];
  return [...new Set([...words, ...acronyms.map(a => a.toLowerCase())])];
}

function generateSearchQueries(message: string): string[] {
  const keyTerms = extractKeyTerms(message);
  const queries = new Set<string>();
  queries.add(normalizeText(message));
  for (const term of keyTerms) {
    const expanded = expandTermWithAliases(term);
    expanded.forEach(t => queries.add(t));
    const intents = ['efeitos','mecanismo','evidência','farmacologia','segurança','tratamento','dosagem','interação','contraindicação','posologia'];
    for (const intent of intents) {
      if (message.toLowerCase().includes(intent) || expanded.length > 1) {
        queries.add(`${term} ${intent}`);
      }
    }
  }
  return Array.from(queries).slice(0, 15);
}

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
    /\[INST\]/gi, /\[\/INST\]/gi,
    /<\|im_start\|>/gi, /<\|im_end\|>/gi,
  ];
  let sanitized = content;
  dangerousPatterns.forEach(p => { sanitized = sanitized.replace(p, '[REDACTED]'); });
  // CORREÇÃO 2: limite por chunk subiu de 6k para 8k
  const maxLength = 8000;
  if (sanitized.length > maxLength) sanitized = sanitized.substring(0, maxLength) + '... [conteúdo truncado]';
  return sanitized;
}

// =============================================================================
// EXTRAÇÃO DE CONTEÚDO DOS ARQUIVOS (Gemini multimodal)
// =============================================================================

// Conversão Uint8Array -> base64 em CHUNKS pequenos.
// IMPORTANTE: usar loop simples (não String.fromCharCode.apply) — apply com arrays
// grandes pode estourar o stack do V8. Chunks pequenos + concat controlado.
function uint8ToBase64(buf: Uint8Array): string {
  const CHUNK = 0x2000; // 8KB por chunk (seguro pro stack do apply)
  const parts: string[] = [];
  for (let i = 0; i < buf.length; i += CHUNK) {
    const slice = buf.subarray(i, Math.min(i + CHUNK, buf.length));
    let binary = '';
    for (let j = 0; j < slice.length; j++) binary += String.fromCharCode(slice[j]);
    parts.push(btoa(binary));
    // Codifica chunk-a-chunk e descarta string intermediária (já em parts como base64).
  }
  // Concatena strings base64 já comprimidas; pico de memória bem menor que
  // construir uma string binary monolítica antes do btoa.
  return parts.join('');
}

async function downloadFileAsBase64(
  supabase: any,
  bucket: string,
  path: string,
): Promise<{ base64: string; mimeType: string; sizeBytes: number } | null> {
  const { data, error } = await supabase.storage.from(bucket).download(path);
  if (error || !data) {
    console.error('Failed to download file:', path, error);
    return null;
  }
  const ab = await data.arrayBuffer();
  const buf = new Uint8Array(ab);
  const mimeType = data.type || 'application/octet-stream';
  const sizeBytes = buf.length;
  const base64 = uint8ToBase64(buf);
  // buf sai de escopo após retornar; ab também. base64 fica como única cópia viva.
  return { base64, mimeType, sizeBytes };
}

function isTextual(mime: string): boolean {
  return mime.startsWith('text/') || mime.includes('plain');
}

async function extractWithGemini(
  base64: string,
  mimeType: string,
  extractionPrompt: string,
): Promise<{ raw: string; metadata: any }> {
  const resp = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${LOVABLE_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'google/gemini-2.5-flash',
      messages: [{
        role: 'user',
        content: [
          { type: 'text', text: extractionPrompt },
          { type: 'image_url', image_url: { url: `data:${mimeType};base64,${base64}` } },
        ],
      }],
    }),
  });

  if (!resp.ok) {
    const t = await resp.text();
    console.error('Gemini extraction error', resp.status, t);
    return { raw: '', metadata: {} };
  }

  const data = await resp.json();
  const raw = data.choices?.[0]?.message?.content || '';

  let metadata: any = {};
  try {
    const jsonMatch = raw.match(/```json\s*([\s\S]*?)\s*```/) || raw.match(/\{[\s\S]*\}/);
    if (jsonMatch) metadata = JSON.parse(jsonMatch[1] || jsonMatch[0]);
  } catch (e) {
    console.warn('Could not parse JSON from extraction', e);
  }

  return { raw, metadata };
}

const CATALOG_EXTRACTION_PROMPT = `Você é um assistente de extração estruturada de dados.
Analise este CATÁLOGO DE PRODUTOS DE CANNABIS MEDICINAL e extraia as informações em JSON.

Retorne APENAS um bloco \`\`\`json com a seguinte estrutura:
{
  "catalog_name": "string|null",
  "products": [
    {
      "name": "string",
      "brand": "string|null",
      "category": "string|null",
      "presentation": "string|null",
      "concentration": "string|null",
      "cannabinoid_profile": "string|null",
      "indications": "string|null",
      "notes": "string|null"
    }
  ],
  "raw_summary": "resumo curto em 1-2 frases"
}

Não invente produtos. Se um campo não existir, use null. Liste TODOS os produtos visíveis.`;

const RECORD_EXTRACTION_PROMPT = `Você é um assistente de extração estruturada de prontuários médicos.
Analise este PRONTUÁRIO e extraia as informações em JSON.

Retorne APENAS um bloco \`\`\`json com:
{
  "patient_name": "string|null",
  "age": "string|null",
  "sex": "string|null",
  "main_complaint": "string",
  "symptoms": ["string"],
  "diagnoses": ["string"],
  "current_medications": ["string"],
  "previous_treatments": ["string"],
  "relevant_history": "string|null",
  "allergies": ["string"],
  "comorbidities": ["string"],
  "clinical_notes": "string|null",
  "raw_summary": "resumo clínico em 2-3 frases"
}

Não invente dados. Se algo não estiver no documento, use null ou array vazio.`;

async function ensureExtraction(
  supabase: any,
  table: 'prescription_catalogs' | 'prescription_records',
  row: any,
  preloadedFile: { base64: string; mimeType: string } | null,
): Promise<any> {
  // CORREÇÃO 3: cache só é reutilizado se a extração anterior for de qualidade.
  // Catálogo precisa ter pelo menos 1 produto extraído. Prontuário precisa ter queixa OU sintomas.
  const meta = row.extracted_metadata || {};
  const isCatalog = table === 'prescription_catalogs';
  const cacheValid = isCatalog
    ? Array.isArray(meta.products) && meta.products.length > 0 && (row.extracted_content?.length || 0) > 200
    : (!!meta.main_complaint || (Array.isArray(meta.symptoms) && meta.symptoms.length > 0)) && (row.extracted_content?.length || 0) > 200;

  if (cacheValid) {
    return row;
  }

  // CORREÇÃO MEMÓRIA: reutiliza arquivo já baixado em vez de baixar de novo.
  const file = preloadedFile;
  if (!file) return row;

  let raw = '';
  let metadata: any = {};

  const prompt = isCatalog ? CATALOG_EXTRACTION_PROMPT : RECORD_EXTRACTION_PROMPT;

  if (isTextual(file.mimeType)) {
    try {
      const decoded = atob(file.base64);
      raw = decoded;
      const structured = await extractWithGemini(file.base64, file.mimeType, prompt + '\n\nConteúdo:\n' + decoded.slice(0, 12000));
      metadata = structured.metadata;
    } catch (e) {
      console.error('Text decode error', e);
    }
  } else {
    const result = await extractWithGemini(file.base64, file.mimeType, prompt);
    raw = result.raw;
    metadata = result.metadata;
  }

  const updates: any = {
    // CORREÇÃO 2: extracted_content sobe de 50k para 80k
    extracted_content: raw.slice(0, 80000),
    extracted_metadata: metadata,
  };

  if (!isCatalog) {
    updates.patient_name = metadata?.patient_name || row.patient_name || null;
    updates.main_complaint = metadata?.main_complaint || row.main_complaint || null;
  }

  await supabase.from(table).update(updates).eq('id', row.id);

  return { ...row, ...updates };
}

// =============================================================================
// RAG MÉDICO (mesma lógica/qualidade do chat-ai)
// =============================================================================

interface ChunkResult {
  id: string;
  content: string;
  document_title: string;
  chunk_order: number;
  relevance_score: number;
}

// CORREÇÃO 1: sanitiza termos de busca para o PostgREST .or(content.ilike...)
// A vírgula é separador de condições; pontuação quebra o "logic tree" do parser.
// Mantemos apenas letras/números, descartamos termos vazios ou muito curtos, e deduplicamos.
function sanitizeSearchTerm(t: string): string {
  return t
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')      // remove acentos
    .replace(/[^a-zA-Z0-9]/g, '')          // remove pontuação, vírgulas, espaços, etc.
    .toLowerCase()
    .trim();
}

async function searchMedicalKnowledgeBase(
  supabase: any,
  message: string,
): Promise<ChunkResult[]> {
  const searchQueries = generateSearchQueries(message);
  console.log(`Generated ${searchQueries.length} search queries:`, searchQueries.slice(0, 5));

  const allResults: Map<string, ChunkResult> = new Map();

  for (const query of searchQueries) {
    try {
      const queryTerms = Array.from(new Set(
        query.split(/\s+/).map(sanitizeSearchTerm).filter(t => t.length > 2)
      ));
      if (queryTerms.length === 0) continue;

      const orConditions = queryTerms.map(t => `content.ilike.%${t}%`).join(',');

      const { data: chunks, error } = await supabase
        .from('document_chunks')
        .select(`
          id,
          content,
          chunk_order,
          knowledge_documents!inner(id, title, knowledge_type)
        `)
        .eq('knowledge_documents.knowledge_type', 'medical')
        .or(orConditions)
        .limit(5);

      if (error) {
        console.error(`Search error for query "${query}":`, error);
        continue;
      }

      if (chunks && chunks.length > 0) {
        for (const chunk of chunks) {
          const chunkId = chunk.id;
          let score = 0;
          const contentLower = chunk.content.toLowerCase();

          for (const term of queryTerms) {
            const termLower = term.toLowerCase();
            const matches = (contentLower.match(new RegExp(termLower.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) || []).length;
            score += matches;
            const expandedTerms = expandTermWithAliases(term);
            for (const expTerm of expandedTerms) {
              if (expTerm !== termLower && contentLower.includes(expTerm)) score += 0.5;
            }
          }

          const existing = allResults.get(chunkId);
          if (!existing || existing.relevance_score < score) {
            allResults.set(chunkId, {
              id: chunkId,
              content: chunk.content,
              document_title: chunk.knowledge_documents?.title || 'Documento',
              chunk_order: chunk.chunk_order,
              relevance_score: score,
            });
          }
        }
      }
    } catch (err) {
      console.error(`Error in search query "${query}":`, err);
    }
  }

  const results = Array.from(allResults.values())
    .sort((a, b) => b.relevance_score - a.relevance_score)
    .slice(0, 8);

  console.log(`RAG search found ${allResults.size} unique chunks, returning top ${results.length}`);
  return results;
}

// =============================================================================
// PROMPT BASE — REUTILIZA O NÚCLEO DO MODELO MÉDICO
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

3. **FORMA DA RESPOSTA**:
   - Use linguagem NATURAL, humana e confiante.
   - NUNCA use termos técnicos como: RAG, chunk, retrieval, base vetorial, embedding, top-k.
   - A resposta deve ser técnica na base, mas acessível na forma.

4. **CITAÇÃO DE FONTES**:
   - Quando usar informações da base, cite a fonte de forma natural (ex: "De acordo com um estudo publicado no Journal of Pain Research...").
   - **PROIBIDO**: NUNCA exiba identificadores de fonte como "(Fonte 1)", "(Fonte 2)" ou qualquer variação. Esses labels são INTERNOS e jamais devem aparecer no texto final.
   - Use as fontes internamente para fundamentar sua resposta, mas NUNCA revele os identificadores ao usuário.

5. **LIMITAÇÕES**:
   - Se a evidência na base for limitada, comunique naturalmente.
   - NÃO invente estudos, dados ou conclusões.
`;

const MEDICAL_SYSTEM_PROMPT = `Você é 'NuraAI', um assistente de IA especializado em cannabis medicinal, projetado exclusivamente para médicos e pesquisadores. Sua base de conhecimento é fundamentada em estudos científicos, ensaios clínicos e publicações médicas revisadas por pares.

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
Nunca ofereça aconselhamento direto a pacientes. Deixe claro que suas informações são apenas para fins de educação e suporte à decisão profissional.`;

// Camada extra de instruções específicas do receituário (não substitui o cérebro médico)
const PRESCRIPTION_TASK_LAYER = `
## MODO DE OPERAÇÃO ATUAL: SUGESTÃO DE RECEITUÁRIO

Você está atuando como apoio à decisão clínica para gerar uma SUGESTÃO DE RECEITUÁRIO. Mantenha 100% do seu rigor clínico e científico habitual — esta tarefa NÃO simplifica seu raciocínio.

### ORDEM DE RACIOCÍNIO (interna, flexível):

1. **Análise clínica completa do prontuário** — leia o documento original (anexado abaixo como arquivo) com atenção: queixa, sintomas, histórico, comorbidades, medicações em uso, alergias. Identifique mecanismos fisiopatológicos e objetivos terapêuticos sem se prender ao catálogo.
2. **Embasamento científico via base de conhecimento recuperada** — use a evidência para definir quais perfis canabinoides (CBD, THC, CBG, CBN, full/broad-spectrum), proporções, vias e posologias têm respaldo para o quadro.
3. **Cruzamento com o catálogo enviado** — só agora filtre os produtos do catálogo (anexado como arquivo) que melhor atendem ao perfil terapêutico definido. Se o catálogo for limitado, deixe claro o que falta.
4. **Composição da receita** — articule produtos, posologias e justificativa.

### REGRAS

- **Recomende SOMENTE produtos presentes no catálogo enviado.** Se nenhum produto do catálogo atender bem a um objetivo, declare a lacuna em vez de inventar.
- **Combinações são bem-vindas quando clinicamente plausíveis** (ex: óleo basal CBD-rico + ajuste THC noturno; oral + tópico). Quando o quadro pedir um único produto, recomende um único — não force múltiplos por obrigação.
- **NUNCA exiba identificadores como "(Fonte 1)", "(Fonte 2)"** — incorpore evidência de forma natural.
- **NÃO simplifique** o raciocínio para caber no formato. Profundidade clínica é prioridade sobre estrutura.
- **NÃO alucine.** Se algo não puder ser inferido com segurança, deixe explícito.

### FORMATO DE SAÍDA SUGERIDO (Markdown — adapte conforme o caso)

A estrutura abaixo é uma referência. Use as seções que fizerem sentido clínico para o caso; pode mesclar, omitir ou reordenar quando isso melhorar a precisão.

- **Resumo do caso** — síntese clínica curta.
- **Análise clínica e objetivos terapêuticos** — discussão técnica do quadro à luz da evidência.
- **Produtos sugeridos** — para cada produto: nome (exatamente como no catálogo), apresentação/concentração, posologia (dose inicial, titulação, frequência, via, horário), justificativa clínica e papel no plano.
- **Observações de uso e monitoramento** — sinais de alerta, marcadores de reavaliação, tempo até resposta esperada.
- **Considerações finais** — limitações da análise, contraindicações, interações com medicações em uso.
- **Aviso** — esta é uma sugestão de apoio à decisão; a prescrição final cabe ao médico responsável.
`;

// =============================================================================
// MONTAGEM DA MENSAGEM DE USUÁRIO (contexto da consulta)
// CORREÇÃO 4: reduz duplicação. Quando o ARQUIVO ORIGINAL é anexado como multimodal
// (PDF/imagem), o texto extraído entra apenas como auxílio resumido. Quando o
// arquivo NÃO pode ser anexado (DOC binário sem multimodal etc.), enviamos o texto
// extraído integral como fonte primária.
// =============================================================================

function buildUserMessage(opts: {
  catalogContent: string;
  catalogMetadata: any;
  recordContent: string;
  recordMetadata: any;
  observations: string;
  ragChunks: ChunkResult[];
  recordHasOriginal: boolean;
  catalogHasOriginal: boolean;
}): string {
  const {
    catalogContent, catalogMetadata, recordContent, recordMetadata,
    observations, ragChunks, recordHasOriginal, catalogHasOriginal,
  } = opts;

  const ragSection = ragChunks.length > 0
    ? ragChunks.map((c, i) =>
        `<fonte_interna id="${i + 1}" titulo="${c.document_title.replace(/"/g, '&quot;')}">\n${sanitizeRAGContent(c.content)}\n</fonte_interna>`
      ).join('\n\n')
    : '(Nenhum trecho da base científica recuperado para esta consulta.)';

  // Se o arquivo original foi anexado, o texto extraído é apenas APOIO (resumido).
  // Se NÃO foi anexado (formato não-multimodal), o texto extraído é a FONTE PRIMÁRIA.
  const recordTextLimit = recordHasOriginal ? 8000 : 30000;
  const catalogTextLimit = catalogHasOriginal ? 12000 : 40000;

  const recordBlock = recordHasOriginal
    ? `**Estrutura auxiliar do prontuário (resumo extraído — confirme no arquivo anexo):**
${recordMetadata && Object.keys(recordMetadata).length > 0 ? '```json\n' + JSON.stringify(recordMetadata, null, 2) + '\n```' : '(sem extração estruturada)'}
${recordContent ? '\n_Trecho do texto extraído (apoio):_\n' + recordContent.slice(0, recordTextLimit) : ''}`
    : `**Conteúdo do prontuário (texto extraído — fonte primária pois o arquivo não pôde ser anexado em formato nativo):**
${recordContent.slice(0, recordTextLimit) || '(conteúdo não extraído)'}
${recordMetadata && Object.keys(recordMetadata).length > 0 ? '\n**Estrutura auxiliar:**\n```json\n' + JSON.stringify(recordMetadata, null, 2) + '\n```' : ''}`;

  const catalogBlock = catalogHasOriginal
    ? `**Estrutura auxiliar do catálogo (lista extraída — confirme no arquivo anexo):**
${catalogMetadata && Object.keys(catalogMetadata).length > 0 ? '```json\n' + JSON.stringify(catalogMetadata, null, 2) + '\n```' : '(sem extração estruturada)'}
${catalogContent ? '\n_Trecho do texto extraído (apoio):_\n' + catalogContent.slice(0, catalogTextLimit) : ''}`
    : `**Conteúdo do catálogo (texto extraído — fonte primária pois o arquivo não pôde ser anexado em formato nativo):**
${catalogContent.slice(0, catalogTextLimit) || '(conteúdo não extraído)'}
${catalogMetadata && Object.keys(catalogMetadata).length > 0 ? '\n**Estrutura auxiliar:**\n```json\n' + JSON.stringify(catalogMetadata, null, 2) + '\n```' : ''}`;

  return `# CONSULTA DE RECEITUÁRIO

## PRONTUÁRIO DO PACIENTE
${recordBlock}

---

## OBSERVAÇÕES COMPLEMENTARES DO MÉDICO
${observations?.trim() || '(Nenhuma observação adicional fornecida.)'}

---

## BASE CIENTÍFICA RECUPERADA (consultar para embasar — NÃO citar identificadores)
${ragSection}

---

## CATÁLOGO DE PRODUTOS DISPONÍVEIS (universo permitido para a receita final)
${catalogBlock}

---

Execute o raciocínio clínico (prontuário → evidência → catálogo → receita) e produza a sugestão de receituário. Combinações múltiplas são bem-vindas quando clinicamente plausíveis; um único produto também é aceitável quando o quadro pedir.`;
}

// =============================================================================
// HANDLER
// =============================================================================

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Não autenticado' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const authClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userError } = await authClient.auth.getUser();
    if (userError || !userData?.user) {
      return new Response(JSON.stringify({ error: 'Não autenticado' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const userId = userData.user.id;

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const hasAccess = await userHasMedicalAccess(supabase, userId);
    if (!hasAccess) {
      return new Response(JSON.stringify({
        error: 'plano_invalido',
        message: 'O Receituário+ está disponível apenas para o plano Médico.',
      }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const body = await req.json();
    const { catalogId, recordId, observations } = body || {};

    if (!catalogId || !recordId) {
      return new Response(JSON.stringify({ error: 'catalogId e recordId são obrigatórios' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (typeof observations === 'string' && observations.length > 1000) {
      return new Response(JSON.stringify({ error: 'observations excede 1000 caracteres' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const [{ data: catalogRow }, { data: recordRow }] = await Promise.all([
      supabase.from('prescription_catalogs').select('*').eq('id', catalogId).eq('user_id', userId).maybeSingle(),
      supabase.from('prescription_records').select('*').eq('id', recordId).eq('user_id', userId).maybeSingle(),
    ]);

    if (!catalogRow || !recordRow) {
      return new Response(JSON.stringify({ error: 'Arquivos não encontrados' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log('Baixando arquivos uma única vez...');
    // CORREÇÃO MEMÓRIA: download único por arquivo. Antes baixávamos até 2x cada
    // (uma vez em ensureExtraction e outra para anexar como multimodal).
    const [recordFile, catalogFile] = await Promise.all([
      downloadFileAsBase64(supabase, 'prescription-files', recordRow.file_path),
      downloadFileAsBase64(supabase, 'prescription-files', catalogRow.file_path),
    ]);

    console.log('Extraindo conteúdo dos arquivos (reutilizando download)...');
    const [catalogFull, recordFull] = await Promise.all([
      ensureExtraction(supabase, 'prescription_catalogs', catalogRow, catalogFile),
      ensureExtraction(supabase, 'prescription_records', recordRow, recordFile),
    ]);

    // Constrói query RAG a partir do prontuário + observações.
    // CORREÇÃO 1: passamos a query bruta (em texto livre) — a sanitização agora
    // é feita por termo dentro de searchMedicalKnowledgeBase (sem vírgulas/pontuação).
    const recordMeta = recordFull.extracted_metadata || {};
    const ragQueryParts = [
      recordFull.main_complaint || recordMeta.main_complaint || '',
      Array.isArray(recordMeta.symptoms) ? recordMeta.symptoms.join(' ') : '',
      Array.isArray(recordMeta.diagnoses) ? recordMeta.diagnoses.join(' ') : '',
      Array.isArray(recordMeta.comorbidities) ? recordMeta.comorbidities.join(' ') : '',
      recordMeta.relevant_history || '',
      observations || '',
    ].filter(Boolean);
    const ragQuery = ragQueryParts.join(' ').trim();

    console.log('RAG query:', ragQuery.slice(0, 200));
    const ragChunks = ragQuery ? await searchMedicalKnowledgeBase(supabase, ragQuery) : [];
    console.log(`RAG retornou ${ragChunks.length} chunks`);

    // CORREÇÃO 2: tratamento de anexos alinhado ao chat-ai.
    //  - PDF/imagem  → multimodal nativo
    //  - DOC/DOCX/RTF/ODT → multimodal binário (mesmo padrão do chat)
    //  - TXT/MD/CSV/JSON/XML → leitura direta como texto, embutida no prompt
    const isMultimodalMime = (mt: string) =>
      mt === 'application/pdf' ||
      mt.startsWith('image/') ||
      mt === 'application/msword' ||
      mt === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
      mt === 'application/rtf' ||
      mt === 'application/vnd.oasis.opendocument.text';

    const isPlainTextMime = (mt: string) =>
      mt.startsWith('text/') ||
      mt === 'application/json' ||
      mt === 'application/xml' ||
      mt === 'application/csv';

    const recordHasOriginal = !!recordFile && isMultimodalMime(recordFile.mimeType);
    const catalogHasOriginal = !!catalogFile && isMultimodalMime(catalogFile.mimeType);

    const decodeTextFile = (file: { base64: string; mimeType: string } | null): string | null => {
      if (!file) return null;
      if (!isPlainTextMime(file.mimeType)) return null;
      try { return atob(file.base64); } catch { return null; }
    };
    const recordPlainText = decodeTextFile(recordFile);
    const catalogPlainText = decodeTextFile(catalogFile);

    const userMessageText = buildUserMessage({
      catalogContent: catalogPlainText
        ? catalogPlainText.slice(0, 80000)
        : (catalogFull.extracted_content || ''),
      catalogMetadata: catalogFull.extracted_metadata || {},
      recordContent: recordPlainText
        ? recordPlainText.slice(0, 80000)
        : (recordFull.extracted_content || ''),
      recordMetadata: recordFull.extracted_metadata || {},
      observations: observations || '',
      ragChunks,
      recordHasOriginal,
      catalogHasOriginal,
    });

    const userContent: any[] = [{ type: 'text', text: userMessageText }];

    const attachIfMultimodal = (file: { base64: string; mimeType: string } | null, label: string) => {
      if (!file) return false;
      const mt = file.mimeType;
      if (isMultimodalMime(mt)) {
        userContent.push({
          type: 'image_url',
          image_url: { url: `data:${mt};base64,${file.base64}` },
        });
        console.log(`Anexado ${label} multimodal (${mt})`);
        return true;
      }
      if (isPlainTextMime(mt)) {
        console.log(`${label} é texto puro (${mt}) — embutido no prompt como fonte primária`);
      } else {
        console.log(`${label} formato não suportado (${mt}) — confiando no texto extraído`);
      }
      return false;
    };

    const recordAttached = attachIfMultimodal(recordFile, 'PRONTUÁRIO');
    const catalogAttached = attachIfMultimodal(catalogFile, 'CATÁLOGO');

    // CORREÇÃO 5: instrução de prioridade dos anexos vai para a camada de SISTEMA
    // (mesmo padrão do chat-ai). O prompt do usuário fica focado no caso clínico.
    const ATTACHMENT_PRIORITY_NOTE = `
## DOCUMENTOS DO USUÁRIO NESTA CONSULTA

O médico anexou ${recordAttached ? 'o PRONTUÁRIO original' : 'o conteúdo do prontuário em texto'} e ${catalogAttached ? 'o CATÁLOGO original' : 'o conteúdo do catálogo em texto'} para esta análise.
Esses documentos têm PRIORIDADE sobre qualquer texto auxiliar extraído. Sempre que houver divergência, o ARQUIVO ORIGINAL prevalece. Leia-os integralmente antes de produzir a sugestão.
`;

    const systemContent = MEDICAL_SYSTEM_PROMPT + '\n\n' + PRESCRIPTION_TASK_LAYER + '\n' + ATTACHMENT_PRIORITY_NOTE;

    // CORREÇÃO 6: logs de comparação objetiva chat vs receituário
    console.log(`\n=== PRESCRIPTION REQUEST SUMMARY ===`);
    console.log(`- RAG chunks: ${ragChunks.length}`);
    console.log(`- Record attached as multimodal: ${recordAttached} (mime=${recordFile?.mimeType || 'none'})`);
    console.log(`- Catalog attached as multimodal: ${catalogAttached} (mime=${catalogFile?.mimeType || 'none'})`);
    console.log(`- Record plain text inlined: ${!!recordPlainText}`);
    console.log(`- Catalog plain text inlined: ${!!catalogPlainText}`);
    console.log(`- System prompt length: ${systemContent.length} chars`);
    console.log(`- User text length: ${userMessageText.length} chars`);
    console.log(`- Total user content parts: ${userContent.length}`);

    // CORREÇÃO 3: parâmetros de inferência alinhados ao chat-ai
    // (max_tokens: 8000, sem temperature fixa — usa default do provedor).
    const aiResp = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-pro',
        messages: [
          { role: 'system', content: systemContent },
          { role: 'user', content: userContent },
        ],
        max_tokens: 8000,
      }),
    });

    if (!aiResp.ok) {
      if (aiResp.status === 429) {
        return new Response(JSON.stringify({ error: 'rate_limit', message: 'Limite de requisições atingido. Tente novamente em alguns instantes.' }), {
          status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      if (aiResp.status === 402) {
        return new Response(JSON.stringify({ error: 'sem_credito', message: 'Créditos de IA esgotados.' }), {
          status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      const t = await aiResp.text();
      console.error('AI error', aiResp.status, t);
      return new Response(JSON.stringify({ error: 'ia_falhou', message: 'Falha ao gerar receituário.' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const aiJson = await aiResp.json();
    const aiText: string = aiJson.choices?.[0]?.message?.content || '';
    const finishReason = aiJson.choices?.[0]?.finish_reason || 'unknown';
    const usage = aiJson.usage || {};
    console.log(`=== PRESCRIPTION RESPONSE ===`);
    console.log(`- finish_reason: ${finishReason}`);
    console.log(`- tokens_input: ${usage.prompt_tokens || 0}, tokens_output: ${usage.completion_tokens || 0}`);
    console.log(`- response length: ${aiText.length} chars`);

    if (!aiText) {
      return new Response(JSON.stringify({ error: 'ia_vazia', message: 'A IA não retornou conteúdo.' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: saved, error: saveError } = await supabase
      .from('prescription_results')
      .insert({
        user_id: userId,
        catalog_id: catalogId,
        record_id: recordId,
        user_observations: observations || null,
        ai_response: aiText,
        suggested_products: catalogFull.extracted_metadata?.products || [],
        patient_name: recordFull.patient_name || null,
        main_complaint: recordFull.main_complaint || null,
        model_used: 'google/gemini-2.5-pro',
      })
      .select()
      .single();

    if (saveError) console.error('Save result error', saveError);

    return new Response(JSON.stringify({
      id: saved?.id,
      response: aiText,
      patient_name: recordFull.patient_name,
      main_complaint: recordFull.main_complaint,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    console.error('generate-prescription fatal', e);
    return new Response(JSON.stringify({ error: 'erro_interno', message: e instanceof Error ? e.message : String(e) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
