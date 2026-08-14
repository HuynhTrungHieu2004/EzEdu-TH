import { expect, test } from '@playwright/test';
import { TEACHER_USER, captureBrowserErrors, stubApi } from './helpers';

declare global {
  interface Window {
    __previousPageEntrance?: HTMLElement;
    __activeIndicatorStyleHistory?: string[];
    __activeIndicatorStyleObserver?: MutationObserver;
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
  const browserErrors = captureBrowserErrors(page);

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
  expect(browserErrors).toEqual([]);
});

test('active navigation indicator chạy rồi dọn GSAP styles sau SPA navigation', async ({ page }) => {
  const browserErrors = captureBrowserErrors(page);
  await stubApi(page, TEACHER_USER);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/dashboard');

  const sidebar = page.locator('.ez-sidebar-nav');
  await sidebar.evaluate((element) => {
    const history: string[] = [];
    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (
          mutation.type === 'attributes'
          && mutation.target instanceof HTMLElement
          && mutation.target.matches('[data-active-indicator]')
        ) {
          history.push(mutation.target.getAttribute('style') ?? '');
        }
      }
    });

    observer.observe(element, {
      subtree: true,
      attributes: true,
      attributeFilter: ['style'],
    });
    window.__activeIndicatorStyleHistory = history;
    window.__activeIndicatorStyleObserver = observer;
  });

  try {
    await sidebar.getByRole('link', { name: 'Học liệu', exact: true }).click();
    await expect(page).toHaveURL(/\/documents$/);

    const indicator = sidebar
      .getByRole('link', { name: 'Học liệu', exact: true })
      .locator('[data-active-indicator]');

    await expect.poll(
      () => page.evaluate(() => window.__activeIndicatorStyleHistory ?? []),
      { timeout: 1_000 },
    ).toEqual(expect.arrayContaining([expect.stringContaining('transform')]));

    await expect.poll(
      () => indicator.evaluate((element) => ({
        transform: element.style.transform,
        opacity: element.style.opacity,
        visibility: element.style.visibility,
      })),
      { timeout: 1_000 },
    ).toEqual({ transform: '', opacity: '', visibility: '' });

    expect(browserErrors).toEqual([]);
  } finally {
    await page.evaluate(() => window.__activeIndicatorStyleObserver?.disconnect());
  }
});

test('reduced mode không để transform trên route content', async ({ browser }) => {
  const context = await browser.newContext({ reducedMotion: 'reduce' });
  const page = await context.newPage();
  await stubApi(page, TEACHER_USER);
  await page.goto('/dashboard');

  const transform = await page
    .locator('[data-page-entrance]')
    .evaluate((element) => getComputedStyle(element).transform);
  expect(transform).toBe('none');
  await context.close();
});

test('reduced mode cập nhật active navigation indicator tức thì', async ({ browser }) => {
  const context = await browser.newContext({
    reducedMotion: 'reduce',
    viewport: { width: 1440, height: 900 },
  });
  const page = await context.newPage();
  await stubApi(page, TEACHER_USER);
  await page.goto('/dashboard');

  const sidebar = page.locator('.ez-sidebar-nav');
  await sidebar.getByRole('link', { name: 'Học liệu', exact: true }).click();
  await expect(page).toHaveURL(/\/documents$/);

  const inlineAnimation = await sidebar
    .getByRole('link', { name: 'Học liệu', exact: true })
    .locator('[data-active-indicator]')
    .evaluate((element) => ({
      transform: element.style.transform,
      opacity: element.style.opacity,
      visibility: element.style.visibility,
    }));

  expect(inlineAnimation).toEqual({ transform: '', opacity: '', visibility: '' });
  await context.close();
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
