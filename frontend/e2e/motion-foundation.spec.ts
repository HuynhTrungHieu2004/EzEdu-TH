import { expect, test } from '@playwright/test';
import { TEACHER_USER, stubApi } from './helpers';

test.describe('motion preference', () => {
  test('đặt reduced mode theo hệ điều hành', async ({ browser }) => {
    const context = await browser.newContext({ reducedMotion: 'reduce' });
    const page = await context.newPage();
    await stubApi(page, TEACHER_USER);
    await page.goto('/dashboard');
    await expect(page.locator('html')).toHaveAttribute('data-motion', 'reduced');
    await context.close();
  });

  test('dùng full mode khi không yêu cầu giảm', async ({ browser }) => {
    const context = await browser.newContext({ reducedMotion: 'no-preference' });
    const page = await context.newPage();
    await stubApi(page, TEACHER_USER);
    await page.goto('/dashboard');
    await expect(page.locator('html')).toHaveAttribute('data-motion', 'full');
    await context.close();
  });
});

test('route content công bố motion contract và cleanup khi điều hướng', async ({ page }) => {
  const unmountWarnings: string[] = [];
  page.on('console', (message) => {
    if (
      (message.type() === 'warning' || message.type() === 'error')
      && /unmount|unmounted component/i.test(message.text())
    ) {
      unmountWarnings.push(message.text());
    }
  });

  await stubApi(page, TEACHER_USER);
  await page.goto('/dashboard');
  await expect(page.locator('[data-page-entrance]')).toBeVisible();
  await page.goto('/documents');
  await expect(page.locator('[data-page-entrance]')).toHaveCount(1);
  const orphaned = await page.locator('[data-page-entrance]').evaluateAll((nodes) =>
    nodes.filter((node) => !document.documentElement.contains(node)).length,
  );
  expect(orphaned).toBe(0);
  expect(unmountWarnings).toEqual([]);
});
