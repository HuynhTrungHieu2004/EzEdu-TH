import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { ADMIN_USER, TEACHER_USER, stubApi } from './helpers';

const ROUTES = [
  '/',
  '/how-it-works',
  '/features',
  '/faq',
  '/login',
  '/register',
  '/maintenance',
  '/duong-dan-khong-ton-tai',
];

for (const path of ROUTES) {
  test(`${path} không có vi phạm axe mức A/AA`, async ({ page }) => {
    await stubApi(page);
    await page.goto(path);
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();
    expect(results.violations).toEqual([]);
  });
}

test('skip link là phần tử bàn phím đầu tiên và chuyển focus tới main', async ({ page }) => {
  await stubApi(page);
  await page.goto('/');
  await page.keyboard.press('Tab');
  const skipLink = page.getByRole('link', { name: 'Bỏ qua tới nội dung chính' });
  await expect(skipLink).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.locator('#main')).toBeFocused();
});

test('form đăng nhập dùng label và thứ tự tab hợp lý', async ({ page }) => {
  await stubApi(page);
  await page.goto('/login');
  await page.getByLabel('Email đăng nhập').focus();
  await expect(page.getByLabel('Email đăng nhập')).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(page.getByLabel('Mật khẩu')).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(
    page.locator('#pub-main-content').getByRole('button', { name: 'Đăng nhập', exact: true }),
  ).toBeFocused();
});

for (const path of ['/', '/login']) {
  test(`${path} dark mode không có vi phạm axe mức A/AA`, async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('theme-preference', 'dark'));
    await stubApi(page);
    await page.goto(path);
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();
    expect(results.violations).toEqual([]);
  });
}

test('Admin layout và unavailable state không có vi phạm axe mức A/AA', async ({ page }) => {
  await stubApi(page, ADMIN_USER);
  await page.goto('/admin/users');
  await expect(page.locator('#main')).not.toBeEmpty();
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();
  expect(results.violations).toEqual([]);
});

test('Teacher ExamGrading invalid state không có vi phạm axe mức A/AA', async ({ page }) => {
  await stubApi(page, TEACHER_USER);
  await page.goto('/exams/not-an-object-id/grading');
  await expect(page.getByText('Không tìm thấy đề thi')).toBeVisible();
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();
  expect(results.violations).toEqual([]);
});
