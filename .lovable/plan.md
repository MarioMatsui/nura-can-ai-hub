

## Eliminar `**` definitivamente do Resumo Copiável

### Diagnóstico

Pelo screenshot:
- **Produto** mostra `SPECTRUM** – ** 60ml | 5000mg CBD` → `**` no meio com `|` como separador
- **Posologia** começa com `**` isolado em uma linha sozinha

Isso é assinatura clara do **fallback regex legado** (`extractFromMarkdownLegacy`), não do sidecar JSON. Sintomas:
- O `|` no nome é o separador que o legado usa quando concatena `Marca | Concentração | Apresentação`.
- O `**` solto na posologia é o `**Posologia:**` virando `**` após o regex pular o rótulo.

Causa raiz: o sidecar JSON ou está **ausente** (IA não emitiu) ou **inválido** (JSON.parse falha por aspas/quebras), então o front cai no fallback que preserva markdown.

### Solução em 3 camadas

#### 1) Sanitização agressiva no `cleanLine` e no fallback (`src/lib/prescriptionExtract.ts`)

Garantir que **nenhum** caminho — sidecar OU fallback — devolva `**` ou tokens vazios entre separadores.

**A. Reforçar `cleanLine`:**
```ts
const cleanLine = (s: unknown): string =>
  String(s ?? '')
    .replace(/\*+/g, '')          // remove ** e *
    .replace(/[`_]/g, '')         // remove ` e _
    .replace(/\s*[–—-]\s*(?=[–—-]|$)/g, '') // tira hífens órfãos no fim
    .replace(/\s*[|│]\s*[|│]\s*/g, ' | ')   // dedup pipes
    .replace(/\s+/g, ' ')
    .replace(/^[\s\-–—|]+|[\s\-–—|]+$/g, '') // tira separadores nas pontas
    .trim();
```

**B. Reforçar `cleanPosologia`:** atualmente só tira `**`. Trocar para usar `stripInlineMarkdown` em cada linha (igual ao fallback faz) e descartar linhas que viram só `**` ou vazias após limpeza:
```ts
const cleanPosologia = (s: unknown): string => {
  const lines = String(s ?? '').split('\n');
  const cleaned: string[] = [];
  for (const original of lines) {
    let line = stripInlineMarkdown(original).replace(/\s+$/g, '');
    // descarta linha que sobrou só com pontuação/markdown residual
    if (!line.replace(/[\s\-–—*•·●▪►▶|]/g, '')) {
      if (cleaned.length && cleaned[cleaned.length - 1] !== '') cleaned.push('');
      continue;
    }
    const bm = line.match(/^\s*(?:[-*•·●▪►▶]|\d+[.)])\s+(.*)$/);
    if (bm) line = `• ${bm[1].trim()}`;
    cleaned.push(line.trim());
  }
  while (cleaned.length && cleaned[0] === '') cleaned.shift();
  while (cleaned.length && cleaned[cleaned.length - 1] === '') cleaned.pop();
  return cleaned.join('\n');
};
```
(`stripInlineMarkdown` já existe no arquivo — só promover ao topo do módulo.)

**C. No fallback `extractProdutoFromBlock`:** trocar o separador `–` por `–` (já é) e garantir que `appendDetail` não anexe partes vazias após sanitização:
```ts
const appendDetail = (base: string, detail: string): string => {
  const cleanDetail = cleanLine(detail);
  if (!cleanDetail) return base;
  if (base.toLowerCase().includes(cleanDetail.toLowerCase())) return base;
  return base ? `${base} – ${cleanDetail}` : cleanDetail;
};
```
E aplicar `cleanLine` no `composed` final antes de retornar.

#### 2) Parsing tolerante do sidecar (`extractPrescriptionSummary`)

A IA às vezes emite o sidecar com pequenas variações que quebram o regex atual. Tornar a captura mais resiliente:

```ts
// Tenta múltiplas formas de capturar o JSON do sidecar
const trySidecarParse = (text: string): any | null => {
  // Variante 1: bloco ```json``` dentro dos comentários
  const v1 = text.match(/<!--RX_JSON_START-->\s*```(?:json)?\s*([\s\S]*?)\s*```\s*<!--RX_JSON_END-->/i);
  if (v1) { try { return JSON.parse(v1[1]); } catch {} }
  // Variante 2: JSON cru entre os comentários (sem ```)
  const v2 = text.match(/<!--RX_JSON_START-->\s*([\s\S]*?)\s*<!--RX_JSON_END-->/i);
  if (v2) {
    const inner = v2[1].replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
    try { return JSON.parse(inner); } catch {}
  }
  return null;
};
```

Substituir o `text.match(SIDECAR_RE)` por `trySidecarParse(text)`. Garante que pequenas variações (sem ```` ``` ````, ou sem `json` após ```` ``` ````) ainda sejam aceitas.

#### 3) Reforço final no prompt (`supabase/functions/generate-prescription/index.ts`)

Adicionar logo antes do bloco `<!--RX_JSON_START-->` na seção de contrato:

```
ATENÇÃO CRÍTICA — ANTI-MARKDOWN NO JSON:
- O valor de `nome_formatado` é uma STRING JSON pura. NUNCA inclua os caracteres
  `*` ou `_` dentro dele, mesmo que apareçam no Markdown acima. Strip explícito.
- NUNCA emita `**` como separador (você estava fazendo isso). O ÚNICO separador
  permitido entre concentração e volume é ` – ` (espaço, en-dash, espaço).
- NUNCA use `|` como separador no `nome_formatado`. Apenas espaços e ` – `.
- Antes de fechar o JSON, reler cada `nome_formatado` mentalmente: se contém
  `*`, `_`, `|`, `**`, ou hífen órfão (` – ` no fim), CORRIGIR antes de enviar.
```

E adicionar 1 exemplo de saída do JSON (literal, ASCII puro) bem antes do contrato — Gemini segue exemplos melhor que regras abstratas.

### Garantias

- **Receituários novos:** sidecar parseado com tolerância → `cleanLine` agressivo remove qualquer `*`/`|` residual.
- **Receituários antigos (cache):** fallback regex agora também passa por `cleanLine` reforçado → posologia sem `**` solto.
- **Card de resultado completo:** intocado, sidecar continua invisível.
- **Múltiplos produtos:** sem mudança de comportamento.
- **Zero efeito** em geração, RAG, anexos, prompt clínico, histórico, botões.

### Arquivos

- **Editado:** `src/lib/prescriptionExtract.ts` — `cleanLine` agressivo, `cleanPosologia` que descarta linhas residuais via `stripInlineMarkdown`, `trySidecarParse` tolerante a variações, `appendDetail` aplicando `cleanLine` antes de anexar.
- **Editado:** `supabase/functions/generate-prescription/index.ts` — bloco "ATENÇÃO CRÍTICA — ANTI-MARKDOWN NO JSON" antes do contrato + exemplo literal do JSON.

