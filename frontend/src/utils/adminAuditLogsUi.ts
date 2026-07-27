import type { AdminAuditAction, AdminAuditResult } from '../types/adminAuditLogs';

export const ADMIN_AUDIT_ACTION_LABELS: Record<AdminAuditAction, string> = {
  user_created: 'Tạo người dùng',
  user_updated: 'Cập nhật người dùng',
  user_locked: 'Khóa người dùng',
  user_unlocked: 'Mở khóa người dùng',
  user_soft_deleted: 'Xóa mềm người dùng',
  user_restored: 'Khôi phục người dùng',
  user_role_changed: 'Đổi vai trò',
  user_quota_changed: 'Đổi quota',
  user_force_logout: 'Buộc đăng xuất',
  password_reset_requested: 'Yêu cầu reset mật khẩu',
  document_deleted: 'Xóa tài liệu',
  document_reprocessed: 'Xử lý lại tài liệu',
  question_updated: 'Cập nhật câu hỏi',
  question_deleted: 'Xóa câu hỏi',
  system_setting_updated: 'Đổi cấu hình hệ thống',
  feature_flag_updated: 'Đổi feature flag',
  website_content_updated: 'Cập nhật CMS',
  website_content_published: 'Xuất bản CMS',
  notification_created: 'Tạo thông báo',
};

export const ADMIN_AUDIT_RESULT_LABELS: Record<AdminAuditResult, string> = {
  success: 'Thành công',
  failure: 'Thất bại',
};

export function adminAuditActionLabel(value: string) {
  return ADMIN_AUDIT_ACTION_LABELS[value as AdminAuditAction] || value;
}

export function adminAuditResultLabel(value: string) {
  return ADMIN_AUDIT_RESULT_LABELS[value as AdminAuditResult] || value;
}

export function formatAuditValue(value: unknown): string {
  if (value === null || value === undefined) return '-';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return JSON.stringify(value);
}
