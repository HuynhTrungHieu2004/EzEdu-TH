// Analytics types for Admin Dashboard

export type BucketType = 'hour' | 'day' | 'week';

export interface DateRangeFilter {
  from_date?: string;  // ISO 8601 UTC
  to_date?: string;    // ISO 8601 UTC
  timezone?: string;   // IANA timezone
  bucket?: BucketType;
}

export type BackendHealthStatus = 'healthy' | 'degraded' | 'down' | 'unknown';
export type BackendServiceStatus = BackendHealthStatus;
export type HealthAlertSeverity = 'info' | 'warning' | 'critical';

export interface HealthComponent {
  name: string;
  status: BackendHealthStatus;
  checked_at: string;
  latency_ms: number | null;
  message: string;
  details: Record<string, unknown>;
}

export interface HealthAlert {
  severity: HealthAlertSeverity;
  message: string;
  component: string | null;
  value: number | null;
  threshold: number | null;
}

export interface BackendHealthResponse {
  status: BackendHealthStatus;
  services: Record<string, BackendServiceStatus>;
  components: HealthComponent[];
  history: HealthComponent[];
  alerts: HealthAlert[];
  project_name: string;
  api_v1_path: string;
  generated_at: string;
}

export type ErrorSeverity = 'info' | 'warning' | 'critical';

export interface ErrorLogItem {
  error_id: string;
  timestamp: string;
  service: string;
  endpoint: string;
  method: string;
  status_code: number;
  error_code: string;
  message_safe: string;
  request_id: string | null;
  user_id: string | null;
  duration_ms: number;
  severity: ErrorSeverity;
  occurrence_count: number;
}

export interface ErrorMonitoringSummary {
  total_errors: number;
  by_severity: Record<string, number>;
  top_endpoints: Array<{ endpoint: string; count: number }>;
  top_ai_models: Array<{ model: string; provider: string; count: number }>;
  timeout_count: number;
  error_rate: number | null;
  latency: {
    p50_ms: number | null;
    p95_ms: number | null;
    p99_ms: number | null;
  };
  warnings: HealthAlert[];
}

export interface ErrorMonitoringResponse {
  summary: ErrorMonitoringSummary;
  items: ErrorLogItem[];
  total: number;
  page: number;
  page_size: number;
  total_pages: number;
  generated_at: string;
}

// ── Overview ─────────────────────────────────────────────────
export interface OverviewResponse {
  generated_at: string;
  time_range: { from_date: string; to_date: string };
  tracking_started_at: string | null;
  total_users: number;
  ai_active_users: number;
  total_conversations: number;
  total_messages: { user: number; assistant: number };
  documents: { total: number; indexed: number; failed: number };
  verification: { success: number; warning: number; failed: number };
  feedback: {
    helpful: number;
    not_helpful: number;
    total: number;
    helpful_ratio: number | null;  // null when denominator is 0
  };
}

// ── Usage ─────────────────────────────────────────────────────
export interface UsageBucket {
  time: string;
  logical_requests: number;
  attempts: number;
}

export interface UsageResponse {
  generated_at: string;
  time_range: { from_date: string; to_date: string };
  bucket: BucketType;
  buckets: UsageBucket[];
  models: Record<string, number>;
  retrieval_modes: Record<string, number>;
  tokens: {
    input_tokens: number | null;   // null when no metadata available
    output_tokens: number | null;
    total_tokens: number | null;
    events_with_usage_metadata: number;
    events_without_usage_metadata: number;
  };
  provider_quota_status: 'unsupported' | 'supported';
}

// ── Quality ───────────────────────────────────────────────────
export interface QualityResponse {
  generated_at: string;
  time_range: { from_date: string; to_date: string };
  helpful_ratio: number | null;         // null when no feedback
  not_helpful_ratio: number | null;
  total_feedback: number;
  negative_reasons: Record<string, number>;
  insufficient_evidence_rate: number | null;
  external_search_failure_rate: number | null;
  correlations: {
    not_helpful_by_retrieval_mode: Record<string, number | null>;
  };
}

// ── Errors & Latency ──────────────────────────────────────────
export interface ErrorsLatencyBucket {
  time: string;
  success_rate: number | null;
  avg_latency_ms: number | null;
  total: number;
}

export interface ErrorsLatencyResponse {
  generated_at: string;
  time_range: { from_date: string; to_date: string };
  bucket: BucketType;
  success_rate: number | null;
  total_logical_requests: number;
  errors: Record<string, number>;
  latency: {
    average_ms: number | null;
    p50_ms: number | null;
    p95_ms: number | null;
  };
  buckets: ErrorsLatencyBucket[];
}

// ── Evaluation Report ─────────────────────────────────────────
export interface EvaluationCategory {
  total: number;
  passed: number;
  failed: number;
  threshold: number;
}

export interface EvaluationSummary {
  passed: boolean;
  total_cases: number;
  passed_cases: number;
  failed_cases_count: number;
  live_mode: boolean;
  llm_model: string;
  embedding_model: string;
  dataset_version: string;
  fixtures_version: string;
  categories: Record<string, EvaluationCategory>;
  timestamp: string;
  commit_hash: string;
}

export interface EvaluationResponse {
  status: 'ok' | 'stale' | 'missing' | 'malformed' | 'oversized';
  message?: string;
  summary: EvaluationSummary | null;
  meta: {
    source_mode: 'mock' | 'live';
    is_stale: boolean;
    report_timestamp: string | null;
    report_path_configured: boolean;
  } | null;
  generated_at: string;
}

// ── Admin User Management ─────────────────────────────────────
export type AdminManagedRole = 'student' | 'lecturer' | 'admin';
export type AdminUserStatusFilter = 'active' | 'locked';

export interface AdminUserItem {
  id: string;
  email: string;
  full_name: string;
  role: AdminManagedRole | 'user';
  is_active: boolean;
  created_at: string | null;
  updated_at: string | null;
}

export interface AdminUserListResponse {
  items: AdminUserItem[];
  total: number;
  limit: number;
  skip: number;
  generated_at: string;
}

// ── Audit Logs ────────────────────────────────────────────────
export type AuditLogSeverity = 'info' | 'warning' | 'error';

export interface AuditLogItem {
  id: string;
  event_type: string;
  severity: AuditLogSeverity;
  message: string;
  actor_user_id: string | null;
  target_user_id: string | null;
  user_id: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface AuditLogResponse {
  items: AuditLogItem[];
  total: number;
  limit: number;
  skip: number;
  generated_at: string;
}
