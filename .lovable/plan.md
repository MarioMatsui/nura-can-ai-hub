

## Saída estruturada via JSON sidecar — Produto + Posologia confiáveis

### Diagnóstico
O fluxo atual depende 100% de regex no Markdown gerado pela IA. Mesmo com o reforço de prompt, o modelo às vezes:
- Quebra o padrão da linha `Produto:` (deixa só "Terapia Basal", joga `**` no meio, omite concentração)
- Detalha posologia em blocos longos que o regex pega parcialmente ou perde quando o título não é exatamente `Posologia:`
- Lista subcampos (`Apresentação`, `Concentração`) em qualquer ordem

A correção sólida é **trocar parsing por contrato estruturado**: a IA passa a devolver um JSON sidecar com `nome_formatado` + `posologia` para cada produto, e o front consome **apenas** esse JSON.

### Estratégia: bloco JSON sidecar no fim da resposta

A IA continua produzindo o receituário Markdown completo (zero impacto no card de resultado). Logo no **fim** da mensagem, ela anexa um bloco delimitado:

```
<!--RX_JSON_START-->
```json
{
  "produtos": [
    {
      "nome_formatado": "Canfy Óleo de Cannabis Full Spectrum 1500mg (50mg/ml) – 30ml",
      "posologia": "- Iniciar com 2 gotas sublinguais à noite por 3-4 dias\n- Após tolerância, adicionar 2 gotas pela manhã\n- Aumentar 1 gota por tomada a cada 3-5 dias até controle da dor"
    }
  ]
}
```
<!--RX_JSON_END-->
```

Vantagens:
- Mantém Markdown intocado para o card de resultado (`MarkdownMessage` ignora comentários HTML).
- Separa render do contrato de dados.
- O front extrai o JSON com 1 regex trivial — sem ambiguidade.
- Posologia preservada literalmente no JSON (a IA copia do bloco textual que ela mesma produziu, não reescreve).
- Robusto a múltiplos produtos: sempre 1 array, sempre 1 par `nome_formatado`+`posologia` por item.

### Mudanças

#### 1) `supabase/functions/generate-prescription/index.ts`

**A. Substituir `### REGRA OBRIGATÓRIA — LINHA "Produto:"` por uma seção mais forte ao final do `PRESCRIPTION_TASK_LAYER`:**

```
### CONTRATO DE SAÍDA — BLOCO JSON OBRIGATÓRIO NO FINAL

Após terminar todo o receituário em Markdown (incluindo "Aviso" final), você DEVE anexar — sempre na última linha — um bloco oculto exatamente neste formato:

<!--RX_JSON_START-->
```json
{
  "produtos": [
    {
      "nome_formatado": "string",
      "posologia": "string"
    }
  ]
}
```
<!--RX_JSON_END-->

REGRAS DO `nome_formatado` (campo gerado por VOCÊ):
- Pipeline interno: extraia `marca`, `nome_produto`, `concentracao`, `volume` do catálogo. Depois monte:
  `{marca} {nome_produto} {concentracao} – {volume}` (separadores: espaço entre marca/nome/concentração; ` – ` antes do volume).
- Ordem fixa. Omitir partes ausentes sem quebrar a estrutura (sem hífens órfãos).
- Se a marca já estiver no nome, NÃO duplicar.
- Concentração inclui TODOS os fitocanabinoides relevantes (CBD, THC, CBG, CBN, CBC, THCA, THCV) no formato `Xmg/ml CBD + Ymg/ml THC` ou `Xmg CBD total`. Se só houver proporção, use a proporção.
- Volume: sempre incluir quantidade física (`30ml`, `10g`, `30 cápsulas`, `30 gummies`, `1g`).
- PROIBIDO: termos genéricos ("terapia basal", "tratamento", "uso oral", "adjuvante"), descrições clínicas, frases longas, markdown (`**`, `*`, bullets), aspas, quebras de linha. UMA linha limpa.
- NUNCA inventar dados — se faltar, omita.

REGRAS DA `posologia` (campo EXTRAÍDO, não gerado):
- Copie LITERALMENTE o bloco de posologia que você escreveu para AQUELE produto no Markdown acima.
- Mantenha bullets se existirem (use `- ` no início de cada item).
- Preserve quebras de linha entre itens (use `\n` no JSON).
- Não resuma, não reescreva, não simplifique.
- Permitido apenas: remover `**` markdown e ajustes mínimos de espaço.
- Se realmente não houver posologia identificável para o produto (raríssimo), retorne `""`.

REGRAS DE CONSISTÊNCIA:
- Ordem do array = ordem em que os produtos aparecem no Markdown.
- 1 produto no Markdown = 1 entrada no array. Nunca mais, nunca menos.
- Cada `posologia` pertence ao seu produto correspondente — nunca misturar instruções.

VALIDAÇÃO ANTES DE ENVIAR:
- `nome_formatado` contém o nome real (não termo genérico).
- Concentração presente quando o catálogo informa.
- Posologia capturada quando existe no Markdown.
- Sem `**`, sem markdown, sem aspas internas escapadas erroneamente.
- JSON válido e parseável.

Esse bloco JSON é INVISÍVEL ao usuário (vai dentro de comentário HTML). Não é opcional.
```

