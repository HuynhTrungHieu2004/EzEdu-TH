import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { ADMIN_USER, STUDENT_USER, TEACHER_USER, stubApi } from './helpers';

test('student shell chỉ hiện hành trình học sinh', async ({ page }) => {
  await stubApi(page, STUDENT_USER);
  await page.goto('/dashboard');

  const navigation = page.getByRole('navigation', { name: 'Điều hướng chính' });
  await expect(navigation.getByText('Tổng quan')).toBeVisible();
  await expect(navigation.getByText('Ngân hàng câu hỏi')).toHaveCount(0);
});

test('teacher shell hiện nhóm nghiệp vụ giáo viên', async ({ page }) => {
  await stubApi(page, TEACHER_USER);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/dashboard');

  const navigation = page.getByRole('navigation', { name: 'Điều hướng chính' });
  await expect(navigation.getByRole('link', { name: 'Học liệu', exact: true })).toBeVisible();
  await expect(navigation.getByRole('link', { name: 'Ma trận đề', exact: true })).toBeVisible();
});

test('desktop dùng navy sidebar và mobile dùng bottom navigation', async ({ page }) => {
  await stubApi(page, TEACHER_USER);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/dashboard');

  const shell = page.locator('[data-app-shell]');
  await expect(shell).toHaveAttribute('data-role-area', 'teacher');
  await expect(page.locator('.ez-sidebar')).toBeVisible();
  await expect(page.locator('.ez-tabbar')).toBeHidden();
  await expect(page.locator('.ez-sidebar')).toHaveCSS('width', '272px');
  await expect(page.locator('.ez-sidebar')).toHaveCSS('background-color', 'rgb(18, 50, 65)');

  await page.setViewportSize({ width: 1024, height: 768 });
  await expect(page.locator('.ez-sidebar')).toBeVisible();
  await expect(page.locator('.ez-topbar')).toBeHidden();
  await expect(page.locator('.ez-tabbar')).toBeHidden();

  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator('.ez-sidebar')).toBeHidden();
  await expect(page.locator('.ez-topbar')).toBeVisible();
  await expect(page.locator('.ez-tabbar')).toBeVisible();
});

test('active navigation không chỉ dựa vào màu', async ({ page }) => {
  await stubApi(page, TEACHER_USER);
  await page.goto('/documents');

  const active = page.getByRole('link', { name: 'Học liệu', exact: true }).first();
  await expect(active).toHaveAttribute('aria-current', 'page');
  await expect(active.locator('[data-active-indicator]')).toBeVisible();
});

for (const { user, path, label } of [
  { user: TEACHER_USER, path: '/question-history', label: 'Đề & câu hỏi' },
  { user: ADMIN_USER, path: '/admin/settings', label: 'Cấu hình' },
]) {
  test(`mobile overflow navigation phản ánh route ${path} đang mở`, async ({ page }) => {
    await stubApi(page, user);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(path);

    const tabbar = page.locator('.ez-tabbar');
    const moreButton = tabbar.getByRole('button', { name: /Thêm/ });
    expect(await moreButton.getAttribute('aria-current')).toBeNull();
    await expect(moreButton.locator('.ez-sr-only')).toHaveText(`Đang xem ${label}`);
    await expect(moreButton.locator('[data-active-indicator]')).toBeVisible();

    await moreButton.click();
    const drawer = page.getByRole('dialog', { name: 'Thêm' });
    const activeOverflowLink = drawer.getByRole('link', { name: label, exact: true });
    await expect(activeOverflowLink).toHaveAttribute('aria-current', 'page');
    await expect(activeOverflowLink.locator('[data-active-indicator]')).toBeVisible();

    const axeResults = await new AxeBuilder({ page })
      .include('.ez-tabbar')
      .include('.ez-more-drawer')
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();
    expect(axeResults.violations).toEqual([]);
  });
}

test('admin navigation toggles every group and reopens the active group after routing', async ({ page }) => {
  await stubApi(page, ADMIN_USER);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/admin/dashboard');

  const overviewTrigger = page.getByRole('button', { name: 'Tổng quan' });
  const contentTrigger = page.getByRole('button', { name: 'Nội dung' });
  const overviewPanel = page.locator('#nav-group-admin-overview');
  const contentPanel = page.locator('#nav-group-admin-content');

  await expect(overviewTrigger).toHaveAttribute('aria-expanded', 'true');
  await overviewTrigger.click();
  await expect(overviewTrigger).toHaveAttribute('aria-expanded', 'false');
  await expect(overviewPanel).toBeHidden();
  await overviewTrigger.click();
  await expect(overviewTrigger).toHaveAttribute('aria-expanded', 'true');

  await contentTrigger.click();
  await expect(contentTrigger).toHaveAttribute('aria-expanded', 'false');
  await expect(contentPanel).toBeHidden();

  await page.evaluate(() => {
    window.history.pushState({ key: 'admin-dashboard-query-e2e' }, '', '/admin/dashboard?tab=content#summary');
    window.dispatchEvent(new PopStateEvent('popstate'));
  });

  await expect(contentTrigger).toHaveAttribute('aria-expanded', 'false');
  await expect(contentPanel).toBeHidden();

  await page.evaluate(() => {
    window.history.pushState({ key: 'admin-documents-e2e' }, '', '/admin/documents');
    window.dispatchEvent(new PopStateEvent('popstate'));
  });

  await expect(contentTrigger).toHaveAttribute('aria-expanded', 'true');
  await expect(contentPanel).toBeVisible();
  await contentTrigger.click();
  await expect(contentTrigger).toHaveAttribute('aria-expanded', 'false');
  await expect(contentPanel).toBeHidden();
});

