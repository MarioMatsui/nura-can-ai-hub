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
// EXTRAÇÃO DE CONTEÚDO DOS ARQUIVOS (Gemini multimodal)
// =============================================================================

async function downloadFileAsBase64(
  supabase: any,
  bucket: string,
  path: string,
): Promise<{ base64: string; mimeType: string } | null> {
  const { data, error } = await supabase.storage.from(bucket).download(path);
  if (error || !data) {
    console.error('Failed to download file:', path, error);
    return null;
  }
  const buf = new Uint8Array(await data.arrayBuffer());
  // base64 encode
  let binary = '';
  for (let i = 0; i < buf.length; i++) binary += String.fromCharCode(buf[i]);
  const base64 = btoa(binary);
  const mimeType = data.type || 'application/octet-stream';
  return { base64, mimeType };
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
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: extractionPrompt },
            {
              type: 'image_url',
              image_url: { url: `data:${mimeType};base64,${base64}` },
            },
          ],
        },
      ],
    }),
  });

  if (!resp.ok) {
    const t = await resp.text();
    console.error('Gemini extraction error', resp.status, t);
    return { raw: '', metadata: {} };
  }

  const data = await resp.json();
  const raw = data.choices?.[0]?.message?.content || '';

  // Tenta extrair JSON dentro da resposta
  let metadata: any = {};
  try {
    const jsonMatch = raw.match(/```json\s*([\s\S]*?)\s*```/) || raw.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      metadata = JSON.parse(jsonMatch[1] || jsonMatch[0]);
    }
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
  "main_complaint": "string",
  "symptoms": ["string"],
  "diagnoses": ["string"],
  "current_medications": ["string"],
  "relevant_history": "string|null",
  "allergies": ["string"],
  "clinical_notes": "string|null",
  "raw_summary": "resumo clínico em 2-3 frases"
}

