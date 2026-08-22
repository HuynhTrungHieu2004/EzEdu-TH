import { expect, test, type Page, type Route } from '@playwright/test';
import { ADMIN_USER, TEACHER_USER } from './helpers';

const STUDENT_USER = { ...TEACHER_USER, role: 'student', student_profile_completed: true };

async function json(route: Route, body: unknown, status = 200) {
  await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
}

async function auth(page: Page, user: typeof ADMIN_USER) {
  await page.addInitScript(() => localStorage.setItem('access_token', 'old-route-token'));
  await page.route('**/api/v1/**', async (route) => {
    const pathname = new URL(route.request().url()).pathname;
    if (pathname === '/api/v1/auth/me') return json(route, user);
    if (pathname === '/api/v1/runtime-config') return json(route, { feature_flags: {} });
    if (pathname === '/api/v1/notifications') return json(route, []);
    if (pathname === '/api/v1/questions/taxonomy/subject-options') return json(route, []);
    if (pathname === '/api/v1/questions/published/subjects') return json(route, []);
    if (pathname === '/api/v1/teacher/content-history') {
      return json(route, { items: [], total: 0, skip: 0, limit: 20 });
    }
    if (pathname === '/api/v1/exam-attempts/a1') {
      return json(route, {
        id: 'a1', exam_id: 'e1', exam_code: 'DEMO-01', user_id: user.id,
        status: 'graded', answers: {}, results: [], total_score: 8, max_score: 10,
        auto_submitted: false, version: 1, due_at: '2026-08-23T10:00:00Z',
        server_now: '2026-08-23T09:00:00Z', created_at: '2026-08-23T08:00:00Z',
      });
    }
    return json(route, { detail: 'fixture unavailable' }, 503);
  });
}

test('public data policy route is preserved', async ({ page }) => {
  await page.route('**/api/v1/**', (route) => json(route, { items: [] }));
  await page.goto('/chinh-sach-du-lieu');
  await expect(page.getByRole('heading', { name: 'Dữ liệu lưu trên trình duyệt' })).toBeVisible();
});

test('admin subject management route is preserved', async ({ page }) => {
  await auth(page, ADMIN_USER);
  await page.goto('/admin/mon-hoc');
  await expect(page.getByRole('heading', { name: 'Danh mục môn học' })).toBeVisible();
});

test('student subject catalog route is preserved', async ({ page }) => {
  await auth(page, STUDENT_USER);
  await page.goto('/hoc-theo-mon');
  await expect(page.getByRole('heading', { name: 'Chọn môn để bắt đầu ôn' })).toBeVisible();
});

test('student can review a stored attempt without starting a new one', async ({ page }) => {
  await auth(page, STUDENT_USER);
  await page.goto('/bai-lam/a1');
  await expect(page.getByRole('heading', { name: 'Xem lại bài làm' })).toBeVisible();
  await expect(page.getByText('8 / 10 điểm')).toBeVisible();
});

test('teacher content history route is preserved', async ({ page }) => {
  await auth(page, TEACHER_USER);
  await page.goto('/teacher/content-history');
  await expect(page.getByRole('heading', { name: 'Lịch sử học liệu & đề thi' })).toBeVisible();
});
