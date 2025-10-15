import { useEffect, useState } from 'react';
import { Search, X, Loader2, Clock, ArrowUpDown, Filter } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { useSearchChats, SearchFilters } from '@/hooks/useSearchChats';
import { Conversation } from '@/pages/Dashboard';
import {
  highlightText,
  getModelLabel,
  getRecentSearches,
  clearRecentSearches,
} from '@/lib/searchUtils';
import { cn } from '@/lib/utils';

interface SearchModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  conversations: Conversation[];
  currentConversationId: string | null;
  userId: string | null;
  onNavigateToChat: (chatId: string, messageId?: string) => void;
}

export function SearchModal({
  open,
  onOpenChange,
  conversations,
  currentConversationId,
  userId,
  onNavigateToChat,
}: SearchModalProps) {
  const { query, setQuery, filters, setFilters, results, loading } = useSearchChats(
    conversations,
    currentConversationId,
    userId
  );
  const [recentSearches, setRecentSearches] = useState<string[]>([]);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);

  // Carrega buscas recentes
  useEffect(() => {
    if (open) {
      setRecentSearches(getRecentSearches());
      setSelectedIndex(0);
    }
  }, [open]);

  // Reset ao fechar
  useEffect(() => {
    if (!open) {
      setQuery('');
      setSelectedIndex(0);
    }
  }, [open]);

  // Navegação por teclado
  useEffect(() => {
    if (!open) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onOpenChange(false);
        return;
      }

      if (results.length === 0) return;

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex(prev => Math.min(prev + 1, results.length - 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex(prev => Math.max(prev - 1, 0));
      } else if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        const result = results[selectedIndex];
        if (result) {
          handleSelectResult(result.chatId, result.messageId);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open, results, selectedIndex]);

  const handleSelectResult = (chatId: string, messageId: string | null) => {
    onNavigateToChat(chatId, messageId || undefined);
    onOpenChange(false);
  };

  const handleRecentSearch = (search: string) => {
    setQuery(search);
  };

  const handleClearRecent = () => {
    clearRecentSearches();
    setRecentSearches([]);
  };

  const updateFilter = <K extends keyof SearchFilters>(
    key: K,
    value: SearchFilters[K]
  ) => {
    setFilters(prev => ({ ...prev, [key]: value }));
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));

    if (days === 0) return 'Hoje';
    if (days === 1) return 'Ontem';
    if (days < 7) return `${days}d atrás`;
    if (days < 30) return `${Math.floor(days / 7)}sem atrás`;
    return date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
  };

  const isMac = typeof navigator !== 'undefined' && /Mac/.test(navigator.platform);
  const shortcut = isMac ? '⌘K' : 'Ctrl+K';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] p-0 gap-0" aria-modal="true">
        <DialogHeader className="p-4 pb-3 border-b">
          <DialogTitle className="sr-only">Buscar em chats</DialogTitle>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Busque por termos, títulos ou #rótulos"
              className="pl-9 pr-16"
              autoFocus
              aria-label="Campo de busca"
            />
            <kbd className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none inline-flex h-5 select-none items-center gap-1 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium text-muted-foreground">
              {shortcut}
            </kbd>
          </div>
        </DialogHeader>

        {/* Filtros */}
        <Collapsible open={filtersOpen} onOpenChange={setFiltersOpen}>
          <div className="px-4 py-2 border-b bg-muted/30">
            <CollapsibleTrigger asChild>
              <Button variant="ghost" size="sm" className="w-full justify-between">
                <span className="flex items-center gap-2">
                  <Filter className="h-4 w-4" />
                  Filtros
                </span>
                <ArrowUpDown className={cn(
                  "h-4 w-4 transition-transform",
                  filtersOpen && "rotate-180"
                )} />
              </Button>
            </CollapsibleTrigger>
          </div>
          
          <CollapsibleContent>
            <div className="px-4 py-3 space-y-4 border-b bg-muted/10">
              {/* Buscar em */}
              <div className="space-y-2">
                <Label className="text-xs font-medium">Buscar em</Label>
                <div className="space-y-2">
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="type-titles"
                      checked={filters.type.titles}
                      onCheckedChange={(checked) =>
                        updateFilter('type', { ...filters.type, titles: !!checked })
                      }
                    />
                    <Label htmlFor="type-titles" className="text-sm cursor-pointer">
                      Títulos
                    </Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="type-messages"
                      checked={filters.type.messages}
                      onCheckedChange={(checked) =>
                        updateFilter('type', { ...filters.type, messages: !!checked })
                      }
                    />
                    <Label htmlFor="type-messages" className="text-sm cursor-pointer">
                      Mensagens
                    </Label>
                  </div>
                </div>
              </div>
            </div>
          </CollapsibleContent>
        </Collapsible>

        {/* Resultados */}
        <ScrollArea className="flex-1 max-h-[50vh]">
          <div className="p-4">
            {!query.trim() && recentSearches.length > 0 && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-medium text-muted-foreground">
                    Buscas recentes
                  </h3>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleClearRecent}
                    className="h-auto py-1 px-2 text-xs"
                  >
                    Limpar
                  </Button>
                </div>
                <div className="space-y-1">
                  {recentSearches.map((search, idx) => (
                    <button
                      key={idx}
                      onClick={() => handleRecentSearch(search)}
                      className="w-full text-left px-3 py-2 rounded-lg hover:bg-accent transition-colors flex items-center gap-2 text-sm"
                    >
                      <Clock className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                      <span className="truncate">{search}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {!query.trim() && recentSearches.length === 0 && (
              <div className="text-center py-8 text-sm text-muted-foreground">
                <p>Pesquise por palavras-chave, ex.:</p>
                <p className="mt-2 italic">dosagem CBD, epilepsia, THC</p>
              </div>
            )}

            {loading && (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            )}

            {!loading && query.trim() && results.length === 0 && (
              <div className="text-center py-8 text-sm text-muted-foreground">
                Nenhum resultado para "<span className="font-medium">{query}</span>".
                <br />
                Tente outra palavra.
              </div>
            )}

            {!loading && results.length > 0 && (
              <div className="space-y-2" role="listbox">
                {results.map((result, idx) => (
                  <button
                    key={`${result.chatId}-${result.messageId || 'title'}-${idx}`}
                    onClick={() => handleSelectResult(result.chatId, result.messageId)}
                    onMouseEnter={() => setSelectedIndex(idx)}
                    className={cn(
                      'w-full text-left p-3 rounded-lg border transition-colors',
                      'hover:bg-accent hover:border-accent-foreground/20',
                      selectedIndex === idx && 'bg-accent border-accent-foreground/20'
                    )}
                    role="option"
                    aria-selected={selectedIndex === idx}
                  >
                    <div className="flex items-start justify-between gap-3 mb-2">
                      <h4 className="font-medium text-sm line-clamp-1">
                        {result.chatTitle}
                      </h4>
                      <Badge variant="secondary" className="text-xs flex-shrink-0">
                        {getModelLabel(result.modelTag)}
                      </Badge>
                    </div>
                    <div
                      className="text-sm text-muted-foreground mb-2 line-clamp-2"
                      dangerouslySetInnerHTML={{
                        __html: highlightText(result.snippet, query),
                      }}
                    />
                    <div className="text-xs text-muted-foreground">
                      {formatDate(result.timestamp)}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
