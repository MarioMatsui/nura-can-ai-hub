import { useEffect, useState, useCallback } from 'react';
import { Plus, Sparkles, Copy, Check, Loader2, FileText, ClipboardList } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Card } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { UploadDropzone, UploadedFile } from './UploadDropzone';
import { MarkdownMessage } from '@/components/dashboard/MarkdownMessage';
import { cn } from '@/lib/utils';

interface PrescriptionViewProps {
  userId: string;
}

interface HistoryItem {
  id: string;
  patient_name: string | null;
  main_complaint: string | null;
  ai_response: string;
  created_at: string;
}

export const PrescriptionView = ({ userId }: PrescriptionViewProps) => {
  const [catalog, setCatalog] = useState<UploadedFile | null>(null);
  const [record, setRecord] = useState<UploadedFile | null>(null);
  const [observations, setObservations] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [aiResponse, setAiResponse] = useState<string>('');
  const [copied, setCopied] = useState(false);
  const [history, setHistory] = useState<HistoryItem[]>([]);

  const loadHistory = useCallback(async () => {
    const { data, error } = await supabase
      .from('prescription_results')
      .select('id, patient_name, main_complaint, ai_response, created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(10);
    if (!error && data) setHistory(data as HistoryItem[]);
  }, [userId]);

  useEffect(() => { loadHistory(); }, [loadHistory]);

  const isCatalogPdf = !!catalog && (
    (catalog.file_type || '').toLowerCase().includes('pdf')
    || catalog.file_name.toLowerCase().endsWith('.pdf')
  );
  const catalogReady = !!catalog && !catalog.isProcessing && (
    // PDFs precisam estar 100% processados (pages_count === total_pages); outros formatos não exigem processamento.
    !isCatalogPdf
    || (
      typeof catalog.pages_count === 'number'
      && typeof catalog.total_pages === 'number'
      && catalog.total_pages > 0
      && catalog.pages_count === catalog.total_pages
    )
  );
  const canGenerate = catalogReady && !!record && !isGenerating;

  const handleGenerate = async () => {
    if (!canGenerate) return;
    if (observations.length > 1000) {
      toast.error('Observações excedem 1000 caracteres.');
      return;
    }
    setIsGenerating(true);
    setAiResponse('');
    try {
      const { data, error } = await supabase.functions.invoke('generate-prescription', {
        body: {
          catalogId: catalog.id,
          recordId: record.id,
          observations: observations.trim(),
        },
      });
      if (error) throw error;
      const payload = data as any;
      if (payload?.error) {
        toast.error(payload.message || 'Falha ao gerar receituário.');
        return;
      }
      setAiResponse(payload?.response || '');
      toast.success('Receituário gerado.');
      loadHistory();
    } catch (e: any) {
      console.error(e);
      toast.error(e?.message || 'Erro ao gerar receituário.');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleCopy = async () => {
    if (!aiResponse) return;
    try {
      await navigator.clipboard.writeText(aiResponse);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error('Não foi possível copiar.');
    }
  };

  const openHistoryItem = (item: HistoryItem) => {
    setAiResponse(item.ai_response);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <div className="flex-1 flex flex-col h-screen overflow-hidden bg-background">
      <ScrollArea className="flex-1">
        <div className="max-w-6xl mx-auto px-4 md:px-8 py-8 space-y-8">
          {/* Header */}
          <header className="space-y-1">
            <div className="flex items-center gap-2">
              <ClipboardList className="w-6 h-6 text-primary" />
              <h1 className="text-2xl font-semibold text-foreground">Receituário +</h1>
            </div>
            <p className="text-sm text-muted-foreground">
              Envie o catálogo de produtos e o prontuário do paciente. A IA cruzará os dados com a base científica para sugerir um receituário.
            </p>
          </header>

          {/* Uploads */}
          <section className="grid grid-cols-1 md:grid-cols-[1fr_auto_1fr] gap-4 md:gap-3 items-stretch">
            <UploadDropzone
              kind="catalog"
              userId={userId}
              value={catalog}
              onChange={setCatalog}
              label="Envie ou arraste aqui o catálogo de produtos"
              description="Lista de produtos disponíveis para prescrição"
            />

            <div className="flex md:flex-col items-center justify-center">
              <div className="w-10 h-10 rounded-full border border-border bg-muted flex items-center justify-center">
                <Plus className="w-5 h-5 text-muted-foreground" />
              </div>
            </div>

            <UploadDropzone
              kind="record"
              userId={userId}
              value={record}
              onChange={setRecord}
              label="Envie ou arraste aqui o prontuário do paciente"
              description="Documento clínico com queixa e histórico"
            />
          </section>

          {/* Observações */}
          <section className="space-y-2">
            <label className="text-sm font-medium text-foreground">
              Observações complementares <span className="text-muted-foreground font-normal">(opcional)</span>
            </label>
            <Textarea
              value={observations}
              onChange={(e) => setObservations(e.target.value)}
              placeholder="Observações complementares para a IA (opcional)"
              className="min-h-[90px] resize-none"
              maxLength={1000}
            />
            <div className="text-xs text-muted-foreground text-right">{observations.length}/1000</div>
          </section>

          {/* Action */}
          <section>
            <Button
              onClick={handleGenerate}
              disabled={!canGenerate}
              size="lg"
              className="w-full md:w-auto bg-[#9EFF00] hover:bg-[#8EEF00] text-black font-medium"
            >
              {isGenerating ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Analisando documentos e cruzando com base científica…
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4 mr-2" />
                  Gerar Receituário
                </>
              )}
            </Button>
            {!canGenerate && !isGenerating && (
              <p className="text-xs text-muted-foreground mt-2">
                {catalog && !catalogReady
                  ? (typeof catalog.total_pages === 'number' && catalog.total_pages > 0
                      ? `Processando páginas do catálogo (${catalog.pages_count ?? 0}/${catalog.total_pages})…`
                      : 'Processando páginas do catálogo…')
                  : 'Envie o catálogo e o prontuário para liberar a geração.'}
              </p>
            )}
          </section>

          {/* Response area */}
          <section>
            <Card className="relative min-h-[400px] p-6 md:p-8">
              {aiResponse && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleCopy}
                  className="absolute top-3 right-3 gap-1.5"
                >
                  {copied ? (
                    <>
                      <Check className="w-4 h-4 text-primary" />
                      Copiado!
                    </>
                  ) : (
                    <>
                      <Copy className="w-4 h-4" />
                      Copiar
                    </>
                  )}
                </Button>
              )}

              {isGenerating ? (
                <div className="flex flex-col items-center justify-center min-h-[350px] gap-3 text-muted-foreground">
                  <Loader2 className="w-8 h-8 animate-spin text-primary" />
                  <p className="text-sm">Analisando documentos e cruzando com base científica…</p>
                </div>
              ) : aiResponse ? (
                <div className="pt-6">
                  <MarkdownMessage content={aiResponse} />
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center min-h-[350px] gap-2 text-center text-muted-foreground">
                  <FileText className="w-10 h-10 opacity-40" />
                  <p className="text-sm">Sua sugestão de receituário aparecerá aqui.</p>
                  <p className="text-xs opacity-70">Envie os arquivos e clique em "Gerar Receituário".</p>
                </div>
              )}
            </Card>
          </section>

          {/* História */}
          {history.length > 0 && (
            <section className="space-y-3">
              <h2 className="text-sm font-medium text-muted-foreground">Histórico recente</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {history.map((item) => (
                  <button
                    key={item.id}
                    onClick={() => openHistoryItem(item)}
                    className={cn(
                      'text-left p-3 rounded-lg border border-border bg-card hover:bg-accent transition-colors',
                    )}
                  >
                    <div className="text-sm font-medium text-foreground line-clamp-1">
                      {item.patient_name || 'Paciente não identificado'}
                    </div>
                    <div className="text-xs text-muted-foreground line-clamp-1 mt-0.5">
                      {item.main_complaint || 'Sem queixa principal extraída'}
                    </div>
                    <div className="text-[11px] text-muted-foreground/70 mt-1">
                      {new Date(item.created_at).toLocaleString('pt-BR', {
                        day: '2-digit', month: '2-digit', year: 'numeric',
                        hour: '2-digit', minute: '2-digit',
                      })}
                    </div>
                  </button>
                ))}
              </div>
            </section>
          )}
        </div>
      </ScrollArea>
    </div>
  );
};
