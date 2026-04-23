import { useCallback, useRef, useState } from 'react';
import { Upload, FileText, X, Loader2, PlayCircle, Bookmark, BookmarkCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { playSfx } from '@/lib/sfx';

const ACCEPTED_TYPES = [
  'application/pdf',
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
  'text/plain',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
];

const ACCEPTED_EXT = '.pdf,.jpg,.jpeg,.png,.webp,.txt,.doc,.docx';
const MAX_SIZE = 10 * 1024 * 1024; // 10MB

// Pipeline condicional: PDFs ≤ 5MB pulam a renderização página-por-página
// (process-catalog-pdf) e vão direto pro Gemini Pro como inline base64.
// Acima disso, mantém o pipeline atual de rasterização incremental.
const PDF_SMALL_THRESHOLD = 5 * 1024 * 1024; // 5MB

const MAX_RETRIES_PER_BATCH = 3;
const RETRY_DELAY_MS = 1500;

const sleep = (ms: number) => new Promise((res) => setTimeout(res, ms));

export interface UploadedFile {
  id: string;
  file_name: string;
  file_path: string;
  file_type: string;
  /** Para catálogos: quantas páginas PNG já foram pré-renderizadas */
  pages_count?: number;
  /** Total de páginas do PDF (conhecido após o primeiro batch) */
  total_pages?: number;
  /** Para catálogos PDF: indica que o backend ainda está renderizando as páginas */
  isProcessing?: boolean;
  /** Para catálogos PDF ≤ 5MB: pulou a renderização página-por-página (modo rápido). */
  skipPageRender?: boolean;
}

interface UploadDropzoneProps {
  kind: 'catalog' | 'record';
  userId: string;
  value: UploadedFile | null;
  onChange: (file: UploadedFile | null) => void;
  label: string;
  description: string;
  /** Para catálogos: callback chamado quando o usuário salva o catálogo como favorito. */
  onSaved?: () => void;
  /** Para catálogos: indica se o catálogo atual já está na lista de salvos do usuário. */
  isSaved?: boolean;
  /** Para catálogos: indica se o limite de salvos foi atingido (3). */
  savedLimitReached?: boolean;
}

export const UploadDropzone = ({
  kind,
  userId,
  value,
  onChange,
  label,
  description,
  onSaved,
  isSaved = false,
  savedLimitReached = false,
}: UploadDropzoneProps) => {
  const [isDragOver, setIsDragOver] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const validate = (file: File): string | null => {
    if (file.size > MAX_SIZE) return 'Arquivo excede 10MB.';
    const ext = file.name.toLowerCase().split('.').pop() || '';
    const validExts = ['pdf', 'jpg', 'jpeg', 'png', 'webp', 'txt', 'doc', 'docx'];
    if (!validExts.includes(ext) && !ACCEPTED_TYPES.includes(file.type)) {
      return 'Formato não suportado. Use PDF, imagem ou documento.';
    }
    return null;
  };

  /** Lê o progresso atual do catálogo direto do banco. */
  const fetchCatalogProgress = useCallback(
    async (catalogId: string): Promise<{ pages_count: number; total_pages: number }> => {
      const { data, error } = await supabase
        .from('prescription_catalogs')
        .select('extracted_metadata')
        .eq('id', catalogId)
        .single();
      if (error || !data) return { pages_count: 0, total_pages: 0 };
      const meta = (data.extracted_metadata as any) || {};
      return {
        pages_count: Number(meta.pages_count ?? (Array.isArray(meta.pages) ? meta.pages.length : 0)) || 0,
        total_pages: Number(meta.total_pages ?? 0) || 0,
      };
    },
    [],
  );

  /** Loop reentrante de processamento do catálogo PDF, com retry por batch. */
  const runCatalogProcessing = useCallback(
    async (uploaded: UploadedFile, initialStartPage: number) => {
      setIsProcessing(true);
      onChange({ ...uploaded, isProcessing: true, pages_count: initialStartPage });

      let startPage = initialStartPage;
      let processed = initialStartPage;
      let total = uploaded.total_pages ?? 0;
      let done = false;
      let lastError: any = null;

      try {
        while (!done) {
          let attempt = 0;
          let batchOk = false;

          while (attempt < MAX_RETRIES_PER_BATCH && !batchOk) {
            attempt++;
            const { data: procData, error: procError } = await supabase.functions.invoke(
              'process-catalog-pdf',
              { body: { catalogId: uploaded.id, startPage, batchSize: 1 } },
            );

            const r = procData as any;
            const hasError = !!procError || !!r?.error;

            if (!hasError && r) {
              processed = r?.processed ?? processed;
              total = r?.total ?? total;
              done = !!r?.done;
              startPage = r?.next_page ?? (startPage + 1);
              batchOk = true;
              lastError = null;

              onChange({
                ...uploaded,
                pages_count: processed,
                total_pages: total,
                isProcessing: !done,
              });

              if (done) break;
              if (r?.next_page != null && r.next_page <= 0) {
                done = true;
                break;
              }
            } else {
              lastError = procError || r;
              // Antes de retentar, sincroniza progresso com o banco — o backend
              // pode ter salvo checkpoint mesmo com a resposta HTTP falhando.
              await sleep(RETRY_DELAY_MS);
              const fresh = await fetchCatalogProgress(uploaded.id);
              if (fresh.total_pages > 0) total = fresh.total_pages;
              if (fresh.pages_count > processed) {
                processed = fresh.pages_count;
                startPage = fresh.pages_count;
                onChange({
                  ...uploaded,
                  pages_count: processed,
                  total_pages: total,
                  isProcessing: true,
                });
                // Se o banco já mostra concluído, encerra.
                if (total > 0 && processed >= total) {
                  done = true;
                  batchOk = true;
                  break;
                }
              }
            }
          }

          if (!batchOk) {
            // Esgotou retries deste batch — pausa o loop, preserva progresso.
            break;
          }
        }

        if (!done && lastError) {
          const detail =
            lastError?.context?.message
            || lastError?.context?.error
            || lastError?.message
            || (typeof lastError === 'string' ? lastError : '');
          const progressMsg = total > 0
            ? `Processamento pausado em ${processed}/${total} páginas.`
            : 'Falha ao processar páginas do catálogo.';
          toast.error(
            detail
              ? `${progressMsg} Clique em "Continuar processamento" para retomar. (${detail})`
              : `${progressMsg} Clique em "Continuar processamento" para retomar.`,
          );
          onChange({
            ...uploaded,
            pages_count: processed,
            total_pages: total,
            isProcessing: false,
          });
        } else {
          onChange({
            ...uploaded,
            pages_count: processed,
            total_pages: total,
            isProcessing: false,
          });
          if (done) toast.success(`Catálogo pronto (${processed} páginas).`);
        }
      } finally {
        setIsProcessing(false);
      }
    },
    [onChange, fetchCatalogProgress],
  );

  const handleResume = useCallback(async () => {
    if (!value) return;
    const fresh = await fetchCatalogProgress(value.id);
    const startPage = fresh.pages_count || value.pages_count || 0;
    toast.info(`Retomando do ponto ${startPage}/${fresh.total_pages || value.total_pages || '?'}…`);
    await runCatalogProcessing(
      { ...value, total_pages: fresh.total_pages || value.total_pages },
      startPage,
    );
  }, [value, fetchCatalogProgress, runCatalogProcessing]);

  const handleUpload = useCallback(async (file: File) => {
    const err = validate(file);
    if (err) {
      toast.error(err);
      return;
    }

    setIsUploading(true);
    try {
      const ext = file.name.split('.').pop() || 'bin';
      const path = `${userId}/${kind}/${Date.now()}-${crypto.randomUUID()}.${ext}`;

      const { error: uploadError } = await supabase.storage
        .from('prescription-files')
        .upload(path, file, { contentType: file.type, upsert: false });

      if (uploadError) throw uploadError;

      const table = kind === 'catalog' ? 'prescription_catalogs' : 'prescription_records';
      const { data, error: insertError } = await supabase
        .from(table)
        .insert({
          user_id: userId,
          file_name: file.name,
          file_type: file.type || 'application/octet-stream',
          file_path: path,
          file_size: file.size,
        })
        .select('id, file_name, file_path, file_type')
        .single();

      if (insertError) throw insertError;

      const uploaded = data as UploadedFile;
      // SFX: toca apenas em upload novo bem-sucedido (não em "Usar" de salvos).
      playSfx('upload');

      const isPdf = (uploaded.file_type || '').toLowerCase().includes('pdf')
        || uploaded.file_name.toLowerCase().endsWith('.pdf');

      if (kind === 'catalog' && isPdf) {
        // Pipeline condicional: PDFs ≤ 5MB são leves o bastante pra ir direto
        // pro Gemini Pro multimodal — sem rasterização, sem batch, sem checkpoint.
        if (file.size <= PDF_SMALL_THRESHOLD) {
          // Marca o catálogo como "renderização pulada" — o backend vai usar
          // o PDF original inline. extracted_metadata fica como sinal pro
          // frontend liberar o botão de gerar imediatamente.
          await supabase
            .from('prescription_catalogs')
            .update({
              extracted_metadata: {
                skip_page_render: true,
                pages_count: 1,
                total_pages: 1,
                size_bytes: file.size,
              },
            })
            .eq('id', uploaded.id);
          onChange({
            ...uploaded,
            pages_count: 1,
            total_pages: 1,
            isProcessing: false,
            skipPageRender: true,
          });
          toast.success('Catálogo pronto (modo rápido — leitura direta sem rasterização).');
        } else {
          toast.success('Catálogo enviado. Processando páginas…');
          await runCatalogProcessing(uploaded, 0);
        }
      } else {
        onChange(uploaded);
        toast.success(kind === 'catalog' ? 'Catálogo enviado.' : 'Prontuário enviado.');
      }
    } catch (e: any) {
      console.error('Upload error', e);
      toast.error(e?.message || 'Falha no upload.');
    } finally {
      setIsUploading(false);
    }
  }, [userId, kind, onChange, runCatalogProcessing]);

  const handleRemove = useCallback(async () => {
    if (!value) return;
    try {
      // Catálogo salvo nos favoritos: não apaga arquivo nem registro — só deseleciona.
      // Caso contrário (prontuário, ou catálogo não salvo): remove storage + registro.
      if (kind === 'catalog' && isSaved) {
        // Apenas deseleciona; preservamos o catálogo para o atalho continuar válido.
      } else {
        await supabase.storage.from('prescription-files').remove([value.file_path]);
        const table = kind === 'catalog' ? 'prescription_catalogs' : 'prescription_records';
        await supabase.from(table).delete().eq('id', value.id);
      }
    } catch (e) {
      console.error('Remove error', e);
    }
    onChange(null);
  }, [value, kind, isSaved, onChange]);

  const handleSave = useCallback(async () => {
    if (!value || kind !== 'catalog') return;
    if (isSaved) {
      toast.info('Catálogo já salvo.');
      return;
    }
    if (savedLimitReached) {
      toast.error('Limite de 3 catálogos salvos atingido. Remova um para salvar este.');
      return;
    }
    setIsSaving(true);
    try {
      const { error } = await supabase.from('saved_catalogs').insert({
        user_id: userId,
        catalog_id: value.id,
        display_name: value.file_name,
      });
      if (error) {
        if ((error as any).code === '23505') {
          toast.info('Catálogo já salvo.');
        } else {
          throw error;
        }
      } else {
        toast.success('Catálogo salvo nos favoritos.');
      }
      onSaved?.();
    } catch (e: any) {
      console.error('Save catalog error', e);
      toast.error(e?.message || 'Falha ao salvar catálogo.');
    } finally {
      setIsSaving(false);
    }
  }, [value, kind, userId, isSaved, savedLimitReached, onSaved]);

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) handleUpload(file);
  };

  // Catálogo PDF parcialmente processado (sem estar em loop ativo)?
  const isCatalogPaused =
    kind === 'catalog'
    && !!value
    && !isProcessing
    && !value.isProcessing
    && typeof value.total_pages === 'number'
    && value.total_pages > 0
    && (value.pages_count ?? 0) < value.total_pages;

  return (
    <div
      onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
      onDragLeave={() => setIsDragOver(false)}
      onDrop={onDrop}
      className={cn(
        'relative flex flex-col items-center justify-center w-full min-h-[180px] rounded-lg border-2 border-dashed bg-card transition-colors p-6',
        isDragOver && !value && 'border-primary bg-primary/5',
        !isDragOver && !value && 'border-border hover:border-primary/60',
        value && 'border-solid border-border',
      )}
    >
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPTED_EXT}
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) handleUpload(f);
          e.target.value = '';
        }}
      />

      {isUploading ? (
        <div className="flex flex-col items-center gap-2 text-muted-foreground">
          <Loader2 className="w-6 h-6 animate-spin" />
          <span className="text-sm">Enviando…</span>
        </div>
      ) : isProcessing ? (
        <div className="flex flex-col items-center gap-1.5 text-muted-foreground">
          <Loader2 className="w-6 h-6 animate-spin text-primary" />
          <span className="text-sm">Enviando…</span>
          <span className="text-sm font-bold text-foreground">
            {value && typeof value.total_pages === 'number' && value.total_pages > 0
              ? `Processando páginas do catálogo (${value.pages_count ?? 0}/${value.total_pages})`
              : 'Processando páginas do catálogo'}
          </span>
          <span className="text-[11px] opacity-70">Isso pode levar alguns segundos.</span>
        </div>
      ) : value ? (
        <div className="flex flex-col items-center gap-3 text-center w-full">
          <FileText className="w-8 h-8 text-primary" />
          <div className="text-sm font-medium text-foreground break-all px-2 line-clamp-2">
            {value.file_name}
          </div>
          {kind === 'catalog' && value.isProcessing && (
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Loader2 className="w-3 h-3 animate-spin" />
              {typeof value.total_pages === 'number' && value.total_pages > 0
                ? `Processando páginas (${value.pages_count ?? 0}/${value.total_pages})…`
                : 'Processando páginas…'}
            </div>
          )}
          {isCatalogPaused && (
            <div className="flex flex-col items-center gap-2 w-full">
              <div className="text-xs text-muted-foreground">
                {value.pages_count ?? 0}/{value.total_pages} páginas processadas
              </div>
              <Button
                variant="default"
                size="sm"
                onClick={handleResume}
                className="gap-1"
              >
                <PlayCircle className="w-4 h-4" />
                Continuar processamento
              </Button>
            </div>
          )}
          {kind === 'catalog'
            && !value.isProcessing
            && !isCatalogPaused
            && !value.skipPageRender
            && typeof value.pages_count === 'number'
            && value.pages_count > 0 && (
              <div className="text-xs text-muted-foreground">{value.pages_count} páginas prontas</div>
            )}
          <div className="flex items-center gap-2 flex-wrap justify-center">
            {kind === 'catalog' && (
              <Button
                variant={isSaved ? 'secondary' : 'outline'}
                size="sm"
                onClick={handleSave}
                disabled={isSaving || isSaved || (savedLimitReached && !isSaved)}
                className="gap-1"
                title={
                  isSaved
                    ? 'Catálogo já salvo'
                    : savedLimitReached
                      ? 'Limite de 3 catálogos salvos atingido'
                      : 'Salvar catálogo nos favoritos'
                }
              >
                {isSaving ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : isSaved ? (
                  <BookmarkCheck className="w-4 h-4" />
                ) : (
                  <Bookmark className="w-4 h-4" />
                )}
                {isSaved ? 'Salvo' : 'Salvar'}
              </Button>
            )}
            <Button variant="ghost" size="sm" onClick={handleRemove} className="gap-1">
              <X className="w-4 h-4" />
              Remover
            </Button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="flex flex-col items-center gap-2 text-center w-full"
        >
          <Upload className="w-8 h-8 text-muted-foreground" />
          <div className="text-sm font-medium text-foreground">{label}</div>
          <div className="text-xs text-muted-foreground">{description}</div>
          <div className="text-[11px] text-muted-foreground/70 mt-1">
            PDF, JPG, PNG, WEBP, TXT, DOC, DOCX · até 10MB
          </div>
        </button>
      )}
    </div>
  );
};
