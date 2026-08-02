import client from './client';

export type ContentHistoryType = 'all' | 'document' | 'exam';

export interface ContentHistoryItem {
  id: string;
  item_type: 'document' | 'exam';
  title: string;
  created_at: string;
  cloudinary_url: string | null;
  blueprint_id: string | null;
  attempt_count: number | null;
  avg_score: number | null;
  last_attempt_at: string | null;
  allow_retake: boolean | null;
  version: number | null;
}

export interface ContentHistoryResponse {
  items: ContentHistoryItem[];
  total: number;
  skip: number;
  limit: number;
}

export const teacherHistoryApi = {
  list: async (params: {
    type?: ContentHistoryType;
    search?: string;
    skip?: number;
    limit?: number;
  } = {}): Promise<ContentHistoryResponse> => {
    const response = await client.get<ContentHistoryResponse>('/teacher/content-history', { params });
    return response.data;
  },
};
