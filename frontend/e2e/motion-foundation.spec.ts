import { expect, test } from '@playwright/test';
import { TEACHER_USER, stubApi } from './helpers';

declare global {
  interface Window {
    __previousPageEntrance?: HTMLElement;
  }
}

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

test('route content cleanup animation khi điều hướng SPA', async ({ page }) => {
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
  const entrance = page.locator('[data-page-entrance]');
  await expect(entrance).toBeVisible();
  await entrance.evaluate((node) => {
    window.__previousPageEntrance = node as HTMLElement;
  });

  await page.getByRole('link', { name: 'Học liệu', exact: true }).click();
  await expect(page).toHaveURL(/\/documents$/);
  await expect(page.locator('[data-page-entrance]')).toHaveCount(1);

  const cleanup = await page.evaluate(() => {
    const previous = window.__previousPageEntrance;
    return {
      detached: Boolean(previous && !document.documentElement.contains(previous)),
      animationStylesRemoved: Boolean(previous)
        && previous.style.opacity === ''
        && previous.style.transform === ''
        && previous.style.visibility === '',
    };
  });

  expect(cleanup).toEqual({ detached: true, animationStylesRemoved: true });
  expect(unmountWarnings).toEqual([]);
});

test('AnimatedCounter hoàn tất decimal theo formatter', async ({ browser }) => {
  const context = await browser.newContext({ reducedMotion: 'no-preference' });
  const page = await context.newPage();
  await page.goto('/e2e/fixtures/motion-harness.html');

  await expect(page.locator('[data-animated-counter]')).toHaveText('12.5');
  await context.close();
});

test('AnimatedCounter render decimal cuối ngay trong reduced mode', async ({ browser }) => {
  const context = await browser.newContext({ reducedMotion: 'reduce' });
  const page = await context.newPage();
  await page.goto('/e2e/fixtures/motion-harness.html');

  await expect(page.locator('[data-animated-counter]')).toHaveText('12.5');
  await context.close();
});
