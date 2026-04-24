

## Adicionar aviso ao lado do título "Resumo"

### Mudança

Em `src/components/dashboard/prescription/PrescriptionView.tsx` (linhas 398–401), transformar o título `Resumo` em um header flex com duas extremidades:

- **Esquerda:** `Resumo` (com a contagem de produtos quando houver mais de 1) — texto atual preservado.
- **Direita:** `Sempre cheque o nome dos produtos e das marcas antes de concluir a receita.` — em `text-xs text-muted-foreground italic`, alinhado à direita.

Estrutura:
```tsx
<div className="flex items-start justify-between gap-4 flex-wrap">
  <h2 className="text-sm font-medium text-muted-foreground">
    Resumo{summaryItems.length > 1 ? ` (${summaryItems.length} produtos)` : ''}
  </h2>
  <p className="text-xs text-muted-foreground italic text-right max-w-xs">
    Sempre cheque o nome dos produtos e das marcas antes de concluir a receita.
  </p>
</div>
```

### Garantias

- **Desktop:** título à esquerda, aviso à direita na mesma linha.
- **Mobile:** `flex-wrap` faz o aviso quebrar para baixo se faltar espaço, sem cortar texto.
- **Zero impacto** no conteúdo dos cards de Produto/Posologia, no copy do botão Copiar, ou em qualquer outra seção.

### Arquivo

- **Editado:** `src/components/dashboard/prescription/PrescriptionView.tsx` — linhas 398–401, header da seção Resumo.

