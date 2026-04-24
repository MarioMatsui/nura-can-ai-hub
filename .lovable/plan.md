

## Mostrar o contador de páginas (X/Y) dentro do bloco de upload durante todo o processamento

### Diagnóstico

O contador **já existe** e já é atualizado a cada página processada (via `runCatalogProcessing` que faz `onChange({ ...uploaded, pages_count, total_pages })` a cada checkpoint do backend).

O problema é puramente de **renderização condicional** no `UploadDropzone.tsx`:

No JSX atual, a checagem é feita nesta ordem:
1. `if (isUploading)` → mostra só "Enviando…" sem contador
2. `else if (isProcessing)` → mostra "Processando páginas do catálogo (X/Y)" **com contador**
3. `else if (value)` → bloco com nome do arquivo

Mas em `handleUpload`, o `setIsUploading(false)` só dispara no `finally` — **depois** do `await runCatalogProcessing(...)` terminar (que pode levar minutos).

Resultado: durante todo o processamento, `isUploading=true` E `isProcessing=true`, mas como o `if` checa `isUploading` primeiro, o usuário vê apenas **"Enviando…"** sem contador, e o bloco com X/Y **nunca é renderizado**.

### Solução

#### `src/components/dashboard/prescription/UploadDropzone.tsx`

**Mudança única:** desligar `setIsUploading(false)` **assim que o upload de arquivo + insert no banco terminam**, antes de chamar `runCatalogProcessing`. Assim a UI transita naturalmente para o bloco "Processando páginas do catálogo (X/Y)" que **já existe** e já tem o contador funcionando.

Estrutura do `handleUpload`:
```ts
try {
  // ... upload no storage + insert no banco ...
  const uploaded = data as UploadedFile;
  playSfx('upload');

  // ✅ Upload terminou. Liberar isUploading ANTES de processar páginas
  // para que a UI mostre o bloco de progresso com contador X/Y.
  setIsUploading(false);

  if (kind === 'catalog' && isPdf) {
    if (file.size <= PDF_SMALL_THRESHOLD) {
      // modo rápido — sem mudança
    } else {
      toast.success('Catálogo enviado. Processando páginas…');
      await runCatalogProcessing(uploaded, 0);
      // runCatalogProcessing já gerencia isProcessing + atualiza pages_count
    }
  } else {
    onChange(uploaded);
    toast.success(...);
  }
} catch (e: any) {
  console.error('Upload error', e);
  toast.error(e?.message || 'Falha no upload.');
  setIsUploading(false); // salvaguarda em erro
}
// remover setIsUploading(false) do finally — já foi feito acima
```

O bloco que já existe (e que vai passar a aparecer) renderiza:
```
[spinner] Enviando…
Processando páginas do catálogo (12/85)   ← contador em negrito atualiza ao vivo
Isso pode levar alguns segundos.
```

### O que o usuário verá

- **Logo após selecionar o arquivo:** "Enviando…" (segundos)
- **Assim que o arquivo sobe:** transição imediata para o bloco com o nome do arquivo + spinner + **"Processando páginas do catálogo (X/Y)"** atualizando página a página
- **Ao terminar:** bloco final com nome do arquivo, "85 páginas prontas" e botões Salvar/Remover

### Garantias

- **PDFs ≤ 5MB (modo rápido):** sem efeito — vai direto pro estado final.
- **PDFs > 5MB:** contador X/Y fica visível durante todo o processamento, atualizando a cada página salva no checkpoint do backend.
- **Botão "Continuar processamento"** (retomada após pausa): já funciona via `setIsProcessing(true)`, sem efeito colateral.
- **Erros de upload:** `setIsUploading(false)` no catch garante que a UI não trava.
- Zero impacto em prontuário, geração, sidecar, sanitização, RAG.

### Arquivo

- **Editado:** `src/components/dashboard/prescription/UploadDropzone.tsx` — `handleUpload` libera `setIsUploading(false)` imediatamente após o insert no banco (antes de `runCatalogProcessing`), com salvaguarda no `catch`. Remove o `setIsUploading(false)` do `finally`.

