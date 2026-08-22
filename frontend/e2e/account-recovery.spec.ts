import { expect, test, type Route } from '@playwright/test';

async function json(route: Route, body: unknown, status = 200) {
  await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
}

test('forgot password submits to the real recovery endpoint', async ({ page }) => {
  let requested = false;
  await page.route('**/api/v1/**', async (route) => {
    const pathname = new URL(route.request().url()).pathname;
    if (pathname === '/api/v1/website-content') return json(route, { items: [] });
    if (pathname === '/api/v1/auth/forgot-password') {
      requested = true;
      return json(route, { message: 'Nếu email tồn tại, hướng dẫn đặt lại mật khẩu đã được gửi.' });
    }
    return json(route, { detail: 'fixture unavailable' }, 503);
  });

  await page.goto('/forgot-password');
  await page.getByLabel('Email').fill('user@example.com');
  await page.getByRole('button', { name: 'Gửi hướng dẫn' }).click();
  await expect(page.getByText('Nếu email tồn tại, hướng dẫn đặt lại mật khẩu đã được gửi.')).toBeVisible();
  expect(requested).toBe(true);
});

test('reset password consumes the token and returns to login', async ({ page }) => {
  await page.route('**/api/v1/**', async (route) => {
    const pathname = new URL(route.request().url()).pathname;
    if (pathname === '/api/v1/website-content') return json(route, { items: [] });
    if (pathname === '/api/v1/auth/reset-password') return json(route, { message: 'Mật khẩu đã được cập nhật.' });
    return json(route, { detail: 'fixture unavailable' }, 503);
  });

  await page.goto('/reset-password?token=abcdefghijklmnopqrstuvwxyz123456');
  await page.getByLabel('Mật khẩu mới').fill('new-password');
  await page.getByRole('button', { name: 'Đặt lại mật khẩu' }).click();
  await expect(page.getByText('Mật khẩu đã được cập nhật.')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Đăng nhập' })).toBeVisible();
});

test('email verification consumes its token', async ({ page }) => {
  await page.route('**/api/v1/**', async (route) => {
    const pathname = new URL(route.request().url()).pathname;
    if (pathname === '/api/v1/website-content') return json(route, { items: [] });
    if (pathname === '/api/v1/auth/verify-email') return json(route, { message: 'Email đã được xác thực.' });
    return json(route, { detail: 'fixture unavailable' }, 503);
  });

  await page.goto('/verify-email?token=abcdefghijklmnopqrstuvwxyz123456');
  await expect(page.getByText('Email đã được xác thực.')).toBeVisible();
});

test('email verification can request a fresh authenticated link', async ({ page }) => {
  await page.route('**/api/v1/**', async (route) => {
    const pathname = new URL(route.request().url()).pathname;
    if (pathname === '/api/v1/website-content') return json(route, { items: [] });
    if (pathname === '/api/v1/auth/resend-verification') return json(route, { message: 'Đã gửi liên kết xác thực email.' });
    return json(route, { detail: 'fixture unavailable' }, 503);
  });

  await page.goto('/verify-email');
  await page.getByRole('button', { name: 'Gửi lại liên kết' }).click();
  await expect(page.getByText('Đã gửi liên kết xác thực email.')).toBeVisible();
});
