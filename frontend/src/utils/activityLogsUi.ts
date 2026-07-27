import type { ActivityAction, ActivityCategory, ActivityStatus } from '../types/activityLogs';

export const CATEGORY_LABELS: Record<ActivityCategory, string> = {
  auth: 'Xác thực',
  document: 'Tài liệu',
  question: 'Câu hỏi',
  exam: 'Đề thi',
  chat: 'Chat',
  ai: 'AI',
  export: 'Xuất file',
  profile: 'Hồ sơ',
  security: 'Bảo mật',
  system: 'Hệ thống',
};

export const STATUS_LABELS: Record<ActivityStatus, string> = {
  success: 'Thành công',
  failure: 'Thất bại',
  started: 'Đang xử lý',
  denied: 'Từ chối',
};

export const ACTION_LABELS: Record<ActivityAction, string> = {
  user_registered: 'Đăng ký',
  login_success: 'Đăng nhập thành công',
  login_failed: 'Đăng nhập thất bại',
  logout: 'Đăng xuất',
  password_changed: 'Đổi mật khẩu',
  profile_updated: 'Cập nhật hồ sơ',
  document_uploaded: 'Tải tài liệu',
  document_processing_started: 'Bắt đầu xử lý tài liệu',
  document_processing_completed: 'Xử lý tài liệu xong',
  document_processing_failed: 'Xử lý tài liệu lỗi',
  document_deleted: 'Xóa tài liệu',
  question_generation_started: 'Bắt đầu sinh câu hỏi',
  question_generation_completed: 'Sinh câu hỏi xong',
  question_generation_failed: 'Sinh câu hỏi lỗi',
  exam_created: 'Tạo đề thi',
  exam_exported: 'Xuất đề thi',
  ai_chat_started: 'Bắt đầu chat AI',
  ai_chat_completed: 'Chat AI xong',
  ai_chat_failed: 'Chat AI lỗi',
  quota_exceeded: 'Vượt quota',
  permission_denied: 'Từ chối quyền',
};

const PRIVATE_METADATA_KEYS = new Set([
  'password',
  'hashed_password',
  'access_token',
  'refresh_token',
  'token',
  'api_key',
  'secret',
  'prompt',
  'question',
  'answer',
  'content',
  'full_text',
  'extracted_text',
  'transcript',
]);

export function activityCategoryLabel(value: string) {
  return CATEGORY_LABELS[value as ActivityCategory] || value;
}

export function activityActionLabel(value: string) {
  return ACTION_LABELS[value as ActivityAction] || value;
}

export function activityStatusLabel(value: string) {
  return STATUS_LABELS[value as ActivityStatus] || value;
}

export function hasPrivateMetadataKey(metadata: Record<string, unknown>) {
  return Object.keys(metadata).some((key) => PRIVATE_METADATA_KEYS.has(key.toLowerCase()));
}
