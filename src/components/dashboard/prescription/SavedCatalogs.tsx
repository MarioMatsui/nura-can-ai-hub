import { useCallback, useEffect, useState } from 'react';
import { FileText, Pencil, Trash2, Check, X, Loader2, Bookmark } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';
import type { UploadedFile } from './UploadDropzone';

export const SAVED_CATALOGS_LIMIT = 3;

export interface SavedCatalog {
  id: string;            // saved_catalogs.id
  catalog_id: string;    // prescription_catalogs.id
  display_name: string;
  catalog: {
    id: string;
    file_name: string;
    file_path: string;
    file_type: string;
    extracted_metadata: any;
  } | null;
}

interface SavedCatalogsProps {
  userId: string;
  items: SavedCatalog[];
  loading: boolean;
  onRefresh: () => void | Promise<void>;
  onUse: (file: UploadedFile) => void;
}

export const SavedCatalogs = ({ userId, items, loading, onRefresh, onUse }: SavedCatalogsProps) => {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingValue, setEditingValue] = useState('');
  const [savingId, setSavingId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const startEdit = (item: SavedCatalog) => {
    setEditingId(item.id);
    setEditingValue(item.display_name);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditingValue('');
  };

  const saveEdit = async (item: SavedCatalog) => {
    const next = editingValue.trim();
    if (!next) {
      toast.error('Nome não pode ficar vazio.');
      return;
    }
    if (next === item.display_name) {
      cancelEdit();
      return;
    }
    setSavingId(item.id);
    try {
      const { error } = await supabase
        .from('saved_catalogs')
        .update({ display_name: next })
        .eq('id', item.id)
        .eq('user_id', userId);
      if (error) throw error;
      toast.success('Catálogo renomeado.');
      cancelEdit();
      await onRefresh();
    } catch (e: any) {
      console.error('Rename error', e);
      toast.error(e?.message || 'Falha ao renomear.');
    } finally {
      setSavingId(null);
    }
  };

  const handleDelete = async () => {
    if (!confirmDeleteId) return;
    setDeletingId(confirmDeleteId);
    try {
      const { error } = await supabase
        .from('saved_catalogs')
        .delete()
        .eq('id', confirmDeleteId)
        .eq('user_id', userId);
      if (error) throw error;
      toast.success('Atalho removido.');
      await onRefresh();
    } catch (e: any) {
      console.error('Delete error', e);
      toast.error(e?.message || 'Falha ao excluir.');
    } finally {
      setDeletingId(null);
      setConfirmDeleteId(null);
    }
  };

  const handleUse = (item: SavedCatalog) => {
    if (!item.catalog) {
      toast.error('Catálogo original não encontrado. Remova o atalho.');
      return;
    }
    const meta = item.catalog.extracted_metadata || {};
    const pages = Array.isArray(meta.pages) ? meta.pages : [];
    const file: UploadedFile = {
      id: item.catalog.id,
      file_name: item.catalog.file_name,
      file_path: item.catalog.file_path,
      file_type: item.catalog.file_type,
      pages_count: Number(meta.pages_count ?? pages.length) || 0,
      total_pages: Number(meta.total_pages ?? 0) || 0,
      isProcessing: false,
    };
    onUse(file);
    toast.success(`Catálogo "${item.display_name}" carregado.`);
  };

  return (
    <section className="space-y-3">
      <div className="flex items-center gap-2">
        <Bookmark className="w-4 h-4 text-muted-foreground" />
        <h2 className="text-sm font-medium text-foreground">Catálogos salvos</h2>
        <span className="text-xs text-muted-foreground">
          ({items.length}/{SAVED_CATALOGS_LIMIT})
        </span>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground py-3">
          <Loader2 className="w-4 h-4 animate-spin" />
          Carregando…
        </div>
      ) : items.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          Nenhum catálogo salvo ainda. Use o botão "Salvar" no catálogo enviado para criar um atalho rápido (até {SAVED_CATALOGS_LIMIT}).
        </p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {items.map((item) => {
            const isEditing = editingId === item.id;
            const broken = !item.catalog;
            return (
              <div
                key={item.id}
                className={cn(
                  'group relative flex flex-col gap-2 p-3 rounded-lg border border-border bg-card transition-colors',
                  !isEditing && !broken && 'hover:border-primary/60 hover:bg-accent/40 cursor-pointer',
                  broken && 'opacity-60',
                )}
                onClick={(e) => {
                  if (isEditing || broken) return;
                  // ignora cliques nos botões internos
                  if ((e.target as HTMLElement).closest('button, input')) return;
                  handleUse(item);
                }}
              >
                <div className="flex items-start gap-2">
                  <FileText className="w-5 h-5 text-primary flex-shrink-0 mt-0.5" />
                  <div className="flex-1 min-w-0">
                    {isEditing ? (
                      <Input
                        autoFocus
                        value={editingValue}
                        onChange={(e) => setEditingValue(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') saveEdit(item);
                          if (e.key === 'Escape') cancelEdit();
                        }}
                        maxLength={120}
                        className="h-8 text-sm"
                        onClick={(e) => e.stopPropagation()}
                      />
                    ) : (
                      <div className="text-sm font-medium text-foreground line-clamp-2 break-words">
                        {item.display_name}
                      </div>
                    )}
                    {broken && (
                      <div className="text-[11px] text-destructive mt-1">
                        Arquivo original indisponível
                      </div>
                    )}
                  </div>
                </div>

                <div className="flex items-center justify-end gap-1">
                  {isEditing ? (
                    <>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={(e) => { e.stopPropagation(); cancelEdit(); }}
                        className="h-7 px-2"
                        disabled={savingId === item.id}
                      >
                        <X className="w-3.5 h-3.5" />
                      </Button>
                      <Button
                        variant="default"
                        size="sm"
                        onClick={(e) => { e.stopPropagation(); saveEdit(item); }}
                        className="h-7 px-2"
                        disabled={savingId === item.id}
                      >
                        {savingId === item.id ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <Check className="w-3.5 h-3.5" />
                        )}
                      </Button>
                    </>
                  ) : (
                    <>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={(e) => { e.stopPropagation(); handleUse(item); }}
                        className="h-7 px-2 text-xs"
                        disabled={broken}
                      >
                        Usar
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={(e) => { e.stopPropagation(); startEdit(item); }}
                        className="h-7 w-7 p-0"
                        title="Renomear"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={(e) => { e.stopPropagation(); setConfirmDeleteId(item.id); }}
                        className="h-7 w-7 p-0 text-destructive hover:text-destructive"
                        title="Excluir atalho"
                        disabled={deletingId === item.id}
                      >
                        {deletingId === item.id ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <Trash2 className="w-3.5 h-3.5" />
                        )}
                      </Button>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <AlertDialog open={!!confirmDeleteId} onOpenChange={(open) => !open && setConfirmDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir atalho do catálogo?</AlertDialogTitle>
            <AlertDialogDescription>
              Isso remove apenas o atalho da sua lista de catálogos salvos. O arquivo original permanece disponível.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete}>Excluir</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
};

/** Hook utilitário para carregar catálogos salvos do usuário. */
export function useSavedCatalogs(userId: string) {
  const [items, setItems] = useState<SavedCatalog[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('saved_catalogs')
        .select(`
          id,
          catalog_id,
          display_name,
          catalog:prescription_catalogs (
            id,
            file_name,
            file_path,
            file_type,
            extracted_metadata
          )
        `)
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(SAVED_CATALOGS_LIMIT);
      if (error) throw error;
      setItems((data as any) || []);
    } catch (e) {
      console.error('Load saved catalogs error', e);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    if (userId) refresh();
  }, [userId, refresh]);

  return { items, loading, refresh };
}
