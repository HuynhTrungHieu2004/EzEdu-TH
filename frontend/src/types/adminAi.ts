export type AIUsageStatus = 'success' | 'failure';

export interface AIUsageFilters {
  from_date?: string;
  to_date?: string;
  user_id?: string;
  provider?: string;
  model?: string;
  feature?: string;
  status?: AIUsageStatus;
  page?: number;
  page_size?: number;
}

export interface AIUsageSummary {
  total_requests: number;
  success_requests: number;
  failed_requests: number;
  total_tokens: number;
  input_tokens: number;
  output_tokens: number;
  estimated_cost: number;
  currency: string;
  avg_latency_ms: number | null;
  p50_latency_ms: number | null;
  p95_latency_ms: number | null;
  p99_latency_ms: number | null;
}

export interface AIAggregateRow {
  key: string;
  label: string | null;
  request_count: number;
  total_tokens: number;
  estimated_cost: number;
  avg_latency_ms: number | null;
}

export interface AIUsageWarning {
  type: string;
  severity: 'info' | 'warning' | 'critical';
  message: string;
  value: number | null;
  threshold: number | null;
}

export interface AIUsageEventItem {
  id: string;
  user_id: string;
  user_email: string | null;
  feature: string;
  provider: string;
  model: string;
  input_tokens: number;
  output_tokens: number;
  total_tokens: number;
  estimated_cost: number | null;
  currency: string;
  latency_ms: number;
  status: AIUsageStatus;
  error_code: string | null;
  request_id: string | null;
  document_id: string | null;
  conversation_id: string | null;
  created_at: string;
}

export interface AIUsageDashboardResponse {
  summary: AIUsageSummary;
  top_users: AIAggregateRow[];
  top_models: AIAggregateRow[];
  top_features: AIAggregateRow[];
  warnings: AIUsageWarning[];
  items: AIUsageEventItem[];
  total: number;
  page: number;
  page_size: number;
  total_pages: number;
  generated_at: string;
}

export interface AIQuotaView {
  user_id: string;
  role: string;
  default_quota: Record<string, number>;
  override_quota: Record<string, unknown>;
  effective_quota: Record<string, number>;
  usage: Record<string, number>;
  generated_at: string;
}

export interface AIQuotaMutationResponse {
  quota: AIQuotaView;
  audit_event: Record<string, unknown>;
}

export interface AIQuotaHistoryItem {
  id: string;
  admin_user_id: string;
  admin_email_snapshot: string;
  reason: string | null;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  changed_fields: string[];
  timestamp: string;
}

export interface AIQuotaHistoryResponse {
  items: AIQuotaHistoryItem[];
  total: number;
  generated_at: string;
}

export interface AIModelPricingItem {
  provider: string;
  model: string;
  input_per_1m: number;
  output_per_1m: number;
  currency: string;
}

export interface AIModelPricingResponse {
  items: AIModelPricingItem[];
  generated_at: string;
}
