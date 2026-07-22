import client from './client';
import type {
  OverviewResponse,
  UsageResponse,
  QualityResponse,
  ErrorsLatencyResponse,
  EvaluationResponse,
  DateRangeFilter,
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
};
