import { expect, test, type Route } from '@playwright/test';

const adminUser = {
  id: '507f1f77bcf86cd799439099',
  email: 'admin.demo@ezedu.vn',
  full_name: 'Quản trị viên Demo',
  role: 'admin',
  student_profile_completed: true,
  created_at: '2026-08-22T00:00:00Z',
};

async function json(route: Route, body: unknown, status = 200) {
  await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
}

test('Admin Demo xác thực qua backend thật trước khi mở dashboard', async ({ page }) => {
  let loginRequests = 0;

  await page.route('**/api/v1/auth/login', async (route) => {
    loginRequests += 1;
    expect(route.request().postDataJSON()).toEqual({
      email: 'admin.demo@ezedu.vn',
      password: 'DemoAdminTestPassword',
    });
    await json(route, { access_token: 'real-jwt-from-backend', token_type: 'bearer' });
  });
  await page.route('**/api/v1/auth/me', (route) => json(route, adminUser));
  await page.route('**/api/v1/admin/dashboard/**', (route) => json(route, { detail: 'Không có fixture dashboard' }, 503));

  await page.goto('/login');
  await page.getByRole('button', { name: '⚡ Admin' }).click();

  await expect(page).toHaveURL('/admin/dashboard');
  expect(loginRequests).toBe(1);
});
