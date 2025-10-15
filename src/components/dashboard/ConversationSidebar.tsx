import { useState } from 'react';
import { Plus, Pencil, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Conversation } from '@/pages/Dashboard';
import { cn } from '@/lib/utils';
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
import { Input } from '@/components/ui/input';

interface ConversationSidebarProps {
  conversations: Conversation[];
  currentConversation: Conversation | null;
  onSelectConversation: (conversation: Conversation) => void;
  onNewConversation: () => void;
  onRenameConversation: (conversationId: string, newTitle: string) => void;
  onDeleteConversation: (conversationId: string) => void;
}

export const ConversationSidebar = ({
  conversations,
  currentConversation,
  onSelectConversation,
  onNewConversation,
  onRenameConversation,
  onDeleteConversation,
}: ConversationSidebarProps) => {
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [conversationToDelete, setConversationToDelete] = useState<string | null>(null);

  const getModelLabel = (modelType: string) => {
    const labels = {
      generic: 'Genérico',
      medical: 'Médico',
      legal: 'Jurídico',
      veterinary: 'Veterinário',
    };
    return labels[modelType as keyof typeof labels] || modelType;
  };

  const handleStartEdit = (conversation: Conversation, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingId(conversation.id);
    setEditTitle(conversation.title);
  };

  const handleSaveEdit = (conversationId: string) => {
    if (editTitle.trim()) {
      onRenameConversation(conversationId, editTitle.trim());
    }
    setEditingId(null);
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setEditTitle('');
  };

  const handleDeleteClick = (conversationId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setConversationToDelete(conversationId);
    setDeleteDialogOpen(true);
  };

  const handleConfirmDelete = () => {
    if (conversationToDelete) {
      onDeleteConversation(conversationToDelete);
    }
    setDeleteDialogOpen(false);
    setConversationToDelete(null);
  };

  return (
    <div className="w-full lg:w-64 h-full border-r border-border bg-card flex flex-col">
      <div className="p-3 pb-[9px] border-b border-border flex flex-col justify-end min-h-[100px]">
        <h2 className="text-base sm:text-lg font-semibold mb-2">Histórico de Consultas</h2>
        <Button
          onClick={onNewConversation}
          className="w-full h-10"
        >
          <Plus className="mr-2 h-4 w-4" />
          Nova Consulta
        </Button>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-2">
          {conversations.length === 0 ? (
            <div className="text-center text-muted-foreground py-8 px-3 sm:px-4 text-sm">
              Nenhuma conversa ainda.
              <br />
              Comece uma nova consulta!
            </div>
          ) : (
            conversations.map((conversation) => (
              <div
                key={conversation.id}
                onMouseEnter={() => setHoveredId(conversation.id)}
                onMouseLeave={() => setHoveredId(null)}
                className="relative mb-1"
              >
                <button
                  onClick={() => onSelectConversation(conversation)}
                  className={cn(
                    'w-full text-left p-2.5 rounded-lg transition-colors group',
                    'hover:bg-accent active:bg-accent',
                    currentConversation?.id === conversation.id && 'bg-accent'
                  )}
                >
                  {editingId === conversation.id ? (
                    <Input
                      value={editTitle}
                      onChange={(e) => setEditTitle(e.target.value)}
                      onBlur={() => handleSaveEdit(conversation.id)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          handleSaveEdit(conversation.id);
                        } else if (e.key === 'Escape') {
                          handleCancelEdit();
                        }
                      }}
                      onClick={(e) => e.stopPropagation()}
                      className="h-6 text-sm mb-1"
                      autoFocus
                    />
                  ) : (
                    <div className="font-medium text-sm mb-0.5 line-clamp-2 pr-16 transition-colors">
                      <span className="hover:text-foreground">{conversation.title}</span>
                    </div>
                  )}
                  <div className="text-xs text-muted-foreground flex items-center justify-between">
                    <span>{getModelLabel(conversation.model_type)}</span>
                    <span>
                      {new Date(conversation.created_at).toLocaleDateString('pt-BR', {
                        day: '2-digit',
                        month: '2-digit',
                      })}
                    </span>
                  </div>
                </button>
                
                {hoveredId === conversation.id && editingId !== conversation.id && (
                  <div className="absolute top-2 right-2 flex gap-1">
                    <button
                      onClick={(e) => handleStartEdit(conversation, e)}
                      className="p-1 rounded hover:bg-background/80 transition-colors"
                      title="Renomear"
                    >
                      <Pencil className="w-3.5 h-3.5 text-muted-foreground hover:text-foreground" />
                    </button>
                    <button
                      onClick={(e) => handleDeleteClick(conversation.id, e)}
                      className="p-1 rounded hover:bg-background/80 transition-colors"
                      title="Deletar"
                    >
                      <Trash2 className="w-3.5 h-3.5 text-muted-foreground hover:text-destructive" />
                    </button>
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </ScrollArea>

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar exclusão</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja deletar esta conversa? Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setConversationToDelete(null)}>
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Deletar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};