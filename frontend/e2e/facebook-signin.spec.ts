import { expect, test, type Page } from '@playwright/test';
import { stubApi } from './helpers';

/**
 * Nút đăng nhập Facebook.
 *
 * Không gọi Facebook thật: chặn luôn `connect.facebook.net` và trả về một SDK
 * giả. Ở đây kiểm hành vi của ta — khi nào SDK được nạp, gửi gì lên backend,
 * xử lý ra sao khi người dùng bấm Huỷ — chứ không kiểm SDK của Facebook.
 */

const NUT = 'button:has-text("Tiếp tục với Facebook")';
const SDK = '**/connect.facebook.net/**';

/** Đếm số lần trang xin nạp SDK, và trả về một SDK giả khi có. */
async function gaSdkGia(page: Page, options: { token?: string | null } = {}) {
  const token = options.token === undefined ? 'fb-access-token-gia' : options.token;
  const soLanNap = { value: 0 };

  await page.route(SDK, async (route) => {
    soLanNap.value += 1;
    // `authResponse: null` là cách SDK thật báo người dùng đã đóng cửa sổ.
    const authResponse = token === null ? 'null' : `{ accessToken: ${JSON.stringify(token)} }`;
    await route.fulfill({
      status: 200,
      contentType: 'application/javascript',
      body: `window.FB = {
        init: function () {},
        login: function (callback) { callback({ authResponse: ${authResponse} }); }
      };`,
    });
  });

  return soLanNap;
}

/** Bắt request lên /auth/facebook và trả lời bằng `body`. */
async function gaBackend(page: Page, body: Record<string, unknown>) {
  const daGui: Array<Record<string, unknown>> = [];
  await page.route('**/api/v1/auth/facebook', async (route) => {
    daGui.push(route.request().postDataJSON());
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
  });
  return daGui;
}

test('SDK Facebook không được nạp cho tới khi người dùng bấm nút', async ({ page }) => {
  // Đây là lý do tồn tại của cả cách dựng nút này. SDK Facebook thả cookie ngay
  // khi nạp; nạp sẵn cho mọi khách vào trang đăng nhập nghĩa là Facebook theo
  // dõi cả người chưa từng định dùng Facebook, và câu chữ trong thông báo dữ
  // liệu của trang sẽ không còn đúng.
  await stubApi(page);
  const soLanNap = await gaSdkGia(page);
  await gaBackend(page, { needs_role: true, email: 'an@example.com', full_name: 'An' });

  await page.goto('/login');
  await expect(page.locator(NUT)).toBeVisible();
  await page.waitForTimeout(1500);

  expect(soLanNap.value, 'chỉ mở trang thôi thì không được đụng tới Facebook').toBe(0);

  await page.locator(NUT).click();
  await expect(page.getByText('Bạn là ai trên EzEdu AI?')).toBeVisible();
  expect(soLanNap.value, 'bấm rồi mới nạp').toBeGreaterThan(0);
});

test('gửi access_token lên backend, người mới thì hỏi vai rồi gửi lại kèm vai', async ({ page }) => {
  await stubApi(page);
  await gaSdkGia(page);
  const daGui = await gaBackend(page, {
    needs_role: true,
    email: 'an@example.com',
    full_name: 'Trần Minh An',
  });

  await page.goto('/login');
  await page.locator(NUT).click();

  await expect(page.getByText('Trần Minh An')).toBeVisible();
  expect(daGui).toHaveLength(1);
  expect(daGui[0]).toEqual({ access_token: 'fb-access-token-gia', role: undefined });

  await page.getByRole('button', { name: 'Tôi là học sinh' }).click();

  await expect
    .poll(() => daGui.length, { message: 'chọn vai xong phải gọi lại lần hai' })
    .toBe(2);
  expect(daGui[1]).toEqual({ access_token: 'fb-access-token-gia', role: 'student' });
});

