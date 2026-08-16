import { expect, test, type Page } from '@playwright/test';
import { STUDENT_USER, stubApi } from './helpers';

/**
 * Logo thương hiệu.
 *
 * Trước đây có bốn nhận diện chỏi nhau: ba ô chữ "Ez" tự vẽ bằng CSS ở sidebar,
 * header công khai và chân trang — mỗi chỗ một kích thước — cộng một favicon
 * hình tài liệu màu chàm chẳng liên quan gì tới ba cái kia.
 */

/** Logo là `<svg role="img">` mang nhãn thương hiệu. */
const LOGO = 'svg[role="img"][aria-label="EzEdu AI"]';

async function demLogo(page: Page): Promise<number> {
  return page.locator(LOGO).count();
}

test('sidebar ứng dụng dùng logo, không còn ô chữ tự vẽ', async ({ page }, testInfo) => {
  // Thanh bên là thành phần CHỈ có ở desktop; dưới 1024px nó ẩn và thanh trên
  // chỉ hiện tên trang. Chốt lại theo bề ngang thay vì giả định desktop.
  const rong = testInfo.project.use.viewport?.width ?? 1440;
  test.skip(rong < 1024, 'thanh bên chỉ có ở màn hình từ 1024px');

  await stubApi(page, STUDENT_USER);
  await page.goto('/dashboard');

  await expect(page.locator('.ez-brand').locator(LOGO)).toBeVisible();
  // Ô chữ cũ phải biến mất hẳn, không chỉ bị che.
  await expect(page.locator('.ez-brand-mark')).toHaveCount(0);
});

test('header và chân trang công khai đều dùng logo', async ({ page }) => {
  await stubApi(page);
  await page.goto('/');

  await expect(page.locator('header').locator(LOGO).first()).toBeVisible();
  await expect(page.locator('footer').locator(LOGO).first()).toBeVisible();
  await expect(page.locator('.ezp-brand-mark')).toHaveCount(0);
});

test('logo hiện ra chứ không bị cấu hình logo_text nuốt mất', async ({ page }) => {
  // Bẫy đã sập một lần: `logo_text` mặc định là "EzEdu AI" nên nhánh "dùng chữ
  // khi quản trị đặt logo_text" luôn thắng, và logo không bao giờ hiện trên
  // trang công khai. Sidebar thì có, header thì không — lệch nhau mà không ai
  // để ý vì hai chỗ nằm ở hai trang khác nhau.
  await stubApi(page);
  await page.goto('/');

  const so = await demLogo(page);
  expect(so, 'trang công khai phải có logo ở cả header và chân trang').toBeGreaterThanOrEqual(2);
  await expect(page.getByText('Ez', { exact: true })).toHaveCount(0);
});

test('logo giữ được tỉ lệ vuông ở mọi bề ngang màn hình', async ({ page }) => {
  // Kéo lệch một chiều làm dấu tích méo và trông như lỗi dựng trang. Đo trên
  // trang công khai vì đó là chỗ logo có mặt ở MỌI bề ngang — thanh bên của ứng
  // dụng thì ẩn dưới 1024px.
  await stubApi(page);
  await page.goto('/');

  const hop = await page.locator('header').locator(LOGO).first().boundingBox();
  expect(hop, 'không đo được logo thì bài kiểm này vô nghĩa').not.toBeNull();
  expect(Math.abs(hop!.width - hop!.height)).toBeLessThanOrEqual(1);
  expect(hop!.width, 'logo bị co về 0 thì coi như biến mất').toBeGreaterThan(16);
});

test('favicon khớp logo, không còn hình cũ', async ({ page }) => {
  const res = await page.request.get('/favicon.svg');
  expect(res.status()).toBe(200);

  const svg = await res.text();
  // Dấu tích cam và hai dòng học liệu — chữ ký của logo hiện tại.
  expect(svg).toContain('#FFAB43');
  expect(svg, 'favicon phải dùng tím thương hiệu').toContain('#5906EB');
  // #4F46E5 là màu chàm của favicon cũ, chẳng liên quan tới bảng màu nào đang dùng.
  expect(svg, 'favicon cũ màu chàm phải biến mất').not.toContain('#4F46E5');
});
