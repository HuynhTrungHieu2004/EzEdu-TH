import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import {
  ADMIN_USER,
  TEACHER_USER,
  captureBrowserErrors,
  expectNoPageOverflow,
  stubApi,
} from './helpers';

declare global {
  interface Window {
    __previousPageEntrance?: HTMLElement;
    __pageEntranceWasActivelyStyled?: boolean;
    __activeIndicatorStyleHistory?: Array<{ href: string | null; style: string }>;
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
  const dashboardEntrance = page.locator('[data-page-entrance]');
  await expect(dashboardEntrance).toBeVisible();
  await expect.poll(() => dashboardEntrance.evaluate((element) => ({
    transform: element.style.transform,
    opacity: element.style.opacity,
    visibility: element.style.visibility,
  }))).toEqual({ transform: '', opacity: '', visibility: '' });

  await page.evaluate(() => {
    const settledDashboardEntrance = document.querySelector('[data-page-entrance]');
    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (
          mutation.type !== 'attributes'
          || !(mutation.target instanceof HTMLElement)
          || !mutation.target.matches('[data-page-entrance]')
          || mutation.target === settledDashboardEntrance
          || !document.documentElement.contains(mutation.target)
        ) continue;

        const style = mutation.target.getAttribute('style') ?? '';
        if (!style.includes('transform') && !style.includes('opacity')) continue;
        const questionHistoryLink = document.querySelector<HTMLAnchorElement>(
          '.ez-sidebar a[href="/question-history"]',
        );
        if (!questionHistoryLink) continue;

        window.__previousPageEntrance = mutation.target;
        window.__pageEntranceWasActivelyStyled = true;
        observer.disconnect();
        questionHistoryLink.click();
        break;
      }
    });
    observer.observe(document.documentElement, {
      subtree: true,
      attributes: true,
      attributeFilter: ['style'],
    });
  });

  await page.getByRole('link', { name: 'Học liệu', exact: true }).click();
  await expect(page).toHaveURL(/\/question-history$/);
  await expect(page.locator('[data-page-entrance]')).toHaveCount(1);

  await expect.poll(() => page.evaluate(() => {
    const previous = window.__previousPageEntrance;
    return {
      wasActivelyStyled: window.__pageEntranceWasActivelyStyled === true,
      detached: Boolean(previous && !document.documentElement.contains(previous)),
      animationStylesRemoved: Boolean(previous)
        && previous.style.opacity === ''
        && previous.style.transform === ''
        && previous.style.visibility === '',
    };
  })).toEqual({
    wasActivelyStyled: true,
    detached: true,
    animationStylesRemoved: true,
  });
  expect(browserErrors).toEqual([]);
});

