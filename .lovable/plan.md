

## Ajustes nos sons e notificações de upload do Receituário+

### Diagnóstico

No `UploadDropzone.tsx`:

1. **Som tocando para prontuário:** `playSfx('upload')` é chamado em `handleUpload` logo após o insert, **sem verificar `kind`** — então toca tanto para catálogo quanto para prontuário.

2. **Som tocando antes do catálogo terminar:** Para PDFs > 5MB, `playSfx('upload')` toca **antes** de `runCatalogProcessing`, que é a parte demorada (página a página). O usuário ouve o som no início, mas o catálogo só fica pronto minutos depois.

3. **Sem aviso para arquivos > 5MB:** Não existe toast informativo sobre demora esperada para PDFs grandes.

### Solução

#### `src/components/dashboard/prescription/UploadDropzone.tsx`

**Mudança 1 — Som apenas para catálogo:** condicionar `playSfx('upload')` a `kind === 'catalog'`.

**Mudança 2 — Som no fim do processamento:**
- **Catálogo PDF ≤ 5MB (modo rápido):** tocar som imediatamente após o update (já é o "fim" do processo).
- **Catálogo PDF > 5MB:** **NÃO** tocar som antes de `runCatalogProcessing`. Tocar som **somente quando o processamento de páginas terminar com sucesso** (`done === true`), dentro de `runCatalogProcessing`, no ramo de sucesso final.
- **Catálogo não-PDF (imagem, doc):** tocar som logo após o insert (não há processamento posterior).

**Mudança 3 — Aviso para arquivos > 5MB:** logo no início de `handleUpload`, após validação, se `file.size > PDF_SMALL_THRESHOLD` (5MB), disparar:
```ts
toast.info('Documento maior que 5MB — o carregamento pode demorar alguns minutos.');
```
Aplicado a **qualquer kind** (catálogo ou prontuário) e **qualquer tipo** de arquivo > 5MB, já que o aviso é sobre tamanho, não sobre tipo.

### Estrutura da mudança em `handleUpload`

```ts
const err = validate(file);
if (err) { toast.error(err); return; }

// Aviso de demora para arquivos > 5MB
if (file.size > PDF_SMALL_THRESHOLD) {
  toast.info('Documento maior que 5MB — o carregamento pode demorar alguns minutos.');
}

setIsUploading(true);
try {
  // ... upload + insert ...
  const uploaded = data as UploadedFile;

  setIsUploading(false);

  if (kind === 'catalog' && isPdf) {
    if (file.size <= PDF_SMALL_THRESHOLD) {
      // modo rápido: terminou aqui → toca som
      await supabase.from('prescription_catalogs').update({...}).eq('id', uploaded.id);
      onChange({...});
      playSfx('upload');  // ✅ catálogo + fim do processo
      toast.success('Catálogo pronto (modo rápido…).');
    } else {
      // PDF grande: NÃO toca aqui, toca dentro de runCatalogProcessing ao concluir
      toast.success('Catálogo enviado. Processando páginas…');
      await runCatalogProcessing(uploaded, 0);
    }
  } else if (kind === 'catalog') {
    // catálogo não-PDF (imagem/doc): terminou no insert
    onChange(uploaded);
    playSfx('upload');  // ✅ catálogo + fim do processo
    toast.success('Catálogo enviado.');
  } else {
    // prontuário: SEM som
    onChange(uploaded);
    toast.success('Prontuário enviado.');
  }
}
```

### Estrutura da mudança em `runCatalogProcessing`

No ramo de sucesso final (quando `done === true`), antes do `toast.success(...)` de "Catálogo pronto":
```ts
} else {
  onChange({...isProcessing: false});
  if (done) {
    playSfx('upload');  // ✅ som toca exatamente quando o catálogo terminou
    toast.success(`Catálogo pronto (${processed} páginas).`);
  }
}
```

**Importante:** o som **não** toca quando o processamento pausa por falha (ramo `if (!done && lastError)`), só no sucesso real.

### Garantias

- **Prontuário:** nunca toca som de upload.
- **Catálogo PDF ≤ 5MB:** som toca uma vez, ao final (que é imediato).
- **Catálogo PDF > 5MB:** som toca uma única vez, quando o contador X/Y chega ao fim e o catálogo está realmente pronto.
- **Catálogo não-PDF:** som toca após upload (que é o fim do processo para esses tipos).
- **Pausa/retomada de processamento:** se pausar por erro, sem som; se retomar e concluir via `handleResume` → `runCatalogProcessing`, som toca normalmente no fim (mesmo caminho).
- **Aviso > 5MB:** toast `info` aparece imediatamente após selecionar o arquivo, antes do upload começar.
- Zero impacto em geração, sidecar, RAG, sanitização.

### Arquivo

- **Editado:** `src/components/dashboard/prescription/UploadDropzone.tsx` — `handleUpload` toca `playSfx` condicionalmente (catálogo + fim do processo); `runCatalogProcessing` toca `playSfx` no sucesso final do batch loop; toast `info` para arquivos > 5MB no início de `handleUpload`.

