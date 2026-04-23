import { useEffect, useState, useCallback, useMemo } from 'react';
import { Plus, Sparkles, Copy, Check, Loader2, FileText, ClipboardList, X, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { UploadDropzone, UploadedFile } from './UploadDropzone';
import { SavedCatalogs, useSavedCatalogs, SAVED_CATALOGS_LIMIT } from './SavedCatalogs';
import { MarkdownMessage } from '@/components/dashboard/MarkdownMessage';
import { cn } from '@/lib/utils';
import { playSfx } from '@/lib/sfx';
import { extractPrescriptionSummary } from '@/lib/prescriptionExtract';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

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
  const [selectedHistoryId, setSelectedHistoryId] = useState<string | null>(null);
  const [historyToDelete, setHistoryToDelete] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const { items: savedCatalogs, loading: savedLoading, refresh: refreshSaved } = useSavedCatalogs(userId);

  const isCurrentCatalogSaved = !!catalog && savedCatalogs.some((s) => s.catalog_id === catalog.id);
  const savedLimitReached = savedCatalogs.length >= SAVED_CATALOGS_LIMIT;

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
      const response = payload?.response || '';
      setAiResponse(response);
      if (response) {
        // SFX: receituário gerado com sucesso
        playSfx('receita');
      }
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
    setSelectedHistoryId(item.id);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleNewPrescription = () => {
    setCatalog(null);
    setRecord(null);
    setObservations('');
    setAiResponse('');
    setSelectedHistoryId(null);
    setCopied(false);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleConfirmDelete = async () => {
    if (!historyToDelete) return;
    setIsDeleting(true);
    try {
      const { error } = await supabase
        .from('prescription_results')
        .delete()
        .eq('id', historyToDelete);
      if (error) throw error;
      setHistory((prev) => prev.filter((h) => h.id !== historyToDelete));
      if (selectedHistoryId === historyToDelete) {
        setSelectedHistoryId(null);
      }
      toast.success('Receituário removido.');
    } catch (e: any) {
      console.error(e);
      toast.error(e?.message || 'Falha ao remover.');
    } finally {
      setIsDeleting(false);
      setHistoryToDelete(null);
    }
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
              isSaved={isCurrentCatalogSaved}
              savedLimitReached={savedLimitReached}
              onSaved={refreshSaved}
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

          {/* Catálogos salvos */}
          <SavedCatalogs
            userId={userId}
            items={savedCatalogs}
            loading={savedLoading}
            onRefresh={refreshSaved}
            onUse={(file) => setCatalog(file)}
          />

          {/* Observações */}
          <section className="space-y-2">
            <div className="flex items-center justify-between gap-3">
              <label className="text-sm font-medium text-foreground">
                Observações complementares <span className="text-muted-foreground font-normal">(opcional)</span>
              </label>
              <span className="text-xs text-muted-foreground tabular-nums">{observations.length}/1000</span>
            </div>
            <Textarea
              value={observations}
              onChange={(e) => setObservations(e.target.value)}
              placeholder="Observações complementares para a IA (opcional)"
              className="min-h-[90px] resize-none"
              maxLength={1000}
            />
          </section>

          {/* Action */}
          <section>
            <div className="flex flex-col md:flex-row gap-3 md:items-center">
              <Button
                onClick={handleGenerate}
                disabled={!canGenerate}
                size="lg"
                className="w-full md:w-auto bg-primary hover:bg-primary/90 text-primary-foreground font-medium"
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
              <Button
                onClick={handleNewPrescription}
                disabled={isGenerating}
                size="lg"
                variant="outline"
                className="w-full md:w-auto"
                title="Limpar campos e iniciar um novo receituário"
              >
                <RotateCcw className="w-4 h-4 mr-2" />
                Novo Receituário
              </Button>
            </div>
            {!canGenerate && !isGenerating && (!catalog || !record) && (
              <p className="text-xs text-muted-foreground mt-2">
                Envie o catálogo e o prontuário para liberar a geração.
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
                {history.map((item) => {
                  const isSelected = selectedHistoryId === item.id;
                  return (
                    <div
                      key={item.id}
                      role="button"
                      tabIndex={0}
                      onClick={() => openHistoryItem(item)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          openHistoryItem(item);
                        }
                      }}
                      className={cn(
                        'group relative text-left p-3 pr-9 rounded-lg border border-border bg-card transition-colors cursor-pointer',
                        'hover:bg-accent hover:text-black dark:hover:text-black',
                        isSelected && 'bg-accent text-black dark:text-black',
                      )}
                    >
                      <div
                        className={cn(
                          'text-sm font-medium line-clamp-1 transition-colors',
                          isSelected ? 'text-black' : 'text-white group-hover:text-black',
                        )}
                      >
                        {item.patient_name || 'Paciente não identificado'}
                      </div>
                      <div
                        className={cn(
                          'text-xs line-clamp-1 mt-0.5 transition-colors',
                          isSelected ? 'text-black/70' : 'text-muted-foreground group-hover:text-black/70',
                        )}
                      >
                        {item.main_complaint || 'Sem queixa principal extraída'}
                      </div>
                      <div
                        className={cn(
                          'text-[11px] mt-1 transition-colors',
                          isSelected ? 'text-black/60' : 'text-muted-foreground/70 group-hover:text-black/60',
                        )}
                      >
                        {new Date(item.created_at).toLocaleString('pt-BR', {
                          day: '2-digit', month: '2-digit', year: 'numeric',
                          hour: '2-digit', minute: '2-digit',
                        })}
                      </div>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setHistoryToDelete(item.id);
                        }}
                        className={cn(
                          'absolute top-2 right-2 p-1 rounded-md transition-opacity',
                          'opacity-0 group-hover:opacity-100 focus:opacity-100',
                          'hover:bg-background/80 text-muted-foreground hover:text-destructive',
                          isSelected && 'text-black/60 hover:text-destructive',
                        )}
                        title="Excluir receituário"
                        aria-label="Excluir receituário"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  );
                })}
              </div>
            </section>
          )}
        </div>
      </ScrollArea>

      <AlertDialog open={!!historyToDelete} onOpenChange={(open) => !open && setHistoryToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar exclusão</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir? Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmDelete}
              disabled={isDeleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeleting ? 'Excluindo…' : 'Excluir'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};
