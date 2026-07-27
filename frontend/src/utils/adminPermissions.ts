import type { AdminRole } from '../types/adminUsers';

export type Permission =
  | 'users.view'
  | 'users.create'
  | 'users.update'
  | 'users.lock'
  | 'users.delete'
  | 'users.restore'
  | 'users.change_role'
  | 'users.reset_password'
  | 'users.manage_quota'
  | 'activity_logs.view'
  | 'admin_audit_logs.view'
  | 'documents.view'
  | 'documents.update'
  | 'documents.delete'
  | 'documents.reprocess'
  | 'questions.view'
  | 'questions.update'
  | 'questions.delete'
  | 'questions.regenerate'
  | 'analytics.view'
  | 'ai_usage.view'
  | 'ai_settings.update'
  | 'website_content.view'
  | 'website_content.update'
  | 'website_content.publish'
  | 'system_settings.view'
  | 'system_settings.update'
  | 'feature_flags.update'
  | 'system_health.view'
  | 'notifications.manage'
  | 'reports.export';

const ALL_PERMISSIONS: Permission[] = [
  'users.view',
  'users.create',
  'users.update',
  'users.lock',
  'users.delete',
  'users.restore',
  'users.change_role',
  'users.reset_password',
  'users.manage_quota',
  'activity_logs.view',
  'admin_audit_logs.view',
  'documents.view',
  'documents.update',
  'documents.delete',
  'documents.reprocess',
  'questions.view',
  'questions.update',
  'questions.delete',
  'questions.regenerate',
  'analytics.view',
  'ai_usage.view',
  'ai_settings.update',
  'website_content.view',
  'website_content.update',
  'website_content.publish',
  'system_settings.view',
  'system_settings.update',
  'feature_flags.update',
  'system_health.view',
  'notifications.manage',
  'reports.export',
];

const ROLE_PERMISSIONS: Record<AdminRole, Permission[]> = {
  super_admin: ALL_PERMISSIONS,
  admin: ALL_PERMISSIONS,
  moderator: [
    'documents.view',
    'documents.update',
    'documents.delete',
    'documents.reprocess',
    'questions.view',
    'questions.update',
    'questions.delete',
    'questions.regenerate',
    'activity_logs.view',
  ],
  support: ['users.view', 'activity_logs.view'],
  analyst: ['analytics.view', 'ai_usage.view', 'reports.export'],
  user: [],
  student: [],
  lecturer: [],
};

export function permissionsForRole(role: string | undefined, override: string[] = []): Set<Permission> {
  const normalized = (role || 'user') as AdminRole;
  if (normalized === 'super_admin') return new Set(ALL_PERMISSIONS);
  const base = ROLE_PERMISSIONS[normalized] || [];
  const knownOverrides = override.filter((item): item is Permission => ALL_PERMISSIONS.includes(item as Permission));
  return new Set([...base, ...knownOverrides]);
}

export function hasPermission(role: string | undefined, permission: Permission, override: string[] = []) {
  return permissionsForRole(role, override).has(permission);
}

export function isAdminAreaRole(role: string | undefined) {
  return ['super_admin', 'admin', 'moderator', 'support', 'analyst'].includes(role || '');
}
