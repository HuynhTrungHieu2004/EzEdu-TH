import client from './client';
import type {
  AdvancedChatAskRequest,
  AdvancedChatResponse,
  ConversationListResponse,
  ConversationMessagesListResponse,
  ConversationResponse
} from '../types/chat';

export interface SourceChunk {
  chunk_index: number | null;
  text: string;
  distance?: number | null;
  text_preview?: string | null;
}

export interface ChatMessageResponse {
  id: string;
  document_id: string;
  question: string;
  answer: string;
  source_chunks: SourceChunk[];
  created_at: string;
}

export const chatApi = {
  ask: async (documentId: string, question: string): Promise<ChatMessageResponse> => {
    const response = await client.post<ChatMessageResponse>('/chat/ask', {
      document_id: documentId,
      question,
    });
    return response.data;
  },

  getHistory: async (documentId: string): Promise<ChatMessageResponse[]> => {
    const response = await client.get<ChatMessageResponse[]>(`/chat/history/${documentId}`);
    return response.data;
  },

  askAdvanced: async (payload: AdvancedChatAskRequest, signal?: AbortSignal): Promise<AdvancedChatResponse> => {
    const response = await client.post<AdvancedChatResponse>('/chat/ask-advanced', payload, {
      signal,
    });
    return response.data;
  },

  listConversations: async (
    params?: { search?: string; cursor?: string; limit?: number },
    signal?: AbortSignal
  ): Promise<ConversationListResponse> => {
    const response = await client.get<ConversationListResponse>('/chat/conversations', {
      params,
      signal,
    });
    return response.data;
  },

  getConversationMessages: async (
    conversationId: string,
    params?: { cursor?: string; limit?: number },
    signal?: AbortSignal
  ): Promise<ConversationMessagesListResponse> => {
    const response = await client.get<ConversationMessagesListResponse>(
      `/chat/conversations/${conversationId}/messages`,
      {
        params,
        signal,
      }
    );
    return response.data;
  },

  patchConversation: async (
    conversationId: string,
    payload: { title?: string; is_pinned?: boolean }
  ): Promise<ConversationResponse> => {
    const response = await client.patch<ConversationResponse>(
      `/chat/conversations/${conversationId}`,
      payload
    );
    return response.data;
  },

  deleteConversation: async (
    conversationId: string
  ): Promise<{ status: string; message: string }> => {
    const response = await client.delete<{ status: string; message: string }>(
      `/chat/conversations/${conversationId}`
    );
    return response.data;
  },
};

