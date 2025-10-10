import { useState, useRef, useEffect } from 'react';
import { Send, Lock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Message, UserSubscription, Conversation } from '@/pages/Dashboard';
import { cn } from '@/lib/utils';

interface ChatAreaProps {
  user: any;
  profile: any;
  messages: Message[];
  subscriptions: UserSubscription[];
  currentConversation: Conversation | null;
  onSendMessage: (content: string, modelType: 'generic' | 'medical' | 'legal' | 'veterinary') => void;
}

type ModelType = 'generic' | 'medical' | 'legal' | 'veterinary';

export const ChatArea = ({
  user,
  profile,
  messages,
  subscriptions,
  currentConversation,
  onSendMessage,
}: ChatAreaProps) => {
  const [inputValue, setInputValue] = useState('');
  const [selectedModel, setSelectedModel] = useState<ModelType>('generic');
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const hasAccess = (modelType: ModelType): boolean => {
    if (modelType === 'generic') return true;
    
    const hasSpecialist = subscriptions.some(
      sub => sub.plan_type === 'specialist' && sub.status === 'active'
    );
    
    if (hasSpecialist) return true;

    return subscriptions.some(
      sub => sub.plan_type === modelType && sub.status === 'active'
    );
  };

  const handleSend = () => {
    if (!inputValue.trim()) return;
    
    if (!hasAccess(selectedModel)) {
      return;
    }

    onSendMessage(inputValue, selectedModel);
    setInputValue('');
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const models: { type: ModelType; label: string; description: string }[] = [
    { type: 'generic', label: 'Genérico', description: 'IA básica' },
    { type: 'medical', label: 'Médico', description: 'Especializado em cannabis medicinal' },
    { type: 'legal', label: 'Jurídico', description: 'Especializado em leis e regulações' },
    { type: 'veterinary', label: 'Veterinário', description: 'Especializado em uso veterinário' },
  ];

  const userName = profile?.full_name?.split(' ')[0] || 'Doutor(a)';

  return (
    <div className="flex-1 flex flex-col bg-background">
      <div className="p-4 border-b border-border">
        <h1 className="text-2xl font-bold mb-4">Nura AI</h1>
        
        <div className="flex gap-2 flex-wrap">
          {models.map((model) => {
            const accessible = hasAccess(model.type);
            const isSelected = selectedModel === model.type;
            
            // Hide generic model if user has any subscription
            if (model.type === 'generic' && subscriptions.length > 1) {
              return null;
            }

            return (
              <Button
                key={model.type}
                onClick={() => accessible && setSelectedModel(model.type)}
                variant={isSelected ? 'default' : 'outline'}
                size="sm"
                className={cn(
                  'relative',
                  !accessible && 'opacity-50 cursor-not-allowed'
                )}
                disabled={!accessible}
              >
                <span>{model.label}</span>
                {!accessible && (
                  <Lock className="ml-2 h-3 w-3 text-purple-500" />
                )}
              </Button>
            );
          })}
        </div>
      </div>

      <ScrollArea className="flex-1 p-4" ref={scrollRef}>
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center">
            {currentConversation ? (
              <div className="text-muted-foreground">
                <p className="text-lg mb-2">
                  Olá, Dr. {userName}. Como posso ajudar em sua pesquisa hoje?
                </p>
              </div>
            ) : (
              <div className="max-w-2xl">
                <p className="text-lg text-muted-foreground mb-4">
                  Aguardando sua pergunta...
                </p>
                <p className="text-sm text-muted-foreground">
                  Você pode perguntar sobre dosagens, interações medicamentosas, estudos clínicos e mais.
                </p>
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-4 max-w-4xl mx-auto">
            {messages.map((message) => (
              <div
                key={message.id}
                className={cn(
                  'flex',
                  message.role === 'user' ? 'justify-end' : 'justify-start'
                )}
              >
                <div
                  className={cn(
                    'max-w-[70%] rounded-lg p-4',
                    message.role === 'user'
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-muted'
                  )}
                >
                  <p className="whitespace-pre-wrap">{message.content}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </ScrollArea>

      <div className="p-4 border-t border-border">
        <div className="flex gap-2 max-w-4xl mx-auto">
          <Textarea
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder="Digite sua pergunta..."
            className="min-h-[60px] max-h-[200px]"
            disabled={!hasAccess(selectedModel)}
          />
          <Button
            onClick={handleSend}
            size="icon"
            className="h-[60px] w-[60px]"
            disabled={!inputValue.trim() || !hasAccess(selectedModel)}
          >
            <Send className="h-5 w-5" />
          </Button>
        </div>
        {!hasAccess(selectedModel) && (
          <p className="text-xs text-muted-foreground text-center mt-2">
            Você não tem acesso a este modelo. Faça upgrade do seu plano.
          </p>
        )}
      </div>
    </div>
  );
};