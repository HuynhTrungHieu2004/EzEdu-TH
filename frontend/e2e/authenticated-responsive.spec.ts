import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import {
  ADMIN_USER,
  TEACHER_USER,
  captureBrowserErrors,
  expectNoPageOverflow,
  stubApi,
} from './helpers';

const ADMIN_ROUTES = [
  '/admin/dashboard',
  '/admin/users',
  '/admin/users/507f1f77bcf86cd799439012',
  '/admin/documents',
  '/admin/documents/507f1f77bcf86cd799439011',
  '/admin/questions',
  '/admin/questions/507f1f77bcf86cd799439011',
  '/admin/exams',
  '/admin/ai',
  '/admin/website-content',
  '/admin/settings',
  '/admin/feature-flags',
  '/admin/notifications',
  '/admin/reports',
  '/admin/activity-logs',
  '/admin/audit-logs',
];

const TEACHER_ROUTES = [
  '/dashboard',
  '/ho-so',
  '/documents',
  '/documents/507f1f77bcf86cd799439021',
  '/documents/507f1f77bcf86cd799439021/questions',
  '/generate',
  '/question-sets/507f1f77bcf86cd799439022',
  '/question-history',
  '/classes',
  '/classes/507f1f77bcf86cd799439023',
  '/chat-advanced',
  '/web-knowledge',
  '/curriculum-kb',
  '/tools',
  '/question-bank',
  '/exam-blueprints',
  '/exam-blueprints/507f1f77bcf86cd799439024',
  '/exams/507f1f77bcf86cd799439025/grading',
];

const STUDENT_ROUTES = [
  '/student-onboarding',
  '/dashboard',
  '/ho-so',
  '/question-sets/507f1f77bcf86cd799439022',
  '/published-questions',
  '/learning-history',
  '/personalization',
  '/chat-advanced',
  '/web-knowledge',
  '/curriculum-kb',
  '/tools',
  '/take-exam/507f1f77bcf86cd799439025',
];

for (const path of ADMIN_ROUTES) {
  test(`${path} render được unavailable state an toàn`, async ({ page }) => {
    const browserErrors = captureBrowserErrors(page);
    await stubApi(page, ADMIN_USER);
    await page.goto(path);
    await expect(page).toHaveURL(path);
    await expect(page.locator('#main')).toBeVisible();
    await expect(page.locator('#main')).not.toBeEmpty();
    await expectNoPageOverflow(page);
    expect(browserErrors).toEqual([]);
  });
}

test('ExamGrading từ chối ID sai trước khi gọi API và không lộ raw ID', async ({ page }) => {
  const browserErrors = captureBrowserErrors(page);
  const requests: string[] = [];
  page.on('request', (request) => requests.push(request.url()));
  await stubApi(page, TEACHER_USER);
  await page.goto('/exams/not-an-object-id/grading');
  await expect(page.getByText('Không tìm thấy đề thi')).toBeVisible();
  expect(requests.some((url) => url.includes('/exams/not-an-object-id/attempts'))).toBe(false);
  await expectNoPageOverflow(page);
  expect(browserErrors).toEqual([]);
});

for (const path of TEACHER_ROUTES) {
  test(`Teacher ${path} render state an toàn và không tràn trang`, async ({ page }) => {
    const browserErrors = captureBrowserErrors(page);
    await stubApi(page, TEACHER_USER);
    await page.goto(path);
    await expect(page).toHaveURL(path);
    await expect(page.locator('main')).toBeVisible();
    await expect(page.locator('main')).not.toBeEmpty();
    await expectNoPageOverflow(page);
    expect(browserErrors).toEqual([]);
  });
}

const STUDENT_USER = {
  ...TEACHER_USER,
  email: 'student.e2e@example.test',
  full_name: 'Học sinh E2E',
  role: 'student',
  student_profile_completed: true,
};

for (const path of STUDENT_ROUTES) {
  test(`Student ${path} render state an toàn và không tràn trang`, async ({ page }) => {
    const browserErrors = captureBrowserErrors(page);
    await stubApi(page, STUDENT_USER);
    await page.goto(path);
    await expect(page).toHaveURL(path);
    await expect(page.locator('main')).toBeVisible();
    await expect(page.locator('main')).not.toBeEmpty();
    await expectNoPageOverflow(page);
    expect(browserErrors).toEqual([]);
  });
}

test('route thống kê học sinh cũ redirect tới lịch sử học tập', async ({ page }) => {
  const browserErrors = captureBrowserErrors(page);
  await stubApi(page, STUDENT_USER);
  await page.goto('/student-statistics');
  await expect(page).toHaveURL('/learning-history');
  await expect(page.locator('main')).toBeVisible();
  await expectNoPageOverflow(page);
  expect(browserErrors).toEqual([]);
});

test('xóa người dùng yêu cầu lý do, email và giữ focus trong dialog', async ({ page }) => {
  const target = {
    id: '507f1f77bcf86cd799439012',
    email: 'target.e2e@example.test',
    full_name: 'Người dùng mục tiêu',
    role: 'student',
    status: 'active',
    is_active: true,
    email_verified: true,
    created_at: '2026-01-02T00:00:00Z',
    updated_at: '2026-01-02T00:00:00Z',
    last_login_at: null,
    deleted_at: null,
    current_quota: null,
    document_count: 0,
    question_count: 0,
    conversation_count: 0,
    ai_request_count: 0,
    token_usage: { input_tokens: 0, output_tokens: 0, total_tokens: 0 },
  };

  await stubApi(page, ADMIN_USER);
  await page.route('**/api/v1/admin/users**', async (route) => {
    const pathname = new URL(route.request().url()).pathname;
    const body = pathname.endsWith('/statistics')
      ? {
          total_users: 1,
          active_users: 1,
          locked_users: 0,
          deleted_users: 0,
          users_created_today: 0,
          users_created_last_7_days: 1,
          users_created_last_30_days: 1,
          active_last_24_hours: 0,
          active_last_7_days: 0,
          generated_at: '2026-01-02T00:00:00Z',
        }
      : pathname.endsWith(`/${target.id}`)
        ? target
        : {
            items: [target],
            total: 1,
            page: 1,
            page_size: 20,
            total_pages: 1,
            generated_at: '2026-01-02T00:00:00Z',
          };
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
  });

  await page.goto('/admin/users');
  const deleteButton = page.getByRole('button', { name: 'Xóa', exact: true });
  await expect(deleteButton).toBeVisible();
  await deleteButton.click();

  const dialog = page.getByRole('dialog', { name: 'Xóa mềm tài khoản' });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Đóng' })).toBeFocused();
  const confirmButton = dialog.getByRole('button', { name: 'Xác nhận' });
  await expect(confirmButton).toBeDisabled();
  const axeResults = await new AxeBuilder({ page })
    .include('[role="dialog"]')
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();
  expect(axeResults.violations).toEqual([]);

  await dialog.getByLabel('Lý do').fill('Kiểm thử xác nhận thao tác');
  await dialog.getByLabel('Nhập email người dùng để xác nhận').fill(target.email);
  await expect(confirmButton).toBeEnabled();

  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(deleteButton).toBeFocused();
});
