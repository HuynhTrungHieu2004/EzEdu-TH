import { expect, test, type Page, type Route } from '@playwright/test';

async function json(route: Route, body: unknown) {
  await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
}

async function expectSocialButtonsStacked(page: Page) {
  const buttons = page.locator('.ez-social-grid').first().locator(':scope > *');
  const google = await buttons.nth(0).boundingBox();
  const facebook = await buttons.nth(1).boundingBox();
  expect(google).not.toBeNull();
  expect(facebook).not.toBeNull();
  expect(Math.abs(google!.x - facebook!.x)).toBeLessThan(2);
  expect(Math.abs(google!.width - facebook!.width)).toBeLessThan(2);
  expect(facebook!.y).toBeGreaterThanOrEqual(google!.y + google!.height);
}

test('Facebook login stays decorative without configuration notes', async ({ page }) => {
  await page.route('**/api/v1/**', async (route) => {
    const pathname = new URL(route.request().url()).pathname;
    if (pathname === '/api/v1/website-content') return json(route, { items: [] });
    return route.fulfill({ status: 503, contentType: 'application/json', body: '{"detail":"unavailable"}' });
  });

  await page.goto('/login');
  await expect(page.getByRole('button', { name: 'Đăng nhập bằng Facebook' })).toBeDisabled();
  await expect(page.getByText(/Facebook chưa được cấu hình|Sắp ra mắt/i)).toHaveCount(0);
  await expectSocialButtonsStacked(page);
});

test('registration shows the same decorative Facebook option', async ({ page }) => {
  await page.goto('/register');
  await expect(page.getByRole('button', { name: 'Đăng ký bằng Facebook' })).toBeDisabled();
  await expect(page.getByText(/Facebook chưa được cấu hình|Sắp ra mắt/i)).toHaveCount(0);
  await expectSocialButtonsStacked(page);
});

for (const account of [
  { role: 'student', student_profile_completed: true, destination: '/published-questions' },
  { role: 'lecturer', student_profile_completed: false, destination: '/dashboard' },
]) {
  test(`registered ${account.role} account is routed without choosing a role`, async ({ page }) => {
    await page.route('**/api/v1/auth/login', (route) => json(route, {
      access_token: 'registered-account-token',
      token_type: 'bearer',
    }));
    await page.route('**/api/v1/auth/me', (route) => json(route, {
      id: '507f1f77bcf86cd799439099',
      email: `${account.role}@example.com`,
      full_name: 'Tài khoản đã đăng ký',
      role: account.role,
      student_profile_completed: account.student_profile_completed,
      created_at: '2026-08-24T00:00:00Z',
    }));

    await page.goto('/login');
    await page.getByLabel('Email đăng nhập').fill(`${account.role}@example.com`);
    await page.getByLabel('Mật khẩu').fill('registered-password');
    await page.locator('form button[type="submit"]').click();

    await expect(page).toHaveURL(account.destination);
    await expect(page.getByText(/hãy chọn vai trò/i)).toHaveCount(0);
  });
}
