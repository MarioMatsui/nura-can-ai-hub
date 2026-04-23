/**
 * Extrai um resumo estruturado (Produto + Posologia) a partir do
 * texto bruto gerado pela IA do Receituário+.
 *
 * A função é puramente client-side e tolerante a variações de
 * formatação (markdown, bullets, espaçamentos).
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

/** Procura o índice de início do conteúdo logo após um rótulo (ex.: "Produto:"). */
const findFieldStart = (text: string, field: string): number => {
  const re = new RegExp(
    String.raw`(?:^|\n)\s*(?:[*_#>\-•·●▪►▶]+\s*)*\**\s*${field}\s*\**\s*[:\-–—]\s*`,
    'i',
  );
  const match = re.exec(text);
  if (!match) return -1;
  return match.index + match[0].length;
};

/** Encontra o próximo rótulo conhecido a partir de uma posição. */
const findNextFieldIndex = (
  text: string,
  fromIndex: number,
  exclude: string[] = [],
): number => {
  const fields = KNOWN_FIELDS.filter((f) => !exclude.includes(f));
  let nearest = -1;
  for (const f of fields) {
    const re = new RegExp(
      String.raw`\n\s*(?:[*_#>\-•·●▪►▶]+\s*)*\**\s*${f}\s*\**\s*[:\-–—]`,
      'i',
    );
    re.lastIndex = 0;
    const slice = text.slice(fromIndex);
    const m = re.exec(slice);
    if (m) {
      const abs = fromIndex + m.index;
      if (nearest === -1 || abs < nearest) nearest = abs;
    }
  }
  // também considerar headings markdown
  const headingRe = /\n\s*#{1,6}\s+\S/;
  const hm = headingRe.exec(text.slice(fromIndex));
  if (hm) {
    const abs = fromIndex + hm.index;
    if (nearest === -1 || abs < nearest) nearest = abs;
  }
  return nearest;
};

const extractProduto = (text: string): string => {
  const start = findFieldStart(text, 'produto');
  if (start === -1) return '';
  const end = findNextFieldIndex(text, start, ['marca']);
  let raw = (end === -1 ? text.slice(start) : text.slice(start, end)).trim();

  // Pega apenas a primeira linha não vazia (produto é monolinha)
  raw = raw.split(/\n/).map((l) => l.trim()).find((l) => l.length > 0) || '';
  raw = stripInlineMarkdown(raw);
  raw = stripLeadingBullet(raw);
  raw = raw.replace(/\s+/g, ' ').trim();

  // Tenta achar Marca (próxima ou anterior) e prefixar se ainda não estiver no nome
  const marcaStart = findFieldStart(text, 'marca');
  let marca = '';
  if (marcaStart !== -1) {
    const marcaEnd = findNextFieldIndex(text, marcaStart, ['produto']);
    let m = (marcaEnd === -1 ? text.slice(marcaStart) : text.slice(marcaStart, marcaEnd)).trim();
    m = m.split(/\n/).map((l) => l.trim()).find((l) => l.length > 0) || '';
    m = stripInlineMarkdown(stripLeadingBullet(m)).replace(/\s+/g, ' ').trim();
    marca = m;
  }

  if (marca && raw && !raw.toLowerCase().includes(marca.toLowerCase())) {
    return `${marca} ${raw}`.replace(/\s+/g, ' ').trim();
  }
  return raw;
};

const extractPosologia = (text: string): string => {
  const start = findFieldStart(text, 'posologia');
  if (start === -1) return '';
  const end = findNextFieldIndex(text, start, ['posologia']);
  let raw = (end === -1 ? text.slice(start) : text.slice(start, end)).trim();

  const lines = raw.split(/\n/);
  const cleaned: string[] = [];
  for (const original of lines) {
    let line = original.replace(/\s+$/g, '');
    if (!line.trim()) {
      // preserva uma quebra entre blocos
      if (cleaned.length && cleaned[cleaned.length - 1] !== '') cleaned.push('');
      continue;
    }
    line = stripInlineMarkdown(line);
    // normaliza bullets para "• "
    const bulletMatch = line.match(/^\s*(?:[-*•·●▪►▶]|\d+[.)])\s+(.*)$/);
    if (bulletMatch) {
      line = `• ${bulletMatch[1].trim()}`;
    } else {
      line = line.trim();
    }
    cleaned.push(line);
  }

  // remove quebras vazias do início/fim
  while (cleaned.length && cleaned[0] === '') cleaned.shift();
  while (cleaned.length && cleaned[cleaned.length - 1] === '') cleaned.pop();

  return cleaned.join('\n');
};

export const extractPrescriptionSummary = (
  text: string | null | undefined,
): PrescriptionSummary => {
  if (!text || typeof text !== 'string') {
    return { produto: '', posologia: '' };
  }
  return {
    produto: extractProduto(text),
    posologia: extractPosologia(text),
  };
};
