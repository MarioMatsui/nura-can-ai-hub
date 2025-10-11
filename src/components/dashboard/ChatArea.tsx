import { useState, useRef, useEffect } from 'react';
import { Send, Lock, Menu, Sparkles, Stethoscope, Scale, PawPrint, GraduationCap, ChevronDown, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Message, UserSubscription, Conversation } from '@/pages/Dashboard';
import { cn, formatMarkdown } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';

interface ChatAreaProps {
  user: any;
  profile: any;
  messages: Message[];
  subscriptions: UserSubscription[];
  currentConversation: Conversation | null;
  onSendMessage: (content: string, modelType: 'generic' | 'medical' | 'legal' | 'veterinary' | 'specialist') => void;
  onOpenSidebar: () => void;
}

type ModelType = 'generic' | 'medical' | 'legal' | 'veterinary' | 'specialist';

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

  const models: { 
    type: ModelType; 
    label: string; 
    description: string;
    icon: typeof Sparkles;
  }[] = [
    { type: 'generic', label: 'Genérico', description: 'IA básica', icon: Sparkles },
    { type: 'medical', label: 'Médico', description: 'Especializado em cannabis medicinal', icon: Stethoscope },
    { type: 'legal', label: 'Jurídico', description: 'Especializado em leis e regulações', icon: Scale },
    { type: 'veterinary', label: 'Veterinário', description: 'Especializado em uso veterinário', icon: PawPrint },
    { type: 'specialist', label: 'Especialista', description: 'Acesso completo a todas as áreas', icon: GraduationCap },
  ];

  const userName = profile?.full_name?.split(' ')[0] || 'Doutor(a)';
  const selectedModelData = models.find(m => m.type === selectedModel);
  const SelectedIcon = selectedModelData?.icon || Sparkles;
  
  // Check if user has any active paid subscription
  const hasActivePaidPlan = subscriptions.some(
    sub => sub.plan_type !== 'free' && sub.status === 'active'
  );

  return (
    <div className="flex-1 flex flex-col bg-background min-w-0">
      <div className="p-3 pb-[9px] border-b border-border flex flex-col justify-end min-h-[100px]">
        <div className="flex items-center gap-3 mb-2">
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
        
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" className="w-full sm:w-64 justify-between gap-2 h-10">
              <div className="flex items-center gap-2">
                <SelectedIcon className="h-4 w-4" />
                <span>{selectedModelData?.label}</span>
              </div>
              <ChevronDown className="h-4 w-4 opacity-50" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-[280px] bg-background z-50">
            {models.map((model) => {
              const accessible = hasAccess(model.type);
              const isSelected = selectedModel === model.type;
              const ModelIcon = model.icon;
              
              // Hide generic model if user has any active paid subscription
              if (model.type === 'generic' && hasActivePaidPlan) {
                return null;
              }

              return (
                <DropdownMenuItem
                  key={model.type}
                  onClick={() => accessible && setSelectedModel(model.type)}
                  disabled={!accessible}
                  className={cn(
                    'flex items-center gap-3 cursor-pointer py-3 px-3',
                    !accessible && 'opacity-50 cursor-not-allowed',
                    isSelected && 'bg-accent'
                  )}
                >
                  <ModelIcon className={cn(
                    "h-5 w-5 flex-shrink-0",
                    isSelected && "text-primary"
                  )} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium truncate">{model.label}</span>
                      {isSelected && <Check className="h-4 w-4 text-primary flex-shrink-0" />}
                    </div>
                    <p className="text-xs text-muted-foreground truncate">{model.description}</p>
                  </div>
                  {!accessible && (
                    <Lock className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                  )}
                </DropdownMenuItem>
              );
            })}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <ScrollArea className="flex-1 p-3" ref={scrollRef}>
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center px-3">
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
                  <div 
                    className="whitespace-pre-wrap text-sm sm:text-base break-words prose prose-sm max-w-none dark:prose-invert"
                    dangerouslySetInnerHTML={{ __html: formatMarkdown(message.content) }}
                  />
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

      <div className="p-3 border-t border-border">
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