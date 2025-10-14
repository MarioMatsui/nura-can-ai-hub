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

    // Create temporary assistant message for streaming
    const tempMessageId = `temp-${Date.now()}`;
    const tempMessage: Message = {
      id: tempMessageId,
      role: 'assistant',
      content: '',
      created_at: new Date().toISOString(),
    };

    setMessages(prev => [...prev, tempMessage]);

    // Call AI API with streaming
    try {
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const supabaseAnonKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
      
      const response = await fetch(`${supabaseUrl}/functions/v1/chat-ai`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${supabaseAnonKey}`,
        },
        body: JSON.stringify({
          conversationId,
          message: content,
          modelType,
          attachments: attachments || [],
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        
        // Check for daily limit error
        if (errorData?.error === 'limite_diario') {
          // Remove temp message
          setMessages(prev => prev.filter(m => m.id !== tempMessageId));
          toast({
            title: 'Limite Diário Atingido',
            description: errorData.message || 'Você atingiu o limite de 5 mensagens por dia do plano gratuito.',
            variant: 'destructive',
          });
          return;
        }
        
        throw new Error(errorData?.error || 'Failed to get AI response');
      }

      // Process streaming response with throttled updates for smooth typing effect
      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      let accumulatedContent = '';
      let buffer = '';
      let lastUpdateTime = Date.now();
      const UPDATE_INTERVAL = 100; // Update UI every 100ms for smooth typing effect

      if (!reader) {
        throw new Error('No response body');
      }

      console.log('Starting to read stream...');

      // Function to update message
      const updateMessage = () => {
        setMessages(prev => prev.map(msg => 
          msg.id === tempMessageId 
            ? { ...msg, content: accumulatedContent }
            : msg
        ));
      };

      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          console.log('Stream completed');
          // Final update to ensure all content is shown
          updateMessage();
          break;
        }

        // Decode chunk and add to buffer
        const chunk = decoder.decode(value, { stream: true });
        buffer += chunk;
        
        // Process complete lines
        const lines = buffer.split('\n');
        // Keep last partial line in buffer
        buffer = lines.pop() || '';

        for (const line of lines) {
          // Skip empty lines and SSE comments
          if (!line.trim() || line.startsWith(':')) continue;
          
          if (line.startsWith('data: ')) {
            const data = line.slice(6).trim();
            if (data === '[DONE]') continue;

            try {
              const parsed = JSON.parse(data);
              const content = parsed.choices?.[0]?.delta?.content;
              
              if (content) {
                accumulatedContent += content;
                
                // Update UI at throttled intervals for smooth typing effect
                const now = Date.now();
                if (now - lastUpdateTime >= UPDATE_INTERVAL) {
                  updateMessage();
                  lastUpdateTime = now;
                  // Small delay to ensure browser renders the update
                  await new Promise(resolve => setTimeout(resolve, 0));
                }
              }
            } catch (e) {
              console.error('Failed to parse SSE data:', e);
            }
          }
        }
      }

      // Process any remaining buffer
      if (buffer.trim() && buffer.startsWith('data: ')) {
        const data = buffer.slice(6).trim();
        if (data !== '[DONE]') {
          try {
            const parsed = JSON.parse(data);
            const content = parsed.choices?.[0]?.delta?.content;
            if (content) {
              accumulatedContent += content;
              setMessages(prev => prev.map(msg => 
                msg.id === tempMessageId 
                  ? { ...msg, content: accumulatedContent }
                  : msg
              ));
            }
          } catch (e) {
            console.error('Failed to parse final SSE data:', e);
          }
        }
      }

      // Save the final AI response to database
      const { data: aiMessage, error: aiMsgError } = await supabase
        .from('messages')
        .insert({
          conversation_id: conversationId,
          role: 'assistant',
          content: accumulatedContent,
        })
        .select()
        .single();

      if (aiMsgError) {
        throw aiMsgError;
      }

      // Replace temp message with saved message
      if (aiMessage) {
        setMessages(prev => prev.map(msg => 
          msg.id === tempMessageId 
            ? { ...aiMessage, attachments: aiMessage.attachments as any } as Message
            : msg
        ));
      }
    } catch (error: any) {
      console.error('Error getting AI response:', error);
      
      // Remove temporary message on error
      setMessages(prev => prev.filter(m => m.id !== tempMessageId));
      
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