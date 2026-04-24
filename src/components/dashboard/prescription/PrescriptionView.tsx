import { useEffect, useState, useCallback, useMemo } from 'react';
import { Plus, Sparkles, Copy, Check, Loader2, FileText, ClipboardList, X, RotateCcw, Menu, Pin } from 'lucide-react';
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
import { useSidebar } from '@/components/ui/sidebar';
import { useIsMobile } from '@/hooks/use-mobile';
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
  subscriptions?: Array<{ plan_type?: string; status?: string }>;
}

interface HistoryItem {
  id: string;
  patient_name: string | null;
  main_complaint: string | null;
  ai_response: string;
  created_at: string;
  pinned_at: string | null;
}

const PIN_LIMIT = 6;

const sortHistory = (items: HistoryItem[]): HistoryItem[] => {
  return [...items].sort((a, b) => {
    if (a.pinned_at && !b.pinned_at) return -1;
    if (!a.pinned_at && b.pinned_at) return 1;
    if (a.pinned_at && b.pinned_at) {
      return new Date(b.pinned_at).getTime() - new Date(a.pinned_at).getTime();
    }
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  });
};

export const PrescriptionView = ({ userId, subscriptions = [] }: PrescriptionViewProps) => {
  const [catalog, setCatalog] = useState<UploadedFile | null>(null);
  const [record, setRecord] = useState<UploadedFile | null>(null);
  const [observations, setObservations] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [progressMessage, setProgressMessage] = useState<string>('');
  const [aiResponse, setAiResponse] = useState<string>('');
  const [copied, setCopied] = useState(false);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [selectedHistoryId, setSelectedHistoryId] = useState<string | null>(null);
  const [historyToDelete, setHistoryToDelete] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [quota, setQuota] = useState<{ used: number; limit: number } | null>(null);

  const isMobile = useIsMobile();
  const { toggleSidebar } = useSidebar();

  const activeSubs = subscriptions.filter((s) => s?.status === 'active');
  const isFreeOnly = activeSubs.length > 0 && activeSubs.every((s) => s?.plan_type === 'free');

  const { items: savedCatalogs, loading: savedLoading, refresh: refreshSaved } = useSavedCatalogs(userId);

  const isCurrentCatalogSaved = !!catalog && savedCatalogs.some((s) => s.catalog_id === catalog.id);
  const savedLimitReached = savedCatalogs.length >= SAVED_CATALOGS_LIMIT;

  const summaryItems = useMemo(() => extractPrescriptionSummary(aiResponse), [aiResponse]);
  const hasSummary = !!aiResponse && summaryItems.length > 0;

  const quotaExhausted = isFreeOnly && quota !== null && quota.used >= quota.limit;

  const loadHistory = useCallback(async () => {
    const { data, error } = await supabase
      .from('prescription_results')
      .select('id, patient_name, main_complaint, ai_response, created_at, pinned_at')
      .eq('user_id', userId)
      .order('pinned_at', { ascending: false, nullsFirst: false })
      .order('created_at', { ascending: false })
      .limit(16);
    if (!error && data) setHistory(sortHistory(data as HistoryItem[]));
  }, [userId]);

  const loadQuota = useCallback(async () => {
    if (!isFreeOnly) {
      setQuota(null);
      return;
    }
    const { data, error } = await supabase.rpc('get_receituario_quota', { _user_id: userId });
    if (!error && data) {
      const d = data as any;
      setQuota({ used: Number(d.used) || 0, limit: Number(d.limit) || 5 });
    }
  }, [userId, isFreeOnly]);

  useEffect(() => { loadHistory(); }, [loadHistory]);
  useEffect(() => { loadQuota(); }, [loadQuota]);

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
  const canGenerate = catalogReady && !!record && !isGenerating && !quotaExhausted;

  const handleGenerate = async () => {
    if (!canGenerate) return;
    if (observations.length > 1000) {
      toast.error('Observações excedem 1000 caracteres.');
      return;
    }
    setIsGenerating(true);
    setAiResponse('');
    setProgressMessage('Iniciando…');
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
        if (payload.error === 'limite_mensal') {
          setQuota({ used: Number(payload.used) || 5, limit: Number(payload.limit) || 5 });
        }
        toast.error(payload.message || 'Falha ao gerar receituário.');
        return;
      }
      const jobId: string | undefined = payload?.jobId;
      if (!jobId) {
        toast.error('Falha ao iniciar geração. Tente novamente.');
        return;
      }

      // Polling: até 8 minutos, intervalo de 3s
      const intervalMs = 3000;
      const timeoutMs = 8 * 60 * 1000;
      const start = Date.now();
      let finalResponse = '';
      let finalStatus: 'completed' | 'failed' | 'timeout' = 'timeout';
      let finalErrorMsg = '';

      while (Date.now() - start < timeoutMs) {
        await new Promise((r) => setTimeout(r, intervalMs));
        const { data: jobRow, error: jobErr } = await supabase
          .from('prescription_jobs')
          .select('status, progress, ai_response, error_message')
          .eq('id', jobId)
          .maybeSingle();
        if (jobErr) {
          console.error('Polling error', jobErr);
          continue;
        }
        if (!jobRow) continue;
        if (jobRow.progress) setProgressMessage(jobRow.progress);
        if (jobRow.status === 'completed') {
          finalStatus = 'completed';
          finalResponse = jobRow.ai_response || '';
          break;
        }
        if (jobRow.status === 'failed') {
          finalStatus = 'failed';
          finalErrorMsg = jobRow.error_message || 'Falha ao gerar receituário.';
          break;
        }
      }

      if (finalStatus === 'completed') {
        setAiResponse(finalResponse);
        if (finalResponse) {
          // SFX: receituário gerado com sucesso
          playSfx('receita');
        }
        toast.success('Receituário gerado.');
        loadHistory();
        loadQuota();
      } else if (finalStatus === 'failed') {
        toast.error(finalErrorMsg);
        loadQuota();
      } else {
        toast.error('Falha ao gerar receituário. Tente novamente em alguns minutos.');
        loadQuota();
      }
    } catch (e: any) {
      console.error(e);
      toast.error(e?.message || 'Erro ao gerar receituário.');
    } finally {
      setIsGenerating(false);
      setProgressMessage('');
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

  const handleTogglePin = async (item: HistoryItem) => {
    const isPinned = !!item.pinned_at;
    const pinnedCount = history.filter((h) => h.pinned_at).length;

    if (!isPinned && pinnedCount >= PIN_LIMIT) {
      toast.error(`Você pode fixar no máximo ${PIN_LIMIT} receituários`);
      return;
    }

    const newPinnedAt = isPinned ? null : new Date().toISOString();
    // Otimista
    setHistory((prev) =>
      sortHistory(prev.map((h) => (h.id === item.id ? { ...h, pinned_at: newPinnedAt } : h))),
    );

    const { error } = await supabase
      .from('prescription_results')
      .update({ pinned_at: newPinnedAt })
      .eq('id', item.id);

    if (error) {
      // rollback
      setHistory((prev) =>
        sortHistory(prev.map((h) => (h.id === item.id ? { ...h, pinned_at: item.pinned_at } : h))),
      );
      toast.error('Falha ao atualizar fixação.');
    }
  };

  return (
    <div className="flex-1 flex flex-col h-screen overflow-hidden bg-background">
      {/* Mobile header com hamburger — paridade com ChatArea */}
      {isMobile && (
        <div className="p-4 flex items-center gap-2 border-b border-border">
          <Button
            variant="ghost"
            size="icon"
            onClick={toggleSidebar}
            className="h-10 w-10 shrink-0"
            aria-label="Abrir menu"
          >
            <Menu className="h-5 w-5" />
          </Button>
          <div className="flex items-center gap-2">
            <ClipboardList className="w-5 h-5 text-primary" />
            <span className="text-base font-semibold text-foreground">Receituário +</span>
          </div>
        </div>
      )}
      <ScrollArea className="flex-1">
        <div className="max-w-6xl mx-auto px-4 md:px-8 py-8 space-y-8">
          {/* Header (desktop) */}
          {!isMobile && (
            <header className="space-y-1">
              <div className="flex items-center gap-2">
                <ClipboardList className="w-6 h-6 text-primary" />
                <h1 className="text-2xl font-semibold text-foreground">Receituário +</h1>
              </div>
              <p className="text-sm text-muted-foreground">
                Envie o catálogo de produtos e o prontuário do paciente. A IA cruzará os dados com a base científica para sugerir um receituário.
              </p>
            </header>
          )}

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
              canSave={!isFreeOnly}
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

          {/* Catálogos salvos — escondido para usuários free (não podem salvar) */}
          {!isFreeOnly && (
            <SavedCatalogs
              userId={userId}
              items={savedCatalogs}
              loading={savedLoading}
              onRefresh={refreshSaved}
              onUse={(file) => setCatalog(file)}
            />
          )}

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
                    {progressMessage || 'Analisando documentos e cruzando com base científica…'}
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
            {!canGenerate && !isGenerating && (!catalog || !record) && !quotaExhausted && (
              <p className="text-xs text-muted-foreground mt-2">
                Envie o catálogo e o prontuário para liberar a geração.
              </p>
            )}
            {isFreeOnly && quota && !quotaExhausted && (
              <p className="text-xs text-muted-foreground mt-2">
                Usos restantes este mês: {Math.max(0, quota.limit - quota.used)}/{quota.limit}
              </p>
            )}
            {quotaExhausted && (
              <p className="text-xs font-medium text-destructive mt-2">
                Você atingiu o limite mensal de 5 receituários no plano gratuito.
              </p>
            )}
          </section>

          {/* Resumo copiável */}
          {hasSummary && (
            <section className="space-y-3">
              <div className="flex items-start justify-between gap-4 flex-wrap">
                <h2 className="text-sm font-medium text-muted-foreground">
                  Resumo{summaryItems.length > 1 ? ` (${summaryItems.length} produtos)` : ''}
                </h2>
                <p className="text-[11px] text-muted-foreground italic text-right whitespace-nowrap">
                  Sempre cheque o nome dos produtos/marca antes de concluir a receita
                </p>
              </div>
              <div className="space-y-3">
                {summaryItems.map((item, idx) => (
                  <Card key={idx} className="p-4 md:p-5 space-y-3">
                    <SummaryRow
                      label={summaryItems.length > 1 ? `Produto ${idx + 1}` : 'Produto'}
                      value={item.produto}
                      multiline={false}
                    />
                    <SummaryRow label="Posologia" value={item.posologia} multiline={true} />
                  </Card>
                ))}
              </div>
            </section>
          )}

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
                  <p className="text-sm">{progressMessage || 'Analisando documentos e cruzando com base científica…'}</p>
                  <p className="text-xs opacity-70">Catálogos grandes podem levar alguns minutos.</p>
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
                        'group relative text-left p-3 pr-16 rounded-lg border bg-card transition-colors cursor-pointer',
                        'hover:bg-accent hover:text-black dark:hover:text-black',
                        isSelected && 'bg-accent text-black dark:text-black',
                        item.pinned_at ? 'border-primary/50' : 'border-border',
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
                          handleTogglePin(item);
                        }}
                        className={cn(
                          'absolute top-2 right-9 p-1 rounded-md transition-opacity',
                          item.pinned_at
                            ? cn(
                                'opacity-100',
                                isSelected ? 'text-black' : 'text-primary group-hover:text-black',
                              )
                            : cn(
                                'opacity-0 group-hover:opacity-100 focus:opacity-100',
                                isSelected ? 'text-black opacity-100' : 'text-muted-foreground hover:text-primary',
                              ),
                        )}
                        title={item.pinned_at ? 'Desfixar receituário' : 'Fixar receituário'}
                        aria-label={item.pinned_at ? 'Desfixar receituário' : 'Fixar receituário'}
                      >
                        <Pin className={cn('w-4 h-4', item.pinned_at && 'fill-current')} />
                      </button>
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

