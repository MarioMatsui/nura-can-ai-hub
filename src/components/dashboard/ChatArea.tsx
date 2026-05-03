import { useState, useRef, useEffect } from 'react';
import { Send, Lock, Sparkles, Stethoscope, Scale, PawPrint, GraduationCap, ChevronDown, Check, Paperclip, X, FileText, Image as ImageIcon, Menu } from 'lucide-react';
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
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { MarkdownMessage } from './MarkdownMessage';
import { TypingIndicator } from './TypingIndicator';
import { usePlanSettings } from '@/hooks/usePlanSettings';
import { useSidebar } from '@/components/ui/sidebar';
import { useIsMobile } from '@/hooks/use-mobile';

interface Attachment {
  file_path: string;
  file_name: string;
  file_type: string;
  storage_url: string;
}

interface ChatAreaProps {
  user: any;
  profile: any;
  messages: Message[];
  subscriptions: UserSubscription[];
  currentConversation: Conversation | null;
  onSendMessage: (content: string, modelType: 'generic' | 'medical' | 'legal' | 'veterinary' | 'specialist', attachments?: Attachment[]) => void;
  onOpenSidebar: () => void;
  showModelSelector?: boolean;
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
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();
  const { isPlanActive } = usePlanSettings();
  const { toggleSidebar } = useSidebar();
  const isMobile = useIsMobile();

  // Determine the default model based on active subscriptions
  const getDefaultModelFromSubscriptions = (): ModelType => {
    // Filter subscriptions that are active OR scheduled for cancellation but still within valid period
    const activeSubs = subscriptions.filter(sub => {
      if (sub.status === 'active') return true;
      if (sub.status === 'scheduled_cancellation' && sub.cancel_at) {
        return new Date(sub.cancel_at) > new Date();
      }
      return false;
    });
    
    // Priority: specialist > medical > legal > veterinary > free/generic
    if (activeSubs.some(sub => sub.plan_type === 'specialist')) return 'specialist';
    if (activeSubs.some(sub => sub.plan_type === 'medical')) return 'medical';
    if (activeSubs.some(sub => sub.plan_type === 'legal')) return 'legal';
    if (activeSubs.some(sub => sub.plan_type === 'veterinary')) return 'veterinary';
    
    return 'generic';
  };

  // Initialize model selection with priority logic
  useEffect(() => {
    // Get default model from subscriptions
    const defaultModel = getDefaultModelFromSubscriptions();
    
    // If no active plans (defaultModel is 'generic'), FORCE generic model
    if (defaultModel === 'generic') {
      setSelectedModel('generic');
      localStorage.setItem('lastUsedModel', 'generic');
      return;
    }

    // Priority 1: Model from current conversation (if user has access to it)
    if (currentConversation?.model_type && currentConversation.model_type !== 'generic') {
      if (hasAccess(currentConversation.model_type)) {
        setSelectedModel(currentConversation.model_type);
        return;
      } else {
        setSelectedModel(defaultModel);
        localStorage.setItem('lastUsedModel', defaultModel);
        return;
      }
    }

    // Priority 2: Use the default model from active subscription
    setSelectedModel(defaultModel);
    localStorage.setItem('lastUsedModel', defaultModel);
  }, [currentConversation, subscriptions]);

  // Scroll to bottom function
  const scrollToBottom = () => {
    setTimeout(() => {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
    }, 100);
  };

  // Scroll when messages change or when processing state changes
  useEffect(() => {
    scrollToBottom();
  }, [messages, isProcessing]);

