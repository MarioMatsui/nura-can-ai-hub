import { useState } from 'react';
import { Plus, Pencil, Trash2, PanelLeft, LogOut } from 'lucide-react';
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
import {
  Sidebar,
  SidebarContent,
  SidebarHeader,
  useSidebar,
} from '@/components/ui/sidebar';
import { supabase } from '@/integrations/supabase/client';
import { useNavigate } from 'react-router-dom';
import { useToast } from '@/hooks/use-toast';

interface ChatSidebarProps {
  conversations: Conversation[];
  currentConversation: Conversation | null;
  onSelectConversation: (conversation: Conversation) => void;
  onNewConversation: () => void;
  onRenameConversation: (conversationId: string, newTitle: string) => void;
  onDeleteConversation: (conversationId: string) => void;
}

export const ChatSidebar = ({
  conversations,
  currentConversation,
  onSelectConversation,
  onNewConversation,
  onRenameConversation,
  onDeleteConversation,
}: ChatSidebarProps) => {
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [conversationToDelete, setConversationToDelete] = useState<string | null>(null);
  const { state, toggleSidebar } = useSidebar();
  const navigate = useNavigate();
  const { toast } = useToast();

  const getModelLabel = (modelType: string) => {
    const labels = {
      generic: 'Genérico',
      medical: 'Médico',
      legal: 'Jurídico',
      veterinary: 'Veterinário',
      specialist: 'Especialista',
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

  const handleLogout = async () => {
    const { error } = await supabase.auth.signOut();
    if (error) {
      toast({
        title: 'Erro',
        description: 'Não foi possível fazer logout',
        variant: 'destructive',
      });
      return;
    }
    navigate('/auth/login');
  };

  const formatDate = (date: string) => {
    const d = new Date(date);
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    
    if (d.toDateString() === today.toDateString()) {
      return 'Hoje';
    } else if (d.toDateString() === yesterday.toDateString()) {
      return 'Ontem';
    } else {
      return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
    }
  };

  return (
    <>
      <Sidebar collapsible="icon" className="border-r border-border">
        <SidebarHeader className="border-b border-border p-3">
          <div className="flex items-center justify-between mb-2">
            <Button
              variant="ghost"
              size="icon"
              onClick={toggleSidebar}
              className="h-8 w-8"
            >
              <PanelLeft className="h-5 w-5" />
            </Button>
            {state === "expanded" && (
              <img 
                src="/src/assets/logo.png" 
                alt="Nura AI" 
                className="h-8"
              />
            )}
          </div>
          {state === "expanded" && (
            <>
              <h2 className="text-base font-semibold mb-2">Histórico de Consultas</h2>
              <Button
                onClick={onNewConversation}
                className="w-full bg-[#9EFF00] hover:bg-[#8EEF00] text-black font-medium"
                size="sm"
              >
                <Plus className="mr-2 h-4 w-4" />
                Nova Consulta
              </Button>
            </>
          )}
          {state === "collapsed" && (
            <Button
              onClick={onNewConversation}
              size="icon"
              className="w-full bg-[#9EFF00] hover:bg-[#8EEF00] text-black"
              title="Nova Consulta"
            >
              <Plus className="h-4 w-4" />
            </Button>
          )}
        </SidebarHeader>

        <SidebarContent>
          {state === "expanded" ? (
            <ScrollArea className="flex-1 p-2">
              {conversations.length === 0 ? (
                <div className="text-center text-muted-foreground py-8 px-3 text-sm">
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
                        'w-full text-left p-2.5 rounded-lg transition-colors',
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
                        <div className="font-medium text-sm mb-0.5 line-clamp-2 pr-16">
                          {conversation.title}
                        </div>
                      )}
                      <div className="text-xs text-muted-foreground flex items-center justify-between">
                        <span>{getModelLabel(conversation.model_type)}</span>
                        <span>{formatDate(conversation.created_at)}</span>
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
            </ScrollArea>
          ) : (
            <ScrollArea className="flex-1 p-2">
              {conversations.map((conversation) => (
                <button
                  key={conversation.id}
                  onClick={() => onSelectConversation(conversation)}
                  className={cn(
                    'w-full p-2 mb-1 rounded-lg transition-colors hover:bg-accent',
                    currentConversation?.id === conversation.id && 'bg-accent'
                  )}
                  title={conversation.title}
                >
                  <div className="h-2 w-2 rounded-full bg-foreground/60 mx-auto" />
                </button>
              ))}
            </ScrollArea>
          )}
        </SidebarContent>

        {/* Footer com botão de logout */}
        <div className="border-t border-border p-3">
          <Button
            onClick={handleLogout}
            variant="ghost"
            size={state === "collapsed" ? "icon" : "sm"}
            className="w-full"
            title="Sair"
          >
            <LogOut className="h-4 w-4" />
            {state === "expanded" && <span className="ml-2">Sair</span>}
          </Button>
        </div>
      </Sidebar>

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
    </>
  );
};
