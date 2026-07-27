import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

function assert(condition: unknown, message: string) {
  if (!condition) {
    throw new Error(message);
  }
}

const root = process.cwd();
const app = readFileSync(resolve(root, 'src/App.tsx'), 'utf8');
const layout = readFileSync(resolve(root, 'src/components/AppLayout.tsx'), 'utf8');
const permissions = readFileSync(resolve(root, 'src/utils/adminPermissions.ts'), 'utf8');
const api = readFileSync(resolve(root, 'src/api/adminNotificationsReportsApi.ts'), 'utf8');
const notificationsPage = readFileSync(resolve(root, 'src/pages/AdminNotificationsPage.tsx'), 'utf8');
const reportsPage = readFileSync(resolve(root, 'src/pages/AdminReportsPage.tsx'), 'utf8');

assert(app.includes('path="/admin/notifications"'), 'Missing /admin/notifications route.');
assert(app.includes('path="/admin/reports"'), 'Missing /admin/reports route.');
assert(layout.includes("hasPermission(currentRole, 'notifications.manage'"), 'Notification menu is not permission-gated.');
assert(layout.includes("hasPermission(currentRole, 'reports.export'"), 'Reports menu is not permission-gated.');
assert(permissions.includes("'notifications.manage'"), 'notifications.manage is missing from frontend permission registry.');
assert(permissions.includes("'reports.export'"), 'reports.export is missing from frontend permission registry.');
assert(api.includes("'/admin/notifications'"), 'Notification API path is missing.');
assert(api.includes("'/admin/reports/export'"), 'Report export API path is missing.');
assert(notificationsPage.includes('ReasonModal'), 'Notification publish/cancel must ask for reason.');
assert(reportsPage.includes('responseType:') || api.includes("responseType: 'blob'"), 'Report export must request a blob download.');

console.log('Admin notifications/reports frontend checks passed.');
