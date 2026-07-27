import client from './client';
import type {
  AdminAuditLogItem,
  AdminAuditLogListParams,
  AdminAuditLogListResponse,
  AdminAuditLogStatisticsResponse,
} from '../types/adminAuditLogs';

export const adminAuditLogsApi = {
  list: async (params: AdminAuditLogListParams, signal?: AbortSignal): Promise<AdminAuditLogListResponse> => {
    const response = await client.get<AdminAuditLogListResponse>('/admin/audit-logs', { params, signal });
    return response.data;
  },

  detail: async (auditId: string, signal?: AbortSignal): Promise<AdminAuditLogItem> => {
    const response = await client.get<AdminAuditLogItem>(`/admin/audit-logs/${auditId}`, { signal });
    return response.data;
  },

  statistics: async (
    params: Pick<AdminAuditLogListParams, 'date_from' | 'date_to'> = {},
    signal?: AbortSignal,
  ): Promise<AdminAuditLogStatisticsResponse> => {
    const response = await client.get<AdminAuditLogStatisticsResponse>('/admin/audit-logs/statistics', { params, signal });
    return response.data;
  },
};
