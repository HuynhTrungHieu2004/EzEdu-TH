import client from './client';

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
};
