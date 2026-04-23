

## Dois ajustes no Receituário +

### 1. Contador de caracteres na mesma linha do label

**`src/components/dashboard/prescription/PrescriptionView.tsx`** (seção "Observações complementares", linhas ~190-201)

Reestruturar o bloco do label para usar `flex justify-between items-center`, movendo o contador `{observations.length}/1000` para o canto direito da mesma linha do label. Remover a `<div>` separada com o contador que aparece abaixo do textarea.

```tsx
<section className="space-y-2">
  <div className="flex items-center justify-between">
    <label className="text-sm font-medium text-foreground">
      Observações complementares <span className="text-muted-foreground font-normal">(opcional)</span>
    </label>
    <span className="text-xs text-muted-foreground">{observations.length}/1000</span>
  </div>
  <Textarea ... />
</section>
```

Resultado: label à esquerda, contador à direita na mesma linha; textarea limpo abaixo, sem texto interno ou inferior.

### 2. Nome do paciente sempre branco no estado padrão

**`src/components/dashboard/prescription/PrescriptionView.tsx`** (cards do "Histórico recente", linhas ~267-275)

Hoje a classe condicional aplica `text-foreground` no estado padrão. No tema dark `--foreground` já é branco, mas em alguns navegadores/estados (após interação ou foco) a herança pode ficar inconsistente porque o card herda cor do parent quando selecionado/hover muda o pai.

Correção: forçar explicitamente `text-white` no estado padrão do nome do paciente, deixando o hover/selected como `text-black` (já implementado). Mesma regra para garantir que apenas hover e selected mudem para preto, nunca outro estado.

```tsx
<div
  className={cn(
    'text-sm font-medium line-clamp-1 transition-colors',
    isSelected ? 'text-black' : 'text-white group-hover:text-black',
  )}
>
  {item.patient_name || 'Paciente não identificado'}
</div>
```

Os outros textos do card (queixa, data) continuam com `text-muted-foreground` no padrão e `text-black/70` / `text-black/60` no hover/selected — apenas o **nome** vai forçar branco puro.

### Resultado esperado

- Label "Observações complementares (opcional)" à esquerda + "5/1000" à direita, mesma linha. Textarea limpo abaixo.
- Nome do paciente no histórico: **sempre branco** no padrão (independente de estado), **preto** apenas no hover ou quando selecionado.

### Arquivos alterados

- `src/components/dashboard/prescription/PrescriptionView.tsx` (única mudança)

