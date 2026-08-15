import { expect, test, type Page } from '@playwright/test';

/** Chạy với BACKEND THẬT (không stub). Bắt lỗi console + lỗi mạng trên từng trang. */

const TEACHER = { email: 'qa-live-lecturer@example.com', password: 'QaLive#2026' };
const STUDENT = { email: 'qa-live-student@example.com', password: 'QaLive#2026' };

type Problem = { page: string; kind: string; detail: string };

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
  await page.locator('#pub-main-content').getByRole('button', { name: 'Đăng nhập' }).click();
  await page.waitForURL(/\/(dashboard|published-questions|student-onboarding)/, { timeout: 20_000 });
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
    await page.goto(route);
    await expect(page.locator('#main')).not.toBeEmpty();
    await page.waitForTimeout(1500);
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    if (overflow > 1) problems.push({ page: route, kind: 'overflow', detail: `${overflow}px` });
    const blank = await page.evaluate(() => (document.querySelector('#main')?.textContent ?? '').trim().length < 20);
    if (blank) problems.push({ page: route, kind: 'blank', detail: '#main gần như rỗng' });
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

  console.log('TEACHER_PROBLEMS=' + JSON.stringify(problems, null, 1));
});

test('học sinh: đi hết các trang với backend thật', async ({ page }) => {
  test.setTimeout(240_000);
  const problems: Problem[] = [];
  let current = 'login';
  watch(page, problems, () => current);

  await login(page, STUDENT);

  for (const route of STUDENT_ROUTES) {
    current = route;
    await page.goto(route);
    await page.waitForTimeout(1500);
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    if (overflow > 1) problems.push({ page: route, kind: 'overflow', detail: `${overflow}px` });
  }

  console.log('STUDENT_PROBLEMS=' + JSON.stringify(problems, null, 1));
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
  console.log('PUBLIC_PROBLEMS=' + JSON.stringify(problems, null, 1));
});
