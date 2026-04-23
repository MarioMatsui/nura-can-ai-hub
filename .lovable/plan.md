

## Suporte a múltiplos produtos no Resumo Copiável

### Mudança no extrator (`src/lib/prescriptionExtract.ts`)

Trocar a interface e função para retornar **array de pares**:

```ts
export interface PrescriptionItem {
  produto: string;
  posologia: string;
}
export const extractPrescriptionSummary = (text): PrescriptionItem[]
```

**Nova lógica:**
1. Localizar **todas** as ocorrências de `Produto:` no texto (regex global, case-insensitive, tolerante a markdown/bullets/numeração tipo `Produto 1:`, `**Produto:**`, `### Produto`).
2. Para cada ocorrência, definir o **bloco daquele produto** = trecho entre o início desse `Produto:` e o início do próximo `Produto:` (ou fim do texto).
3. Dentro do bloco:
   - **Produto**: aplicar a lógica atual de `extractProduto` (primeira linha após `Produto:`, com prefixação opcional da `Marca:` encontrada **dentro daquele bloco**).
   - **Posologia**: aplicar a lógica atual de `extractPosologia` restrita ao bloco — captura entre `Posologia:` e o próximo cabeçalho conhecido (`Observações`, `Justificativa`, etc.) **dentro do bloco**, mantendo bullets normalizados.
4. Filtrar itens onde ambos `produto` e `posologia` estão vazios.
5. Fallback: se nenhuma ocorrência de `Produto:` for encontrada, retornar `[]`.

Refatorar funções helpers já existentes (`findFieldStart`, `findNextFieldIndex`, `extractProduto`, `extractPosologia`) para aceitarem um sub-trecho/offset, evitando duplicação. Adicionar `findAllFieldStarts(text, 'produto')` que devolve lista de índices.

### Mudança na UI (`PrescriptionView.tsx`)

**1. Estado derivado (linha 56-57):**
```tsx
const summaryItems = useMemo(() => extractPrescriptionSummary(aiResponse), [aiResponse]);
const hasSummary = !!aiResponse && summaryItems.length > 0;
```

**2. Render do bloco (linhas 285-294):**
Renderizar um `Card` por item. Quando há mais de 1 produto, exibir título `Produto 1`, `Produto 2`, etc. Quando há só 1, manter `Produto` / `Posologia` simples (comportamento atual preservado).

```tsx
{hasSummary && (
  <section className="space-y-3">
    <h2 className="text-sm font-medium text-muted-foreground">
      Resumo {summaryItems.length > 1 && `(${summaryItems.length} produtos)`}
    </h2>
    <div className="space-y-3">
      {summaryItems.map((item, idx) => (
        <Card key={idx} className="p-4 md:p-5 space-y-3">
          <SummaryRow
            label={summaryItems.length > 1 ? `Produto ${idx + 1}` : 'Produto'}
            value={item.produto}
            multiline={false}
          />
          <SummaryRow
            label="Posologia"
            value={item.posologia}
            multiline={true}
          />
        </Card>
      ))}
    </div>
  </section>
)}
```

**3. `SummaryRow` (linhas 441+):** sem alterações — cada linha continua com seu próprio botão de copiar e feedback "Copiado!" individual.

### Garantias

- Se o receituário tiver 1 produto → comportamento idêntico ao atual (1 card com Produto + Posologia).
- Se tiver N produtos → N cards independentes, cada um com seu par e seus botões de copiar.
- Continua não tocando em prompts da IA, edge function, histórico, reset ou bloco de resultado completo.
- Continua puramente client-side, recalcula via `useMemo` quando `aiResponse` muda.
- Posologia de cada produto fica **isolada no bloco do seu produto** — evita "vazar" posologia do produto 2 para o resumo do produto 1.

### Arquivos

- **Editado:** `src/lib/prescriptionExtract.ts` — refator para múltiplos produtos, exporta `PrescriptionItem[]`
- **Editado:** `src/components/dashboard/prescription/PrescriptionView.tsx` — `summaryItems` array, render via `.map()`, label dinâmico

