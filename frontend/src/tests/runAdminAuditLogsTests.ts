import { ADMIN_AUDIT_ACTIONS } from '../types/adminAuditLogs';
import { adminAuditActionLabel, formatAuditValue } from '../utils/adminAuditLogsUi';

function assert(condition: unknown, message: string) {
  if (!condition) throw new Error(message);
}

const requiredActions = [
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

requiredActions.forEach((action) => {
  assert(ADMIN_AUDIT_ACTIONS.includes(action as (typeof ADMIN_AUDIT_ACTIONS)[number]), `Missing audit action: ${action}`);
  assert(adminAuditActionLabel(action) !== action, `Missing audit action label: ${action}`);
});

assert(formatAuditValue(null) === '-', 'Null audit values should be compact');
assert(formatAuditValue({ role: 'admin' }).includes('admin'), 'Object audit values should be readable');

console.log('Admin audit logs UI tests passed.');
