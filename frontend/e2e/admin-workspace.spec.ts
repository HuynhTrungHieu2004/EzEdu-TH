import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { ADMIN_USER, stubApi } from './helpers';

const OWNER = { id: '68b2f1f77bcf86cd79945001', email: 'a@example.test', full_name: 'Nguyễn Văn A', role: 'lecturer' };

const USERS = {
  items: [
    { id: '68b2f1f77bcf86cd79945001', full_name: 'Nguyễn Văn A', email: 'a@example.test', role: 'lecturer', status: 'active', is_active: true, email_verified: true, created_at: '2026-07-01T02:00:00Z', updated_at: null, last_login_at: '2026-08-12T02:00:00Z', deleted_at: null, current_quota: null },
    { id: '68b2f1f77bcf86cd79945002', full_name: 'Trần Thị B', email: 'b@example.test', role: 'student', status: 'locked', is_active: false, email_verified: false, created_at: '2026-07-11T02:00:00Z', updated_at: null, last_login_at: null, deleted_at: null, current_quota: null },
  ],
  total: 2, page: 1, page_size: 20, total_pages: 1, generated_at: '2026-08-14T02:00:00Z',
};

const USER_STATS = {
  total_users: 2, active_users: 1, locked_users: 1, deleted_users: 0,
  users_created_today: 0, users_created_last_7_days: 1, users_created_last_30_days: 2,
  active_last_24_hours: 1, active_last_7_days: 2,
};

const DOCUMENTS = {
  items: [
    { id: '68b2f1f77bcf86cd79945101', original_filename: 'Đại số 10.pdf', owner: OWNER, file_type: 'pdf', file_size: 254_000, uploaded_at: '2026-08-01T02:00:00Z', processing_status: 'indexed', page_count: 12, chunk_count: 40, question_count: 20, knowledge_verification_status: 'verified', latest_error: null, is_quarantined: false, deleted_at: null, updated_at: null },
  ],
  total: 1, page: 1, page_size: 20, total_pages: 1, generated_at: '2026-08-14T02:00:00Z',
};

const QUESTIONS = {
  items: [
    { id: '68b2f1f77bcf86cd79945201', question_set_id: '68b2f1f77bcf86cd79945202', question_index: 0, question_preview: 'Đạo hàm của x^2 là gì?', question_type: 'multiple_choice', difficulty: 'medium', subject: 'Toán', topic: 'Đạo hàm', source_document_id: '68b2f1f77bcf86cd79945101', source_document_name: 'Đại số 10.pdf', owner: OWNER, citation_status: 'verified', hallucination_risk: 'low', moderation_status: 'approved', created_at: '2026-08-02T02:00:00Z', updated_at: null, deleted_at: null },
  ],
  total: 1, page: 1, page_size: 20, total_pages: 1, generated_at: '2026-08-14T02:00:00Z',
};

const EXAMS = {
  items: [
    { id: '68b2f1f77bcf86cd79945301', name: 'Giữa kỳ Toán 10', owner: OWNER, question_count: 20, created_at: '2026-08-03T02:00:00Z', last_exported_at: null, status: 'active', source_document_id: '68b2f1f77bcf86cd79945101', source_document_name: 'Đại số 10.pdf', deleted_at: null },
  ],
  total: 1, page: 1, page_size: 20, total_pages: 1, generated_at: '2026-08-14T02:00:00Z',
};

const ACTIVITY = {
  items: [
    { id: '68b2f1f77bcf86cd79945401', user_id: '68b2f1f77bcf86cd79945001', action: 'login', category: 'auth', resource_type: 'session', resource_id: null, status: 'success', timestamp: '2026-08-13T02:00:00Z', request_id: 'req-9', metadata: {}, error_code: null, duration_ms: 120, ip_hash: 'hash', user_agent_summary: 'Chrome' },
  ],
  total: 1, page: 1, page_size: 20, total_pages: 1, generated_at: '2026-08-14T02:00:00Z',
};

const AUDIT = {
  items: [
    { id: '68b2f1f77bcf86cd79945501', admin_user_id: '68b2f1f77bcf86cd79945003', admin_email_snapshot: 'admin@example.test', action: 'user_locked', target_type: 'user', target_id: '68b2f1f77bcf86cd79945002', timestamp: '2026-08-13T03:00:00Z', reason: 'Vi phạm nội quy', before: { status: 'active' }, after: { status: 'locked' }, changed_fields: ['status'], request_id: 'req-1', result: 'success', error_code: null, ip_hash: 'hash', user_agent_summary: 'Chrome' },
  ],
  total: 1, page: 1, page_size: 20, total_pages: 1, generated_at: '2026-08-14T02:00:00Z',
};

