export type NotificationType = 'system' | 'exam' | 'maintenance_banner' | 'new_feature' | 'quota_warning' | 'private';
export type NotificationAudienceType = 'all' | 'roles' | 'users';
export type NotificationPriority = 'low' | 'normal' | 'high' | 'urgent';
export type NotificationStatus = 'draft' | 'scheduled' | 'published' | 'expired' | 'cancelled';

export interface NotificationItem {
  id: string;
  title: string;
  content: string;
  type: NotificationType;
  audience_type: NotificationAudienceType;
  target_roles: string[];
  target_user_ids: string[];
  priority: NotificationPriority;
  starts_at: string | null;
  expires_at: string | null;
  status: NotificationStatus;
  created_by: string;
  created_at: string;
  updated_at: string | null;
  published_at: string | null;
  cancelled_at: string | null;
  read_count: number;
  unread_count: number;
  audience_count: number;
}

export interface NotificationListParams {
  page?: number;
  page_size?: number;
  search?: string;
  status?: NotificationStatus | '';
  type?: NotificationType | '';
  audience_type?: NotificationAudienceType | '';
  created_from?: string;
  created_to?: string;
}

export interface NotificationListResponse {
  items: NotificationItem[];
  total: number;
  page: number;
  page_size: number;
  total_pages: number;
  generated_at: string;
}

export interface NotificationStatisticsResponse {
  total: number;
  draft: number;
  scheduled: number;
  published: number;
  expired: number;
  cancelled: number;
  unread_total: number;
  generated_at: string;
}

export interface NotificationPayload {
  title: string;
  content: string;
  type: NotificationType;
  audience_type: NotificationAudienceType;
  target_roles: string[];
  target_user_ids: string[];
  priority: NotificationPriority;
  starts_at?: string | null;
  expires_at?: string | null;
  status?: 'draft' | 'scheduled' | 'published';
  reason?: string;
}

export type ReportType =
  | 'users'
  | 'activity_logs'
  | 'admin_audit_logs'
  | 'documents'
  | 'questions'
  | 'ai_usage'
  | 'quota'
  | 'system_errors'
  | 'ai_quality';

export type ReportFormat = 'csv' | 'xlsx' | 'pdf';

export interface ReportTypeItem {
  key: ReportType;
  label: string;
  description: string;
  formats: ReportFormat[];
}

export interface ReportTypesResponse {
  items: ReportTypeItem[];
  max_limit: number;
  generated_at: string;
}

export interface ReportExportParams {
  report_type: ReportType;
  format: ReportFormat;
  date_from?: string;
  date_to?: string;
  limit?: number;
  search?: string;
  role?: string;
  status?: string;
  user_id?: string;
  provider?: string;
  model?: string;
  feature?: string;
  severity?: string;
  category?: string;
  action?: string;
  target_type?: string;
}
