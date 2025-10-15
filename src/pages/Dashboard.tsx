import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { ChatSidebar } from '@/components/dashboard/ChatSidebar';
import { ChatArea } from '@/components/dashboard/ChatArea';
import { useToast } from '@/hooks/use-toast';
import { SidebarProvider } from '@/components/ui/sidebar';
import { useIsMobile } from '@/hooks/use-mobile';

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
  status: 'active' | 'inactive' | 'cancelled';
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
  const isMobile = useIsMobile();
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
      fetchSubscriptions(session.user.id)
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
      .from('user_subscriptions')
      .select('id, plan_type, status, cancel_at, user_id')
      .eq('user_id', userId);

    if (error) {
      console.error('Error fetching subscriptions:', error);
      return;
    }

    // Filter to include both active and pending_cancellation status
    const filtered = (data || []).filter(sub => 
      sub.status === 'active' || sub.status === 'pending_cancellation' as any
    );

    setSubscriptions(filtered);
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
    setCurrentConversation(conversation);
    await fetchMessages(conversation.id);
  };

  const handleNewConversation = () => {
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

    // Call AI API and save response
    try {
      const response = await supabase.functions.invoke('chat-ai', {
        body: {
          conversationId,
          message: content,
          modelType,
          attachments: attachments || [],
        }
      });

      const aiData = response.data as any;

      // Check for business logic errors (like daily limit)
      if (aiData?.error === 'limite_diario') {
        toast({
          title: 'Limite Diário Atingido',
          description: aiData.message || 'Você atingiu o limite de 5 mensagens por dia do plano gratuito.',
          variant: 'destructive',
        });
        return;
      }

      // Check for other errors
      if (response.error) {
        throw response.error;
      }

      if (!aiData?.response) {
        throw new Error('No response from AI');
      }

      // Save AI response to database
      const { data: aiMessage, error: aiMsgError } = await supabase
        .from('messages')
        .insert({
          conversation_id: conversationId,
          role: 'assistant',
          content: aiData.response,
        })
        .select()
        .single();

      if (aiMsgError) {
        throw aiMsgError;
      }

      if (aiMessage) {
        setMessages(prev => [...prev, {
          ...aiMessage,
          attachments: aiMessage.attachments as any
        } as Message]);
      }
    } catch (error: any) {
      console.error('Error getting AI response:', error);
      
      // Check if it's a daily limit error
      const errorMessage = error?.message || '';
      const isLimitError = errorMessage.includes('limite diário');
      
      if (!isLimitError) {
        toast({
          title: 'Erro',
          description: 'Não foi possível obter resposta da IA. Tente novamente.',
          variant: 'destructive',
        });
      }
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-lg">Carregando...</div>
      </div>
    );
  }

  return (
    <SidebarProvider 
      defaultOpen={!isMobile}
      style={{
        '--sidebar-width-icon': '5.125rem'
      } as React.CSSProperties}
    >
      <div id="app-root" data-theme={appTheme} className="flex h-screen w-full overflow-hidden bg-background">
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
        />
        
        <ChatArea
          user={user}
          profile={profile}
          messages={messages}
          subscriptions={subscriptions}
          currentConversation={currentConversation}
          onSendMessage={handleSendMessage}
          onOpenSidebar={() => {}}
        />
      </div>
    </SidebarProvider>
  );
};

export default Dashboard;