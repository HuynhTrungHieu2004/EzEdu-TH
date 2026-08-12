import client from './client';
import type {
  ActivityLogListParams,
  UserActivityLogListResponse,
  UserActivityLogStatisticsResponse,
  UserBehaviorGroupsResponse,
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

  /** Phân nhóm hành vi người dùng bằng K-Means (chỉ quản trị). */
  behaviorGroups: async (days = 90, signal?: AbortSignal): Promise<UserBehaviorGroupsResponse> => {
    const response = await client.get<UserBehaviorGroupsResponse>('/admin/behavior-groups', {
      params: { days },
      signal,
    });
    return response.data;
  },
};
