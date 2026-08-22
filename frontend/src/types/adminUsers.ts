export type AdminRole = 'super_admin' | 'admin' | 'moderator' | 'support' | 'analyst' | 'user' | 'student' | 'lecturer';
export type AdminUserStatus = 'active' | 'locked' | 'deleted';
export type AdminUserSortBy = 'created_at' | 'updated_at' | 'last_login_at' | 'email' | 'full_name' | 'role' | 'status';
export type SortOrder = 'asc' | 'desc';

export interface TokenUsage {
  input_tokens: number;
  output_tokens: number;
  total_tokens: number;
}

export interface AdminUserSummary {
  id: string;
  full_name: string;
  email: string;
  role: AdminRole;
  status: AdminUserStatus;
  is_active: boolean;
  email_verified: boolean;
  created_at: string;
  updated_at: string | null;
  last_login_at: string | null;
  deleted_at: string | null;
  current_quota: Record<string, unknown> | null;
  phone_number?: string;
  student_code?: string;
  teacher_code?: string;
  class_name?: string;
  grade?: string;
  subject?: string;
  specialization?: string;
  date_of_birth?: string;
}

export interface UserActivityLog {
  id: string;
  timestamp: string;
  action: string;
  details?: string;
}

export interface AdminUserDetail extends AdminUserSummary {
  document_count: number;
  question_count: number;
  conversation_count: number;
  ai_request_count: number;
  token_usage: TokenUsage;
  enrolled_courses?: string[];
  exercises_done?: number;
  exams_done?: number;
  gpa?: number;
  learning_progress_pct?: number;
  class_count?: number;
  assigned_classes?: string[];
  materials_created?: number;
  questions_created?: number;
  exams_created?: number;
  submissions_graded?: number;
  activity_history?: UserActivityLog[];
}

export interface AdminUserListParams {
  page?: number;
  page_size?: number;
  search?: string;
  role?: AdminRole;
  status?: AdminUserStatus | 'all';
  created_from?: string;
  created_to?: string;
  last_login_from?: string;
  last_login_to?: string;
  sort_by?: AdminUserSortBy;
  sort_order?: SortOrder;
}

export interface AdminUserListResponse {
  items: AdminUserSummary[];
  total: number;
  page: number;
  page_size: number;
  total_pages: number;
  generated_at: string;
}

export interface AdminUserStatisticsResponse {
  total_users: number;
  active_users: number;
  locked_users: number;
  deleted_users: number;
  users_created_today: number;
  users_created_last_7_days: number;
  users_created_last_30_days: number;
  active_last_24_hours: number;
  active_last_7_days: number;
  generated_at: string;
}

export interface AdminUserMutationResponse {
  user: AdminUserDetail;
  audit_event: Record<string, unknown>;
}

export interface AdminUserCreatePayload {
  full_name: string;
  email: string;
  role: AdminRole;
  password?: string;
  temporary_password?: string;
  email_verified?: boolean;
  current_quota?: Record<string, unknown> | null;
}

export interface AdminUserUpdatePayload {
  full_name?: string;
  email?: string;
  email_verified?: boolean;
  permissions_override?: string[];
}

export interface AdminPasswordResetResponse {
  user_id: string;
  temporary_password: string;
  password_reset_required: boolean;
  updated_at: string;
  audit_event: Record<string, unknown>;
}
