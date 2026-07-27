import client from './client';
import type {
  AdminPasswordResetResponse,
  AdminRole,
  AdminUserCreatePayload,
  AdminUserDetail,
  AdminUserListParams,
  AdminUserListResponse,
  AdminUserMutationResponse,
  AdminUserStatisticsResponse,
  AdminUserUpdatePayload,
} from '../types/adminUsers';

export interface AdminUserQuotaUpdatePayload {
  current_quota: Record<string, unknown>;
  reason?: string;
}

export const adminUsersApi = {
  list: async (params: AdminUserListParams, signal?: AbortSignal): Promise<AdminUserListResponse> => {
    const response = await client.get<AdminUserListResponse>('/admin/users', { params, signal });
    return response.data;
  },

  statistics: async (signal?: AbortSignal): Promise<AdminUserStatisticsResponse> => {
    const response = await client.get<AdminUserStatisticsResponse>('/admin/users/statistics', { signal });
    return response.data;
  },

  detail: async (userId: string, signal?: AbortSignal): Promise<AdminUserDetail> => {
    const response = await client.get<AdminUserDetail>(`/admin/users/${userId}`, { signal });
    return response.data;
  },

  create: async (payload: AdminUserCreatePayload): Promise<AdminUserMutationResponse> => {
    const response = await client.post<AdminUserMutationResponse>('/admin/users', payload);
    return response.data;
  },

  update: async (userId: string, payload: AdminUserUpdatePayload): Promise<AdminUserMutationResponse> => {
    const response = await client.patch<AdminUserMutationResponse>(`/admin/users/${userId}`, payload);
    return response.data;
  },

  lock: async (userId: string, reason: string): Promise<AdminUserMutationResponse> => {
    const response = await client.post<AdminUserMutationResponse>(`/admin/users/${userId}/lock`, { reason });
    return response.data;
  },

  unlock: async (userId: string): Promise<AdminUserMutationResponse> => {
    const response = await client.post<AdminUserMutationResponse>(`/admin/users/${userId}/unlock`);
    return response.data;
  },

  restore: async (userId: string): Promise<AdminUserMutationResponse> => {
    const response = await client.post<AdminUserMutationResponse>(`/admin/users/${userId}/restore`);
    return response.data;
  },

  softDelete: async (userId: string, reason: string): Promise<AdminUserMutationResponse> => {
    const response = await client.delete<AdminUserMutationResponse>(`/admin/users/${userId}`, { data: { reason } });
    return response.data;
  },

  changeRole: async (userId: string, role: AdminRole, reason: string): Promise<AdminUserMutationResponse> => {
    const response = await client.patch<AdminUserMutationResponse>(`/admin/users/${userId}/role`, { role, reason });
    return response.data;
  },

  updateQuota: async (userId: string, payload: AdminUserQuotaUpdatePayload): Promise<AdminUserMutationResponse> => {
    const response = await client.patch<AdminUserMutationResponse>(`/admin/users/${userId}/quota`, payload);
    return response.data;
  },

  forceLogout: async (userId: string): Promise<AdminUserMutationResponse> => {
    const response = await client.post<AdminUserMutationResponse>(`/admin/users/${userId}/force-logout`);
    return response.data;
  },

  resetPassword: async (userId: string): Promise<AdminPasswordResetResponse> => {
    const response = await client.post<AdminPasswordResetResponse>(`/admin/users/${userId}/password-reset`, {});
    return response.data;
  },
};