const AUDIT_STATS = {
  total: 1, success_count: 1, failure_count: 0,
  by_action: { user_locked: 1 }, by_target_type: { user: 1 },
  generated_at: '2026-08-14T02:00:00Z',
};

const json = (body: unknown) => ({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });

/** Route cụ thể phải đăng ký SAU route bao trùm: Playwright ưu tiên route đăng ký sau. */
async function stubAdmin(page: Page) {
  await stubApi(page, ADMIN_USER);
  await page.route('**/api/v1/admin/users**', (route) => route.fulfill(json(USERS)));
  await page.route('**/api/v1/admin/users/statistics**', (route) => route.fulfill(json(USER_STATS)));
  await page.route('**/api/v1/admin/content/documents**', (route) => route.fulfill(json(DOCUMENTS)));
  await page.route('**/api/v1/admin/content/questions**', (route) => route.fulfill(json(QUESTIONS)));
  await page.route('**/api/v1/admin/content/exams**', (route) => route.fulfill(json(EXAMS)));
  await page.route('**/api/v1/admin/activity-logs**', (route) => route.fulfill(json(ACTIVITY)));
  await page.route('**/api/v1/admin/activity-logs/statistics**', (route) =>
    route.fulfill(json({ total_events: 1, events_last_24_hours: 1, events_last_7_days: 1, top_actions: [], top_users: [] })));
  await page.route('**/api/v1/admin/audit-logs**', (route) => route.fulfill(json(AUDIT)));
  await page.route('**/api/v1/admin/audit-logs/statistics**', (route) => route.fulfill(json(AUDIT_STATS)));
}

const LIST_ROUTES = [
  { path: '/admin/users', rows: 2, sample: 'a@example.test' },
  { path: '/admin/documents', rows: 1, sample: 'Đại số 10.pdf' },
  { path: '/admin/questions', rows: 1, sample: 'Đạo hàm của x^2 là gì?' },
  { path: '/admin/exams', rows: 1, sample: 'Giữa kỳ Toán 10' },
  { path: '/admin/activity-logs', rows: 1, sample: 'login' },
  { path: '/admin/audit-logs', rows: 1, sample: 'admin@example.test' },
];

for (const route of LIST_ROUTES) {
  test(`${route.path} dùng bảng, thanh lọc và phân trang dùng chung`, async ({ page }) => {
    await stubAdmin(page);
    await page.goto(route.path);

    const table = page.locator('.ez-datatable');
    await expect(table).toBeVisible();
    await expect(table.locator('tbody tr')).toHaveCount(route.rows);
    await expect(page.locator('.ez-filter-bar')).toBeVisible();
    await expect(page.locator('.ez-pagination')).toBeVisible();
    await expect(table.getByText(route.sample).first()).toBeVisible();

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(1);
  });
}

test('nút hành động hiện ngay, không chờ chi tiết từng dòng', async ({ page }) => {
  // Lỗi thật thấy khi chạy với backend: mỗi dòng bắn một request chi tiết, mà cả
  // cột "Hành động" chỉ render sau khi request đó về — stub trả tức thì nên ẩn.
  await stubApi(page, ADMIN_USER);
  await page.route('**/api/v1/admin/users/statistics**', (route) => route.fulfill(json(USER_STATS)));
  await page.route('**/api/v1/admin/users?**', (route) => route.fulfill(json(USERS)));
  // Chi tiết từng dòng không về được. Dùng `abort` chứ không để treo: trang gom
  // bằng `Promise.allSettled` nên hỏng cũng chỉ là `rowDetails` rỗng, mà request
  // treo thì còn sống sau khi test kết thúc và làm nghẽn cả lượt chạy song song.
  await page.route('**/api/v1/admin/users/68b2f1f77bcf86cd7994500*', (route) => route.abort());

  await page.goto('/admin/users');
  const row = page.locator('.ez-datatable tbody tr', { hasText: 'a@example.test' });
  await expect(row.getByRole('button', { name: 'Khóa' })).toBeVisible();
  await expect(row.getByRole('button', { name: 'Sửa' })).toBeVisible();
  // Cột số đếm vẫn được phép chờ
  await expect(row.getByText('...').first()).toBeVisible();
});

