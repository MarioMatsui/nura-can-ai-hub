import { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Conversation, Message } from '@/pages/Dashboard';
import {
  calculateRelevance,
  createSnippet,
  sanitizeQuery,
  saveRecentSearch,
} from '@/lib/searchUtils';

export interface SearchResult {
  chatId: string;
  chatTitle: string;
  modelTag: string;
  messageId: string | null;
  snippet: string;
  timestamp: string;
  score: number;
}

export interface SearchFilters {
  type: {
    titles: boolean;
    messages: boolean;
  };
}

export function useSearchChats(
  conversations: Conversation[],
  currentConversationId: string | null,
  userId: string | null
) {
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [filters, setFilters] = useState<SearchFilters>({
    type: { titles: true, messages: true },
  });
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [allMessages, setAllMessages] = useState<Record<string, Message[]>>({});

  // Debounce da query
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(query);
    }, 300);

    return () => clearTimeout(timer);
  }, [query]);

  // Carrega mensagens de todas as conversas
  useEffect(() => {
    if (!userId || conversations.length === 0) return;

    const loadAllMessages = async () => {
      const conversationIds = conversations.map(c => c.id);
      
      const { data, error } = await supabase
        .from('messages')
        .select('*')
        .in('conversation_id', conversationIds)
        .order('created_at', { ascending: true });

      if (error) {
        console.error('Error loading messages:', error);
        return;
      }

      // Agrupa mensagens por conversation_id
      const grouped: Record<string, Message[]> = {};
      (data || []).forEach((msg: any) => {
        if (!grouped[msg.conversation_id]) {
          grouped[msg.conversation_id] = [];
        }
        grouped[msg.conversation_id].push({
          id: msg.id,
          role: msg.role as 'user' | 'assistant',
          content: msg.content,
          created_at: msg.created_at,
          attachments: msg.attachments as any,
        });
      });

      setAllMessages(grouped);
    };

    loadAllMessages();
  }, [userId, conversations]);

  // Executa busca
  useEffect(() => {
    if (!debouncedQuery.trim()) {
      setResults([]);
      return;
    }

    const sanitized = sanitizeQuery(debouncedQuery);
    if (!sanitized) {
      setResults([]);
      return;
    }

    performSearch(sanitized);
  }, [debouncedQuery, filters, conversations, allMessages]);

  const performSearch = async (searchQuery: string) => {
    setLoading(true);

    try {
      // Salva busca recente
      saveRecentSearch(searchQuery);

      const searchResults: SearchResult[] = [];

      conversations.forEach(chat => {
        const messages = allMessages[chat.id] || [];
        
        // Busca em títulos
        if (filters.type.titles) {
          const titleScore = calculateRelevance(searchQuery, chat, []);
          if (titleScore > 0) {
            searchResults.push({
              chatId: chat.id,
              chatTitle: chat.title,
              modelTag: chat.model_type,
              messageId: null,
              snippet: chat.title,
              timestamp: chat.created_at,
              score: titleScore,
            });
          }
        }

        // Busca em mensagens
        if (filters.type.messages) {
          messages.forEach(msg => {
            const msgScore = calculateRelevance(searchQuery, chat, [msg]);
            if (msgScore > 0) {
              const snippet = createSnippet(msg.content, searchQuery);
              searchResults.push({
                chatId: chat.id,
                chatTitle: chat.title,
                modelTag: chat.model_type,
                messageId: msg.id,
                snippet,
                timestamp: msg.created_at,
                score: msgScore,
              });
            }
          });
        }
      });

      // Ordena por relevância e depois por data
      searchResults.sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        return new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime();
      });

      setResults(searchResults.slice(0, 12)); // Limita a 12 resultados
    } catch (error) {
      console.error('Search error:', error);
    } finally {
      setLoading(false);
    }
  };

  return {
    query,
    setQuery,
    filters,
    setFilters,
    results,
    loading,
  };
}
