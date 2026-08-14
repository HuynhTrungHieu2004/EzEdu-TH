import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { TEACHER_USER, stubApi } from './helpers';

const DOCUMENTS = [
  {
    id: '68b2f1f77bcf86cd79944001',
    original_filename: 'Đại số 10 - Chương 1.pdf',
    file_type: 'pdf',
    file_size: 254_000,
    status: 'indexed',
    media_kind: 'document',
    created_at: '2026-08-01T02:00:00Z',
  },
  {
    id: '68b2f1f77bcf86cd79944002',
    original_filename: 'Bài giảng hình học.mp4',
    file_type: 'mp4',
    file_size: 18_400_000,
    status: 'transcribing',
    media_kind: 'video',
    created_at: '2026-08-05T02:00:00Z',
  },
  {
    id: '68b2f1f77bcf86cd79944003',
    original_filename: 'Đề cương ôn tập.docx',
    file_type: 'docx',
    file_size: 96_000,
    status: 'index_failed',
    media_kind: 'document',
    created_at: '2026-08-09T02:00:00Z',
  },
];

async function stubDocuments(page: Page, documents: unknown[] = DOCUMENTS) {
  await stubApi(page, TEACHER_USER);
  await page.route('**/api/v1/documents', async (route) => {
    if (route.request().method() !== 'GET') {
      await route.fulfill({ status: 405, contentType: 'application/json', body: '{}' });
      return;
    }
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(documents) });
  });
}

test('kho học liệu dùng bảng dùng chung với trạng thái đọc được', async ({ page }) => {
  await stubDocuments(page);
  await page.goto('/documents');

  const table = page.locator('.ez-datatable');
  await expect(table).toBeVisible();
  await expect(table.locator('tbody tr')).toHaveCount(3);
  await expect(page.getByText('3/3 học liệu')).toBeVisible();

  // Trạng thái dùng ProcessingStatusBadge chung, không phải mã kỹ thuật thô
  await expect(table.getByText('Sẵn sàng dùng', { exact: true })).toBeVisible();
  await expect(table.getByText('Đang chuyển lời video')).toBeVisible();
  await expect(table.getByText('Chuẩn bị không thành công')).toBeVisible();
  await expect(page.getByText('index_failed')).toHaveCount(0);

  // Bảng cuộn trong khung riêng, trang không tràn ngang
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(1);
});

test('lọc học liệu theo tên và theo trạng thái', async ({ page }) => {
  await stubDocuments(page);
  await page.goto('/documents');

  const rows = page.locator('.ez-datatable tbody tr');
  await page.getByLabel('Tìm theo tên').fill('hình học');
  await expect(rows).toHaveCount(1);
  await expect(page.getByText('1/3 học liệu')).toBeVisible();

  await page.getByLabel('Tìm theo tên').fill('');
  await page.getByLabel('Trạng thái xử lý').selectOption('failed');
  await expect(rows).toHaveCount(1);
  await expect(page.getByText('Đề cương ôn tập.docx')).toBeVisible();

  await page.getByLabel('Trạng thái xử lý').selectOption('ready');
  await page.getByLabel('Tìm theo tên').fill('không có tài liệu nào như vậy');
  await expect(page.getByText('Không có học liệu khớp bộ lọc')).toBeVisible();
  await page.getByRole('button', { name: 'Xoá bộ lọc' }).click();
  await expect(rows).toHaveCount(3);
});

test('kho học liệu rỗng hiện hướng dẫn thay vì bảng trống', async ({ page }) => {
  await stubDocuments(page, []);
  await page.goto('/documents');

  await expect(page.getByText('Chưa có học liệu nào')).toBeVisible();
  await expect(page.locator('.ez-datatable')).toHaveCount(0);
});

test('kho học liệu lỗi tải hiện ErrorState có nút thử lại', async ({ page }) => {
  await stubApi(page, TEACHER_USER);
  await page.route('**/api/v1/documents', async (route) => {
    await route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ detail: 'Sự cố máy chủ' }) });
  });
  await page.goto('/documents');

  await expect(page.getByText('Không tải được danh sách học liệu')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Thử lại' })).toBeVisible();
});

test('trang kho học liệu không có vi phạm axe A/AA', async ({ page }) => {
  await stubDocuments(page);
  await page.goto('/documents');
  await expect(page.locator('.ez-datatable')).toBeVisible();
  await expect
    .poll(async () => page.locator('.ez-datatable tbody tr').first().evaluate((el) => el.style.opacity))
    .toBe('');

  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();
  expect(results.violations).toEqual([]);
});

test('dashboard giáo viên đếm số liệu thật và không giữ transform', async ({ page }) => {
  await stubApi(page, TEACHER_USER);
  await page.route('**/api/v1/documents', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(DOCUMENTS) });
  });
  await page.route('**/api/v1/questions/my-history*', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        items: [{ id: '68b2f1f77bcf86cd79944101', document_name: 'Đại số 10 - Chương 1.pdf', question_count: 10, published_question_count: 0, created_at: '2026-08-02T02:00:00Z' }],
        total: 1,
      }),
    });
  });
  await page.route('**/api/v1/classes', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ items: [{ id: 'c1', name: 'Lớp 10A' }], total: 1 }) });
  });
  await page.goto('/dashboard');

  const documentsTile = page.locator('.ez-stat', { hasText: 'Học liệu' }).first().locator('.ez-stat-value');
  await expect(documentsTile).toHaveText('3');
  await expect(page.locator('.ez-stat', { hasText: 'Sẵn sàng dùng' }).locator('.ez-stat-value')).toHaveText('1');
  await expect
    .poll(async () => page.locator('.ez-stat').first().evaluate((el) => getComputedStyle(el).transform))
    .toBe('none');
});
