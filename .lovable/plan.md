

## Novo bloco "Resumo Copiável" no Receituário +

### Posicionamento
Inserir entre os botões de ação e o `Card` com o resultado completo (entre as `<section>` das linhas ~241-278 e a `<section>` do response na linha ~281 em `PrescriptionView.tsx`).

### Estrutura visual
- Container com 2 linhas (Produto + Posologia)
- Cada linha: label à esquerda (largura fixa ~120px no desktop, full width mobile) + campo readonly + botão copiar
- Campo `Produto`: input readonly de uma linha
- Campo `Posologia`: textarea readonly multilinha (auto-altura ou min-height)
- Visível apenas quando `aiResponse` tem conteúdo (mesma condição de exibição que faz sentido)

### Lógica de extração

Criar utilitário `extractPrescriptionSummary(text: string): { produto: string; posologia: string }` em arquivo novo `src/lib/prescriptionExtract.ts`:

**Produto:**
- Regex: localizar primeira ocorrência de `Produto:` (case-insensitive, ignorando `**Produto:**` markdown)
- Capturar texto até primeira quebra de linha dupla, próximo campo conhecido (`Posologia:`, `Marca:`, `Concentração:`, `Indicação:`) ou fim
- Tentar capturar também `Marca:` próximo (até 5 linhas antes/depois) para compor `{marca} + {produto}` se a marca não estiver já contida no nome
- Limpar: remover markdown (`**`, `*`, `-`, `•`), prefixos, espaços extras, quebras múltiplas
- Resultado: linha única limpa

**Posologia:**
- Regex: localizar `Posologia:` (case-insensitive, com/sem markdown)
- Capturar até próximo cabeçalho conhecido (`Observações:`, `Justificativa:`, `Contraindicações:`, `Acompanhamento:`, headings markdown `##`, `###`) ou fim do texto
- Limpar markdown bold/italic mas **manter bullets** (`- `, `• `, `* ` no início de linha → normalizar para `• `)
- Preservar quebras de linha entre itens

### UI

Novo subcomponente inline (ou pequeno componente) dentro do `PrescriptionView`:

```tsx
{aiResponse && (summary.produto || summary.posologia) && (
  <section className="space-y-3">
    <h2 className="text-sm font-medium text-muted-foreground">Resumo</h2>
    <Card className="p-4 md:p-5 space-y-3">
      <SummaryRow label="Produto" value={summary.produto} multiline={false} />
      <SummaryRow label="Posologia" value={summary.posologia} multiline={true} />
    </Card>
  </section>
)}
```

`SummaryRow`:
- Layout `flex flex-col md:flex-row md:items-start gap-2 md:gap-4`
- Label: `md:w-24 text-sm font-medium text-foreground`
- Wrapper do campo: `relative flex-1`
- Campo readonly: `Input` (single) ou `Textarea` (multi) com `pr-10` para o botão
- Botão copiar: `absolute top-2 right-2`, ghost size sm, ícone `Copy`/`Check`, feedback "Copiado!" por 2s (estado local por linha)

### Estado e atualização

```ts
const summary = useMemo(
  () => extractPrescriptionSummary(aiResponse),
  [aiResponse]
);
```

Sempre que `aiResponse` mudar (nova geração ou abertura de item do histórico), o `useMemo` recalcula. Se ambos vierem vazios, o bloco não renderiza.

### Garantias
- Não toca em `handleGenerate`, prompts da edge function, nem no `Card` de resultado existente
- Não altera o histórico nem o reset (`handleNewPrescription` já zera `aiResponse`, então o resumo some junto)
- Extração é puramente client-side sobre o texto já gerado

### Arquivos
- **Novo:** `src/lib/prescriptionExtract.ts` — função de extração + testes manuais cobertos via regex robusto
- **Editado:** `src/components/dashboard/prescription/PrescriptionView.tsx` — import, `useMemo`, novo bloco entre botões e resultado, subcomponente `SummaryRow` interno

