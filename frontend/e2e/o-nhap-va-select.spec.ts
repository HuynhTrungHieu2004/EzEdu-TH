import { expect, test } from '@playwright/test';
import { ADMIN_USER, stubApi } from './helpers';

/**
 * Ô nhập văn bản và ô chọn phải giữ đúng định dạng riêng của mình.
 *
 * Đã hỏng một lần và lọt lên bản chạy thật: bản vá `appearance: none` cho
 * `<select>` trên Safari được viết nối vào danh sách `.ez-input, .ez-textarea,`
 * ngay phía trên. Dấu phẩy kéo luôn hai lớp đó vào, nên mọi ô nhập văn bản
 * trong ứng dụng mất sạch viền, nền, bo góc và mọc thêm mũi tên xổ xuống.
 *
 * Không bài kiểm nào bắt được, vì bộ kiểm a11y chỉ soi tương phản chữ còn ảnh
 * chụp thì không ai đối chiếu từng pixel. Bài kiểm này soi thẳng computed style.
 */

test('ô nhập văn bản có viền và bo góc riêng, không mọc mũi tên xổ xuống', async ({ page }) => {
  await stubApi(page);
  await page.goto('/login');

  const o = page.locator('input.ez-input').first();
  await expect(o).toBeVisible();

  const dang = await o.evaluate((el) => {
    const s = getComputedStyle(el);
    return {
      vienRong: s.borderTopWidth,
      boGoc: s.borderTopLeftRadius,
      anhNen: s.backgroundImage,
      nen: s.backgroundColor,
    };
  });

  // Viền của trình duyệt mặc định là 2px; của ta là 1px theo token.
  expect(dang.vienRong, 'mất viền riêng thì rơi về viền mặc định 2px').toBe('1px');
  expect(dang.boGoc, 'mất bo góc nghĩa là quy tắc dùng chung đã bị cuốn đi').not.toBe('0px');
  expect(dang.anhNen, 'ô nhập văn bản không được có mũi tên của select').toBe('none');
  expect(dang.nen, 'nền phải là màu surface, không trong suốt').not.toBe('rgba(0, 0, 0, 0)');
});

test('ô chọn vẫn giữ mũi tên tự vẽ — bản vá Safari còn nguyên tác dụng', async ({ page }) => {
  await stubApi(page, ADMIN_USER);
  await page.goto('/admin/activity-logs');

  const chon = page.locator('select').first();
  // Không cho phép bỏ qua: một bài kiểm tự tắt khi không tìm thấy thứ cần soi
  // thì mãi mãi xanh, kể cả lúc bản vá Safari đã bị xoá.
  await expect(chon).toBeVisible({ timeout: 15_000 });

  const dang = await chon.evaluate((el) => {
    const s = getComputedStyle(el);
    return { appearance: s.appearance, anhNen: s.backgroundImage, cao: el.getBoundingClientRect().height };
  });

  expect(dang.appearance, 'Safari cần appearance:none thì mới nhận padding').toBe('none');
  expect(dang.anhNen, 'tắt appearance mà không tự vẽ mũi tên thì ô chọn trông như ô nhập').toContain('svg');
  expect(dang.cao, 'ô chọn từng bị co còn 27px trên iPhone').toBeGreaterThanOrEqual(40);
});
