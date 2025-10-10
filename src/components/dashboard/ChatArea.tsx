import { useState, useRef, useEffect } from 'react';
import { Send, Lock, Menu } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Message, UserSubscription, Conversation } from '@/pages/Dashboard';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';

interface ChatAreaProps {
  user: any;
  profile: any;
  messages: Message[];
  subscriptions: UserSubscription[];
  currentConversation: Conversation | null;
  onSendMessage: (content: string, modelType: 'generic' | 'medical' | 'legal' | 'veterinary') => void;
  onOpenSidebar: () => void;
}

type ModelType = 'generic' | 'medical' | 'legal' | 'veterinary';

export const ChatArea = ({
  user,
  profile,
  messages,
  subscriptions,
  currentConversation,
  onSendMessage,
  onOpenSidebar,
}: ChatAreaProps) => {
  const [inputValue, setInputValue] = useState('');
  const [selectedModel, setSelectedModel] = useState<ModelType>('generic');
  const [isProcessing, setIsProcessing] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();

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

  const handleSend = async () => {
    if (!inputValue.trim() || isProcessing) return;
    
    if (!hasAccess(selectedModel)) {
      toast({
        title: "Acesso Negado",
        description: "Você precisa de uma assinatura premium para usar este modelo de IA.",
        variant: "destructive",
      });
      return;
    }

    setIsProcessing(true);
    const messageToSend = inputValue;
    setInputValue('');
    
    try {
      await onSendMessage(messageToSend, selectedModel);
    } catch (error: any) {
      // Check if it's a daily limit error
      if (error?.message?.includes('limite diário')) {
        toast({
          title: "Limite Diário Atingido",
          description: "Você atingiu o limite de 5 mensagens por dia do plano gratuito. Faça upgrade para continuar.",
          variant: "destructive",
        });
      }
    } finally {
      setIsProcessing(false);
    }
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
    <div className="flex-1 flex flex-col bg-background min-w-0">
      <div className="p-3 sm:p-4 border-b border-border">
        <div className="flex items-center gap-3 mb-3 sm:mb-4">
          <Button
            variant="ghost"
            size="icon"
            onClick={onOpenSidebar}
            className="lg:hidden"
          >
            <Menu className="h-5 w-5" />
          </Button>
          <h1 className="text-xl sm:text-2xl font-bold">Nura AI</h1>
        </div>
        
        <div className="flex gap-1.5 sm:gap-2 flex-wrap">
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
                  'relative text-xs sm:text-sm px-2 sm:px-3',
                  !accessible && 'opacity-50 cursor-not-allowed'
                )}
                disabled={!accessible}
              >
                <span className="truncate">{model.label}</span>
                {!accessible && (
                  <Lock className="ml-1 sm:ml-2 h-3 w-3 text-purple-500 flex-shrink-0" />
                )}
              </Button>
            );
          })}
        </div>
      </div>

      <ScrollArea className="flex-1 p-3 sm:p-4" ref={scrollRef}>
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center px-4">
            {currentConversation ? (
              <div className="text-muted-foreground">
                <p className="text-base sm:text-lg mb-2">
                  Olá, Dr. {userName}. Como posso ajudar em sua pesquisa hoje?
                </p>
              </div>
            ) : (
              <div className="max-w-2xl">
                <p className="text-base sm:text-lg text-muted-foreground mb-3 sm:mb-4">
                  Aguardando sua pergunta...
                </p>
                <p className="text-xs sm:text-sm text-muted-foreground">
                  Você pode perguntar sobre dosagens, interações medicamentosas, estudos clínicos e mais.
                </p>
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-3 sm:space-y-4 max-w-4xl mx-auto">
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
                    'max-w-[85%] sm:max-w-[75%] rounded-lg p-3 sm:p-4',
                    message.role === 'user'
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-muted'
                  )}
                >
                  <p className="whitespace-pre-wrap text-sm sm:text-base break-words">{message.content}</p>
                </div>
              </div>
            ))}
            
            {/* AI Processing Indicator */}
            {isProcessing && (
              <div className="flex justify-start">
                <div className="max-w-[85%] sm:max-w-[75%] rounded-lg p-3 sm:p-4 bg-muted">
                  <div className="flex gap-1">
                    <div className="w-2 h-2 rounded-full bg-primary animate-bounce" style={{ animationDelay: '0ms' }}></div>
                    <div className="w-2 h-2 rounded-full bg-primary animate-bounce" style={{ animationDelay: '150ms' }}></div>
                    <div className="w-2 h-2 rounded-full bg-primary animate-bounce" style={{ animationDelay: '300ms' }}></div>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </ScrollArea>

      <div className="p-2 sm:p-4 border-t border-border">
        <div className="flex gap-2 max-w-4xl mx-auto">
          <Textarea
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder="Digite sua pergunta..."
            className="min-h-[50px] sm:min-h-[60px] max-h-[120px] sm:max-h-[200px] text-sm sm:text-base"
            disabled={!hasAccess(selectedModel) || isProcessing}
          />
          <Button
            onClick={handleSend}
            size="icon"
            className="h-[50px] w-[50px] sm:h-[60px] sm:w-[60px] flex-shrink-0"
            disabled={!inputValue.trim() || !hasAccess(selectedModel) || isProcessing}
          >
            <Send className="h-4 w-4 sm:h-5 sm:w-5" />
          </Button>
        </div>
        {!hasAccess(selectedModel) && (
          <p className="text-xs text-muted-foreground text-center mt-2 px-2">
            Você não tem acesso a este modelo. Faça upgrade do seu plano.
          </p>
        )}
      </div>
    </div>
  );
};