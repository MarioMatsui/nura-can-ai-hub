import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { ConversationSidebar } from '@/components/dashboard/ConversationSidebar';
import { ChatArea } from '@/components/dashboard/ChatArea';
import { MobileSidebar } from '@/components/dashboard/MobileSidebar';
import { useToast } from '@/hooks/use-toast';

export interface Conversation {
  id: string;
  title: string;
  model_type: 'generic' | 'medical' | 'legal' | 'veterinary';
  created_at: string;
}

export interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  created_at: string;
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
  const [sidebarOpen, setSidebarOpen] = useState(false);

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
      .select('plan_type, status')
      .eq('user_id', userId)
      .eq('status', 'active');

    if (error) {
      console.error('Error fetching subscriptions:', error);
      return;
    }

    setSubscriptions(data || []);
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

    setMessages((data || []) as Message[]);
  };

  const handleSelectConversation = async (conversation: Conversation) => {
    setCurrentConversation(conversation);
    await fetchMessages(conversation.id);
    setSidebarOpen(false); // Close mobile sidebar
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

  const handleSendMessage = async (content: string, modelType: 'generic' | 'medical' | 'legal' | 'veterinary') => {
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

    setMessages([...messages, userMessage as Message]);

    // Call AI API and save response
    try {
      const response = await supabase.functions.invoke('chat-ai', {
        body: {
          conversationId,
          message: content,
          modelType,
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
        setMessages(prev => [...prev, aiMessage as Message]);
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
    <div className="flex h-screen overflow-hidden bg-background">
      {/* Desktop Sidebar */}
      <div className="hidden lg:block">
        <ConversationSidebar
          conversations={conversations}
          currentConversation={currentConversation}
          onSelectConversation={handleSelectConversation}
          onNewConversation={handleNewConversation}
          onRenameConversation={handleRenameConversation}
          onDeleteConversation={handleDeleteConversation}
        />
      </div>

      {/* Mobile Sidebar */}
      <MobileSidebar
        conversations={conversations}
        currentConversation={currentConversation}
        onSelectConversation={handleSelectConversation}
        onNewConversation={handleNewConversation}
        onRenameConversation={handleRenameConversation}
        onDeleteConversation={handleDeleteConversation}
        open={sidebarOpen}
        onOpenChange={setSidebarOpen}
      />

      <ChatArea
        user={user}
        profile={profile}
        messages={messages}
        subscriptions={subscriptions}
        currentConversation={currentConversation}
        onSendMessage={handleSendMessage}
        onOpenSidebar={() => setSidebarOpen(true)}
      />
    </div>
  );
};

export default Dashboard;