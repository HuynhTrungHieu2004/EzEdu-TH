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

type ExportFormat = 'docx' | 'pdf';

function parseFilename(contentDisposition?: string, fallback = 'question-set') {
  if (!contentDisposition) {
    return fallback;
  }

  const utf8Match = contentDisposition.match(/filename\*=UTF-8''([^;]+)/i);
  if (utf8Match?.[1]) {
    return decodeURIComponent(utf8Match[1]);
  }

  const basicMatch = contentDisposition.match(/filename="?([^";]+)"?/i);
  if (basicMatch?.[1]) {
    return basicMatch[1];
  }

  return fallback;
}

function downloadBlob(blob: Blob, filename: string) {
  const objectUrl = window.URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = objectUrl;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  window.URL.revokeObjectURL(objectUrl);
}

async function exportQuestionSet(id: string, format: ExportFormat) {
  const response = await client.get<Blob>(`/questions/${id}/export/${format}`, {
    responseType: 'blob',
  });

  const extension = format === 'docx' ? 'docx' : 'pdf';
  const fallbackName = `question-set.${extension}`;
  const filename = parseFilename(response.headers['content-disposition'], fallbackName);
  downloadBlob(response.data, filename);
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

  downloadDocx: async (id: string) => {
    await exportQuestionSet(id, 'docx');
  },

  downloadPdf: async (id: string) => {
    await exportQuestionSet(id, 'pdf');
  },
};