test('admin sidebar keeps focus on the active link after SPA navigation', async ({ page }) => {
  await stubApi(page, ADMIN_USER);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/admin/dashboard');

  const sidebar = page.locator('nav.ez-sidebar-nav');
  const usersLink = sidebar.getByRole('link', { name: 'Người dùng', exact: true });
  await usersLink.focus();
  await expect(usersLink).toBeFocused();

  await usersLink.click();

  await expect(usersLink).toHaveAttribute('aria-current', 'page');
  await expect(usersLink).toBeFocused();
});

test('admin navigation opens groups after fast Back from suspended content navigation', async ({ page }) => {
  await stubApi(page, ADMIN_USER);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/admin/dashboard');

  const sidebar = page.locator('nav.ez-sidebar-nav');
  const overviewTrigger = sidebar.getByRole('button', { name: 'Tổng quan' });
  await overviewTrigger.click();
  await expect(overviewTrigger).toHaveAttribute('aria-expanded', 'false');

  let releaseUsersChunk = () => {};
  const usersChunkReleased = new Promise<void>((resolve) => {
    releaseUsersChunk = resolve;
  });
  let markUsersChunkRequested = () => {};
  const usersChunkRequested = new Promise<void>((resolve) => {
    markUsersChunkRequested = resolve;
  });
  await page.route('**/src/pages/AdminUsersPage.tsx*', async (route) => {
    markUsersChunkRequested();
    await usersChunkReleased;
    await route.continue();
  });

  try {
    await page.getByRole('link', { name: 'Quản lý người dùng chi tiết' }).click();
    await expect(page).toHaveURL(/\/admin\/users$/);
    await usersChunkRequested;
    await page.goBack();

    await expect(page).toHaveURL(/\/admin\/dashboard$/);
    await expect(overviewTrigger).toHaveAttribute('aria-expanded', 'true');
    await expect(page.locator('#nav-group-admin-overview')).toBeVisible();
  } finally {
    releaseUsersChunk();
  }
});

test('academic semantic palette thắng CSS legacy', async ({ page }) => {
  await stubApi(page, TEACHER_USER);
  await page.goto('/dashboard');
  const colors = await page.evaluate(() => {
    const probe = document.createElement('div');
    probe.style.backgroundColor = 'var(--ez-primary)';
    probe.style.color = 'var(--ez-text)';
    document.body.append(probe);
    const result = {
      primary: getComputedStyle(probe).backgroundColor,
      text: getComputedStyle(probe).color,
      nav: getComputedStyle(document.documentElement).getPropertyValue('--ez-nav-bg').trim(),
    };
    probe.remove();
    return result;
  });
  expect(colors.primary).toBe('rgb(23, 125, 115)');
  expect(colors.text).toBe('rgb(18, 45, 58)');
  expect(colors.nav).toBe('#123241');
});

test('base academic tokens override the legacy body cascade', async ({ page }) => {
  await stubApi(page, TEACHER_USER);
  await page.goto('/dashboard');
  const bodyStyle = await page.evaluate(() => {
    const style = getComputedStyle(document.body);
    return {
      backgroundColor: style.backgroundColor,
      backgroundImage: style.backgroundImage,
      color: style.color,
    };
  });

  expect(bodyStyle.backgroundColor).toBe('rgb(243, 247, 247)');
  expect(bodyStyle.backgroundImage).toBe('none');
  expect(bodyStyle.color).toBe('rgb(18, 45, 58)');
});

test('dark theme keeps the academic teal and gold semantic palette', async ({ page }) => {
  await stubApi(page, TEACHER_USER);
  await page.goto('/dashboard');
  const colors = await page.evaluate(() => {
    document.documentElement.dataset.theme = 'dark';
    const probe = document.createElement('div');
    probe.style.backgroundColor = 'var(--ez-primary)';
    probe.style.borderColor = 'var(--ez-accent)';
    document.body.append(probe);
    const result = {
      primary: getComputedStyle(probe).backgroundColor,
      accent: getComputedStyle(probe).borderTopColor,
    };
    probe.remove();
    return result;
  });

  expect(colors.primary).toBe('rgb(23, 125, 115)');
  expect(colors.accent).toBe('rgb(229, 184, 91)');
});

test('reduced motion preserves animations while disabling root smooth scrolling', async ({ page }) => {
  await stubApi(page, TEACHER_USER);
  await page.goto('/dashboard');
  const motion = await page.evaluate(() => {
    document.documentElement.dataset.motion = 'reduced';
    const probe = document.createElement('div');
    probe.style.animation = 'spin 750ms linear infinite';
    document.body.append(probe);
    const result = {
      rootScrollBehavior: getComputedStyle(document.documentElement).scrollBehavior,
      animationDuration: getComputedStyle(probe).animationDuration,
    };
    probe.remove();
    return result;
  });

  expect(motion.rootScrollBehavior).toBe('auto');
  expect(motion.animationDuration).toBe('0.75s');
});
