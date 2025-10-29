import { Conversation, Message } from '@/pages/Dashboard';

// Remove acentos e normaliza para busca
export function normalizeString(str: string): string {
  return str
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

// Stopwords simples em PT-BR
const stopwords = new Set([
  'a', 'o', 'e', 'é', 'de', 'da', 'do', 'em', 'um', 'uma', 'os', 'as',
  'para', 'com', 'por', 'que', 'se', 'na', 'no', 'ao', 'à', 'dos', 'das'
]);

// Tokeniza e remove stopwords
export function tokenize(text: string): string[] {
  return normalizeString(text)
    .split(/\s+/)
    .filter(token => token.length > 2 && !stopwords.has(token));
}

// Calcula score de relevância
export function calculateRelevance(
  query: string,
  chat: Conversation,
  messages: Message[]
): number {
  let score = 0;
  const normalizedQuery = normalizeString(query);
  const queryTokens = tokenize(query);

  // +3: match no título
  if (normalizeString(chat.title).includes(normalizedQuery)) {
    score += 3;
  }

  // +2 por token no título
  queryTokens.forEach(token => {
    if (normalizeString(chat.title).includes(token)) {
      score += 2;
    }
  });

  // +1: match em modelTag
  const modelTags = ['medico', 'juridico', 'veterinario', 'especialista', 'generico'];
  if (modelTags.some(tag => normalizedQuery.includes(tag))) {
    score += 1;
  }

  // +2: match exato na mensagem, +1: match parcial
  messages.forEach(msg => {
    const normalizedContent = normalizeString(msg.content);
    if (normalizedContent.includes(normalizedQuery)) {
      score += 2;
    } else {
      queryTokens.forEach(token => {
        if (normalizedContent.includes(token)) {
          score += 1;
        }
      });
    }
  });

  return score;
}

// Cria snippet com highlight
export function createSnippet(
  content: string,
  query: string,
  maxLength: number = 150
): string {
  const normalizedContent = normalizeString(content);
  const normalizedQuery = normalizeString(query);
  
  const index = normalizedContent.indexOf(normalizedQuery);
  
  if (index === -1) {
    // Se não encontrar match exato, procura por tokens
    const tokens = tokenize(query);
    for (const token of tokens) {
      const tokenIndex = normalizedContent.indexOf(token);
      if (tokenIndex !== -1) {
        const start = Math.max(0, tokenIndex - 50);
        const end = Math.min(content.length, tokenIndex + maxLength - 50);
        let snippet = content.slice(start, end);
        if (start > 0) snippet = '...' + snippet;
        if (end < content.length) snippet = snippet + '...';
        return snippet;
      }
    }
    // Fallback: retorna início do conteúdo
    return content.slice(0, maxLength) + (content.length > maxLength ? '...' : '');
  }
  
  const start = Math.max(0, index - 50);
  const end = Math.min(content.length, index + maxLength - 50);
  let snippet = content.slice(start, end);
  
  if (start > 0) snippet = '...' + snippet;
  if (end < content.length) snippet = snippet + '...';
  
  return snippet;
}

// HTML-escapes text to prevent XSS
function escapeHtml(text: string): string {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// Adiciona highlight HTML ao texto (XSS-safe)
export function highlightText(text: string, query: string): string {
  if (!query.trim()) return escapeHtml(text);
  
  const normalizedText = normalizeString(text);
  const normalizedQuery = normalizeString(query);
  const tokens = tokenize(query);
  
  let result = text;
  const matches: Array<{ start: number; end: number; original: string }> = [];
  
  // Encontra matches exatos
  let searchIndex = 0;
  while (true) {
    const index = normalizedText.indexOf(normalizedQuery, searchIndex);
    if (index === -1) break;
    
    matches.push({
      start: index,
      end: index + query.length,
      original: text.slice(index, index + query.length)
    });
    
    searchIndex = index + query.length;
  }
  
  // Encontra matches parciais (tokens)
  if (matches.length === 0) {
    tokens.forEach(token => {
      let searchIndex = 0;
      while (true) {
        const index = normalizedText.indexOf(token, searchIndex);
        if (index === -1) break;
        
        // Evita overlaps
        const hasOverlap = matches.some(m => 
          (index >= m.start && index < m.end) ||
          (index + token.length > m.start && index + token.length <= m.end)
        );
        
        if (!hasOverlap) {
          matches.push({
            start: index,
            end: index + token.length,
            original: text.slice(index, index + token.length)
          });
        }
        
        searchIndex = index + token.length;
      }
    });
  }
  
  // Ordena por posição
  matches.sort((a, b) => a.start - b.start);
  
  // Aplica highlights com escape de HTML
  let offset = 0;
  matches.forEach(match => {
    const before = result.slice(0, match.start + offset);
    // Escape HTML to prevent XSS attacks
    const escapedMatch = escapeHtml(match.original);
    const highlighted = `<mark class="bg-primary/20 text-primary font-medium rounded px-0.5">${escapedMatch}</mark>`;
    const after = result.slice(match.end + offset);
    result = before + highlighted + after;
    offset += highlighted.length - match.original.length;
  });
  
  return result;
}

// Sanitiza query para prevenir XSS
export function sanitizeQuery(query: string): string {
  return query
    .replace(/[<>]/g, '')
    .trim()
    .slice(0, 200); // Limite de caracteres
}

// Salva busca recente no localStorage
export function saveRecentSearch(query: string) {
  if (!query.trim() || query.length < 2) return;
  
  const recent = getRecentSearches();
  const updated = [query, ...recent.filter(q => q !== query)].slice(0, 5);
  
  try {
    localStorage.setItem('nura:recent-searches', JSON.stringify(updated));
  } catch (error) {
    console.error('Error saving recent search:', error);
  }
}

// Recupera buscas recentes
export function getRecentSearches(): string[] {
  try {
    const stored = localStorage.getItem('nura:recent-searches');
    return stored ? JSON.parse(stored) : [];
  } catch (error) {
    console.error('Error loading recent searches:', error);
    return [];
  }
}

// Limpa buscas recentes
export function clearRecentSearches() {
  try {
    localStorage.removeItem('nura:recent-searches');
  } catch (error) {
    console.error('Error clearing recent searches:', error);
  }
}

// Formata label do modelo
export function getModelLabel(modelType: string): string {
  const labels: Record<string, string> = {
    generic: 'Genérico',
    medical: 'Médico',
    legal: 'Jurídico',
    veterinary: 'Veterinário',
    specialist: 'Especialista',
  };
  return labels[modelType] || modelType;
}