test('người dùng đóng cửa sổ Facebook thì không báo lỗi và không gọi backend', async ({ page }) => {
  await stubApi(page);
  await gaSdkGia(page, { token: null });
  const daGui = await gaBackend(page, { needs_role: true });

  await page.goto('/login');
  await page.locator(NUT).click();

  // Huỷ là hành động cố ý của người dùng, không phải sự cố. Hiện dải đỏ ở đây
  // chỉ làm họ tưởng mình vừa làm hỏng thứ gì.
  await page.waitForTimeout(1000);
  expect(daGui, 'không có token thì không được gọi backend').toHaveLength(0);
  await expect(page.locator('.ez-alert-error')).toHaveCount(0);
  await expect(page.locator(NUT)).toBeEnabled();
});

test('backend từ chối thì hiện đúng câu backend trả về', async ({ page }) => {
  await stubApi(page);
  await gaSdkGia(page);
  await page.route('**/api/v1/auth/facebook', async (route) => {
    await route.fulfill({
      status: 403,
      contentType: 'application/json',
      body: JSON.stringify({
        detail: 'Tài khoản Facebook này không chia sẻ email. Vui lòng đăng nhập bằng Google hoặc bằng email và mật khẩu.',
      }),
    });
  });

  await page.goto('/login');
  await page.locator(NUT).click();

  // Câu này chỉ đường thoát cho người dùng, nuốt mất nó là bỏ họ ở ngõ cụt.
  await expect(page.getByText('không chia sẻ email')).toBeVisible();
});

test('nút có mặt ở cả trang đăng ký', async ({ page }) => {
  await stubApi(page);
  await gaSdkGia(page);

  await page.goto('/register');

  await expect(page.locator(NUT)).toBeVisible();
});

/**
 * Bản trưng bày — khi chưa có VITE_FACEBOOK_APP_ID.
 *
 * Bộ kiểm chạy với App ID giả trong .env nên nhánh này không tự xuất hiện. Gỡ
 * biến ra khỏi bundle không làm được lúc chạy, nên ở đây kiểm bằng bản dựng
 * riêng: xem chuỗi nào có mặt trong tệp JavaScript sinh ra.
 */
test('bản dựng thiếu App ID: có nút trưng bày, không có mã chạm tới Facebook', async ({}, testInfo) => {
  // Kiểm nội dung bản dựng, không liên quan kích thước màn hình. Không chốt lại
  // thì sáu project dựng lại sáu lần cho cùng một kết quả.
  test.skip(testInfo.project.name !== 'desktop-1440', 'chỉ cần chạy một lần');

  const { execFileSync } = await import('node:child_process');
  const { readFileSync, readdirSync, rmSync } = await import('node:fs');
  const { join } = await import('node:path');

  const thuMuc = join('/tmp', 'fb-demo-build');
  rmSync(thuMuc, { recursive: true, force: true });
  execFileSync('npx', ['vite', 'build', '--outDir', thuMuc, '--emptyOutDir'], {
    env: { ...process.env, VITE_FACEBOOK_APP_ID: '' },
    stdio: 'pipe',
  });

  const assets = join(thuMuc, 'assets');
  const goc = readdirSync(assets)
    .filter((ten) => ten.endsWith('.js'))
    .map((ten) => readFileSync(join(assets, ten), 'utf8'))
    .join('');

  expect(goc, 'nút phải có để trưng bày').toContain('Tiếp tục với Facebook');
  expect(goc, 'phải nói ra điều kiện Facebook đặt ra').toContain('xác minh doanh nghiệp');
  // Cả hai chuỗi dưới đây chỉ tồn tại trong bộ nạp SDK. Còn chúng nghĩa là bản
  // trưng bày vẫn kéo Facebook về, và cookie Facebook sẽ đặt lên máy người xem.
  expect(goc, 'không được nạp SDK ở bản trưng bày').not.toContain('connect.facebook.net');
  expect(goc, 'không được nạp SDK ở bản trưng bày').not.toContain('facebook-jssdk');
});
