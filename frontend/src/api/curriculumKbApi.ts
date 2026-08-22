import client from './client';
import type { WebCitation } from '../types/chat';

export type CurriculumReviewStatus = 'draft' | 'reviewing' | 'approved' | 'published' | 'archived';
export type CurriculumQualityStatus = 'unreviewed' | 'flagged' | 'verified';
export type CurriculumIngestStatus = 'not_ingested' | 'pending' | 'ingested' | 'failed';

export interface CurriculumSource {
  id: string;
  title: string;
  content_text: string;
  subject_id: string;
  grade: number | null;
  topic_id: string | null;
  curriculum_version: string | null;
  citations: WebCitation[];
  origin_type: 'web_knowledge' | 'manual';
  origin_id: string | null;
  review_status: CurriculumReviewStatus;
  quality_status: CurriculumQualityStatus;
  ingest_status: CurriculumIngestStatus;
  chunk_count: number;
  ingest_error: string | null;
  version: number;
  owner_id: string;
}

export interface CurriculumSearchResultItem {
  source_id: string;
  title: string;
  chunk_text: string;
  subject_id: string;
  grade: number | null;
  topic_id: string | null;
  citations: WebCitation[];
  relevance_score: number;
}

export const curriculumKbApi = {
  search: async (query: string, filters?: { subject_id?: string; grade?: number; topic_id?: string }) => {
    const response = await client.get<{ query: string; results: CurriculumSearchResultItem[] }>('/curriculum-kb/search', {
      params: { query, ...filters },
    });
    return response.data;
  },

  listPublished: async (filters?: { subject_id?: string; grade?: number; topic_id?: string }) => {
    const response = await client.get<{ items: CurriculumSource[]; total: number }>('/curriculum-kb/sources/published', {
      params: filters,
    });
    return response.data;
  },

  createSource: async (payload: {
    title: string;
    content_text: string;
    subject_id: string;
    grade?: number;
    topic_id?: string;
    curriculum_version?: string;
  }): Promise<CurriculumSource> => {
    const response = await client.post<CurriculumSource>('/curriculum-kb/sources', payload);
    return response.data;
  },

  createFromWebKnowledge: async (webSourceId: string): Promise<CurriculumSource> => {
    const response = await client.post<CurriculumSource>(`/curriculum-kb/sources/from-web-knowledge/${webSourceId}`);
    return response.data;
  },

  listMySources: async (status?: CurriculumReviewStatus) => {
    const response = await client.get<{ items: CurriculumSource[]; total: number }>('/curriculum-kb/sources', {
      params: status ? { status } : {},
    });
    return response.data;
  },

  reviewSource: async (id: string, version: number, targetStatus: CurriculumReviewStatus): Promise<CurriculumSource> => {
    const response = await client.post<CurriculumSource>(`/curriculum-kb/sources/${id}/review`, {
      version,
      target_status: targetStatus,
    });
    return response.data;
  },

  ingestSource: async (id: string): Promise<{ status: string }> => {
    const response = await client.post(`/curriculum-kb/sources/${id}/ingest`);
    return response.data;
  },
};
