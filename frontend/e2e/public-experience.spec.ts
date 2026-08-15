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

test('dây chuyền dữ liệu ghim theo cuộn trên desktop', async ({ page }) => {
  await stubApi(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');

  const pipeline = page.locator('[data-pipeline]');
  await pipeline.scrollIntoViewIfNeeded();
  await expect(pipeline.locator('.ezp-pipeline-stage')).toHaveCount(6);
  await expect(page.getByRole('heading', { name: 'Học liệu của bạn đi qua sáu công đoạn' })).toBeVisible();

  // ScrollTrigger ghim khối lại -> chèn pin-spacer vào DOM
  await expect.poll(async () => page.locator('.pin-spacer').count()).toBeGreaterThan(0);

  // Cuộn tiếp thì công đoạn sau sáng dần theo tiến độ
  await page.mouse.wheel(0, 900);
  await expect
    .poll(async () => page.locator('.ezp-pipeline-stage[data-active="true"]').count())
    .toBeGreaterThan(1);

  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(1);
});

test('reduced motion: dây chuyền dữ liệu không ghim và hiện đủ nội dung', async ({ browser }) => {
  const context = await browser.newContext({ reducedMotion: 'reduce', viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  await stubApi(page);
  await page.goto('/');

  const pipeline = page.locator('[data-pipeline]');
  await pipeline.scrollIntoViewIfNeeded();
  await expect(pipeline.locator('.ezp-pipeline-stage')).toHaveCount(6);
  expect(await page.locator('.pin-spacer').count()).toBe(0);
  await expect(pipeline.getByText('CP-SAT')).toBeVisible();

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
  // Ba lượt quét axe trong một bài; trang chủ nay có cả dây chuyền dữ liệu nên
  // quét lâu hơn hạn 30s mặc định khi máy đang chạy song song nhiều project.
  test.setTimeout(90_000);
  await stubApi(page);
  for (const path of ['/', '/login', '/register']) {
    await page.goto(path);
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();
    expect(results.violations, `axe fail tại ${path}`).toEqual([]);
  }
});

async function stubOnboarding(page: import('@playwright/test').Page) {
  await stubApi(page, { ...STUDENT_USER, student_profile_completed: false });
  await page.route('**/api/v1/personalization/me/onboarding/options', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        grades: [10, 11, 12],
        subjects: [{ id: 'toan', label: 'Toán' }, { id: 'vat_li', label: 'Vật lí' }],
        exam_combinations: [
          { code: 'A00', label: 'A00 (Toán, Vật lí, Hóa học)', subjects: ['Toán', 'Vật lí', 'Hóa học'], group: 'A' },
          { code: 'D01', label: 'D01 (Toán, Ngữ văn, Tiếng Anh)', subjects: ['Toán', 'Ngữ văn', 'Tiếng Anh'], group: 'D' },
        ],
      }),
    });
  });
  await page.route('**/api/v1/personalization/me/onboarding', async (route) => {
    if (route.request().method() === 'PUT') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ user_id: STUDENT_USER.id, grade_level: 11, strong_subjects: [], weak_subjects: [], target_exam_combinations: ['A00'], onboarding_completed: true }) });
      return;
    }
    await route.fulfill({ status: 200, contentType: 'application/json', body: 'null' });
  });
}

test('onboarding đi từng bước, quay lại được và giữ đường thoát "Để sau"', async ({ page }) => {
  await stubOnboarding(page);
  await page.goto('/student-onboarding');

  // Bước 1: lớp
  await expect(page.getByRole('group', { name: 'Bạn đang học lớp mấy?' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Quay lại' })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Để sau' })).toBeEnabled();
  await page.getByRole('radio', { name: 'Lớp 11' }).check();
  await page.getByRole('button', { name: 'Tiếp tục' }).click();

  // Bước 2 -> 3
  await expect(page.getByRole('group', { name: 'Môn nào bạn đang tự tin?' })).toBeVisible();
  await page.getByRole('checkbox', { name: 'Toán' }).check();
  await page.getByRole('button', { name: 'Tiếp tục' }).click();

  // Điểm mạnh đã chọn không xuất hiện trong danh sách điểm yếu
  await expect(page.getByRole('group', { name: 'Môn nào bạn muốn cải thiện?' })).toBeVisible();
  await expect(page.getByRole('checkbox', { name: 'Toán' })).toHaveCount(0);
  await expect(page.getByRole('checkbox', { name: 'Vật lí' })).toBeVisible();

  // Quay lại giữ nguyên lựa chọn của bước trước
  await page.getByRole('button', { name: 'Quay lại' }).click();
  await expect(page.getByRole('checkbox', { name: 'Toán' })).toBeChecked();
  await page.getByRole('button', { name: 'Tiếp tục' }).click();
  await page.getByRole('button', { name: 'Tiếp tục' }).click();

  // Bước cuối bắt buộc chọn tổ hợp
  await expect(page.getByRole('group', { name: 'Khối hoặc tổ hợp môn muốn ôn' })).toBeVisible();
  await page.getByRole('button', { name: 'Lưu và bắt đầu học' }).click();
  await expect(page.getByText('Hãy chọn ít nhất một khối hoặc tổ hợp môn muốn ôn.')).toBeVisible();

  await page.getByRole('checkbox', { name: /A00/ }).check();
  await page.getByRole('button', { name: 'Lưu và bắt đầu học' }).click();
  await expect(page).toHaveURL(/\/published-questions$/);
});

test('onboarding giữ nháp khi tải lại trang', async ({ page }) => {
  await stubOnboarding(page);
  await page.goto('/student-onboarding');

  await page.getByRole('radio', { name: 'Lớp 10' }).check();
  await page.getByRole('button', { name: 'Tiếp tục' }).click();
  await page.getByRole('checkbox', { name: 'Vật lí' }).check();

  await page.reload();

  // Về lại bước 1 nhưng dữ liệu đã chọn còn nguyên
  await expect(page.getByRole('radio', { name: 'Lớp 10' })).toBeChecked();
  await page.getByRole('button', { name: 'Tiếp tục' }).click();
  await expect(page.getByRole('checkbox', { name: 'Vật lí' })).toBeChecked();
});
