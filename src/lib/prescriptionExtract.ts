/**
 * Extrai um resumo estruturado (Produto + Posologia) a partir do
 * texto bruto gerado pela IA do Receituário+.
 *
 * Suporta múltiplos produtos: cada ocorrência de "Produto:" gera
 * um item independente, com posologia isolada no bloco daquele produto.
 *
 * Puramente client-side e tolerante a variações de formatação
 * (markdown, bullets, numeração, espaçamentos).
 */

export interface PrescriptionItem {
  produto: string;
  posologia: string;
}

/**
 * Mantido por retrocompatibilidade caso algum chamador ainda use
 * o formato antigo. Preferir `PrescriptionItem[]`.
 */
export interface PrescriptionSummary {
  produto: string;
  posologia: string;
}

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

/** Remove marcações markdown comuns mantendo o texto legível. */
const stripInlineMarkdown = (text: string): string => {
  return text
    // bold/italic
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/__(.+?)__/g, '$1')
    .replace(/(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)/g, '$1')
    .replace(/(?<!_)_(?!_)(.+?)(?<!_)_(?!_)/g, '$1')
    // inline code
    .replace(/`([^`]+)`/g, '$1');
};

/** Remove prefixos de lista no começo de uma linha. */
const stripLeadingBullet = (line: string): string => {
  return line.replace(/^\s*(?:[-*•·●▪►▶]|\d+[.)])\s+/, '');
};

/**
 * Constrói regex que casa um rótulo de campo no início de uma linha,
 * tolerando markdown, bullets, numeração ("Produto 1:") e variantes.
 */
const buildFieldRegex = (field: string, flags = 'i'): RegExp => {
  return new RegExp(
    String.raw`(?:^|\n)\s*(?:[*_#>\-•·●▪►▶]+\s*)*\**\s*${field}(?:\s*\d+)?\s*\**\s*[:\-–—]\s*`,
    flags,
  );
};

/** Procura o índice de início do conteúdo logo após um rótulo (ex.: "Produto:"). */
const findFieldStart = (text: string, field: string): number => {
  const re = buildFieldRegex(field);
  const match = re.exec(text);
  if (!match) return -1;
  return match.index + match[0].length;
};

/** Encontra todos os índices de início de conteúdo de um rótulo. */
const findAllFieldStarts = (text: string, field: string): number[] => {
  const re = buildFieldRegex(field, 'gi');
  const out: number[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    out.push(m.index + m[0].length);
    // evita loop infinito caso o match tenha length 0
    if (m.index === re.lastIndex) re.lastIndex++;
  }
  return out;
};

/** Encontra o próximo rótulo conhecido a partir de uma posição. */
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
  // também considerar headings markdown
  const headingRe = /\n\s*#{1,6}\s+\S/;
  const hm = headingRe.exec(slice);
  if (hm) {
    const abs = fromIndex + hm.index;
    if (nearest === -1 || abs < nearest) nearest = abs;
  }
  return nearest;
};

/** Extrai a primeira linha não-vazia de um campo nominal dentro do bloco. */
const extractSingleLineField = (block: string, field: string): string => {
  const start = findFieldStart(block, field);
  if (start === -1) return '';
  const end = findNextFieldIndex(block, start, [field]);
  let raw = (end === -1 ? block.slice(start) : block.slice(start, end)).trim();
  raw = raw.split(/\n/).map((l) => l.trim()).find((l) => l.length > 0) || '';
  raw = stripInlineMarkdown(stripLeadingBullet(raw)).replace(/\s+/g, ' ').trim();
  return raw;
};

/** Anexa um detalhe ao nome se ainda não estiver contido (case-insensitive). */
const appendDetail = (base: string, detail: string): string => {
  if (!detail) return base;
  const baseLc = base.toLowerCase();
  const detailLc = detail.toLowerCase();
  if (!base) return detail;
  if (baseLc.includes(detailLc)) return base;
  // Evita duplicar se o nome já termina com a info principal do detalhe
  return `${base} – ${detail}`;
};

/** Extrai o nome do produto a partir de um bloco já isolado, compondo
 *  Marca + Nome – Concentração – Apresentação quando disponível. */
const extractProdutoFromBlock = (block: string): string => {
  const start = findFieldStart(block, 'produto');
  if (start === -1) return '';
  const end = findNextFieldIndex(block, start, ['marca']);
  let raw = (end === -1 ? block.slice(start) : block.slice(start, end)).trim();

  raw = raw.split(/\n/).map((l) => l.trim()).find((l) => l.length > 0) || '';
  raw = stripInlineMarkdown(raw);
  raw = stripLeadingBullet(raw);
  raw = raw.replace(/\s+/g, ' ').trim();

  // Marca dentro do mesmo bloco
  const marca = extractSingleLineField(block, 'marca');
  let nome = raw;
  if (marca && nome && !nome.toLowerCase().includes(marca.toLowerCase())) {
    nome = `${marca} ${nome}`.replace(/\s+/g, ' ').trim();
  } else if (marca && !nome) {
    nome = marca;
  }

  // Composição defensiva: anexar concentração e apresentação quando ausentes na linha
  const concentracao =
    extractSingleLineField(block, 'concentração') ||
    extractSingleLineField(block, 'concentracao');
  const apresentacao =
    extractSingleLineField(block, 'apresentação') ||
    extractSingleLineField(block, 'apresentacao') ||
    extractSingleLineField(block, 'volume');

  let composed = nome;
  composed = appendDetail(composed, concentracao);
  composed = appendDetail(composed, apresentacao);

  return composed.replace(/\s+/g, ' ').trim();
};

/** Extrai a posologia a partir de um bloco já isolado. */
const extractPosologiaFromBlock = (block: string): string => {
  const start = findFieldStart(block, 'posologia');
  if (start === -1) return '';
  const end = findNextFieldIndex(block, start, ['posologia']);
  const raw = (end === -1 ? block.slice(start) : block.slice(start, end)).trim();

  const lines = raw.split(/\n/);
  const cleaned: string[] = [];
  for (const original of lines) {
    let line = original.replace(/\s+$/g, '');
    if (!line.trim()) {
      if (cleaned.length && cleaned[cleaned.length - 1] !== '') cleaned.push('');
      continue;
    }
    line = stripInlineMarkdown(line);
    const bulletMatch = line.match(/^\s*(?:[-*•·●▪►▶]|\d+[.)])\s+(.*)$/);
    if (bulletMatch) {
      line = `• ${bulletMatch[1].trim()}`;
    } else {
      line = line.trim();
    }
    cleaned.push(line);
  }

  while (cleaned.length && cleaned[0] === '') cleaned.shift();
  while (cleaned.length && cleaned[cleaned.length - 1] === '') cleaned.pop();

  return cleaned.join('\n');
};

/**
 * Extrai TODOS os pares (produto + posologia) presentes no texto.
 * - Localiza todas as ocorrências de "Produto:".
 * - Para cada uma, isola o bloco até o próximo "Produto:" (ou fim).
 * - Extrai produto e posologia restritos àquele bloco.
 */
export const extractPrescriptionSummary = (
  text: string | null | undefined,
): PrescriptionItem[] => {
  if (!text || typeof text !== 'string') return [];

  // Para localizar inícios de "Produto:" considerando o casamento do rótulo,
  // precisamos das posições do MATCH (não do conteúdo após o rótulo).
  // Reaproveitamos a regex e calculamos os índices do início do match.
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