  const hasAccess = (modelType: ModelType): boolean => {
    // Generic model is always available for everyone
    if (modelType === 'generic') return true;
    
    // Check for specific model type plan or specialist (which has access to all)
    const hasAccessResult = subscriptions.some(
      sub => {
        // Free plan only has access to generic
        if ((sub.plan_type as string) === 'free') return false;
        
        // Check if plan matches the model type or if user has specialist (access to all)
        const planMatch = sub.plan_type === modelType || (sub.plan_type as string) === 'specialist';
        
        // Active plans have access
        if (sub.status === 'active' && planMatch) return true;
        
        // Scheduled cancellation still has access until cancel_at date
        if (sub.status === 'scheduled_cancellation' && planMatch && sub.cancel_at) {
          const cancelDate = new Date(sub.cancel_at);
          const now = new Date();
          return cancelDate > now;
        }
        
        return false;
      }
    );
    
    return hasAccessResult;
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setIsUploading(true);
    const uploadedAttachments: Attachment[] = [];

    try {
      for (const file of Array.from(files)) {
        // Validate file size (10MB limit)
        if (file.size > 10 * 1024 * 1024) {
          toast({
            title: "Arquivo muito grande",
            description: `${file.name} excede o limite de 10MB`,
            variant: "destructive",
          });
          continue;
        }

        // Upload to Supabase Storage
        const fileExt = file.name.split('.').pop();
        const fileName = `${Date.now()}-${Math.random().toString(36).substring(2)}.${fileExt}`;
        const filePath = `${user.id}/${fileName}`;

        const { error: uploadError } = await supabase.storage
          .from('chat-attachments')
          .upload(filePath, file);

        if (uploadError) {
          console.error('Upload error:', uploadError);
          toast({
            title: "Erro no upload",
            description: `Falha ao enviar ${file.name}`,
            variant: "destructive",
          });
          continue;
        }

        // Get public URL
        const { data: { publicUrl } } = supabase.storage
          .from('chat-attachments')
          .getPublicUrl(filePath);

        uploadedAttachments.push({
          file_path: filePath,
          file_name: file.name,
          file_type: file.type,
          storage_url: publicUrl,
        });
      }

      setAttachments(prev => [...prev, ...uploadedAttachments]);
      
      if (uploadedAttachments.length > 0) {
        toast({
          title: "Arquivos anexados",
          description: `${uploadedAttachments.length} arquivo(s) pronto(s) para envio`,
        });
      }
    } catch (error) {
      console.error('File upload error:', error);
      toast({
        title: "Erro",
        description: "Erro ao processar arquivos",
        variant: "destructive",
      });
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const removeAttachment = (index: number) => {
    setAttachments(prev => prev.filter((_, i) => i !== index));
  };

  const handleSend = async () => {
    if ((!inputValue.trim() && attachments.length === 0) || isProcessing) return;
    
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
    const attachmentsToSend = [...attachments];
    setInputValue('');
    setAttachments([]);
    
    // Scroll to bottom after sending
    scrollToBottom();
    
    try {
      await onSendMessage(messageToSend, selectedModel, attachmentsToSend);
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
    { type: 'generic', label: 'Generalista', description: 'IA básica', icon: Sparkles },
    { type: 'medical', label: 'Médico', description: 'Especializado em cannabis medicinal', icon: Stethoscope },
    { type: 'legal', label: 'Jurídico', description: 'Especializado em leis e regulações', icon: Scale },
    { type: 'veterinary', label: 'Veterinário', description: 'Especializado em uso veterinário', icon: PawPrint },
    { type: 'specialist', label: 'Especialista', description: 'Acesso completo a todas as áreas', icon: GraduationCap },
  ];

  // Map plan types for comparison
  const planTypeMap: Record<string, ModelType> = {
    'medico': 'medical',
    'juridico': 'legal',
    'veterinario': 'veterinary',
    'especialista': 'specialist',
  };

  // Map model types to plan codes for isPlanActive check
  const modelToPlanCode: Record<ModelType, string> = {
    'generic': 'free',
    'medical': 'medico',
    'legal': 'juridico',
    'veterinary': 'veterinario',
    'specialist': 'especialista',
  };

  const userName = profile?.full_name?.split(' ')[0] || 'Doutor(a)';
  const selectedModelData = models.find(m => m.type === selectedModel);
  const SelectedIcon = selectedModelData?.icon || Sparkles;
  
  // Check if user has any active paid subscription (including scheduled cancellations within valid period)
  const hasActivePaidPlan = subscriptions.some(
    sub => {
      const isPaid = sub.plan_type !== 'free' && (sub.plan_type as string) !== 'generic';
      const statusValid = sub.status === 'active' || 
        (sub.status === 'scheduled_cancellation' && sub.cancel_at && new Date(sub.cancel_at) > new Date());
      return isPaid && statusValid;
    }
  );

  // Get user's subscribed models
  const subscribedModels = subscriptions
    .filter(sub => 
      sub.status === 'active' || 
      (sub.status === 'scheduled_cancellation' && sub.cancel_at && new Date(sub.cancel_at) > new Date())
    )
    .map(sub => planTypeMap[sub.plan_type] || sub.plan_type)
    .filter(Boolean);

  return (
    <div className="flex-1 flex flex-col bg-background min-w-0">
      {/* Header with hamburger menu on mobile + model dropdown */}
      <div className="p-4 flex items-center gap-2">
        {isMobile && (
          <Button
            variant="ghost"
            size="icon"
            onClick={toggleSidebar}
            className="h-10 w-10 shrink-0"
            aria-label="Abrir menu"
          >
            <Menu className="h-5 w-5" />
          </Button>
        )}
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
            {models
              .filter((model) => {
                // Filter out inactive plans (but always show if user already has access)
                const planCode = modelToPlanCode[model.type];
                const userHasAccess = hasAccess(model.type);
                return isPlanActive(planCode) || userHasAccess;
              })
              .map((model) => {
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
                  onClick={() => {
                    if (accessible) {
                      setSelectedModel(model.type);
                      // Save to localStorage as user preference
                      localStorage.setItem('lastUsedModel', model.type);
                    }
                  }}
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
                      <span className={cn(
                        "font-medium truncate transition-colors duration-200",
                        isSelected && "dark:text-black"
                      )}>
                        {model.label}
                      </span>
                      {isSelected && <Check className="h-4 w-4 text-primary flex-shrink-0" />}
                    </div>
                    <p className={cn(
                      "text-xs text-muted-foreground truncate transition-colors duration-200",
                      isSelected && "dark:text-black"
                    )}>
                      {model.description}
                    </p>
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
                id={`message-${message.id}`}
                key={message.id}
                className={cn(
                  'flex transition-all',
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
                  {message.attachments && message.attachments.length > 0 && (
                    <div className="mb-2 space-y-1">
                      {message.attachments.map((att: any, idx: number) => (
                        <div key={idx} className="flex items-center gap-2 text-xs opacity-80">
                          {att.file_type?.startsWith('image/') ? (
                            <ImageIcon className="h-3 w-3" />
                          ) : (
                            <FileText className="h-3 w-3" />
                          )}
                          <span className="truncate">{att.file_name}</span>
                        </div>
                      ))}
                    </div>
                  )}
                  <MarkdownMessage 
                    content={message.content}
                    className="text-sm sm:text-base"
                  />
                </div>
              </div>
            ))}
            
            {/* AI Processing Indicator */}
            {isProcessing && <TypingIndicator />}
            {/* Invisible element to scroll to */}
            <div ref={messagesEndRef} />
          </div>
        )}
      </ScrollArea>

      <div className="pt-1.5 px-3 pb-3 border-t border-border">
        <div className="max-w-4xl mx-auto">
          {attachments.length > 0 && (
            <div className="mb-2 flex flex-wrap gap-2">
              {attachments.map((att, idx) => (
                <div
                  key={idx}
                  className="flex items-center gap-2 bg-muted px-3 py-2 rounded-lg text-sm"
                >
                  {att.file_type.startsWith('image/') ? (
                    <ImageIcon className="h-4 w-4" />
                  ) : (
                    <FileText className="h-4 w-4" />
                  )}
                  <span className="truncate max-w-[150px]">{att.file_name}</span>
                  <button
                    onClick={() => removeAttachment(idx)}
                    className="hover:bg-background rounded p-0.5"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ))}
            </div>
          )}
          <div className="flex gap-2">
            <div className="relative">
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept="image/*,.pdf,.txt,.doc,.docx"
                onChange={handleFileSelect}
                className="hidden"
              />
              <Button
                variant="outline"
                size="icon"
                onClick={() => {
                  if (selectedModel === 'generic') {
                    toast({
                      title: "Recurso bloqueado",
                      description: "Envio de documentos não está disponível no plano gratuito. Faça upgrade para desbloquear.",
                      variant: "destructive",
                    });
                    return;
                  }
                  fileInputRef.current?.click();
                }}
                disabled={isUploading || isProcessing || selectedModel === 'generic'}
                className={cn(
                  "h-[50px] w-[50px] sm:h-[60px] sm:w-[60px] flex-shrink-0",
                  selectedModel === 'generic' && "opacity-50 cursor-not-allowed"
                )}
                title={selectedModel === 'generic' ? "Disponível apenas em planos pagos" : "Anexar documento"}
              >
                <Paperclip className="h-4 w-4 sm:h-5 sm:w-5" />
              </Button>
              {selectedModel === 'generic' && (
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                  <Lock className="h-3 w-3 text-muted-foreground" />
                </div>
              )}
            </div>
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
              disabled={(!inputValue.trim() && attachments.length === 0) || !hasAccess(selectedModel) || isProcessing}
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
    </div>
  );
};