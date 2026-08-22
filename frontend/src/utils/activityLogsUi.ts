import type { ActivityCategory, ActivityStatus } from '../types/activityLogs';

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

export const ACTION_LABELS: Record<string, string> = {
  // Auth & Profile
  login: 'Đăng nhập',
  login_success: 'Đăng nhập thành công',
  login_failed: 'Đăng nhập thất bại',
  logout: 'Đăng xuất',
  user_registered: 'Đăng ký tài khoản',
  password_changed: 'Đổi mật khẩu',
  profile_updated: 'Cập nhật hồ sơ',

  // Student LMS actions
  complete_lesson: 'Hoàn thành bài học',
  submit_assignment: 'Nộp bài tập',
  join_class: 'Tham gia lớp học trực tuyến',
  receive_score: 'Nhận điểm số',
  read_document: 'Xem tài liệu học liệu',
  take_quiz: 'Làm bài kiểm tra',
  earn_achievement: 'Đạt thành tích mới',

  // Documents
  document_uploaded: 'Tải tài liệu',
  document_processing_started: 'Bắt đầu xử lý tài liệu',
  document_processing_completed: 'Xử lý tài liệu xong',
  document_processing_failed: 'Xử lý tài liệu lỗi',
  document_deleted: 'Xóa tài liệu',

  // AI & Exam
  question_generation_started: 'Bắt đầu sinh câu hỏi',
  question_generation_completed: 'Sinh câu hỏi xong',
  question_generation_failed: 'Sinh câu hỏi lỗi',
  exam_created: 'Tạo đề thi',
  exam_exported: 'Xuất đề thi',
  ai_chat_started: 'Bắt đầu chat AI',
  ai_chat_completed: 'Chat AI xong',
  ai_chat_failed: 'Chat AI lỗi',
  chat_query: 'Hỏi đáp với AI',

  // System
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
  if (ACTION_LABELS[value]) return ACTION_LABELS[value];
  // Fallback: format snake_case or English action to friendly title case
  return value
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export function activityStatusLabel(value: string) {
  return STATUS_LABELS[value as ActivityStatus] || value;
}

export function hasPrivateMetadataKey(metadata: Record<string, unknown>) {
  return Object.keys(metadata).some((key) => PRIVATE_METADATA_KEYS.has(key.toLowerCase()));
}
