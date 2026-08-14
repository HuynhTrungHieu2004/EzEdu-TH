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