Não invente dados. Se algo não estiver no documento, use null ou array vazio.`;

async function ensureExtraction(
  supabase: any,
  table: 'prescription_catalogs' | 'prescription_records',
  row: any,
): Promise<any> {
  if (row.extracted_content && row.extracted_metadata && Object.keys(row.extracted_metadata || {}).length > 0) {
    return row;
  }

  const file = await downloadFileAsBase64(supabase, 'prescription-files', row.file_path);
  if (!file) return row;

  let raw = '';
  let metadata: any = {};

  const isCatalog = table === 'prescription_catalogs';
  const prompt = isCatalog ? CATALOG_EXTRACTION_PROMPT : RECORD_EXTRACTION_PROMPT;

  if (isTextual(file.mimeType)) {
    // Decode plain text directly
    try {
      const decoded = atob(file.base64);
      raw = decoded;
      // Use Gemini to structure the text too
      const structured = await extractWithGemini(file.base64, file.mimeType, prompt + '\n\nConteúdo:\n' + decoded.slice(0, 8000));
      metadata = structured.metadata;
    } catch (e) {
      console.error('Text decode error', e);
    }
  } else {
    const result = await extractWithGemini(file.base64, file.mimeType, prompt);
    raw = result.raw;
    metadata = result.metadata;
  }

  // Persist
  const updates: any = {
    extracted_content: raw.slice(0, 50000),
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
// RAG MÉDICO (espelhando chat-ai)
// =============================================================================

const TERM_ALIASES: Record<string, string[]> = {
  cbc: ['canabicromeno', 'cannabichromene', 'cbc'],
  cbg: ['canabigerol', 'cannabigerol', 'cbg'],
  cbn: ['canabinol', 'cannabinol', 'cbn'],
  cbd: ['canabidiol', 'cannabidiol', 'cbd'],
  thc: ['tetrahidrocanabinol', 'tetrahydrocannabinol', 'thc'],
  thcv: ['tetrahidrocanabivarina', 'thcv'],
  cbdv: ['canabidivarina', 'cbdv'],
  epilepsia: ['epilepsia', 'epilepsy', 'convulsões', 'seizures'],
  dor: ['dor', 'pain', 'dor crônica', 'chronic pain'],
  ansiedade: ['ansiedade', 'anxiety'],
  insônia: ['insônia', 'insomnia', 'sleep'],
  câncer: ['câncer', 'cancer', 'oncologia'],
  fibromialgia: ['fibromialgia', 'fibromyalgia'],
};

function normalizeText(t: string) {
  return t.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
}

function expandTerm(t: string): string[] {
  const n = normalizeText(t);
  const terms = new Set<string>([n]);
  for (const [k, aliases] of Object.entries(TERM_ALIASES)) {
    if (n === normalizeText(k) || aliases.some(a => normalizeText(a) === n)) {
      aliases.forEach(a => terms.add(normalizeText(a)));
    }
  }
  return Array.from(terms);
}

function extractKeyTerms(message: string): string[] {
  const stop = new Set([
    'a','o','e','de','da','do','em','para','com','por','que','um','uma','os','as',
    'paciente','queixa','principal','sintoma','sintomas','dos','das','no','na','ao'
  ]);
  return [...new Set(
    message.toLowerCase()
      .replace(/[^\w\sáàâãéèêíìîóòôõúùûüçñ-]/g, ' ')
      .split(/\s+/)
      .filter(w => w.length > 2 && !stop.has(w))
  )];
}

async function searchMedicalKnowledgeBase(
  supabase: any,
  query: string,
): Promise<Array<{ content: string; document_title: string; score: number }>> {
  const keyTerms = extractKeyTerms(query);
  const expanded = new Set<string>();
  keyTerms.forEach(t => expandTerm(t).forEach(e => expanded.add(e)));

  const allTerms = Array.from(expanded).filter(t => t.length > 2).slice(0, 15);
  if (allTerms.length === 0) return [];

  const results = new Map<string, any>();

  // Single grouped OR query for efficiency
  const orConditions = allTerms.map(t => `content.ilike.%${t}%`).join(',');

  const { data: chunks, error } = await supabase
    .from('document_chunks')
    .select('id, content, knowledge_documents!inner(title, knowledge_type)')
    .eq('knowledge_documents.knowledge_type', 'medical')
    .or(orConditions)
    .limit(30);

  if (error) {
    console.error('RAG search error', error);
    return [];
  }

  for (const chunk of chunks || []) {
    let score = 0;
    const lower = chunk.content.toLowerCase();
    for (const t of allTerms) {
      const m = (lower.match(new RegExp(t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) || []).length;
      score += m;
    }
    if (score > 0) {
      results.set(chunk.id, {
        content: chunk.content,
        document_title: chunk.knowledge_documents?.title || 'Documento',
        score,
      });
    }
  }

  return Array.from(results.values()).sort((a, b) => b.score - a.score).slice(0, 8);
}

// =============================================================================
// PROMPT MESTRE
// =============================================================================

function buildPrescriptionPrompt(opts: {
  catalogContent: string;
  catalogMetadata: any;
  recordContent: string;
  recordMetadata: any;
  observations: string;
  ragChunks: Array<{ content: string; document_title: string }>;
}): string {
  const { catalogContent, catalogMetadata, recordContent, recordMetadata, observations, ragChunks } = opts;

  const ragSection = ragChunks.length > 0
    ? ragChunks.map((c, i) => `[Trecho ${i + 1} — ${c.document_title}]\n${c.content}`).join('\n\n---\n\n')
    : '(Nenhum trecho da base científica recuperado para esta consulta.)';

  return `Você é um agente especialista em **cannabis medicinal**, atuando como apoio à decisão para profissionais de saúde habilitados.

## TAREFA
Gerar uma SUGESTÃO DE RECEITUÁRIO baseada em:
1. O CATÁLOGO de produtos disponíveis (universo de prescrição permitido).
2. O PRONTUÁRIO do paciente (contexto clínico).
3. As OBSERVAÇÕES complementares do profissional, se houver.
4. A BASE CIENTÍFICA (RAG médico) recuperada para o caso.

## REGRAS CRÍTICAS
- **NUNCA recomende um produto que não esteja explicitamente listado no catálogo abaixo.**
- Se o catálogo não tiver produto adequado, declare isso explicitamente.
- Use a base científica para fundamentar as escolhas, mas **não exiba identificadores como "(Fonte 1)"** no texto final — incorpore o conhecimento de forma natural.
- Não alucine. Quando algo não puder ser inferido com segurança, deixe claro.
- Pode sugerir 1 ou múltiplos produtos, conforme a necessidade clínica real.

