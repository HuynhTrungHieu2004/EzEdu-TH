import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { STUDENT_USER, stubApi } from './helpers';

test('landing dùng nền học thuật navy, không còn gradient forest', async ({ page }) => {
  await stubApi(page);
  await page.goto('/');

  const cta = page.locator('.ezp-section-dark').first();
  await cta.scrollIntoViewIfNeeded();
  await expect(cta).toBeVisible();
  const background = await cta.evaluate((el) => getComputedStyle(el).backgroundImage);
  expect(background).toContain('rgb(18, 50, 65)');
  expect(background).toContain('rgb(15, 111, 104)');
  // #1d3b2c là forest-600 của hệ cũ
  expect(background).not.toContain('rgb(29, 59, 44)');
});

test('landing reveal theo cuộn và dọn sạch transform sau khi chạy', async ({ page }) => {
  await stubApi(page);
  await page.goto('/');

  const section = page.locator('.ezp-section').first();
  await section.scrollIntoViewIfNeeded();
  await expect
    .poll(async () => section.evaluate((el) => getComputedStyle(el).opacity))
    .toBe('1');
  await expect
    .poll(async () => section.evaluate((el) => getComputedStyle(el).transform))
    .toBe('none');

  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(1);
});

test('reduced motion: landing hiện sẵn nội dung, không đợi cuộn', async ({ browser }) => {
  const context = await browser.newContext({ reducedMotion: 'reduce' });
  const page = await context.newPage();
  await stubApi(page);
  await page.goto('/');

  // Khối cuối trang phải hiện dù chưa cuộn tới
  const finalCta = page.locator('.ezp-section-dark').first();
  expect(await finalCta.evaluate((el) => getComputedStyle(el).opacity)).toBe('1');
  expect(await finalCta.evaluate((el) => getComputedStyle(el).transform)).toBe('none');

  await context.close();
});

test('đăng nhập báo lỗi cạnh từng trường, không gộp một dòng', async ({ page }) => {
  await stubApi(page);
  await page.goto('/login');
  const form = page.locator('#pub-main-content');

  await expect(page.getByRole('heading', { name: 'Đăng nhập' })).toBeVisible();
  await form.getByRole('button', { name: 'Đăng nhập' }).click();

  await expect(page.getByText('Nhập email đăng nhập.')).toBeVisible();
  await expect(page.getByText('Nhập mật khẩu.')).toBeVisible();
  await expect(page.getByLabel('Email đăng nhập')).toHaveAttribute('aria-invalid', 'true');

  await page.getByLabel('Email đăng nhập').fill('sai-dinh-dang');
  await page.getByLabel('Mật khẩu').fill('mat-khau');
  await form.getByRole('button', { name: 'Đăng nhập' }).click();
  await expect(page.getByText('Email chưa đúng định dạng.')).toBeVisible();
  await expect(page.getByText('Nhập mật khẩu.')).toHaveCount(0);
});

test('đăng ký kiểm tra mật khẩu và xác nhận ngay tại trường', async ({ page }) => {
  await stubApi(page);
  await page.goto('/register');

  await page.getByLabel('Họ và tên').fill('Nguyễn Văn A');
  await page.getByLabel('Email').fill('a@example.test');
  await page.getByLabel('Mật khẩu', { exact: true }).fill('123');
  await page.getByLabel('Xác nhận mật khẩu').fill('456');
  await page.locator('#pub-main-content').getByRole('button', { name: 'Đăng ký tài khoản' }).click();

  await expect(page.getByText('Mật khẩu phải chứa ít nhất 6 ký tự.')).toBeVisible();
  await expect(page.getByText('Mật khẩu xác nhận không khớp.')).toBeVisible();
  await expect(page.getByText('Nhập họ và tên.')).toHaveCount(0);
});

test('trang công khai không có vi phạm axe A/AA sau khi di trú', async ({ page }) => {
  await stubApi(page);
  for (const path of ['/', '/login', '/register']) {
    await page.goto(path);
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();
    expect(results.violations, `axe fail tại ${path}`).toEqual([]);
  }
});

test('onboarding học sinh có đường thoát "Để sau"', async ({ page }) => {
  await stubApi(page, { ...STUDENT_USER, student_profile_completed: false });
  await page.route('**/api/v1/personalization/onboarding-options', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        grades: [10, 11, 12],
        subjects: [{ id: 'math', label: 'Toán' }, { id: 'physics', label: 'Vật lý' }],
        goals: [],
      }),
    });
  });
  await page.goto('/student-onboarding');

  await expect(page.getByRole('button', { name: 'Để sau' })).toBeEnabled();
  await expect(page.getByRole('button', { name: 'Lưu và bắt đầu học' })).toBeEnabled();
});
