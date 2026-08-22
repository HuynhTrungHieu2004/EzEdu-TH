import { expect, test, type Route } from '@playwright/test';

async function json(route: Route, body: unknown) {
  await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
}

test('unconfigured social providers are explicit and cannot simulate login', async ({ page }) => {
  await page.route('**/api/v1/**', async (route) => {
    const pathname = new URL(route.request().url()).pathname;
    if (pathname === '/api/v1/website-content') return json(route, { items: [] });
    return route.fulfill({ status: 503, contentType: 'application/json', body: '{"detail":"unavailable"}' });
  });

  await page.goto('/login');
  await expect(page.getByRole('button', { name: /Facebook/ })).toBeDisabled();
  await expect(page.getByText('Google chưa được cấu hình')).toBeVisible();
  await expect(page.getByText('Facebook chưa được cấu hình')).toBeVisible();
});

test('registration delegates social sign-up to the real login flow', async ({ page }) => {
  await page.goto('/register');
  await page.getByRole('link', { name: 'Đăng ký qua Google hoặc Facebook' }).click();
  await expect(page).toHaveURL(/\/login$/);
});