interface SummaryRowProps {
  label: string;
  value: string;
  multiline: boolean;
}

const SummaryRow = ({ label, value, multiline }: SummaryRowProps) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    if (!value) return;
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error('Não foi possível copiar.');
    }
  };

  const lineCount = multiline ? Math.min(Math.max(value.split('\n').length, 3), 10) : 1;

  return (
    <div className="flex flex-col md:flex-row md:items-start gap-2 md:gap-4">
      <label className="md:w-24 md:pt-2 text-sm font-medium text-foreground shrink-0">
        {label}
      </label>
      <div className="relative flex-1 min-w-0">
        {multiline ? (
          <Textarea
            readOnly
            value={value}
            placeholder={`Sem ${label.toLowerCase()} identificado.`}
            rows={lineCount}
            className="pr-24 resize-none bg-muted/40 cursor-text"
          />
        ) : (
          <Input
            readOnly
            value={value}
            placeholder={`Sem ${label.toLowerCase()} identificado.`}
            className="pr-24 bg-muted/40 cursor-text"
            title={value || undefined}
          />
        )}
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={handleCopy}
          disabled={!value}
          className={cn(
            'absolute right-1 gap-1.5 h-8 px-2',
            multiline ? 'top-1' : 'top-1/2 -translate-y-1/2',
          )}
          title={`Copiar ${label.toLowerCase()}`}
          aria-label={`Copiar ${label.toLowerCase()}`}
        >
          {copied ? (
            <>
              <Check className="w-4 h-4 text-primary" />
              <span className="text-xs">Copiado!</span>
            </>
          ) : (
            <Copy className="w-4 h-4" />
          )}
        </Button>
      </div>
    </div>
  );
};
