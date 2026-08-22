import { expect, test, type Route } from '@playwright/test';
import { TEACHER_USER } from './helpers';

const student = {
  ...TEACHER_USER,
  email: 'student.e2e@example.test',
  full_name: 'Học sinh E2E',
  role: 'student',
  student_profile_completed: true,
};

async function json(route: Route, body: unknown, status = 200) {
  await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
}

test('Dashboard học sinh vẫn hiển thị dữ liệu khi một API phụ tạm lỗi', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('access_token', 'student-dashboard-token'));
  await page.route('**/api/v1/**', async (route) => {
    const pathname = new URL(route.request().url()).pathname;
    if (pathname === '/api/v1/auth/me') return json(route, student);
    if (pathname === '/api/v1/runtime-config') return json(route, { feature_flags: {} });
    if (pathname === '/api/v1/courses/mine') return json(route, []);
    if (pathname === '/api/v1/assignments') return json(route, []);
    if (pathname === '/api/v1/schedules') return json(route, []);
    if (pathname === '/api/v1/notifications') return json(route, { detail: 'Tạm thời không khả dụng' }, 503);
    return json(route, { detail: 'Không có fixture' }, 404);
  });

  await page.goto('/student/dashboard');

  await expect(page.getByText('Khóa học', { exact: true })).toBeVisible();
  await expect(page.getByText('Một số dữ liệu chưa thể tải. Bạn có thể bấm Làm mới để thử lại.')).toBeVisible();
});
