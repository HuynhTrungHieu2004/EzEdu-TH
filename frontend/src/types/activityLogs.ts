export type ActivityCategory =
  | 'auth'
  | 'document'
  | 'question'
  | 'exam'
  | 'chat'
  | 'ai'
  | 'export'
  | 'profile'
  | 'security'
  | 'system';

export type ActivityStatus = 'success' | 'failure' | 'started' | 'denied';

export type ActivityAction =
  | 'user_registered'
  | 'login_success'
  | 'login_failed'
  | 'logout'
  | 'password_changed'
  | 'profile_updated'
  | 'document_uploaded'
  | 'document_processing_started'
  | 'document_processing_completed'
  | 'document_processing_failed'
  | 'document_deleted'
  | 'question_generation_started'
  | 'question_generation_completed'
  | 'question_generation_failed'
  | 'exam_created'
  | 'exam_exported'
  | 'ai_chat_started'
  | 'ai_chat_completed'
  | 'ai_chat_failed'
  | 'quota_exceeded'
  | 'permission_denied';

export interface UserActivityLogItem {
  id: string;
  user_id: string | null;
  action: ActivityAction | string;
  category: ActivityCategory | string;
  resource_type: string | null;
  resource_id: string | null;
  status: ActivityStatus | string;
  timestamp: string;
  request_id: string | null;
  metadata: Record<string, unknown>;
  error_code: string | null;
  duration_ms: number | null;
  ip_hash: string | null;
  user_agent_summary: string | null;
}

export interface ActivityLogListParams {
  page?: number;
  page_size?: number;
  user_id?: string;
  category?: ActivityCategory | string;
  action?: ActivityAction | string;
  status?: ActivityStatus | string;
  date_from?: string;
  date_to?: string;
  search?: string;
  resource_type?: string;
  resource_id?: string;
  error_only?: boolean;
}

export interface UserActivityLogListResponse {
  items: UserActivityLogItem[];
  total: number;
  page: number;
  page_size: number;
  total_pages: number;
  generated_at: string;
  retention_days: number | null;
}

export interface UserActivityLogStatisticsResponse {
  total_today: number;
  success_count: number;
  failure_count: number;
  permission_denied_count: number;
  quota_exceeded_count: number;
  by_category: Record<string, number>;
  by_status: Record<string, number>;
  generated_at: string;
  retention_days: number | null;
}

export const ACTIVITY_CATEGORIES: ActivityCategory[] = [
  'auth',
  'document',
  'question',
  'exam',
  'chat',
  'ai',
  'export',
  'profile',
  'security',
  'system',
];

export const ACTIVITY_ACTIONS: ActivityAction[] = [
  'user_registered',
  'login_success',
  'login_failed',
  'logout',
  'password_changed',
  'profile_updated',
  'document_uploaded',
  'document_processing_started',
  'document_processing_completed',
  'document_processing_failed',
  'document_deleted',
  'question_generation_started',
  'question_generation_completed',
  'question_generation_failed',
  'exam_created',
  'exam_exported',
  'ai_chat_started',
  'ai_chat_completed',
  'ai_chat_failed',
  'quota_exceeded',
  'permission_denied',
];
