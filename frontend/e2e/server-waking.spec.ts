import { expect, test } from '@playwright/test';
import { STUDENT_USER, TEACHER_USER, stubApi } from './helpers';

/**
 * Thông báo "máy chủ đang khởi động lại".
 *
 * Backend chạy gói miễn phí của Render: ngủ sau 15 phút, dậy mất khoảng một
 * phút. Render có trang chờ nhưng chỉ hiện khi trình duyệt vào thẳng backend —
 * frontend ở Netlify gọi API bằng XHR nên người dùng chỉ thấy ứng dụng đứng im.
 */

const WAKING = '.ez-waking';

test('hiện khi API treo quá lâu, biến mất khi có phản hồi', async ({ page }) => {
  await stubApi(page, STUDENT_USER);

  // Giữ một request treo 8 giây rồi mới trả — mô phỏng lần gọi đầu đánh thức
  // máy chủ. Ngưỡng báo là 4 giây.
  let release: (() => void) | null = null;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route('**/api/v1/questions/published*', async (route) => {
    await held;
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ items: [], total: 0 }),
    });
  });

  await page.goto('/published-questions');

  const waking = page.locator(WAKING);
  await expect(waking).toBeVisible({ timeout: 15_000 });
  await expect(waking).toContainText('Máy chủ đang khởi động lại');

  release!();
  await expect(waking).toHaveCount(0, { timeout: 15_000 });
});

test('không hiện khi API trả lời bình thường', async ({ page }) => {
  await stubApi(page, TEACHER_USER);
  await page.goto('/dashboard');

  // Chờ quá ngưỡng 4 giây: nếu logic đếm sai thì thông báo sẽ nhảy ra ở đây
  await page.waitForTimeout(6000);
  await expect(page.locator(WAKING)).toHaveCount(0);
});

test('thông báo lỗi cũng gỡ được cờ, không kẹt vĩnh viễn', async ({ page }) => {
  await stubApi(page, STUDENT_USER);

  let release: (() => void) | null = null;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route('**/api/v1/questions/published*', async (route) => {
    await held;
    await route.fulfill({ status: 500, contentType: 'application/json', body: '{"detail":"lỗi"}' });
  });

  await page.goto('/published-questions');
  await expect(page.locator(WAKING)).toBeVisible({ timeout: 15_000 });

  release!();
  // Request hỏng vẫn phải gỡ cờ — nếu chỉ gỡ ở nhánh thành công thì thông báo
  // treo mãi trên màn hình.
  await expect(page.locator(WAKING)).toHaveCount(0, { timeout: 15_000 });
});
