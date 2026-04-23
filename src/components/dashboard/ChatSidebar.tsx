import { useState } from 'react';
import { Plus, Pencil, Trash2, PanelLeft, Search, FilePlus2, Lock } from 'lucide-react';
import { toast } from 'sonner';
import logoIcon from '@/assets/logo-icon.png';
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
import { UserProfileHeader } from './UserProfileHeader';

interface ChatSidebarProps {
  conversations: Conversation[];
  currentConversation: Conversation | null;
  onSelectConversation: (conversation: Conversation) => void;
  onNewConversation: () => void;
  onRenameConversation: (conversationId: string, newTitle: string) => void;
  onDeleteConversation: (conversationId: string) => void;
  appTheme: 'light' | 'dark';
  onThemeToggle: () => void;
  profile: any;
  user: any;
  subscriptions: any[];
  onOpenSearch: () => void;
  activeView: 'chat' | 'prescription';
  onOpenPrescription: () => void;
}

export const ChatSidebar = ({
  conversations,
  currentConversation,
  onSelectConversation,
  onNewConversation,
  onRenameConversation,
  onDeleteConversation,
  appTheme,
  onThemeToggle,
  profile,
  user,
  subscriptions,
  onOpenSearch,
  activeView,
  onOpenPrescription,
}: ChatSidebarProps) => {
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [conversationToDelete, setConversationToDelete] = useState<string | null>(null);
  const { state, toggleSidebar } = useSidebar();

  const hasPrescriptionAccess = (subscriptions || []).some(
    (s) => s?.status === 'active' && (s?.plan_type === 'medical' || s?.plan_type === 'specialist')
  );

  const handlePrescriptionClick = () => {
    if (!hasPrescriptionAccess) {
      toast.error('Receituário + disponível apenas no plano Médico.');
      return;
    }
    onOpenPrescription();
  };

  const getModelLabel = (modelType: string) => {
    const labels = {
      generic: 'Generalista',
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
      <Sidebar collapsible="icon" className="border-r border-border flex flex-col">
        <SidebarHeader className="pt-[21px] px-3 pb-4">
          {state === "expanded" ? (
            <>
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center justify-center w-10 h-10 rounded-lg overflow-hidden">
                  <img src={logoIcon} alt="Nura Logo" className="w-10 h-10 object-cover" />
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={toggleSidebar}
                  className="h-8 w-8"
                  title="Recolher barra lateral"
                >
                  <PanelLeft className="h-5 w-5" />
                </Button>
              </div>
              <Button
                onClick={onNewConversation}
                className="w-full bg-[#9EFF00] hover:bg-[#8EEF00] text-black font-medium"
                size="sm"
              >
                <Plus className="mr-2 h-4 w-4" />
                Nova Consulta
              </Button>
              <Button
                onClick={onOpenSearch}
                variant="ghost"
                className="w-full"
                size="sm"
                aria-label="Buscar em chats"
              >
                <Search className="mr-2 h-4 w-4" />
                Buscar em chats
              </Button>
              <Button
                onClick={handlePrescriptionClick}
                variant="ghost"
                className={cn(
                  'w-full justify-start',
                  activeView === 'prescription' && hasPrescriptionAccess && 'bg-accent',
                  !hasPrescriptionAccess && 'opacity-50 cursor-not-allowed hover:bg-transparent',
                )}
                size="sm"
                title={hasPrescriptionAccess ? 'Receituário +' : 'Disponível no plano Médico'}
                aria-label="Receituário +"
              >
                <FilePlus2 className="mr-2 h-4 w-4" />
                Receituário +
                {!hasPrescriptionAccess && <Lock className="ml-auto h-3.5 w-3.5" />}
              </Button>
            </>
          ) : (
            <div className="flex flex-col gap-2">
              <Button
                variant="ghost"
                size="icon"
                onClick={toggleSidebar}
                className="w-full h-10"
                title="Expandir barra lateral"
              >
                <PanelLeft className="h-5 w-5" />
              </Button>
              <Button
                onClick={onNewConversation}
                size="icon"
                className="w-full h-10 bg-[#9EFF00] hover:bg-[#8EEF00] text-black"
                title="Nova Consulta"
              >
                <Plus className="h-5 w-5" />
              </Button>
              <Button
                onClick={onOpenSearch}
                variant="ghost"
                size="icon"
                className="w-full h-10"
                title="Buscar em chats"
                aria-label="Buscar em chats"
              >
                <Search className="h-5 w-5" />
              </Button>
              <Button
                onClick={handlePrescriptionClick}
                variant="ghost"
                size="icon"
                className={cn(
                  'w-full h-10',
                  activeView === 'prescription' && hasPrescriptionAccess && 'bg-accent',
                  !hasPrescriptionAccess && 'opacity-50 cursor-not-allowed hover:bg-transparent',
                )}
                title={hasPrescriptionAccess ? 'Receituário +' : 'Disponível no plano Médico'}
                aria-label="Receituário +"
              >
                <FilePlus2 className="h-5 w-5" />
              </Button>
            </div>
          )}
        </SidebarHeader>

        <SidebarContent className="flex-1">
          {state === "expanded" ? (
            <>
              <div className="px-4 pt-4 pb-0">
                <h2 className="text-xs font-medium text-muted-foreground/60">Consultas</h2>
              </div>
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
                    className="relative mb-1"
                    onMouseEnter={() => setHoveredId(conversation.id)}
                    onMouseLeave={() => setHoveredId(null)}
                  >
                    <button
                      onClick={() => onSelectConversation(conversation)}
                      className={cn(
                        'w-full text-left p-2.5 rounded-lg transition-colors',
                        (hoveredId === conversation.id || currentConversation?.id === conversation.id) && 'bg-accent'
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
                        <div className={cn(
                          "font-medium text-sm mb-0.5 line-clamp-2 pr-16 transition-colors duration-200",
                          (hoveredId === conversation.id || currentConversation?.id === conversation.id) && "dark:text-black"
                        )}>
                          {conversation.title}
                        </div>
                      )}
                      <div className="text-xs text-muted-foreground flex items-center justify-between">
                        <span className={cn(
                          "transition-colors duration-200",
                          (hoveredId === conversation.id || currentConversation?.id === conversation.id) && "dark:text-black"
                        )}>
                          {getModelLabel(conversation.model_type)}
                        </span>
                        <span className={cn(
                          "transition-colors duration-200",
                          (hoveredId === conversation.id || currentConversation?.id === conversation.id) && "dark:text-black"
                        )}>
                          {formatDate(conversation.created_at)}
                        </span>
                      </div>
                    </button>
                    
                    {hoveredId === conversation.id && editingId !== conversation.id && (
                      <div 
                        className="absolute top-2 right-2 flex gap-1 z-10"
                        onMouseEnter={() => setHoveredId(conversation.id)}
                      >
                        <button
                          onClick={(e) => handleStartEdit(conversation, e)}
                          className="p-2 rounded transition-colors"
                          title="Renomear"
                        >
                          <Pencil className="w-4 h-4 text-muted-foreground hover:text-foreground transition-colors" />
                        </button>
                        <button
                          onClick={(e) => handleDeleteClick(conversation.id, e)}
                          className="p-2 rounded transition-colors"
                          title="Deletar"
                        >
                          <Trash2 className="w-4 h-4 text-muted-foreground hover:text-destructive transition-colors" />
                        </button>
                      </div>
                    )}
                  </div>
                ))
              )}
              </ScrollArea>
            </>
          ) : null}
        </SidebarContent>

        <UserProfileHeader
          profile={profile}
          user={user}
          subscriptions={subscriptions}
          appTheme={appTheme}
          onThemeToggle={onThemeToggle}
        />
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
