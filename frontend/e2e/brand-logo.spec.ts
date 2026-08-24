import { expect, test } from '@playwright/test';
import { stubApi } from './helpers';

test('trang đăng nhập hiển thị logo EzEdu AI dạng hình ảnh', async ({ page }) => {
  await stubApi(page);
  await page.goto('/login');

  const logo = page.getByRole('img', { name: 'EzEdu AI' });
  await expect(logo).toBeVisible();
  await expect
    .poll(() => logo.evaluate((image: HTMLImageElement) => image.complete && image.naturalWidth > 0))
    .toBe(true);
});
