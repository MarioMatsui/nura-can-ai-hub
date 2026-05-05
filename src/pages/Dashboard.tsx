import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
import { ChatSidebar } from '@/components/dashboard/ChatSidebar';
import { ChatArea } from '@/components/dashboard/ChatArea';
import { SearchModal } from '@/components/dashboard/SearchModal';
import { PrescriptionView } from '@/components/dashboard/prescription/PrescriptionView';
import { useToast } from '@/hooks/use-toast';
import { SidebarProvider } from '@/components/ui/sidebar';
import { useIsMobile } from '@/hooks/use-mobile';
import { preloadAppSettings, useAppSettings } from '@/hooks/useAppSettings';

export interface Conversation {
  id: string;
  title: string;
  model_type: 'generic' | 'medical' | 'legal' | 'veterinary' | 'specialist';
  created_at: string;
}

export interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  created_at: string;
  attachments?: Array<{
    file_path: string;
    file_name: string;
    file_type: string;
    storage_url: string;
  }>;
}

export interface UserSubscription {
  plan_type: 'free' | 'medical' | 'legal' | 'veterinary' | 'specialist';
  status: 'active' | 'inactive' | 'cancelled' | 'scheduled_cancellation' | 'pending_cancellation';
  cancel_at?: string;
}

const Dashboard = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [user, setUser] = useState<any>(null);
  const [profile, setProfile] = useState<any>(null);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [currentConversation, setCurrentConversation] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [subscriptions, setSubscriptions] = useState<UserSubscription[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchModalOpen, setSearchModalOpen] = useState(false);
  const [activeView, setActiveView] = useState<'chat' | 'prescription'>('chat');
  // Phase 1: streaming state. null = not streaming. Empty string = streaming
  // started but no token yet. Non-empty = streaming with content.
  const [streamingContent, setStreamingContent] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const isMobile = useIsMobile();
  const { getFlag } = useAppSettings();
  const showModelSelector = getFlag('show_model_selector', false);
  const [appTheme, setAppTheme] = useState<'light' | 'dark'>(() => {
    const saved = localStorage.getItem('theme:/app');
    return (saved as 'light' | 'dark') || 'dark';
  });

  // Apply theme to app container and body (for portals)
  useEffect(() => {
    const appRoot = document.getElementById('app-root');
    if (appRoot) {
      appRoot.setAttribute('data-theme', appTheme);
    }
    // Apply theme class to body for portals (modals, popovers)
    document.body.classList.remove('light', 'dark');
    document.body.classList.add(appTheme);
  }, [appTheme]);

  const handleThemeToggle = () => {
    const newTheme = appTheme === 'dark' ? 'light' : 'dark';
    setAppTheme(newTheme);
    localStorage.setItem('theme:/app', newTheme);
  };

  // Atalho global Ctrl/⌘ + K para abrir busca
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        setSearchModalOpen(true);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  useEffect(() => {
    checkAuth();
  }, []);

  const checkAuth = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    
    if (!session) {
      navigate('/auth/login');
      return;
    }

    setUser(session.user);
    await Promise.all([
      fetchProfile(session.user.id),
      fetchConversations(session.user.id),
      fetchSubscriptions(session.user.id),
      preloadAppSettings(),
    ]);
    setLoading(false);
  };

  const fetchProfile = async (userId: string) => {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single();

    if (error) {
      console.error('Error fetching profile:', error);
      return;
    }

    setProfile(data);
  };

  const fetchConversations = async (userId: string) => {
    const { data, error } = await supabase
      .from('conversations')
      .select('*')
      .eq('user_id', userId)
      .order('updated_at', { ascending: false });

    if (error) {
      console.error('Error fetching conversations:', error);
      toast({
        title: 'Erro',
        description: 'Não foi possível carregar as conversas',
        variant: 'destructive',
      });
      return;
    }

    setConversations(data || []);
  };

  const fetchSubscriptions = async (userId: string) => {
    const { data, error } = await supabase
      .from('user_plans')
      .select('plan_type, status, current_period_end, cancel_at_period_end, stripe_customer_id, billing_cycle, subscription_id')
      .eq('user_id', userId);

    if (error) {
      console.error('Error fetching user plans:', error);
      setSubscriptions([]);
      return;
    }

    // Map Portuguese plan names to English for consistency
    const planTypeMap: Record<string, 'free' | 'medical' | 'legal' | 'veterinary' | 'specialist'> = {
      'free': 'free',
      'medico': 'medical',
      'juridico': 'legal',
      'veterinario': 'veterinary',
      'especialista': 'specialist',
      // Also support English names for backward compatibility
      'medical': 'medical',
      'legal': 'legal',
      'veterinary': 'veterinary',
      'specialist': 'specialist',
    };

    // Process all plans - multiple active plans allowed
    if (data && data.length > 0) {
      const activePlans = data
        .filter(plan => plan.status === 'active')
        .map(plan => {
          const mappedPlanType = planTypeMap[plan.plan_type] || 'free';
          
          // Check if plan should still be active (not past cancellation date)
          const isCanceled = plan.cancel_at_period_end && plan.current_period_end && new Date(plan.current_period_end) < new Date();
          
          if (!isCanceled) {
            return {
              plan_type: mappedPlanType,
              status: plan.cancel_at_period_end ? 'scheduled_cancellation' : 'active',
              cancel_at: plan.current_period_end,
              stripe_customer_id: plan.stripe_customer_id,
              billing_cycle: plan.billing_cycle,
              subscription_id: plan.subscription_id,
            };
          }
          return null;
        })
        .filter(Boolean);

      if (activePlans.length > 0) {
        setSubscriptions(activePlans as any);
      } else {
        // No active plans, fallback to free
        setSubscriptions([{
          plan_type: 'free',
          status: 'active',
          cancel_at: null,
          stripe_customer_id: null,
          billing_cycle: null,
          subscription_id: null,
        }] as any);
      }
    } else {
      // No plans at all, fallback to free
      setSubscriptions([{
        plan_type: 'free',
        status: 'active',
        cancel_at: null,
        stripe_customer_id: null,
        billing_cycle: null,
        subscription_id: null,
      }] as any);
    }
  };

  const fetchMessages = async (conversationId: string) => {
    const { data, error } = await supabase
      .from('messages')
      .select('*')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: true });

    if (error) {
      console.error('Error fetching messages:', error);
      return;
    }

    setMessages((data || []).map(msg => ({
      id: msg.id,
      role: msg.role as 'user' | 'assistant',
      content: msg.content,
      created_at: msg.created_at,
      attachments: Array.isArray(msg.attachments) ? msg.attachments as any : []
    })));
  };

  const handleSelectConversation = async (conversation: Conversation) => {
    setActiveView('chat');
    setCurrentConversation(conversation);
    await fetchMessages(conversation.id);
  };

  const handleNewConversation = () => {
    setActiveView('chat');
    setCurrentConversation(null);
    setMessages([]);
  };

  const handleRenameConversation = async (conversationId: string, newTitle: string) => {
    const { error } = await supabase
      .from('conversations')
      .update({ title: newTitle })
      .eq('id', conversationId);

    if (error) {
      toast({
        title: 'Erro',
        description: 'Não foi possível renomear a conversa',
        variant: 'destructive',
      });
      return;
    }

    // Update local state
    setConversations(conversations.map(conv => 
      conv.id === conversationId ? { ...conv, title: newTitle } : conv
    ));
    
    if (currentConversation?.id === conversationId) {
      setCurrentConversation({ ...currentConversation, title: newTitle });
    }

    toast({
      title: 'Sucesso',
      description: 'Conversa renomeada com sucesso',
    });
  };

  const handleDeleteConversation = async (conversationId: string) => {
    const { error } = await supabase
      .from('conversations')
      .delete()
      .eq('id', conversationId);

    if (error) {
      toast({
        title: 'Erro',
        description: 'Não foi possível deletar a conversa',
        variant: 'destructive',
      });
      return;
    }

    // Update local state
    setConversations(conversations.filter(conv => conv.id !== conversationId));
    
    if (currentConversation?.id === conversationId) {
      setCurrentConversation(null);
      setMessages([]);
    }

    toast({
      title: 'Sucesso',
      description: 'Conversa deletada com sucesso',
    });
  };

  const handleNavigateToChat = async (chatId: string, messageId?: string) => {
    const conversation = conversations.find(c => c.id === chatId);
    if (!conversation) return;

    await handleSelectConversation(conversation);

    // Scroll para a mensagem específica se fornecida
    if (messageId) {
      setTimeout(() => {
        const messageElement = document.getElementById(`message-${messageId}`);
        if (messageElement) {
          messageElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
          // Adiciona destaque temporário
          messageElement.classList.add('ring-2', 'ring-primary', 'rounded-lg');
          setTimeout(() => {
            messageElement.classList.remove('ring-2', 'ring-primary', 'rounded-lg');
          }, 2000);
        }
      }, 100);
    }
  };

  const handleSendMessage = async (
    content: string, 
    modelType: 'generic' | 'medical' | 'legal' | 'veterinary' | 'specialist',
    attachments?: Array<{file_path: string; file_name: string; file_type: string; storage_url: string}>
  ) => {
    if (!user) return;

    let conversationId = currentConversation?.id;

    // Create new conversation if none exists
    if (!conversationId) {
      const title = content.slice(0, 50) + (content.length > 50 ? '...' : '');
      const { data: newConversation, error: convError } = await supabase
        .from('conversations')
        .insert({
          user_id: user.id,
          title,
          model_type: modelType,
        })
        .select()
        .single();

      if (convError) {
        toast({
          title: 'Erro',
          description: 'Não foi possível criar a conversa',
          variant: 'destructive',
        });
        return;
      }

      conversationId = newConversation.id;
      setCurrentConversation(newConversation);
      setConversations([newConversation, ...conversations]);
    }

    // Save user message
    const { data: userMessage, error: msgError } = await supabase
      .from('messages')
      .insert({
        conversation_id: conversationId,
        role: 'user',
        content,
        attachments: attachments || [],
      })
      .select()
      .single();

    if (msgError) {
      toast({
        title: 'Erro',
        description: 'Não foi possível enviar a mensagem',
        variant: 'destructive',
      });
      return;
    }

    setMessages([...messages, {
      ...userMessage,
      attachments: userMessage.attachments as any
    } as Message]);

    // Call AI API and stream the response. The backend now returns
    // text/event-stream on success and JSON on errors / daily-limit, so we
    // branch on Content-Type after fetch returns. Persistence of the assistant
    // message moved to the backend (see chat-ai/index.ts) — we only optimistically
    // append the persisted row to local state when the `done` event arrives.
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      toast({ title: 'Erro', description: 'Sessão expirada. Faça login novamente.', variant: 'destructive' });
      navigate('/auth/login');
      return;
    }

    // Tracks per-request streaming state. The throttle keeps React renders ≤20fps
    // so very fast streams don't flood the reconciler.
    let buffer = '';
    let pendingFlush: ReturnType<typeof setTimeout> | null = null;
    const scheduleFlush = () => {
      if (pendingFlush) return;
      pendingFlush = setTimeout(() => {
        pendingFlush = null;
        setStreamingContent(buffer);
      }, 50);
    };
    const cancelFlush = () => {
      if (pendingFlush) {
        clearTimeout(pendingFlush);
        pendingFlush = null;
      }
    };

    const controller = new AbortController();
    abortRef.current = controller;
    setStreamingContent(''); // signal: streaming started, no tokens yet

    try {
      const response = await fetch(`${SUPABASE_URL}/functions/v1/chat-ai`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          conversationId,
          message: content,
          modelType,
          attachments: attachments || [],
        }),
        signal: controller.signal,
      });

      const contentType = response.headers.get('content-type') || '';

      // JSON path = error or daily-limit. Same semantics as before.
      if (contentType.includes('application/json')) {
        const aiData = await response.json();

        if (aiData?.error === 'limite_diario') {
          toast({
            title: 'Limite Diário Atingido',
            description: aiData.message || 'Você atingiu o limite de 5 mensagens por dia do plano gratuito.',
            variant: 'destructive',
          });
          return;
        }

        if (!response.ok) {
          throw new Error(aiData?.error || `chat-ai returned ${response.status}`);
        }

        // Unexpected JSON success — shouldn't happen with the new backend, but
        // handle defensively in case the function is rolled back temporarily.
        throw new Error('Unexpected JSON response from chat-ai');
      }

      if (!contentType.includes('text/event-stream') || !response.body) {
        throw new Error(`Unexpected response type: ${contentType}`);
      }

      // SSE path — read chunks, parse `data: {...}` events.
      const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
      let lineBuffer = '';
      let assistantMessageId: string | null = null;
      let streamError: string | null = null;

      streamLoop: while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        lineBuffer += value;
        const lines = lineBuffer.split('\n');
        lineBuffer = lines.pop() ?? '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed.startsWith('data:')) continue;
          const dataStr = trimmed.slice(5).trim();
          if (!dataStr) continue;

          try {
            const event = JSON.parse(dataStr);

            if (typeof event.delta === 'string') {
              buffer += event.delta;
              scheduleFlush();
              continue;
            }

            if (event.error) {
              streamError = event.error;
              break streamLoop;
            }

            if (event.done) {
              assistantMessageId = event.messageId ?? null;
              break streamLoop;
            }
          } catch (parseErr) {
            console.error('SSE parse error:', parseErr, 'data:', dataStr.slice(0, 200));
          }
        }
      }

      cancelFlush();

      if (streamError) {
        throw new Error(streamError);
      }

      // Always show the response if we received any tokens. If the backend
      // returned a messageId, use it (matches the persisted row, survives
      // refresh). If not, the DB INSERT failed server-side — keep the response
      // visible with a synthetic id so the user sees the answer they waited
      // for, and warn that history may not persist on refresh.
      if (buffer.length > 0) {
        setMessages(prev => [...prev, {
          id: assistantMessageId ?? `local-${Date.now()}`,
          role: 'assistant',
          content: buffer,
          created_at: new Date().toISOString(),
          attachments: [],
        } as Message]);

        if (!assistantMessageId) {
          toast({
            title: 'Aviso',
            description: 'Resposta exibida mas não foi salva no histórico. Recarregue se quiser tentar novamente.',
            variant: 'destructive',
          });
        }
      }
    } catch (error: any) {
      cancelFlush();

      if (error?.name === 'AbortError') {
        // User cancelled — backend may still persist what it has. Refetch to
        // pick up the partial message if it landed.
        await fetchMessages(conversationId);
        return;
      }

      console.error('Error streaming AI response:', error);
      const errorMessage = error?.message || '';
      const isLimitError = errorMessage.includes('limite diário') || errorMessage.includes('limite_diario');

      if (!isLimitError) {
        toast({
          title: 'Erro',
          description: 'Não foi possível obter resposta da IA. Tente novamente.',
          variant: 'destructive',
        });
      }
    } finally {
      setStreamingContent(null);
      abortRef.current = null;
    }
  };

  const handleStopGenerating = () => {
    abortRef.current?.abort();
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-lg">Carregando...</div>
      </div>
    );
  }

  const profileIncomplete = profile && profile.profile_completed === false;

  return (
    <SidebarProvider 
      defaultOpen={!isMobile}
      style={{
        '--sidebar-width-icon': '5.125rem'
      } as React.CSSProperties}
    >
      {profileIncomplete && (
        <div className="fixed top-0 left-0 right-0 z-50 h-12 bg-primary text-primary-foreground flex items-center justify-center px-4 text-sm sm:text-base font-semibold shadow-md">
          <span className="text-center">
            Para iniciar seu uso da Nuracan você precisa{" "}
            <button
              type="button"
              onClick={() => navigate('/auth/completar-cadastro')}
              className="underline underline-offset-2 hover:opacity-90 font-bold"
            >
              Completar seu cadastro
            </button>
          </span>
        </div>
      )}
      <div
        id="app-root"
        data-theme={appTheme}
        className={`flex h-screen w-full overflow-hidden bg-background ${profileIncomplete ? 'pt-12' : ''}`}
      >
        <div className={profileIncomplete ? 'flex w-full pointer-events-none opacity-50 select-none' : 'flex w-full'}>
          <ChatSidebar
            conversations={conversations}
            currentConversation={currentConversation}
            onSelectConversation={handleSelectConversation}
            onNewConversation={handleNewConversation}
            onRenameConversation={handleRenameConversation}
            onDeleteConversation={handleDeleteConversation}
            appTheme={appTheme}
            onThemeToggle={handleThemeToggle}
            profile={profile}
            user={user}
            subscriptions={subscriptions}
            onOpenSearch={() => setSearchModalOpen(true)}
            activeView={activeView}
            onOpenPrescription={() => setActiveView('prescription')}
          />

          {activeView === 'prescription' && user ? (
            <PrescriptionView userId={user.id} subscriptions={subscriptions} />
          ) : (
            <ChatArea
              user={user}
              profile={profile}
              messages={messages}
              subscriptions={subscriptions}
              currentConversation={currentConversation}
              onSendMessage={handleSendMessage}
              onOpenSidebar={() => {}}
              showModelSelector={showModelSelector}
              streamingContent={streamingContent}
              onStopGenerating={handleStopGenerating}
            />
          )}
        </div>

        <SearchModal
          open={searchModalOpen}
          onOpenChange={setSearchModalOpen}
          conversations={conversations}
          currentConversationId={currentConversation?.id || null}
          userId={user?.id || null}
          onNavigateToChat={handleNavigateToChat}
        />
      </div>
    </SidebarProvider>
  );
};

export default Dashboard;