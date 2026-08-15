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
  origin_type: 'web_knowledge' | 'web_crawl' | 'manual';
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

export type CrawlReviewStatus = 'draft' | 'reviewing' | 'approved' | 'rejected';

export interface CrawlBatch {
  id: string;
  seed_urls: string[];
  subject_id: string;
  grade: number | null;
  topic_id: string | null;
  max_pages: number;
  status: 'pending' | 'running' | 'completed' | 'failed';
  fetched_count: number;
  blocked_count: number;
  failed_count: number;
}

export interface CrawlItem {
  id: string;
  batch_id: string;
  canonical_url: string;
  source_url: string;
  title: string | null;
  content_text: string | null;
  crawl_status: string;
  crawl_error: string | null;
  review_status: CrawlReviewStatus;
  quality_status: string;
  copyright_status: string;
  subject_id: string | null;
  grade: number | null;
  topic_id: string | null;
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

  createCrawlBatch: async (payload: {
    seed_urls: string[];
    subject_id: string;
    grade?: number;
    topic_id?: string;
    max_pages: number;
  }): Promise<CrawlBatch> => {
    const response = await client.post<CrawlBatch>('/curriculum-kb/crawl-batches', payload);
    return response.data;
  },

  listCrawlItems: async (status?: CrawlReviewStatus) => {
    const response = await client.get<{ items: CrawlItem[]; total: number }>('/curriculum-kb/crawl-items', {
      params: status ? { status } : {},
    });
    return response.data;
  },

  reviewCrawlItem: async (id: string, targetStatus: CrawlReviewStatus): Promise<CrawlItem> => {
    const response = await client.post<CrawlItem>(`/curriculum-kb/crawl-items/${id}/review`, {
      target_status: targetStatus,
    });
    return response.data;
  },

  promoteCrawlItem: async (id: string): Promise<CurriculumSource> => {
    const response = await client.post<CurriculumSource>(`/curriculum-kb/crawl-items/${id}/promote`);
    return response.data;
  },
};
