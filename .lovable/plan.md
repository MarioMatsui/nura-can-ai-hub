

## Padronização clínica do nome do produto no Resumo Copiável

### Problema
O campo "Produto" do Resumo mostra só o nome cru (ex.: "Sensia THC & CBD 1:1") porque:
1. O extrator pega apenas a primeira linha após `Produto:`.
2. O prompt da IA permite que `Concentração` e `Apresentação` venham em campos separados, então o extrator não os agrega.

### Solução — duas frentes coordenadas

#### A) Reforço no prompt (`supabase/functions/generate-prescription/index.ts`)

Adicionar ao `PRESCRIPTION_TASK_LAYER` uma regra explícita de formatação do campo "Produto:" para garantir que a IA já entregue a linha clinicamente completa, mesmo quando descreva os detalhes em subcampos:

```
### REGRA OBRIGATÓRIA — LINHA "Produto:"
Para CADA produto sugerido, a linha imediatamente após "Produto:" DEVE conter o nome
clinicamente completo neste padrão único:

  {Marca} {Nome do Produto} – {Concentração completa} – {Apresentação/Volume}

Regras:
- Se a marca já estiver no nome, NÃO duplicar.
- Concentração: incluir TODOS os fitocanabinoides relevantes do catálogo (CBD, THC,
  CBG, CBN, CBC, THCA, THCV, etc.) no formato "X mg/ml CBD + Y mg/ml THC" ou
  "Xmg CBD + Ymg THC". Se só houver proporção (ex: 1:1), use a proporção.
- Apresentação: sempre incluir volume/quantidade (ex: 30ml, 10g, 30 cápsulas, 30 gummies).
- Use apenas dados presentes no catálogo. Se faltar algum dado, omita-o (NUNCA inventar).
- Sem markdown, sem aspas, sem bullets na linha "Produto:". Texto puro em uma linha só.
- Você pode (e deve) detalhar Concentração, Apresentação e Posologia em subcampos
  abaixo — mas a linha "Produto:" precisa ser auto-suficiente para uso em receita.

Exemplos:
  Produto: Sensia THC & CBD 1:1 Oil Tincture – 10mg/ml THC + 10mg/ml CBD – 30ml
  Produto: UBSuper General Relief Tincture – 50mg/ml CBD + 16mg/ml CBG + 5mg/ml THC – 30ml
  Produto: Elite Live Rosin Blue Dream – THC dominante (Live Rosin) – 1g
```

Esta regra é instrucional — não muda nenhuma outra parte do raciocínio nem o formato Markdown global. O bloco de "Produtos sugeridos" continua existindo; apenas a linha `Produto:` ganha contrato de formato.

#### B) Composição defensiva no extrator (`src/lib/prescriptionExtract.ts`)

Mesmo com o prompt reforçado, o extrator passa a ser **resiliente**: se a IA emitir o nome curto e detalhar em subcampos, a UI ainda monta a string clínica completa.

Em `extractProdutoFromBlock`, após extrair `marca + nome` (lógica atual), buscar dentro do mesmo bloco:
- `Concentração:` / `Concentracao:` → primeira linha após o rótulo, limpa de markdown/bullets
- `Apresentação:` / `Apresentacao:` (ou `Volume:`) → primeira linha após o rótulo

Compor: `{nome} – {concentração} – {apresentação}` usando `–` (en dash) como separador. Pular partes vazias. Deduplicar: se a string base já contiver a concentração ou a apresentação (case-insensitive substring), não anexar de novo.

Resultado: linha única, sem markdown, sem bullets, pronta pra copiar.

#### C) UI (`src/components/dashboard/prescription/PrescriptionView.tsx`)

Adicionar `title={item.produto}` no `Input` do `SummaryRow` quando `multiline=false` para tooltip do nome completo (já é readonly e ocupa uma linha — ellipsis natural do input). Nenhuma outra mudança de layout.

### Garantias

- Receituários antigos (cache no banco) continuam abrindo: o extrator faz fallback à lógica atual quando os subcampos não existem.
- Nada muda no bloco do receituário completo (markdown integral preservado).
- Botão de copiar continua funcionando — agora copia a string clínica completa.
- Múltiplos produtos: cada bloco compõe sua própria linha independentemente (já suportado).

### Arquivos

- **Editado:** `supabase/functions/generate-prescription/index.ts` — adicionar regra de formato da linha `Produto:` em `PRESCRIPTION_TASK_LAYER`.
- **Editado:** `src/lib/prescriptionExtract.ts` — em `extractProdutoFromBlock`, buscar `Concentração` e `Apresentação` no bloco e compor `{nome} – {concentração} – {apresentação}` com deduplicação.
- **Editado:** `src/components/dashboard/prescription/PrescriptionView.tsx` — atributo `title` no input de produto para tooltip com nome completo.

