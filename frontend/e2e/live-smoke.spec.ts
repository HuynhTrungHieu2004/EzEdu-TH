import { expect, test, type Page } from '@playwright/test';

/** Chạy với BACKEND THẬT (không stub). Bắt lỗi console + lỗi mạng trên từng trang. */

const TEACHER = { email: 'qa-live-lecturer@example.com', password: 'QaLive#2026' };
const STUDENT = { email: 'qa-live-student@example.com', password: 'QaLive#2026' };
const ADMIN = { email: 'qa-live-admin@example.com', password: 'QaLive#2026' };

type Problem = { page: string; kind: string; detail: string };

/** Thiếu tài khoản thì báo ngay lệnh cần chạy, thay vì để login timeout khó hiểu. */
test.beforeAll(async () => {
  const api = process.env.VITE_API_BASE_URL || 'http://127.0.0.1:8000';
  for (const account of [TEACHER, STUDENT, ADMIN]) {
    const response = await fetch(`${api}/api/v1/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(account),
    }).catch(() => null);
    if (!response?.ok) {
      throw new Error(
        `Không đăng nhập được ${account.email} (${response?.status ?? 'không kết nối được ' + api}). `
        + 'Chạy: cd backend && python scripts/qa_live_accounts.py --setup',
      );
    }
  }
});

function watch(page: Page, problems: Problem[], label: () => string) {
  page.on('pageerror', (error) => problems.push({ page: label(), kind: 'pageerror', detail: error.message }));
  page.on('console', (message) => {
    if (message.type() !== 'error') return;
    const text = message.text();
    if (text.startsWith('Failed to load resource')) return;
    problems.push({ page: label(), kind: 'console', detail: text.slice(0, 200) });
  });
  page.on('response', async (response) => {
    const url = response.url();
    if (!url.includes('/api/v1/')) return;
    if (response.status() >= 400) {
      problems.push({
        page: label(),
        kind: `http-${response.status()}`,
        detail: `${response.request().method()} ${url.replace(/^https?:\/\/[^/]+/, '')}`,
      });
    }
  });
}

async function login(page: Page, user: { email: string; password: string }) {
  await page.goto('/login');
  await page.getByLabel('Email đăng nhập').fill(user.email);
  await page.getByLabel('Mật khẩu').fill(user.password);
  await page.locator('#pub-main-content').getByRole('button', { name: 'Đăng nhập', exact: true }).click();
  await page.waitForURL(/\/(dashboard|published-questions|student-onboarding|admin\/dashboard)/, { timeout: 20_000 });
}

/**
 * Kind chỉ mang tính thông tin: DB trống không phải lỗi ứng dụng, nhưng vẫn cần
 * in ra để biết trang nào chưa thực sự được kiểm với dữ liệu.
 */
const INFO_KINDS = new Set(['thiếu-dữ-liệu']);

function report(label: string, problems: Problem[]) {
  console.log(`${label}=` + JSON.stringify(problems, null, 1));
  expect(problems.filter((problem) => !INFO_KINDS.has(problem.kind))).toEqual([]);
}

/** Đi một route và ghi lại tràn ngang / trang trắng. */
async function visit(page: Page, route: string, problems: Problem[], settleMs = 1500) {
  await page.goto(route);
  // Backend thật, lượt đầu sau khi tạo tài khoản: chậm hơn hạn mặc định 5s.
  await expect(page.locator('#main')).not.toBeEmpty({ timeout: 15_000 });
  await page.waitForTimeout(settleMs);
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  if (overflow > 1) problems.push({ page: route, kind: 'overflow', detail: `${overflow}px` });
  const blank = await page.evaluate(() => (document.querySelector('#main')?.textContent ?? '').trim().length < 20);
  if (blank) problems.push({ page: route, kind: 'blank', detail: '#main gần như rỗng' });
}

const TEACHER_ROUTES = [
  '/dashboard', '/documents', '/tools', '/question-history', '/question-bank',
  '/exam-blueprints', '/classes', '/chat-advanced', '/teacher/content-history',
  '/web-knowledge', '/curriculum-kb', '/generate', '/ho-so',
];

const STUDENT_ROUTES = [
  '/dashboard', '/published-questions', '/learning-history', '/chat-advanced',
  '/tools', '/personalization', '/student-statistics', '/curriculum-kb', '/web-knowledge', '/ho-so',
];

test('giáo viên: đi hết các trang với backend thật', async ({ page }) => {
  test.setTimeout(240_000);
  const problems: Problem[] = [];
  let current = 'login';
  watch(page, problems, () => current);

  await login(page, TEACHER);

  for (const route of TEACHER_ROUTES) {
    current = route;
    await visit(page, route, problems);
  }

  // Thao tác ghi thật: tạo lớp rồi mở trang chi tiết
  current = 'tạo lớp';
  await page.goto('/classes');
  const createButton = page.getByRole('button', { name: /Tạo lớp|Thêm lớp|Lớp mới/ }).first();
  if (await createButton.count()) {
    await createButton.click();
    const nameField = page.getByLabel(/Tên lớp/).first();
    if (await nameField.count()) {
      await nameField.fill(`QA Live ${Date.now()}`);
      await page.getByRole('button', { name: /^(Tạo|Lưu|Tạo lớp)$/ }).first().click();
      await page.waitForTimeout(2000);
    }
  } else {
    problems.push({ page: '/classes', kind: 'thiếu-nút', detail: 'không tìm thấy nút tạo lớp' });
  }

  const classLink = page.locator('a[href^="/classes/"]').first();
  if (await classLink.count()) {
    current = 'chi tiết lớp';
    await classLink.click();
    await page.waitForTimeout(2000);
    await expect(page.locator('#main')).not.toBeEmpty();
  }

  report('TEACHER_PROBLEMS', problems);
});

test('học sinh: đi hết các trang với backend thật', async ({ page }) => {
  test.setTimeout(240_000);
  const problems: Problem[] = [];
  let current = 'login';
  watch(page, problems, () => current);

  await login(page, STUDENT);

  for (const route of STUDENT_ROUTES) {
    current = route;
    await visit(page, route, problems);
  }

  report('STUDENT_PROBLEMS', problems);
});

const ADMIN_ROUTES = [
  '/admin/dashboard', '/admin/users', '/admin/documents', '/admin/questions', '/admin/exams',
  '/admin/ai', '/admin/website-content', '/admin/settings', '/admin/feature-flags',
  '/admin/notifications', '/admin/reports', '/admin/activity-logs', '/admin/audit-logs',
];

test('quản trị viên: đi hết các trang với backend thật', async ({ page }) => {
  test.setTimeout(300_000);
  const problems: Problem[] = [];
  let current = 'login';
  watch(page, problems, () => current);

  await login(page, ADMIN);
  expect(page.url()).toContain('/admin/dashboard');

  for (const route of ADMIN_ROUTES) {
    current = route;
    await visit(page, route, problems, 2000);
  }

  // Trang chi tiết: lấy id thật từ bảng thay vì đoán URL
  for (const [list, detailPrefix] of [
    ['/admin/users', '/admin/users/'],
    ['/admin/documents', '/admin/documents/'],
    ['/admin/questions', '/admin/questions/'],
  ] as const) {
    current = `${detailPrefix}:id`;
    await page.goto(list);
    const view = page.locator('.ez-datatable tbody tr').first().getByRole('button', { name: 'Xem' });
    // Bảng tải bất đồng bộ: phải chờ dòng đầu tiên chứ không đếm ngay.
    await view.waitFor({ state: 'visible', timeout: 20_000 }).catch(() => undefined);
    if (await view.count()) {
      await view.click();
      await page.waitForURL(new RegExp(`${detailPrefix.replace(/\//g, '\\/')}[^/]+$`), { timeout: 15_000 });
      await page.waitForTimeout(2000);
      await expect(page.locator('#main')).not.toBeEmpty();
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      if (overflow > 1) problems.push({ page: current, kind: 'overflow', detail: `${overflow}px` });
    } else {
      problems.push({ page: list, kind: 'thiếu-dữ-liệu', detail: 'bảng rỗng, không mở được trang chi tiết' });
    }
  }

  report('ADMIN_PROBLEMS', problems);
});

test('quản trị viên: khoá rồi mở khoá một tài khoản thật', async ({ page }) => {
  test.setTimeout(180_000);
  const problems: Problem[] = [];
  let current = 'login';
  watch(page, problems, () => current);

  await login(page, ADMIN);

  // Chỉ thao tác trên tài khoản QA do bộ kiểm tự tạo, không đụng dữ liệu thật.
  current = 'khoá tài khoản';
  await page.goto('/admin/users');
  await page.getByLabel('Tìm kiếm').fill(STUDENT.email);
  await page.getByRole('button', { name: 'Lọc' }).click();

  const row = page.locator('.ez-datatable tbody tr', { hasText: STUDENT.email });
  await expect(row).toHaveCount(1, { timeout: 15_000 });
  // Nút hành động chỉ hiện sau khi chi tiết từng dòng tải xong
  const lockButton = row.getByRole('button', { name: 'Khóa' });
  await expect(lockButton).toBeVisible({ timeout: 20_000 });
  await lockButton.click();
  await page.getByLabel('Lý do').fill('Kiểm thử QA với backend thật');
  await page.getByRole('button', { name: 'Xác nhận' }).click();
  await expect(row.getByText('Đã khóa')).toBeVisible({ timeout: 15_000 });

  // Nhật ký quản trị phải ghi lại thao tác vừa rồi
  current = 'nhật ký ghi lại thao tác';
  await page.goto('/admin/audit-logs');
  await page.waitForTimeout(2500);
  await expect(page.locator('.ez-datatable').getByText(ADMIN.email).first()).toBeVisible({ timeout: 15_000 });

  current = 'mở khoá lại';
  await page.goto('/admin/users');
  await page.getByLabel('Tìm kiếm').fill(STUDENT.email);
  await page.getByRole('button', { name: 'Lọc' }).click();
  const unlockButton = row.getByRole('button', { name: 'Mở khóa' });
  await expect(unlockButton).toBeVisible({ timeout: 20_000 });
  await unlockButton.click();
  await page.getByRole('button', { name: 'Xác nhận' }).click();
  await expect(row.getByText('Hoạt động')).toBeVisible({ timeout: 15_000 });

  report('ADMIN_MUTATION_PROBLEMS', problems);
});

test('trang công khai với backend thật', async ({ page }) => {
  test.setTimeout(120_000);
  const problems: Problem[] = [];
  let current = '/';
  watch(page, problems, () => current);

  for (const route of ['/', '/how-it-works', '/features', '/faq', '/login', '/register']) {
    current = route;
    await page.goto(route);
    await page.waitForTimeout(1200);
  }
  report('PUBLIC_PROBLEMS', problems);
});
