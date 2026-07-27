export type AdminAuditResult = 'success' | 'failure';

export type AdminAuditAction =
  | 'user_created'
  | 'user_updated'
  | 'user_locked'
  | 'user_unlocked'
  | 'user_soft_deleted'
  | 'user_restored'
  | 'user_role_changed'
  | 'user_quota_changed'
  | 'user_force_logout'
  | 'password_reset_requested'
  | 'document_deleted'
  | 'document_reprocessed'
  | 'question_updated'
  | 'question_deleted'
  | 'system_setting_updated'
  | 'feature_flag_updated'
  | 'website_content_updated'
  | 'website_content_published'
  | 'notification_created';

export interface AdminAuditLogItem {
  id: string;
  admin_user_id: string;
  admin_email_snapshot: string;
  action: AdminAuditAction | string;
  target_type: string;
  target_id: string;
  timestamp: string;
  reason: string | null;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  changed_fields: string[];
  request_id: string | null;
  result: AdminAuditResult | string;
  error_code: string | null;
  ip_hash: string | null;
  user_agent_summary: string | null;
}

export interface AdminAuditLogListParams {
  page?: number;
  page_size?: number;
  admin_user_id?: string;
  action?: AdminAuditAction | string;
  target_type?: string;
  target_id?: string;
  result?: AdminAuditResult | string;
  date_from?: string;
  date_to?: string;
  search?: string;
}

export interface AdminAuditLogListResponse {
  items: AdminAuditLogItem[];
  total: number;
  page: number;
  page_size: number;
  total_pages: number;
  generated_at: string;
}

export interface AdminAuditLogStatisticsResponse {
  total: number;
  success_count: number;
  failure_count: number;
  by_action: Record<string, number>;
  by_target_type: Record<string, number>;
  generated_at: string;
}

export const ADMIN_AUDIT_ACTIONS: AdminAuditAction[] = [
  'user_created',
  'user_updated',
  'user_locked',
  'user_unlocked',
  'user_soft_deleted',
  'user_restored',
  'user_role_changed',
  'user_quota_changed',
  'user_force_logout',
  'password_reset_requested',
  'document_deleted',
  'document_reprocessed',
  'question_updated',
  'question_deleted',
  'system_setting_updated',
  'feature_flag_updated',
  'website_content_updated',
  'website_content_published',
  'notification_created',
];
