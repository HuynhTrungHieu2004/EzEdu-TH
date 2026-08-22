import { expect, test, type Page, type Route } from '@playwright/test';
import { ADMIN_USER, TEACHER_USER } from './helpers';

async function json(route: Route, body: unknown, status = 200) {
  await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
}

async function authenticate(page: Page, user: typeof ADMIN_USER) {
  await page.addInitScript(() => localStorage.setItem('access_token', 'route-regression-token'));
  await page.route('**/api/v1/**', async (route) => {
    const pathname = new URL(route.request().url()).pathname;
    if (pathname === '/api/v1/auth/me') return json(route, user);
    if (pathname === '/api/v1/runtime-config') return json(route, { feature_flags: {} });
    if (pathname === '/api/v1/notifications') return json(route, []);
    if (pathname === '/api/v1/admin/users') {
      return json(route, { items: [], total: 0, page: 1, page_size: 100, total_pages: 0 });
    }
    if (pathname === '/api/v1/schedules') return json(route, []);
    if (pathname === '/api/v1/courses') return json(route, []);
    return json(route, { detail: 'fixture unavailable' }, 503);
  });
}

test('admin student route uses the backend-connected page', async ({ page }) => {
  await authenticate(page, ADMIN_USER);
  await page.goto('/admin/students');
  await expect(page.getByRole('heading', { name: 'Quản lý tài khoản Học sinh' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Không tìm thấy trang' })).toHaveCount(0);
});

test('teacher exam schedule navigation stays inside the teacher area', async ({ page }) => {
  await authenticate(page, TEACHER_USER);
  await page.goto('/dashboard');
  const link = page.getByRole('link', { name: 'Lịch thi' });
  await expect(link).toHaveAttribute('href', '/teacher/exam-schedules');
  await link.click();
  await expect(page).toHaveURL(/\/teacher\/exam-schedules$/);
  await expect(page.getByRole('heading', { name: 'Lịch thi' })).toBeVisible();
});

test('admin lesson navigation never contains a demo course id', async ({ page }) => {
  await authenticate(page, ADMIN_USER);
  await page.goto('/admin/dashboard');
  const lessonLink = page.getByRole('link', { name: 'Bài học' });
  await expect(lessonLink).toHaveAttribute('href', '/admin/courses');
  await expect(lessonLink).not.toHaveAttribute('href', /CRS-101/);
});

test('teacher dashboard keeps successful cards when one auxiliary API fails', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('access_token', 'teacher-dashboard-token'));
  await page.route('**/api/v1/**', async (route) => {
    const pathname = new URL(route.request().url()).pathname;
    if (pathname === '/api/v1/auth/me') return json(route, TEACHER_USER);
    if (pathname === '/api/v1/runtime-config') return json(route, { feature_flags: {} });
    if (pathname === '/api/v1/documents') return json(route, []);
    if (pathname === '/api/v1/questions/my-history') return json(route, { items: [], total: 0 });
    if (pathname === '/api/v1/classes') return json(route, { items: [], total: 0 });
    if (pathname === '/api/v1/courses') return json(route, []);
    if (pathname === '/api/v1/assignments') return json(route, { detail: 'temporary failure' }, 503);
    return json(route, { detail: 'fixture unavailable' }, 404);
  });

  await page.goto('/dashboard');
  await expect(page.locator('#main').getByText('Học liệu', { exact: true })).toBeVisible();
  await expect(page.getByText('Một số dữ liệu chưa thể tải. Bạn có thể bấm Làm mới để thử lại.')).toBeVisible();
});

test('student notification badge shows the unread API count', async ({ page }) => {
  const student = { ...TEACHER_USER, role: 'student', student_profile_completed: true };
  await page.addInitScript(() => localStorage.setItem('access_token', 'student-notification-token'));
  await page.route('**/api/v1/**', async (route) => {
    const pathname = new URL(route.request().url()).pathname;
    if (pathname === '/api/v1/auth/me') return json(route, student);
    if (pathname === '/api/v1/runtime-config') return json(route, { feature_flags: {} });
    if (pathname === '/api/v1/notifications') {
      return json(route, [
        { id: 'n1', title: 'Đã đọc', content: '', type: 'system', priority: 'normal', created_at: '2026-01-01T00:00:00Z', is_read: true },
        { id: 'n2', title: 'Mới 1', content: '', type: 'system', priority: 'normal', created_at: '2026-01-02T00:00:00Z', is_read: false },
        { id: 'n3', title: 'Mới 2', content: '', type: 'system', priority: 'normal', created_at: '2026-01-03T00:00:00Z', is_read: false },
      ]);
    }
    return json(route, { detail: 'fixture unavailable' }, 503);
  });

  await page.goto('/student/courses');
  const notifications = page.getByRole('link', { name: /Thông báo/ });
  await expect(notifications.getByText('2', { exact: true })).toBeVisible();
});
