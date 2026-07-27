import client from './client';
import type {
  ActivityLogListParams,
  UserActivityLogListResponse,
  UserActivityLogStatisticsResponse,
} from '../types/activityLogs';

export const activityLogsApi = {
  list: async (params: ActivityLogListParams, signal?: AbortSignal): Promise<UserActivityLogListResponse> => {
    const response = await client.get<UserActivityLogListResponse>('/admin/activity-logs', { params, signal });
    return response.data;
  },

  statistics: async (
    params: Pick<ActivityLogListParams, 'user_id' | 'date_from' | 'date_to'> = {},
    signal?: AbortSignal,
  ): Promise<UserActivityLogStatisticsResponse> => {
    const response = await client.get<UserActivityLogStatisticsResponse>('/admin/activity-logs/statistics', { params, signal });
    return response.data;
  },

  userActivity: async (
    userId: string,
    params: Omit<ActivityLogListParams, 'user_id'> = {},
    signal?: AbortSignal,
  ): Promise<UserActivityLogListResponse> => {
    const response = await client.get<UserActivityLogListResponse>(`/admin/users/${userId}/activity`, { params, signal });
    return response.data;
  },
};
