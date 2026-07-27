import client from './client';
import type {
  BackendHealthResponse,
  OverviewResponse,
  UsageResponse,
  QualityResponse,
  ErrorsLatencyResponse,
  EvaluationResponse,
  DateRangeFilter,
  AdminManagedRole,
  AdminUserListResponse,
  AdminUserStatusFilter,
  AuditLogResponse,
  AuditLogSeverity,
  ErrorMonitoringResponse,
  ErrorSeverity,
} from '../types/analytics';

function buildParams(filter: DateRangeFilter): Record<string, string> {
  const params: Record<string, string> = {};
  if (filter.from_date) params['from_date'] = filter.from_date;
  if (filter.to_date) params['to_date'] = filter.to_date;
  if (filter.timezone) params['timezone'] = filter.timezone;
  if (filter.bucket) params['bucket'] = filter.bucket;
  return params;
}

export const analyticsApi = {
  getBackendHealth: async (signal?: AbortSignal): Promise<BackendHealthResponse> => {
    const r = await client.get<BackendHealthResponse>('/admin/dashboard/backend-health', { signal });
    return r.data;
  },

  getOverview: async (filter: DateRangeFilter, signal?: AbortSignal): Promise<OverviewResponse> => {
    const r = await client.get<OverviewResponse>('/admin/dashboard/overview', {
      params: buildParams(filter),
      signal,
    });
    return r.data;
  },

  getUsage: async (filter: DateRangeFilter, signal?: AbortSignal): Promise<UsageResponse> => {
    const r = await client.get<UsageResponse>('/admin/dashboard/usage', {
      params: buildParams(filter),
      signal,
    });
    return r.data;
  },

  getQuality: async (filter: DateRangeFilter, signal?: AbortSignal): Promise<QualityResponse> => {
    const r = await client.get<QualityResponse>('/admin/dashboard/quality', {
      params: buildParams(filter),
      signal,
    });
    return r.data;
  },

  getErrorsLatency: async (filter: DateRangeFilter, signal?: AbortSignal): Promise<ErrorsLatencyResponse> => {
    const r = await client.get<ErrorsLatencyResponse>('/admin/dashboard/errors-latency', {
      params: buildParams(filter),
      signal,
    });
    return r.data;
  },

  getEvaluation: async (signal?: AbortSignal): Promise<EvaluationResponse> => {
    const r = await client.get<EvaluationResponse>('/admin/dashboard/evaluation', { signal });
    return r.data;
  },

  listUsers: async (
    params: {
      search?: string;
      role?: AdminManagedRole;
      status?: AdminUserStatusFilter;
      limit?: number;
      skip?: number;
    },
    signal?: AbortSignal,
  ): Promise<AdminUserListResponse> => {
    const r = await client.get<AdminUserListResponse>('/admin/dashboard/users', { params, signal });
    return r.data;
  },

  updateUserRole: async (userId: string, role: AdminManagedRole) => {
    const r = await client.patch(`/admin/dashboard/users/${userId}/role`, { role });
    return r.data;
  },

  updateUserStatus: async (userId: string, isActive: boolean) => {
    const r = await client.patch(`/admin/dashboard/users/${userId}/status`, { is_active: isActive });
    return r.data;
  },

  listAuditLogs: async (
    filter: DateRangeFilter & {
      search?: string;
      event_type?: string;
      severity?: AuditLogSeverity;
      limit?: number;
      skip?: number;
    },
    signal?: AbortSignal,
  ): Promise<AuditLogResponse> => {
    const { search, event_type, severity, limit, skip, ...dateFilter } = filter;
    const r = await client.get<AuditLogResponse>('/admin/dashboard/audit-logs', {
      params: {
        ...buildParams(dateFilter),
        ...(search ? { search } : {}),
        ...(event_type ? { event_type } : {}),
        ...(severity ? { severity } : {}),
        ...(limit ? { limit } : {}),
        ...(skip ? { skip } : {}),
      },
      signal,
    });
    return r.data;
  },

  getErrorMonitoring: async (
    filter: DateRangeFilter & {
      search?: string;
      severity?: ErrorSeverity;
      service?: string;
      page?: number;
      page_size?: number;
    },
    signal?: AbortSignal,
  ): Promise<ErrorMonitoringResponse> => {
    const { search, severity, service, page, page_size, ...dateFilter } = filter;
    const r = await client.get<ErrorMonitoringResponse>('/admin/dashboard/error-monitoring', {
      params: {
        ...buildParams(dateFilter),
        ...(search ? { search } : {}),
        ...(severity ? { severity } : {}),
        ...(service ? { service } : {}),
        ...(page ? { page } : {}),
        ...(page_size ? { page_size } : {}),
      },
      signal,
    });
    return r.data;
  },
};
