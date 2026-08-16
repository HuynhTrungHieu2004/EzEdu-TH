import { expect, type Page } from '@playwright/test';

export const ADMIN_USER = {
  id: '507f1f77bcf86cd799439011',
  email: 'admin.e2e@example.test',
  full_name: 'Admin E2E',
  role: 'super_admin',
  status: 'active',
  is_active: true,
  permissions_override: [],
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
};

export const TEACHER_USER = {
  ...ADMIN_USER,
  email: 'teacher.e2e@example.test',
  full_name: 'Giáo viên E2E',
  role: 'lecturer',
};

export const STUDENT_USER = {
  ...ADMIN_USER,
  email: 'student.e2e@example.test',
  full_name: 'Học sinh E2E',
  role: 'student',
};

type AuthFixtureUser = Omit<typeof ADMIN_USER, 'role'> & {
  role: string;
  student_profile_completed?: boolean;
};

export async function stubApi(
  page: Page,
  user: AuthFixtureUser | null = null,
  options: { showDataNotice?: boolean } = {},
) {
  // Dải thông báo dữ liệu hiện trên MỌI trang và nằm cố định ở đáy, nên nó chắn
  // nút ở cuối trang trong những bài kiểm không liên quan. Mặc định đánh dấu là
  // đã đọc; bài kiểm của chính dải đó truyền `showDataNotice: true`.
  if (!options.showDataNotice) {
    await page.addInitScript(() => {
      try {
        localStorage.setItem('ez-data-notice-v1', 'ack');
      } catch {
        // Trình duyệt chặn localStorage — bỏ qua.
      }
    });
  }

  await page.route('**/api/v1/**', async (route) => {
    const pathname = new URL(route.request().url()).pathname;

    if (pathname === '/api/v1/website-content') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ items: [] }) });
      return;
    }

    if (pathname === '/api/v1/runtime-config') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ feature_flags: {} }) });
      return;
    }

    if (pathname === '/api/v1/auth/me' && user) {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(user) });
      return;
    }

    await route.fulfill({
      status: 503,
      contentType: 'application/json',
      body: JSON.stringify({ detail: 'E2E deterministic unavailable-state fixture' }),
    });
  });

  if (user) {
    await page.addInitScript(() => {
      localStorage.setItem('access_token', 'e2e-layout-token');
    });
  }
}

export function captureBrowserErrors(page: Page) {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`));
  page.on('console', (message) => {
    if (
      message.type() === 'error'
      && !message.text().startsWith('Failed to load resource:')
    ) {
      errors.push(`console: ${message.text()}`);
    }
  });
  return errors;
}

export async function expectNoPageOverflow(page: Page) {
  const metrics = await page.evaluate(() => ({
    viewport: window.innerWidth,
    html: document.documentElement.scrollWidth,
    body: document.body.scrollWidth,
  }));
  expect(metrics.html, `documentElement overflow: ${JSON.stringify(metrics)}`).toBeLessThanOrEqual(metrics.viewport + 1);
  expect(metrics.body, `body overflow: ${JSON.stringify(metrics)}`).toBeLessThanOrEqual(metrics.viewport + 1);
}

export async function expectNoBrokenImages(page: Page) {
  const broken = await page.locator('img').evaluateAll((images) =>
    images
      .filter((image) => !image.complete || image.naturalWidth === 0)
      .map((image) => image.getAttribute('src') || '(missing src)'),
  );
  expect(broken).toEqual([]);
}
