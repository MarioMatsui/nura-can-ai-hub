import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { ConversationSidebar } from '@/components/dashboard/ConversationSidebar';
import { ChatArea } from '@/components/dashboard/ChatArea';
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
  };

  const handleNewConversation = () => {
    setCurrentConversation(null);
    setMessages([]);
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

    // TODO: Call AI API here and save response
    // For now, just a placeholder response
    setTimeout(async () => {
      const { data: aiMessage } = await supabase
        .from('messages')
        .insert({
          conversation_id: conversationId,
          role: 'assistant',
          content: 'Esta é uma resposta temporária. A integração com a IA será implementada em breve.',
        })
        .select()
        .single();

      if (aiMessage) {
        setMessages(prev => [...prev, aiMessage as Message]);
      }
    }, 1000);
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
      <ConversationSidebar
        conversations={conversations}
        currentConversation={currentConversation}
        onSelectConversation={handleSelectConversation}
        onNewConversation={handleNewConversation}
      />
      <ChatArea
        user={user}
        profile={profile}
        messages={messages}
        subscriptions={subscriptions}
        currentConversation={currentConversation}
        onSendMessage={handleSendMessage}
      />
    </div>
  );
};

export default Dashboard;