**B. Validação leve no backend** (logo após receber `aiText`, antes de salvar):

```ts
// Best-effort: tenta parsear o sidecar para log/observabilidade.
// Se falhar, NÃO bloqueia — front tem fallback regex.
function tryParseSidecar(text: string): { produtos: any[] } | null {
  const m = text.match(/<!--RX_JSON_START-->\s*```json\s*([\s\S]*?)\s*```\s*<!--RX_JSON_END-->/);
  if (!m) return null;
  try { return JSON.parse(m[1]); } catch { return null; }
}
const sidecar = tryParseSidecar(aiText);
console.log(`- sidecar JSON: ${sidecar ? `${sidecar.produtos?.length || 0} produtos` : 'AUSENTE'}`);
```

Sem retry, sem reprompt — apenas observabilidade. Front é resiliente.

**Não tocar:** RAG, anexos multimodais, modelo, max_tokens, fluxo de salvamento.

#### 2) `src/lib/prescriptionExtract.ts`

Reescrever o módulo mantendo a mesma assinatura pública (`extractPrescriptionSummary(text) → PrescriptionItem[]`) para zero impacto em quem importa:

```ts
export interface PrescriptionItem {
  produto: string;
  posologia: string;
}

const SIDECAR_RE = /<!--RX_JSON_START-->\s*```json\s*([\s\S]*?)\s*```\s*<!--RX_JSON_END-->/;

const cleanLine = (s: string): string =>
  String(s ?? '')
    .replace(/\*\*/g, '')
    .replace(/[`*_]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

const cleanPosologia = (s: string): string =>
  String(s ?? '')
    .replace(/\*\*/g, '')
    .split('\n')
    .map((l) => l.replace(/\s+$/g, ''))
    .join('\n')
    .trim();

export const extractPrescriptionSummary = (text: string | null | undefined): PrescriptionItem[] => {
  if (!text || typeof text !== 'string') return [];

  // 1) CAMINHO PREFERIDO: sidecar JSON
  const m = text.match(SIDECAR_RE);
  if (m) {
    try {
      const parsed = JSON.parse(m[1]);
      const arr = Array.isArray(parsed?.produtos) ? parsed.produtos : [];
      const items: PrescriptionItem[] = arr
        .map((p: any) => ({
          produto: cleanLine(p?.nome_formatado),
          posologia: cleanPosologia(p?.posologia),
        }))
        .filter((it) => it.produto || it.posologia);
      if (items.length > 0) return items;
    } catch {
      // cai pro fallback
    }
  }

  // 2) FALLBACK: regex antigo (retrocompatibilidade com receituários históricos sem sidecar)
  return extractFromMarkdownLegacy(text);
};
```

Mover toda a lógica regex atual para `extractFromMarkdownLegacy` (mesma função, renomeada). Receituários antigos no histórico continuam abrindo normalmente.

#### 3) `src/components/dashboard/MarkdownMessage.tsx` — esconder o sidecar do render

Verificar e adicionar (se necessário) um pre-processamento que strippa o bloco antes de passar pro `react-markdown`:

```ts
const visible = content.replace(/<!--RX_JSON_START-->[\s\S]*?<!--RX_JSON_END-->/g, '').trimEnd();
```

Comentários HTML normalmente já são ignorados pelo `react-markdown`, mas o conteúdo dentro deles (o `\`\`\`json`) **não é** — ficaria visível como bloco de código. Esse strip garante invisibilidade total.

#### 4) `src/components/dashboard/prescription/PrescriptionView.tsx`

Sem mudanças — já consome `extractPrescriptionSummary(aiResponse)` via `useMemo`. O contrato externo está preservado.

### Garantias

- **Card de resultado (Markdown):** intocado. Sidecar invisível.
- **Resumo Copiável:** passa a usar dados estruturados — fim do parsing impreciso.
- **Múltiplos produtos:** array nativo, ordem preservada, sem cruzamento de posologias.
- **Receituários antigos no histórico:** abrem via fallback regex (lógica atual preservada como `extractFromMarkdownLegacy`).
- **Falha silenciosa:** se a IA esquecer o sidecar (improvável dado o contrato explícito), o fallback regex assume — usuário nunca vê tela vazia.
- **Botões de copiar, "Novo Receituário", histórico, geração:** zero impacto.

### Arquivos

- **Editado:** `supabase/functions/generate-prescription/index.ts` — substituir a regra "LINHA Produto:" pela seção "CONTRATO DE SAÍDA — BLOCO JSON OBRIGATÓRIO" + log de observabilidade do sidecar.
- **Editado:** `src/lib/prescriptionExtract.ts` — caminho primário via JSON sidecar; lógica regex atual preservada como fallback (`extractFromMarkdownLegacy`).
- **Editado:** `src/components/dashboard/MarkdownMessage.tsx` — strip do bloco `<!--RX_JSON_START-->...<!--RX_JSON_END-->` antes do render.

