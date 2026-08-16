import { expect, test, type Page } from '@playwright/test';
import { ADMIN_USER, stubApi } from './helpers';

/**
 * Trang quản trị danh mục môn → chương.
 *
 * Cây này quyết định mục lục "Học theo môn" của học sinh và ô chọn của giáo viên
 * lúc công bố. Chưa có môn nào thì mọi học liệu rơi vào "Chưa phân môn".
 */

const DANH_MUC = [
  { id: 's1', name: 'Toán', count: 0, chapters: [{ id: 'c1', name: 'Hàm số bậc hai', count: 0 }] },
  { id: 's2', name: 'Ngữ văn', count: 0, chapters: [] },
];

async function gaApi(page: Page, danhMuc = DANH_MUC) {
  const daGoi: Array<{ method: string; path: string; body?: unknown }> = [];

  await page.route('**/api/v1/questions/taxonomy/subject-options', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(danhMuc) });
  });

  await page.route('**/api/v1/questions/taxonomy/nodes**', async (route) => {
    const req = route.request();
    daGoi.push({
      method: req.method(),
      path: new URL(req.url()).pathname,
      body: req.method() === 'GET' ? undefined : req.postDataJSON?.(),
    });
    if (req.method() === 'DELETE') {
      await route.fulfill({ status: 204, body: '' });
      return;
    }
    await route.fulfill({
      status: req.method() === 'POST' ? 201 : 200,
      contentType: 'application/json',
      body: JSON.stringify({ id: 'moi', name: 'x', node_type: 'subject' }),
    });
  });

  return daGoi;
}

test('hiện cây môn và chương hiện có', async ({ page }) => {
  await stubApi(page, ADMIN_USER);
  await gaApi(page);

  await page.goto('/admin/mon-hoc');

  await expect(page.getByRole('heading', { name: 'Toán' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Ngữ văn' })).toBeVisible();
  await expect(page.getByText('Hàm số bậc hai')).toBeVisible();
  await expect(page.getByText('Chưa có chương nào.')).toBeVisible();
});

test('thêm môn gửi đúng node_type và không kèm parent', async ({ page }) => {
  await stubApi(page, ADMIN_USER);
  const daGoi = await gaApi(page);

  await page.goto('/admin/mon-hoc');
  await page.getByLabel('Tên môn').fill('Vật lí');
  await page.getByRole('button', { name: 'Thêm môn' }).click();

  await expect.poll(() => daGoi.filter((g) => g.method === 'POST').length).toBe(1);
  expect(daGoi.find((g) => g.method === 'POST')?.body).toEqual({
    node_type: 'subject',
    name: 'Vật lí',
  });
});

test('thêm chương gửi kèm đúng môn cha', async ({ page }) => {
  // Thiếu parent_id thì backend từ chối, và chương không biết thuộc môn nào.
  await stubApi(page, ADMIN_USER);
  const daGoi = await gaApi(page);

  await page.goto('/admin/mon-hoc');
  await page.getByLabel('Thêm chương cho Ngữ văn').fill('Truyện ngắn');
  await page
    .locator('[data-subject-admin-card]')
    .filter({ hasText: 'Ngữ văn' })
    .getByRole('button', { name: 'Thêm chương' })
    .click();

  await expect.poll(() => daGoi.filter((g) => g.method === 'POST').length).toBe(1);
  expect(daGoi.find((g) => g.method === 'POST')?.body).toEqual({
    node_type: 'chapter',
    name: 'Truyện ngắn',
    parent_id: 's2',
  });
});

test('xoá hỏi xác nhận trước, huỷ thì không gọi API', async ({ page }) => {
  await stubApi(page, ADMIN_USER);
  const daGoi = await gaApi(page);
  page.on('dialog', (dialog) => void dialog.dismiss());

  await page.goto('/admin/mon-hoc');
  await page
    .locator('[data-subject-admin-card]')
    .filter({ hasText: 'Ngữ văn' })
    .getByRole('button', { name: 'Xoá môn' })
    .click();

  await page.waitForTimeout(800);
  expect(daGoi.filter((g) => g.method === 'DELETE')).toEqual([]);
});

test('lý do backend từ chối xoá phải hiện nguyên văn cho người dùng', async ({ page }) => {
  // Câu "Môn này còn 3 chương. Xoá chương trước." nói đúng việc cần làm. Nuốt
  // nó và thay bằng "Thao tác không thành công" là bỏ người dùng ở ngõ cụt.
  await stubApi(page, ADMIN_USER);
  await page.route('**/api/v1/questions/taxonomy/subject-options', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(DANH_MUC) });
  });
  await page.route('**/api/v1/questions/taxonomy/nodes**', async (route) => {
    await route.fulfill({
      status: 400,
      contentType: 'application/json',
      body: JSON.stringify({ detail: 'Môn này còn 1 chương. Xoá chương trước.' }),
    });
  });
  page.on('dialog', (dialog) => void dialog.accept());

  await page.goto('/admin/mon-hoc');
  await page
    .locator('[data-subject-admin-card]')
    .filter({ hasText: 'Toán' })
    .getByRole('button', { name: 'Xoá môn' })
    .click();

  await expect(page.getByText('Môn này còn 1 chương. Xoá chương trước.')).toBeVisible();
});

test('chưa có môn nào thì chỉ đường, không để trang trắng', async ({ page }) => {
  await stubApi(page, ADMIN_USER);
  await gaApi(page, []);

  await page.goto('/admin/mon-hoc');

  await expect(page.getByText('Chưa có môn nào')).toBeVisible();
});

test('có mục Danh mục môn trong menu quản trị', async ({ page }, testInfo) => {
  await stubApi(page, ADMIN_USER);
  await gaApi(page);

  await page.goto('/admin/dashboard');

  // Dưới 1024px thanh bên bị ẩn và menu nằm trong ngăn kéo "Thêm". Chỉ kiểm
  // desktop thì mục này biến mất trên điện thoại mà không ai biết.
  const rong = testInfo.project.use.viewport?.width ?? 1440;
  if (rong < 1024) {
    await page.locator('.ez-tabbar').getByRole('button', { name: 'Thêm' }).click();
    await expect(page.getByRole('dialog', { name: 'Thêm' })).toBeVisible();
  }

  await expect(page.getByRole('link', { name: 'Danh mục môn' })).toBeVisible();
});
