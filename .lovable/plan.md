

## Ajustes finais no Receituário +

### 1. Remover "Pronto para uso (modo rápido)"

**`src/components/dashboard/prescription/UploadDropzone.tsx`** (linha 460)

Remover por completo o bloco condicional que renderiza:
```tsx
<div className="text-xs text-primary font-medium">✓ Pronto para uso (modo rápido)</div>
```
Esse texto não aparecerá em nenhum estado (catálogo recém-enviado nem catálogo salvo reutilizado).

### 2. Botão "Novo Receituário" ao lado de "Gerar Receituário"

**`src/components/dashboard/prescription/PrescriptionView.tsx`** (seção Action, linhas 228–253)

- Envolver os dois botões em um wrapper `flex flex-col md:flex-row gap-3 md:items-center` para alinhamento horizontal no desktop e empilhado no mobile.
- O botão "Gerar Receituário" mantém o estilo atual (primary, destaque forte).
- Adicionar à direita um novo `<Button variant="outline" size="lg">` com ícone `<RotateCcw />` (lucide) + texto **"Novo Receituário"** — menor peso visual, coerente com o design system existente.
- O botão "Novo Receituário" fica **desabilitado durante `isGenerating`** para evitar reset no meio da requisição.
- O botão fica **sempre visível** (não depende de ter resposta gerada) — assim o usuário pode descartar inputs rapidamente também antes de gerar.

### 3. Comportamento do reset

Adicionar handler `handleNewPrescription` em `PrescriptionView.tsx` que limpa exclusivamente o estado local da tela:

```ts
const handleNewPrescription = () => {
  setCatalog(null);
  setRecord(null);
  setObservations('');
  setAiResponse('');
  setSelectedHistoryId(null);
  setCopied(false);
  window.scrollTo({ top: 0, behavior: 'smooth' });
};
```

Garantias:
- **Não recarrega a página** (sem `window.location.reload`).
- **Não toca em dados persistidos**: catálogos salvos (`prescription_catalogs`), histórico (`prescription_results`) e arquivos no storage permanecem intactos. O reset só zera os `useState` locais.
- **Não dispara DELETE** no banco — apenas desvincula do estado os IDs atualmente selecionados.
- Limpa também `selectedHistoryId` para que, se o usuário estava visualizando um item antigo, o card do histórico volte ao estado neutro — reforçando a leitura de "novo fluxo, novos parâmetros, novo resultado, novo histórico" (o próximo `handleGenerate` criará um registro novo em `prescription_results`, como já acontece hoje).
- Scroll para o topo para reforçar visualmente que um novo fluxo começou.

### Resultado esperado

- Texto "Pronto para uso (modo rápido)" eliminado de todos os estados do dropzone.
- Dois botões lado a lado: "Gerar Receituário" (primary) à esquerda, "Novo Receituário" (outline com ícone de reset) à direita.
- Clique em "Novo Receituário" devolve a tela ao estado inicial em milissegundos, sem afetar histórico nem catálogos salvos, e o usuário pode iniciar imediatamente um novo fluxo que gerará uma nova entrada no histórico.

### Arquivos alterados

- `src/components/dashboard/prescription/UploadDropzone.tsx` (remover bloco "Pronto para uso")
- `src/components/dashboard/prescription/PrescriptionView.tsx` (wrapper flex + botão "Novo Receituário" + handler de reset)

