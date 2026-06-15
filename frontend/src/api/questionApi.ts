import client from './client';

export interface QuestionItem {
  question: string;
  options: Record<string, string> | null;
  correct_answer: string;
  explanation: string;
  difficulty: string;
  question_type: string;
}

export interface QuestionSetResponse {
  id: string;
  document_id: string;
  user_id: string;
  document_name: string;
  question_count: number;
  difficulty: string;
  question_type: string;
  questions: QuestionItem[];
  created_at: string;
  updated_at: string;
}

export const questionApi = {
  generate: async (documentId: string, count: number, difficulty: string, type: string): Promise<QuestionSetResponse> => {
    const response = await client.post<QuestionSetResponse>('/questions/generate', {
      document_id: documentId,
      question_count: count,
      difficulty,
      question_type: type,
    });
    return response.data;
  },

  listByDocument: async (documentId: string): Promise<QuestionSetResponse[]> => {
    const response = await client.get<QuestionSetResponse[]>(`/questions/document/${documentId}`);
    return response.data;
  },

  get: async (id: string): Promise<QuestionSetResponse> => {
    const response = await client.get<QuestionSetResponse>(`/questions/${id}`);
    return response.data;
  },

  exportDocxUrl: (id: string): string => {
    const baseUrl = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000';
    return `${baseUrl}/api/v1/questions/${id}/export/docx`;
  },

  exportPdfUrl: (id: string): string => {
    const baseUrl = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000';
    return `${baseUrl}/api/v1/questions/${id}/export/pdf`;
  },
};