test('active navigation indicator chạy rồi dọn GSAP styles sau SPA navigation', async ({ page }) => {
  const browserErrors = captureBrowserErrors(page);
  await stubApi(page, TEACHER_USER);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/dashboard');

  const sidebar = page.locator('.ez-sidebar-nav');
  const initialIndicator = sidebar
    .getByRole('link', { name: 'Tổng quan', exact: true })
    .locator('[data-active-indicator]');
  await expect.poll(() => initialIndicator.evaluate((element) => ({
    transform: element.style.transform,
    opacity: element.style.opacity,
    visibility: element.style.visibility,
  }))).toEqual({ transform: '', opacity: '', visibility: '' });

  await sidebar.evaluate((element) => {
    const history: Array<{ href: string | null; style: string }> = [];
    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (
          mutation.type === 'attributes'
          && mutation.target instanceof HTMLElement
          && mutation.target.matches('[data-active-indicator]')
        ) {
          history.push({
            href: mutation.target.closest('a')?.getAttribute('href') ?? null,
            style: mutation.target.getAttribute('style') ?? '',
          });
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
    ).toEqual(expect.arrayContaining([
      expect.objectContaining({ href: '/documents', style: expect.stringContaining('transform') }),
    ]));

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

test('reduced mode opens More drawer and account dropdown without decorative motion', async ({ browser }) => {
  const context = await browser.newContext({
    reducedMotion: 'reduce',
    viewport: { width: 390, height: 844 },
  });
  const page = await context.newPage();
  const browserErrors = captureBrowserErrors(page);
  await stubApi(page, TEACHER_USER);
  await page.route('**/api/v1/questions/my-history**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ items: [], next_cursor: null, has_more: false }),
    });
  });
  await page.goto('/question-history');
  await expect(page.locator('html')).toHaveAttribute('data-motion', 'reduced');

  await page.locator('.ez-tabbar').getByRole('button', { name: /Thêm/ }).click();
  const drawer = page.getByRole('dialog', { name: 'Thêm' });
  await expect(drawer).toBeVisible();
  const drawerMotion = await drawer.evaluate((element) => {
    const style = getComputedStyle(element);
    const overlayStyle = getComputedStyle(document.querySelector('.ez-overlay') as Element);
    return {
      animationName: style.animationName,
      animationDuration: style.animationDuration,
      transform: style.transform,
      overlayAnimationName: overlayStyle.animationName,
    };
  });
  expect(drawerMotion).toEqual({
    animationName: 'none',
    animationDuration: '0s',
    transform: 'none',
    overlayAnimationName: 'none',
  });
  await expectNoPageOverflow(page);
  expect((await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze()).violations).toEqual([]);

  await drawer.getByRole('button', { name: 'Đóng' }).click();
  await expect(drawer).toHaveCount(0);
  await page.getByRole('button', { name: 'Mở menu tài khoản' }).click();
  const accountMenu = page.getByRole('menu', { name: 'Tài khoản và cài đặt' });
  await expect(accountMenu).toBeVisible();
  const dropdownMotion = await accountMenu.evaluate((element) => {
    const style = getComputedStyle(element);
    return {
      animationName: style.animationName,
      animationDuration: style.animationDuration,
      transitionDuration: style.transitionDuration,
    };
  });
  expect(dropdownMotion).toEqual({
    animationName: 'none',
    animationDuration: '0s',
    transitionDuration: '0s',
  });
  expect(browserErrors).toEqual([]);
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

test('reduced motion giữ AppShell đại diện không tràn và axe sạch', async ({ browser }) => {
  const scenarios = [
    {
      name: 'admin desktop sidebar',
      user: ADMIN_USER,
      path: '/admin/users',
      viewport: { width: 1440, height: 900 },
      shell: '.ez-sidebar',
    },
    {
      name: 'teacher mobile tabbar',
      user: TEACHER_USER,
      path: '/question-history',
      viewport: { width: 390, height: 844 },
      shell: '.ez-tabbar',
      historyFixture: true,
    },
  ];

  for (const scenario of scenarios) {
    const context = await browser.newContext({
      reducedMotion: 'reduce',
      viewport: scenario.viewport,
    });
    const page = await context.newPage();
    const browserErrors = captureBrowserErrors(page);

    try {
      await stubApi(page, scenario.user);
      if (scenario.historyFixture) {
        await page.route('**/api/v1/questions/my-history**', async (route) => {
          await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({ items: [], next_cursor: null, has_more: false }),
          });
        });
      }
      await page.goto(scenario.path);
      await expect(page.locator('html')).toHaveAttribute('data-motion', 'reduced');
      await expect(page.locator(scenario.shell)).toBeVisible();
      await expect(page.locator('[data-page-entrance]')).toBeVisible();
      await expect.poll(() => page.locator('[data-page-entrance]').evaluate((element) => ({
        opacity: element.style.opacity,
        transform: element.style.transform,
        visibility: element.style.visibility,
      }))).toEqual({ opacity: '', transform: '', visibility: '' });

      await expectNoPageOverflow(page);
      const axeResults = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
        .analyze();
      expect(axeResults.violations, scenario.name).toEqual([]);
      expect(browserErrors, scenario.name).toEqual([]);
    } finally {
      await context.close();
    }
  }
});
