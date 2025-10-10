import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Conversation } from '@/pages/Dashboard';
import { cn } from '@/lib/utils';

interface ConversationSidebarProps {
  conversations: Conversation[];
  currentConversation: Conversation | null;
  onSelectConversation: (conversation: Conversation) => void;
  onNewConversation: () => void;
}

export const ConversationSidebar = ({
  conversations,
  currentConversation,
  onSelectConversation,
  onNewConversation,
}: ConversationSidebarProps) => {
  const getModelLabel = (modelType: string) => {
    const labels = {
      generic: 'Genérico',
      medical: 'Médico',
      legal: 'Jurídico',
      veterinary: 'Veterinário',
    };
    return labels[modelType as keyof typeof labels] || modelType;
  };

  return (
    <div className="w-[30%] border-r border-border bg-card flex flex-col">
      <div className="p-4 border-b border-border">
        <h2 className="text-lg font-semibold mb-3">Histórico de Consultas</h2>
        <Button
          onClick={onNewConversation}
          className="w-full"
          size="sm"
        >
          <Plus className="mr-2 h-4 w-4" />
          Nova Consulta
        </Button>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-2 space-y-1">
          {conversations.length === 0 ? (
            <div className="text-center text-muted-foreground py-8 px-4">
              Nenhuma conversa ainda.
              <br />
              Comece uma nova consulta!
            </div>
          ) : (
            conversations.map((conversation) => (
              <button
                key={conversation.id}
                onClick={() => onSelectConversation(conversation)}
                className={cn(
                  'w-full text-left p-3 rounded-lg transition-colors',
                  'hover:bg-accent',
                  currentConversation?.id === conversation.id && 'bg-accent'
                )}
              >
                <div className="font-medium text-sm mb-1 line-clamp-2">
                  {conversation.title}
                </div>
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
            ))
          )}
        </div>
      </ScrollArea>
    </div>
  );
};