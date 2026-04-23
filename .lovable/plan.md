

## Ajustes UI/UX no módulo Receituário +

### 1. Botão "Receituário +" na sidebar (`ChatSidebar.tsx`)

- Centralizar texto: trocar `justify-start` por `justify-center` no botão expandido (linha 180), mantendo coerência com "Nova Consulta" e "Buscar em chats".
- Estado ativo em preto: hoje só aplica `bg-accent`. Adicionar `dark:text-black text-black` quando `activeView === 'prescription'` para que texto + ícone fiquem pretos no estado selecionado (mesmo padrão dos itens de conversa).
- Mover o ícone `<Lock>` para fora da centralização (manter `ml-auto`) só quando bloqueado.

### 2. Contador de páginas dentro do quadro de upload (`UploadDropzone.tsx`)

Hoje a mensagem `"Processando páginas do catálogo (x/y)…"` aparece **fora do dropzone**, dentro do `PrescriptionView` na seção do botão. Mover para dentro do dropzone, no estado `isUploading`:

- Quando `isUploading === true` E `kind === 'catalog'` E houver progresso de páginas conhecido (via `value?.pages_count` / `value?.total_pages`), renderizar abaixo de "Enviando…":
  ```
  Enviando…
  Processando páginas do catálogo (x/y)   ← negrito (font-bold)
  ```
- Como o progresso do catálogo só existe **após** o insert (durante `runCatalogProcessing`, `isUploading` já é false e cai no branch `isProcessing`), na prática a linha em negrito vai aparecer no branch `isProcessing` (que já mostra "Processando páginas (x/y)…"). Ajuste: trocar esse texto por **dois níveis** dentro do mesmo bloco:
  - "Enviando…" (label superior)
  - "Processando páginas do catálogo (x/y)" em **negrito** (`font-bold text-foreground`)
- Remover do `PrescriptionView.tsx` o parágrafo `"Processando páginas do catálogo (x/y)…"` que aparece sob o botão "Gerar Receituário" (linhas 174-182), substituindo por mensagem genérica apenas quando faltar arquivo.

### 3. Efeitos sonoros (SFX)

Criar utilitário `src/lib/sfx.ts` com cache de `HTMLAudioElement` por arquivo (evita recriar a cada call) e debounce de 300ms para evitar disparo duplo:

```ts
import uploadFoi from '@/assets/uploadFoi.wav';
import receitaFoi from '@/assets/receitaFoi.mp3';

const cache = new Map<string, HTMLAudioElement>();
const lastPlay = new Map<string, number>();

export function playSfx(name: 'upload' | 'receita') {
  const src = name === 'upload' ? uploadFoi : receitaFoi;
  const now = Date.now();
  if ((now - (lastPlay.get(name) ?? 0)) < 300) return;
  lastPlay.set(name, now);
  let audio = cache.get(name);
  if (!audio) { audio = new Audio(src); audio.preload = 'auto'; cache.set(name, audio); }
  audio.currentTime = 0;
  audio.volume = 0.6;
  audio.play().catch(() => {}); // silencia bloqueios de autoplay
}
```

Triggers:
- **`UploadDropzone.tsx` → `handleUpload`**: chamar `playSfx('upload')` **dentro do bloco try, após o `insertError` validado** (linha ~265, logo após `const uploaded = data as UploadedFile`). Isso garante que toca **APENAS** em upload novo bem-sucedido, **não** quando o usuário clica em "Usar" no `SavedCatalogs` (que só chama `onChange`/`onUse`, não passa por `handleUpload`).
- **`PrescriptionView.tsx` → `handleGenerate`**: chamar `playSfx('receita')` logo após `setAiResponse(payload?.response || '')` quando `payload?.response` for truthy (linha ~88). Debounce no util já previne duplicação se o usuário clicar duas vezes.

### 4. Histórico recente — texto preto no hover/selected (`PrescriptionView.tsx`)

Bloco do "Histórico recente" (linhas ~213-238) já é uma `<button>` com `hover:bg-accent`. Adicionar:
- Estado local `selectedHistoryId` que recebe o `item.id` no `openHistoryItem`.
- Classes condicionais: `hover:text-black dark:hover:text-black` no botão + `selectedHistoryId === item.id && 'bg-accent text-black dark:text-black'`.
- Aplicar a regra a todos os `div`s internos (nome, queixa, data) com `group-hover:text-black/70` para legibilidade.

### 5. Exclusão de item do histórico (`PrescriptionView.tsx`)

- Adicionar ícone `<X>` (lucide) absolutamente posicionado no canto superior direito do card, visível só em `group-hover` (`opacity-0 group-hover:opacity-100`).
- Adicionar a classe `group` ao card e mudar de `<button>` para `<div role="button">` para permitir botão filho clicável.
- Estado `historyToDelete: string | null` + `AlertDialog` reutilizando o padrão já existente em `ChatSidebar`:
  - Título: "Confirmar exclusão"
  - Descrição: "Tem certeza que deseja excluir? Esta ação não pode ser desfeita."
  - Confirm: `await supabase.from('prescription_results').delete().eq('id', id)` → `setHistory(prev => prev.filter(h => h.id !== id))` + `toast.success('Receituário removido.')`.
- RLS já permite delete pelo dono (`Users can delete own results`), nenhuma migration necessária.

### 6. Nome do usuário no canto inferior — preto no hover (`UserProfileHeader.tsx`)

No botão expandido (linha 177), adicionar à `<div>` com `font-medium text-sm truncate` (linha 183) a classe `group-hover:text-black dark:group-hover:text-black transition-colors`. O wrapper `<button>` já tem `group` implícito via Tailwind — adicionar `group` explicitamente se faltar. Aplicar também ao subtítulo do plano (`group-hover:text-black/70`).

### Memória

Atualizar `mem://features/prescription-engine` registrando: SFX em upload novo (uploadFoi.wav) e em receituário gerado (receitaFoi.mp3); contador de páginas dentro do dropzone em negrito; exclusão de histórico via DELETE em prescription_results.

### Arquivos alterados

- `src/lib/sfx.ts` (novo)
- `src/components/dashboard/ChatSidebar.tsx` (botão Receituário centralizado + ativo preto)
- `src/components/dashboard/prescription/UploadDropzone.tsx` (contador em negrito + SFX upload)
- `src/components/dashboard/prescription/PrescriptionView.tsx` (remover contador antigo + SFX receita + hover/selected preto + exclusão de histórico com modal)
- `src/components/dashboard/UserProfileHeader.tsx` (nome preto no hover)
- `mem://features/prescription-engine` (atualização de regras)