## ESTRUTURA OBRIGATÓRIA DA RESPOSTA (em Markdown)

### 1. Resumo do caso
Síntese clínica em 2-4 linhas (paciente, queixa principal, achados relevantes).

### 2. Objetivos terapêuticos
Lista breve do que se busca alcançar.

### 3. Produtos sugeridos
Para CADA produto recomendado:
- **Nome do produto** (exatamente como aparece no catálogo) — apresentação/concentração.
- **Posologia sugerida** (titulação, frequência, via).
- **Justificativa clínica** (por que este produto para este paciente, ancorada na evidência disponível).

### 4. Observações de uso e monitoramento
Cuidados, sinais de alerta, ajustes esperados.

### 5. Considerações finais
Limitações da análise, contraindicações relevantes, interações potenciais.

### 6. Aviso
Frase clara de que esta é uma SUGESTÃO de apoio e que a decisão final cabe ao profissional responsável.

---

## CATÁLOGO DISPONÍVEL
${catalogMetadata && Object.keys(catalogMetadata).length > 0 ? '**Estrutura extraída:**\n```json\n' + JSON.stringify(catalogMetadata, null, 2) + '\n```\n' : ''}
**Conteúdo bruto do catálogo:**
${catalogContent.slice(0, 12000)}

---

## PRONTUÁRIO DO PACIENTE
${recordMetadata && Object.keys(recordMetadata).length > 0 ? '**Estrutura extraída:**\n```json\n' + JSON.stringify(recordMetadata, null, 2) + '\n```\n' : ''}
**Conteúdo bruto do prontuário:**
${recordContent.slice(0, 12000)}

---

## OBSERVAÇÕES COMPLEMENTARES DO PROFISSIONAL
${observations?.trim() || '(Nenhuma observação adicional fornecida.)'}

---

## BASE CIENTÍFICA RECUPERADA (use como fundamento, não cite identificadores)
${ragSection}

---

Agora gere a sugestão de receituário seguindo EXATAMENTE a estrutura acima.`;
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

    // Auth client (validate user)
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

    // Service client for DB / storage
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Plan check
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

    // Load records (and verify ownership)
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

    console.log('Extraindo conteúdo dos arquivos...');
    const [catalogFull, recordFull] = await Promise.all([
      ensureExtraction(supabase, 'prescription_catalogs', catalogRow),
      ensureExtraction(supabase, 'prescription_records', recordRow),
    ]);

    const recordMeta = recordFull.extracted_metadata || {};
    const ragQuery = [
      recordFull.main_complaint || recordMeta.main_complaint || '',
      Array.isArray(recordMeta.symptoms) ? recordMeta.symptoms.join(' ') : '',
      Array.isArray(recordMeta.diagnoses) ? recordMeta.diagnoses.join(' ') : '',
      observations || '',
    ].filter(Boolean).join(' ').trim();

    console.log('RAG query:', ragQuery.slice(0, 200));
    const ragChunks = ragQuery
      ? await searchMedicalKnowledgeBase(supabase, ragQuery)
      : [];
    console.log(`RAG retornou ${ragChunks.length} chunks`);

    const prompt = buildPrescriptionPrompt({
      catalogContent: catalogFull.extracted_content || '',
      catalogMetadata: catalogFull.extracted_metadata || {},
      recordContent: recordFull.extracted_content || '',
      recordMetadata: recordFull.extracted_metadata || {},
      observations: observations || '',
      ragChunks,
    });

    // Call Lovable AI
    const aiResp = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-pro',
        messages: [
          { role: 'system', content: 'Você é um especialista em cannabis medicinal que apoia decisões de prescrição com rigor clínico e científico.' },
          { role: 'user', content: prompt },
        ],
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

    if (!aiText) {
      return new Response(JSON.stringify({ error: 'ia_vazia', message: 'A IA não retornou conteúdo.' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Persist result
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

    if (saveError) {
      console.error('Save result error', saveError);
    }

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
