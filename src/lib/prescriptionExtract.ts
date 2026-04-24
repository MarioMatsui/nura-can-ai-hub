/**
 * Extrai pares (Produto + Posologia) do receituário gerado pela IA.
 *
 * Estratégia híbrida:
 *  1. CAMINHO PREFERIDO — JSON sidecar emitido pela IA no fim da resposta,
 *     dentro de um bloco delimitado por <!--RX_JSON_START--> ... <!--RX_JSON_END-->.
 *
 *  2. FALLBACK LEGADO — regex sobre o Markdown. Mantido por retrocompatibilidade
 *     com receituários antigos no histórico (gerados antes do contrato JSON).
 *
 * AMBOS os caminhos passam pelo mesmo sanitizador final (`cleanLine` /
 * `cleanPosologia`), garantindo que `**`, `*`, `_`, `|` ou hífens órfãos
 * NUNCA cheguem ao Resumo Copiável.
 */

export interface PrescriptionItem {
  produto: string;
  posologia: string;
}

/** Mantido por retrocompatibilidade. Preferir `PrescriptionItem[]`. */
export interface PrescriptionSummary {
  produto: string;
  posologia: string;
}

// =============================================================================
// SANITIZADORES (compartilhados entre sidecar e fallback)
// =============================================================================

/** Remove markdown inline (negrito, itálico, código). Usado em linhas de posologia. */
const stripInlineMarkdown = (text: string): string => {
  return text
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/__(.+?)__/g, '$1')
    .replace(/(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)/g, '$1')
    .replace(/(?<!_)_(?!_)(.+?)(?<!_)_(?!_)/g, '$1')
    .replace(/`([^`]+)`/g, '$1');
};

/** Limpa nome do produto: remove TODO markdown, pipes, separadores órfãos. UMA linha. */
const cleanLine = (s: unknown): string =>
  String(s ?? '')
    .replace(/\*+/g, '')                              // remove ** e *
    .replace(/[`_]/g, '')                             // remove ` e _
    .replace(/\s*[–—-]\s*(?=[–—-]|$)/g, '')           // hífens órfãos no fim
    .replace(/\s*[|│]\s*[|│]\s*/g, ' | ')             // dedup pipes consecutivos
    .replace(/\s+/g, ' ')
    .replace(/^[\s\-–—|]+|[\s\-–—|]+$/g, '')          // separadores nas pontas
    .trim();

/** Limpa posologia preservando bullets/quebras, descartando linhas residuais. */
const cleanPosologia = (s: unknown): string => {
  const lines = String(s ?? '').split('\n');
  const cleaned: string[] = [];
  for (const original of lines) {
    let line = stripInlineMarkdown(original).replace(/\s+$/g, '');
    // Descarta linha que sobrou só com pontuação/markdown residual (ex.: "**" sozinho).
    if (!line.replace(/[\s\-–—*•·●▪►▶|]/g, '')) {
      if (cleaned.length && cleaned[cleaned.length - 1] !== '') cleaned.push('');
      continue;
    }
    const bm = line.match(/^\s*(?:[-*•·●▪►▶]|\d+[.)])\s+(.*)$/);
    if (bm) {
      line = `• ${bm[1].trim()}`;
    } else {
      line = line.trim();
    }
    cleaned.push(line);
  }
  while (cleaned.length && cleaned[0] === '') cleaned.shift();
  while (cleaned.length && cleaned[cleaned.length - 1] === '') cleaned.pop();
  return cleaned.join('\n');
};

// =============================================================================
// SIDECAR JSON (caminho preferido)
// =============================================================================

/**
 * Tenta extrair o JSON sidecar com tolerância a variações:
 *  - bloco ```json``` dentro dos comentários
 *  - JSON cru entre os comentários (sem fences)
 *  - fences sem o tag `json`
 */
