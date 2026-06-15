import client from './client';

export interface SourceChunk {
  chunk_index: number | null;
  text: string;
}

export interface ChatAskResponse {
  id: string;
  question: string;
  answer: string;
  sources: SourceChunk[];
  created_at: string;
}

export const chatApi = {
  ask: async (documentId: string, question: string): Promise<ChatAskResponse> => {
    const response = await client.post<ChatAskResponse>('/chat/ask', {
      document_id: documentId,
      question,
    });
    return response.data;
  },

  getHistory: async (documentId: string): Promise<ChatAskResponse[]> => {
    const response = await client.get<ChatAskResponse[]>(`/chat/history/${documentId}`);
    return response.data;
  },
};
