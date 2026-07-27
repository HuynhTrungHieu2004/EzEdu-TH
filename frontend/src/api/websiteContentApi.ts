import client from './client';
import { buildApiUrl, isApiBaseUrlConfigured } from '../config/api';
import type {
  WebsiteContentAdminItem,
  WebsiteContentPublicResponse,
  WebsiteContentVersionResponse,
  WebsiteSectionKey,
} from '../types/websiteContent';

export async function fetchPublicWebsiteContent(signal?: AbortSignal): Promise<WebsiteContentPublicResponse> {
  if (!isApiBaseUrlConfigured) {
    throw new Error('API base URL is not configured');
  }
  const response = await fetch(buildApiUrl('/api/v1/website-content'), { signal });
  if (!response.ok) throw new Error('Failed to load website content');
  return response.json() as Promise<WebsiteContentPublicResponse>;
}

export const websiteContentAdminApi = {
  list: async (signal?: AbortSignal): Promise<{ items: WebsiteContentAdminItem[]; generated_at: string }> => {
    const response = await client.get('/admin/website-content', { signal });
    return response.data;
  },
  updateDraft: async (sectionKey: WebsiteSectionKey, draft_content: Record<string, unknown>): Promise<WebsiteContentAdminItem> => {
    const response = await client.patch<WebsiteContentAdminItem>(`/admin/website-content/${sectionKey}`, { draft_content });
    return response.data;
  },
  publish: async (sectionKey: WebsiteSectionKey, reason: string): Promise<WebsiteContentAdminItem> => {
    const response = await client.post<WebsiteContentAdminItem>(`/admin/website-content/${sectionKey}/publish`, { reason });
    return response.data;
  },
  rollback: async (sectionKey: WebsiteSectionKey, version: number, reason: string): Promise<WebsiteContentAdminItem> => {
    const response = await client.post<WebsiteContentAdminItem>(`/admin/website-content/${sectionKey}/rollback`, { version, reason });
    return response.data;
  },
  versions: async (sectionKey: WebsiteSectionKey, signal?: AbortSignal): Promise<WebsiteContentVersionResponse> => {
    const response = await client.get<WebsiteContentVersionResponse>(`/admin/website-content/${sectionKey}/versions`, { signal });
    return response.data;
  },
};