const trySidecarParse = (text: string): any | null => {
  // Variante 1: bloco ```json``` (ou ```) bem formado
  const v1 = text.match(
    /<!--RX_JSON_START-->\s*```(?:json)?\s*([\s\S]*?)\s*```\s*<!--RX_JSON_END-->/i,
  );
  if (v1) {
    try {
      return JSON.parse(v1[1]);
    } catch {
      // segue
    }
  }
  // Variante 2: qualquer conteúdo entre os comentários — tira fences se existirem
  const v2 = text.match(/<!--RX_JSON_START-->\s*([\s\S]*?)\s*<!--RX_JSON_END-->/i);
  if (v2) {
    const inner = v2[1]
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/\s*```$/, '')
      .trim();
    try {
      return JSON.parse(inner);
    } catch {
      // segue
    }
  }
  return null;
};

// =============================================================================
// FALLBACK LEGADO (regex sobre Markdown — retrocompatibilidade)
// =============================================================================

const KNOWN_FIELDS = [
  'posologia',
  'marca',
  'concentração',
  'concentracao',
  'indicação',
  'indicacao',
  'observações',
  'observacoes',
  'justificativa',
  'contraindicações',
  'contraindicacoes',
  'acompanhamento',
  'duração',
  'duracao',
  'via',
  'apresentação',
  'apresentacao',
];

const stripLeadingBullet = (line: string): string => {
  return line.replace(/^\s*(?:[-*•·●▪►▶]|\d+[.)])\s+/, '');
};

const buildFieldRegex = (field: string, flags = 'i'): RegExp => {
  return new RegExp(
    String.raw`(?:^|\n)\s*(?:[*_#>\-•·●▪►▶]+\s*)*\**\s*${field}(?:\s*\d+)?\s*\**\s*[:\-–—]\s*`,
    flags,
  );
};

const findFieldStart = (text: string, field: string): number => {
  const re = buildFieldRegex(field);
  const match = re.exec(text);
  if (!match) return -1;
  return match.index + match[0].length;
};

const findNextFieldIndex = (
  text: string,
  fromIndex: number,
  exclude: string[] = [],
): number => {
  const fields = KNOWN_FIELDS.filter((f) => !exclude.includes(f));
  let nearest = -1;
  const slice = text.slice(fromIndex);
  for (const f of fields) {
    const re = new RegExp(
      String.raw`\n\s*(?:[*_#>\-•·●▪►▶]+\s*)*\**\s*${f}(?:\s*\d+)?\s*\**\s*[:\-–—]`,
      'i',
    );
    const m = re.exec(slice);
    if (m) {
      const abs = fromIndex + m.index;
      if (nearest === -1 || abs < nearest) nearest = abs;
    }
  }
  const headingRe = /\n\s*#{1,6}\s+\S/;
  const hm = headingRe.exec(slice);
  if (hm) {
    const abs = fromIndex + hm.index;
    if (nearest === -1 || abs < nearest) nearest = abs;
  }
  return nearest;
};

const extractSingleLineField = (block: string, field: string): string => {
  const start = findFieldStart(block, field);
  if (start === -1) return '';
  const end = findNextFieldIndex(block, start, [field]);
  let raw = (end === -1 ? block.slice(start) : block.slice(start, end)).trim();
  raw = raw.split(/\n/).map((l) => l.trim()).find((l) => l.length > 0) || '';
  raw = stripInlineMarkdown(stripLeadingBullet(raw)).replace(/\s+/g, ' ').trim();
  return raw;
};

const appendDetail = (base: string, detail: string): string => {
  const cleanDetail = cleanLine(detail);
  if (!cleanDetail) return base;
  const baseLc = base.toLowerCase();
  const detailLc = cleanDetail.toLowerCase();
  if (!base) return cleanDetail;
  if (baseLc.includes(detailLc)) return base;
  return `${base} – ${cleanDetail}`;
};

const extractProdutoFromBlock = (block: string): string => {
  const start = findFieldStart(block, 'produto');
  if (start === -1) return '';
  const end = findNextFieldIndex(block, start, ['marca']);
  let raw = (end === -1 ? block.slice(start) : block.slice(start, end)).trim();

  raw = raw.split(/\n/).map((l) => l.trim()).find((l) => l.length > 0) || '';
  raw = stripInlineMarkdown(raw);
  raw = stripLeadingBullet(raw);
  raw = raw.replace(/\s+/g, ' ').trim();

  const marca = extractSingleLineField(block, 'marca');
  let nome = raw;
  if (marca && nome && !nome.toLowerCase().includes(marca.toLowerCase())) {
    nome = `${marca} ${nome}`.replace(/\s+/g, ' ').trim();
  } else if (marca && !nome) {
    nome = marca;
  }

  const concentracao =
    extractSingleLineField(block, 'concentração') ||
    extractSingleLineField(block, 'concentracao');
  const apresentacao =
    extractSingleLineField(block, 'apresentação') ||
    extractSingleLineField(block, 'apresentacao') ||
    extractSingleLineField(block, 'volume');

  let composed = cleanLine(nome);
  composed = appendDetail(composed, concentracao);
  composed = appendDetail(composed, apresentacao);

  return cleanLine(composed);
};

const extractPosologiaFromBlock = (block: string): string => {
  const start = findFieldStart(block, 'posologia');
  if (start === -1) return '';
  const end = findNextFieldIndex(block, start, ['posologia']);
  const raw = (end === -1 ? block.slice(start) : block.slice(start, end)).trim();
  return cleanPosologia(raw);
};

const extractFromMarkdownLegacy = (text: string): PrescriptionItem[] => {
  const re = buildFieldRegex('produto', 'gi');
  const matchStarts: number[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    matchStarts.push(m.index);
    if (m.index === re.lastIndex) re.lastIndex++;
  }

  if (matchStarts.length === 0) return [];

  const items: PrescriptionItem[] = [];
  for (let i = 0; i < matchStarts.length; i++) {
    const blockStart = matchStarts[i];
    const blockEnd = i + 1 < matchStarts.length ? matchStarts[i + 1] : text.length;
    const block = text.slice(blockStart, blockEnd);

    const produto = extractProdutoFromBlock(block);
    const posologia = extractPosologiaFromBlock(block);

    if (produto || posologia) {
      items.push({ produto, posologia });
    }
  }

  return items;
};

// =============================================================================
// API PÚBLICA
// =============================================================================

/**
 * Extrai pares (produto + posologia). Preferência absoluta pelo JSON sidecar;
 * se ausente ou inválido, cai no parser legado de Markdown.
 *
 * Em AMBOS os caminhos, os campos passam pelos sanitizadores `cleanLine` e
 * `cleanPosologia` — garantindo saída ASCII limpa, sem markdown residual.
 */
export const extractPrescriptionSummary = (
  text: string | null | undefined,
): PrescriptionItem[] => {
  if (!text || typeof text !== 'string') return [];

  // 1) CAMINHO PREFERIDO: sidecar JSON (com parsing tolerante)
  const parsed = trySidecarParse(text);
  if (parsed) {
    const arr = Array.isArray(parsed?.produtos) ? parsed.produtos : [];
    const items: PrescriptionItem[] = arr
      .map((p: any) => ({
        produto: cleanLine(p?.nome_formatado),
        posologia: cleanPosologia(p?.posologia),
      }))
      .filter((it: PrescriptionItem) => it.produto || it.posologia);
    if (items.length > 0) return items;
  }

  // 2) FALLBACK: regex sobre Markdown (retrocompatibilidade)
  return extractFromMarkdownLegacy(text);
};
