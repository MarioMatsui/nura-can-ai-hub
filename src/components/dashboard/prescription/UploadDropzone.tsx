import { useCallback, useRef, useState } from 'react';
import { Upload, FileText, X, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';

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
}

interface UploadDropzoneProps {
  kind: 'catalog' | 'record';
  userId: string;
  value: UploadedFile | null;
  onChange: (file: UploadedFile | null) => void;
  label: string;
  description: string;
}

export const UploadDropzone = ({
  kind,
  userId,
  value,
  onChange,
  label,
  description,
}: UploadDropzoneProps) => {
  const [isDragOver, setIsDragOver] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
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

      // Para catálogos PDF, dispara pré-renderização em páginas PNG (em LOTES).
      const isPdf = (uploaded.file_type || '').toLowerCase().includes('pdf')
        || uploaded.file_name.toLowerCase().endsWith('.pdf');

      if (kind === 'catalog' && isPdf) {
        onChange({ ...uploaded, isProcessing: true, pages_count: 0 });
        toast.success('Catálogo enviado. Processando páginas…');
        setIsProcessing(true);

        let startPage = 0;
        let processed = 0;
        let total = 0;
        let done = false;
        let lastError: any = null;

        try {
          // Loop de batches — cada chamada processa ~8 páginas (~5-7s CPU).
          while (!done) {
            const { data: procData, error: procError } = await supabase.functions.invoke(
              'process-catalog-pdf',
              { body: { catalogId: uploaded.id, startPage, batchSize: 8 } },
            );
            if (procError) {
              lastError = procError;
              break;
            }
            const r = procData as any;
            if (r?.error) {
              lastError = r;
              break;
            }
            processed = r?.processed ?? processed;
            total = r?.total ?? total;
            done = !!r?.done;
            startPage = r?.next_page ?? (startPage + 8);

            onChange({
              ...uploaded,
              pages_count: processed,
              total_pages: total,
              isProcessing: !done,
            });

            if (done) break;
            // Safety: se não avançou, evita loop infinito.
            if (r?.next_page != null && r.next_page <= 0) break;
          }

          if (lastError) {
            const detail =
              lastError?.context?.message
              || lastError?.context?.error
              || lastError?.message
              || (typeof lastError === 'string' ? lastError : '');
            toast.error(
              detail
                ? `Falha ao processar catálogo: ${detail}`
                : 'Falha ao processar páginas do catálogo. Tente reenviar.',
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
            toast.success(`Catálogo pronto (${processed} páginas).`);
          }
        } finally {
          setIsProcessing(false);
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
  }, [userId, kind, onChange]);

  const handleRemove = useCallback(async () => {
    if (!value) return;
    try {
      await supabase.storage.from('prescription-files').remove([value.file_path]);
      const table = kind === 'catalog' ? 'prescription_catalogs' : 'prescription_records';
      await supabase.from(table).delete().eq('id', value.id);
    } catch (e) {
      console.error('Remove error', e);
    }
    onChange(null);
  }, [value, kind, onChange]);

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) handleUpload(file);
  };

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
        <div className="flex flex-col items-center gap-2 text-muted-foreground">
          <Loader2 className="w-6 h-6 animate-spin text-primary" />
          <span className="text-sm">
            {value && typeof value.total_pages === 'number' && value.total_pages > 0
              ? `Processando páginas (${value.pages_count ?? 0}/${value.total_pages})…`
              : 'Processando páginas do catálogo…'}
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
          {kind === 'catalog' && !value.isProcessing && typeof value.pages_count === 'number' && value.pages_count > 0 && (
            <div className="text-xs text-muted-foreground">{value.pages_count} páginas prontas</div>
          )}
          <Button variant="ghost" size="sm" onClick={handleRemove} className="gap-1">
            <X className="w-4 h-4" />
            Remover
          </Button>
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
