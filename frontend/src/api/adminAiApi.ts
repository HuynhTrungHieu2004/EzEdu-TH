import client from './client';
import type {
  AIModelPricingResponse,
  AIQuotaHistoryResponse,
  AIQuotaMutationResponse,
  AIQuotaView,
  AIUsageDashboardResponse,
  AIUsageFilters,
} from '../types/adminAi';

export const adminAiApi = {
  usage: async (params: AIUsageFilters, signal?: AbortSignal): Promise<AIUsageDashboardResponse> => {
    const response = await client.get<AIUsageDashboardResponse>('/admin/ai/usage', { params, signal });
    return response.data;
  },
  pricing: async (signal?: AbortSignal): Promise<AIModelPricingResponse> => {
    const response = await client.get<AIModelPricingResponse>('/admin/ai/pricing', { signal });
    return response.data;
  },
  quota: async (userId: string, signal?: AbortSignal): Promise<AIQuotaView> => {
    const response = await client.get<AIQuotaView>(`/admin/ai/quota/users/${userId}`, { signal });
    return response.data;
  },
  updateQuota: async (userId: string, current_quota: Record<string, unknown>, reason: string): Promise<AIQuotaMutationResponse> => {
    const response = await client.patch<AIQuotaMutationResponse>(`/admin/ai/quota/users/${userId}`, { current_quota, reason });
    return response.data;
  },
  resetQuota: async (userId: string, reason: string): Promise<AIQuotaMutationResponse> => {
    const response = await client.post<AIQuotaMutationResponse>(`/admin/ai/quota/users/${userId}/reset`, { reason });
    return response.data;
  },
  quotaHistory: async (userId: string, signal?: AbortSignal): Promise<AIQuotaHistoryResponse> => {
    const response = await client.get<AIQuotaHistoryResponse>(`/admin/ai/quota/users/${userId}/history`, { signal });
    return response.data;
  },
  quotaDefaults: async (signal?: AbortSignal): Promise<{ items: Record<string, Record<string, number>>; generated_at: string }> => {
    const response = await client.get(`/admin/ai/quota/defaults`, { signal });
    return response.data;
  },
  updateQuotaDefaults: async (role: string, overrides: Record<string, number>, reason: string): Promise<{ role: string; quota: Record<string, number> }> => {
    const response = await client.patch(`/admin/ai/quota/defaults/${role}`, { overrides, reason });
    return response.data;
  },
};