test('danh sách người dùng có dữ liệu không có vi phạm axe A/AA', async ({ page }) => {
  test.setTimeout(60_000);
  await stubAdmin(page);
  await page.goto('/admin/users');
  await expect(page.locator('.ez-datatable')).toBeVisible({ timeout: 15_000 });
  // Chờ stagger của bảng chạy xong; 5s mặc định không đủ khi sáu project chạy song song.
  await expect
    .poll(async () => page.locator('.ez-datatable tbody tr').first().evaluate((el) => el.style.opacity),
      { timeout: 15_000 })
    .toBe('');

  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();
  expect(results.violations).toEqual([]);
});

test('nhật ký quản trị có dữ liệu không có vi phạm axe A/AA', async ({ page }) => {
  test.setTimeout(60_000);
  await stubAdmin(page);
  await page.goto('/admin/audit-logs');
  await expect(page.locator('.ez-datatable')).toBeVisible({ timeout: 15_000 });
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();
  expect(results.violations).toEqual([]);
});

test('backend trả thiếu field thống kê thì trang vẫn đọc được', async ({ page }) => {
  await stubAdmin(page);
  // Ghi đè: thiếu by_action/by_target_type như khi backend lệch phiên bản
  await page.route('**/api/v1/admin/audit-logs/statistics**', (route) =>
    route.fulfill(json({ total: 1, success_count: 1, failure_count: 0, generated_at: '2026-08-14T02:00:00Z' })));
  await page.goto('/admin/audit-logs');

  await expect(page.getByRole('heading', { name: 'Nhật ký quản trị' })).toBeVisible();
  await expect(page.locator('.ez-datatable')).toBeVisible();
  await expect(page.locator('.ez-stat', { hasText: 'Loại hành động' }).locator('.ez-stat-value')).toHaveText('0');
});

test('lỗi render của một trang không làm trắng khung ứng dụng', async ({ page }) => {
  await stubAdmin(page);
  // Payload sai kiểu: `items` không phải mảng nên trang sẽ nổ lúc render
  await page.route('**/api/v1/admin/audit-logs**', (route) =>
    route.fulfill(json({ items: 'không-phải-mảng', total: 1, page: 1, page_size: 20, total_pages: 1, generated_at: '2026-08-14T02:00:00Z' })));
  await page.goto('/admin/audit-logs');

  // Khung vẫn còn: điều hướng bên trái còn dùng được, nội dung thành ErrorState
  await expect(page.getByText('Không mở được nội dung trang này')).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole('navigation', { name: 'Điều hướng chính' })).toBeVisible();

  await page.getByRole('link', { name: 'Người dùng', exact: true }).first().click();
  await expect(page).toHaveURL(/\/admin\/users$/);
  await expect(page.locator('.ez-datatable')).toBeVisible();
});

test('dashboard quản trị đếm số liệu và không giữ transform', async ({ page }) => {
  await stubAdmin(page);
  await page.route('**/api/v1/admin/dashboard/overview**', (route) =>
    route.fulfill(json({
      generated_at: '2026-08-14T02:00:00Z',
      time_range: { from_date: '2026-08-07T00:00:00Z', to_date: '2026-08-14T00:00:00Z' },
      tracking_started_at: '2026-01-01T00:00:00Z',
      total_users: 128,
      ai_active_users: 42,
      total_conversations: 310,
      total_messages: { user: 900, assistant: 880 },
      documents: { total: 60, indexed: 55, failed: 1 },
      verification: { success: 50, warning: 3, failed: 2 },
      feedback: { helpful: 110, not_helpful: 10, total: 120, helpful_ratio: 91.7 },
    })));
  await page.goto('/admin/dashboard');

  const totalUsers = page.locator('.ez-stat', { hasText: 'Tổng người dùng' }).locator('.ez-stat-value');
  // Dashboard chờ ba endpoint rồi mới đếm số; 5s mặc định không đủ khi chạy song song.
  await expect(totalUsers).toHaveText('128', { timeout: 15_000 });
  await expect
    .poll(async () => page.locator('.stat-card').first().evaluate((el) => getComputedStyle(el).transform))
    .toBe('none');
});
