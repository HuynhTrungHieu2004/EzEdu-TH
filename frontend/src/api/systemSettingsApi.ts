import client from './client';
import { buildApiUrl, isApiBaseUrlConfigured } from '../config/api';
import type {
  FeatureFlagItem,
  FeatureFlagsResponse,
  PublicRuntimeConfig,
  SystemSettingItem,
  SystemSettingsResponse,
} from '../types/systemSettings';

export const systemSettingsApi = {
  listSettings: async (signal?: AbortSignal): Promise<SystemSettingsResponse> => {
    const response = await client.get<SystemSettingsResponse>('/admin/settings', { signal });
    return response.data;
  },
  updateSetting: async (key: string, value: unknown, reason: string): Promise<SystemSettingItem> => {
    const response = await client.patch<SystemSettingItem>(`/admin/settings/${key}`, { value, reason });
    return response.data;
  },
  listFlags: async (signal?: AbortSignal): Promise<FeatureFlagsResponse> => {
    const response = await client.get<FeatureFlagsResponse>('/admin/feature-flags', { signal });
    return response.data;
  },
  updateFlag: async (
    key: string,
    payload: { enabled?: boolean; description?: string; rollout_percentage?: number; allowed_roles?: string[]; reason: string },
  ): Promise<FeatureFlagItem> => {
    const response = await client.patch<FeatureFlagItem>(`/admin/feature-flags/${key}`, payload);
    return response.data;
  },
};

export async function fetchPublicRuntimeConfig(signal?: AbortSignal): Promise<PublicRuntimeConfig> {
  if (!isApiBaseUrlConfigured) throw new Error('API base URL is not configured');
  const response = await fetch(buildApiUrl('/api/v1/runtime-config'), { signal });
  if (!response.ok) throw new Error('Failed to load runtime config');
  return response.json() as Promise<PublicRuntimeConfig>;
}
