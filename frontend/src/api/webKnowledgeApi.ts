import client from './client';
import type { WebCitation } from '../types/chat';

export type WebKnowledgeSourceStatus = 'draft' | 'reviewing' | 'approved' | 'published' | 'archived';

export interface ExploreResult {
  query: string;
  answer: string;
  citations: WebCitation[];
  evidence_status: 'well_supported' | 'partially_supported' | 'insufficient_evidence' | 'conflicting_sources' | 'unverified';
  confidence: number;
  from_cache: boolean;
  generated_at: string;
}

export interface WebKnowledgeSource {
  id: string;
  query: string;
  answer: string;
  citations: WebCitation[];
  subject_id: string | null;
  grade: number | null;
  topic_id: string | null;
  status: WebKnowledgeSourceStatus;
  version: number;
  owner_id: string;
  created_at: string;
  updated_at: string;
}

export const webKnowledgeApi = {
  explore: async (query: string): Promise<ExploreResult> => {
    const response = await client.post<ExploreResult>('/web-knowledge/explore', { query });
    return response.data;
  },

  saveSource: async (payload: {
    query: string;
    answer: string;
    citations: WebCitation[];
    subject_id?: string;
    grade?: number;
    topic_id?: string;
  }): Promise<WebKnowledgeSource> => {
    const response = await client.post<WebKnowledgeSource>('/web-knowledge/sources', payload);
    return response.data;
  },

  listSources: async (status?: WebKnowledgeSourceStatus): Promise<{ items: WebKnowledgeSource[]; total: number }> => {
    const response = await client.get('/web-knowledge/sources', { params: status ? { status } : {} });
    return response.data;
  },

  reviewSource: async (
    id: string,
    version: number,
    targetStatus: WebKnowledgeSourceStatus,
  ): Promise<WebKnowledgeSource> => {
    const response = await client.post<WebKnowledgeSource>(`/web-knowledge/sources/${id}/review`, {
      version,
      target_status: targetStatus,
    });
    return response.data;
  },
};
