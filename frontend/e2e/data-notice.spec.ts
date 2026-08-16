import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { STUDENT_USER, stubApi } from './helpers';

/**
 * Thông báo dữ liệu lưu trên trình duyệt.
 *
 * Không phải banner cookie: app không đặt cookie nào, không có analytics — xem
 * `docs/superpowers/specs/2026-08-16-thong-bao-du-lieu-design.md`.
 */

const NOTICE = '.ez-data-notice';

test('hiện lần đầu và biến mất vĩnh viễn sau khi bấm Đã hiểu', async ({ page }) => {
  await stubApi(page, null, { showDataNotice: true });
  await page.goto('/');

  const notice = page.locator(NOTICE);
  await expect(notice).toBeVisible();
  await expect(notice.getByText(/Không dùng cookie quảng cáo hay theo dõi/)).toBeVisible();

  await notice.getByRole('button', { name: 'Đã hiểu' }).click();
  await expect(notice).toHaveCount(0);

  // Tải lại: lựa chọn phải còn, nếu không thì mỗi lần vào trang lại bị hỏi
  await page.reload();
  await page.waitForTimeout(1000);
  await expect(page.locator(NOTICE)).toHaveCount(0);
});

test('liên kết Chi tiết mở trang chính sách', async ({ page }) => {
  await stubApi(page, null, { showDataNotice: true });
  await page.goto('/');
  await page.locator(NOTICE).getByRole('link', { name: 'Chi tiết' }).click();

  await expect(page).toHaveURL(/\/chinh-sach-du-lieu$/);
  await expect(page.getByRole('heading', { name: 'Dữ liệu lưu trên trình duyệt' })).toBeVisible();
  // Bảng phải liệt kê đúng khoá thật trong mã nguồn
  await expect(page.getByText('access_token').first()).toBeVisible();
  await expect(page.getByText('theme-preference').first()).toBeVisible();

  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(1);
});

test('không đè lên thanh tab dưới cùng trên điện thoại', async ({ page }) => {
  // Thanh tab chỉ có ở khung ứng dụng, tức phải đăng nhập
  await stubApi(page, STUDENT_USER, { showDataNotice: true });
  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto('/dashboard');

  const notice = page.locator(NOTICE);
  await expect(notice).toBeVisible();
  const tabbar = page.locator('.ez-tabbar');
  await expect(tabbar).toBeVisible();

  const [noticeBox, tabbarBox] = await Promise.all([notice.boundingBox(), tabbar.boundingBox()]);
  // Đáy dải thông báo phải nằm trên đỉnh thanh tab; chồng lên nhau thì một
  // trong hai không bấm được.
  expect(noticeBox!.y + noticeBox!.height).toBeLessThanOrEqual(tabbarBox!.y + 1);
});

test('trang chính sách không có vi phạm axe A/AA', async ({ page }) => {
  test.setTimeout(60_000);
  await stubApi(page, null, { showDataNotice: true });
  await page.goto('/chinh-sach-du-lieu');
  await expect(page.getByRole('heading', { name: 'Dữ liệu lưu trên trình duyệt' })).toBeVisible();

  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();
  expect(results.violations).toEqual([]);
});
