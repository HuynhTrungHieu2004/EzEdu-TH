import { expect, test } from '@playwright/test';
import {
  captureBrowserErrors,
  expectNoBrokenImages,
  expectNoPageOverflow,
  stubApi,
} from './helpers';

const PUBLIC_ROUTES = [
  { path: '/', heading: /Biến học liệu thành trải nghiệm học tập thông minh/i },
  { path: '/how-it-works', heading: 'Cách EzEdu AI hoạt động' },
  { path: '/features', heading: 'Tính năng chính' },
  { path: '/faq', heading: 'Câu hỏi thường gặp' },
  { path: '/login', heading: 'Đăng nhập' },
  { path: '/register', heading: 'Đăng ký' },
  { path: '/maintenance', heading: 'Hệ thống đang bảo trì' },
  { path: '/duong-dan-khong-ton-tai', heading: 'Không tìm thấy trang này' },
];

for (const route of PUBLIC_ROUTES) {
  test(`${route.path} không tràn ngang, không lỗi trình duyệt`, async ({ page }) => {
    const browserErrors = captureBrowserErrors(page);
    await stubApi(page);
    await page.goto(route.path);
    await expect(page.getByRole('heading', { name: route.heading, level: 1 })).toBeVisible();
    await expect(page.locator('main')).toBeVisible();
    await expectNoPageOverflow(page);
    await expectNoBrokenImages(page);
    expect(browserErrors).toEqual([]);
  });
}

test('route bảo vệ chuyển về login và vẫn đúng sau refresh', async ({ page }) => {
  const browserErrors = captureBrowserErrors(page);
  await stubApi(page);
  await page.goto('/admin/users');
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByRole('heading', { name: 'Đăng nhập', level: 1 })).toBeVisible();
  await page.reload();
  await expect(page).toHaveURL(/\/login$/);
  await expectNoPageOverflow(page);
  expect(browserErrors).toEqual([]);
});

test('dark theme dùng semantic token và không tràn ngang', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('theme-preference', 'dark'));
  await stubApi(page);
  await page.goto('/');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  const tokens = await page.evaluate(() => {
    const styles = getComputedStyle(document.documentElement);
    return {
      background: styles.getPropertyValue('--ez-background').trim(),
      primary: styles.getPropertyValue('--ez-primary').trim(),
      text: styles.getPropertyValue('--ez-text-primary').trim(),
      danger: styles.getPropertyValue('--ez-danger').trim(),
    };
  });
  expect(Object.values(tokens).every(Boolean)).toBe(true);
  await expectNoPageOverflow(page);
});
