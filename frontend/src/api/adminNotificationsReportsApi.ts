import client from './client';
import type {
  NotificationItem,
  NotificationListParams,
  NotificationListResponse,
  NotificationPayload,
  NotificationStatisticsResponse,
  ReportExportParams,
  ReportTypesResponse,
} from '../types/adminNotificationsReports';

export const adminNotificationsApi = {
  list: async (params: NotificationListParams, signal?: AbortSignal): Promise<NotificationListResponse> => {
    const response = await client.get<NotificationListResponse>('/admin/notifications', { params, signal });
    return response.data;
  },
  statistics: async (signal?: AbortSignal): Promise<NotificationStatisticsResponse> => {
    const response = await client.get<NotificationStatisticsResponse>('/admin/notifications/statistics', { signal });
    return response.data;
  },
  create: async (payload: NotificationPayload): Promise<NotificationItem> => {
    const response = await client.post<NotificationItem>('/admin/notifications', payload);
    return response.data;
  },
  update: async (notificationId: string, payload: Partial<NotificationPayload>): Promise<NotificationItem> => {
    const response = await client.patch<NotificationItem>(`/admin/notifications/${notificationId}`, payload);
    return response.data;
  },
  publish: async (notificationId: string, reason: string): Promise<NotificationItem> => {
    const response = await client.post<NotificationItem>(`/admin/notifications/${notificationId}/publish`, { reason });
    return response.data;
  },
  cancel: async (notificationId: string, reason: string): Promise<NotificationItem> => {
    const response = await client.post<NotificationItem>(`/admin/notifications/${notificationId}/cancel`, { reason });
    return response.data;
  },
};

export const adminReportsApi = {
  types: async (signal?: AbortSignal): Promise<ReportTypesResponse> => {
    const response = await client.get<ReportTypesResponse>('/admin/reports/types', { signal });
    return response.data;
  },
  export: async (params: ReportExportParams): Promise<{ blob: Blob; filename: string }> => {
    const response = await client.get('/admin/reports/export', {
      params,
      responseType: 'blob',
    });
    const disposition = String(response.headers['content-disposition'] || '');
    const match = disposition.match(/filename="?([^";]+)"?/i);
    return {
      blob: response.data,
      filename: match?.[1] || `ezedu-${params.report_type}.${params.format}`,
    };
  },
};
