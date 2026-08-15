import { expect, test, type Page } from '@playwright/test';

/**
 * CRUD xuyên ba lớp: GIAO DIỆN → API → MONGODB, với backend thật.
 *
 * Chia ba pha (`tạo` / `sửa` / `xoá`) để chạy xen kẽ với
 * `backend/scripts/qa_crud_check.py` — sau mỗi pha, script đọc thẳng MongoDB
 * xác nhận dữ liệu đã đổi đúng. Không có bước đó thì chỉ chứng minh được giao
 * diện và API đồng ý với nhau, chưa chứng minh dữ liệu chạm tới CSDL.
 *
 * Bản ghi tìm nhau giữa các pha bằng tên cố định (không gắn timestamp).
 */

const TEACHER = { email: 'qa-live-lecturer@example.com', password: 'QaLive#2026' };
const ADMIN = { email: 'qa-live-admin@example.com', password: 'QaLive#2026' };

/**
 * Mỗi lượt chạy một mã riêng. Tên cố định thì lần chạy thứ hai đụng dữ liệu lần
 * trước: email đã xoá mềm vẫn giữ chỗ trong chỉ mục duy nhất nên không tạo lại
 * được, và tra cứu theo tên khớp phải nhiều bản ghi.
 * Ba pha nằm cùng một file, chạy tuần tự trong một worker nên dùng chung hằng số này.
 */
const RUN_ID = process.env.QA_RUN_ID ?? String(Date.now());

const CLASS_NAME = `QA CRUD Lớp ${RUN_ID}`;
const CLASS_NAME_UPDATED = `QA CRUD Lớp ${RUN_ID} đã đổi tên`;
const BLUEPRINT_NAME = `QA CRUD Ma trận ${RUN_ID}`;
const NEW_USER_EMAIL = `qa-crud-${RUN_ID}@example.com`;
const NEW_USER_NAME = `QA CRUD Người dùng ${RUN_ID}`;
const NEW_USER_NAME_UPDATED = `QA CRUD Người dùng ${RUN_ID} đã sửa`;

async function login(page: Page, account: { email: string; password: string }) {
  // Xoá phiên cũ TRƯỚC khi vào `/login`: còn phiên thì trang login tải xong rồi
  // React mới đá về dashboard, kiểm tra URL sau `goto` sẽ đua với lần chuyển đó.
  await page.goto('/');
  await page.evaluate(() => {
    localStorage.clear();
    sessionStorage.clear();
  });
  await page.goto('/login');
  await page.getByLabel('Email đăng nhập').fill(account.email);
  await page.getByLabel('Mật khẩu').fill(account.password);
  await page.locator('#pub-main-content').getByRole('button', { name: 'Đăng nhập' }).click();
  await page.waitForURL(/\/(dashboard|admin\/dashboard)/, { timeout: 30_000 });
}

/* ── Pha 1: TẠO ────────────────────────────────────────────────────────── */

test('tạo: lớp học, ma trận đề, người dùng', async ({ page }) => {
  test.setTimeout(180_000);

  await login(page, TEACHER);

  // Lớp học — form tạo nằm ngay trên trang, không phải hộp thoại
  await page.goto('/classes');
  await page.getByLabel('Tên lớp').fill(CLASS_NAME);
  await page.getByLabel('Mô tả').fill('Bản ghi do bộ kiểm CRUD tạo.');
  await page.getByRole('button', { name: 'Tạo lớp' }).click();
  // Đọc lại từ server: danh sách lớp lấy từ MongoDB chứ không phải state cục bộ
  await page.goto('/classes');
  await expect(page.getByText(CLASS_NAME).first()).toBeVisible({ timeout: 20_000 });

  // Ma trận đề
  await page.goto('/exam-blueprints');
  await page.getByRole('button', { name: 'Tạo ma trận mới' }).first().click();
  await page.getByLabel('Tên ma trận').fill(BLUEPRINT_NAME);
  await page.getByLabel('Mã môn học').fill('physics');
  await page.getByLabel('Lớp').fill('10');
  await page.getByLabel('Chương trình').fill('2018');
  await page.getByLabel('Tổng điểm').fill('10');
  await page.getByLabel('Thời gian làm bài (phút)').fill('45');
  await page.getByRole('button', { name: 'Tạo & cấu hình' }).click();
  await page.goto('/exam-blueprints');
  await expect(page.getByText(BLUEPRINT_NAME).first()).toBeVisible({ timeout: 20_000 });

  // Người dùng (khu quản trị)
  await login(page, ADMIN);
  await page.goto('/admin/users');
  await page.getByRole('button', { name: 'Tạo người dùng' }).click();
  await page.getByLabel('Họ tên').fill(NEW_USER_NAME);
  // Nhãn thật là "Email (bắt buộc)"; giới hạn trong hộp thoại để không trúng ô lọc
  await page.getByRole('dialog').getByRole('textbox', { name: /^Email/ }).fill(NEW_USER_EMAIL);
  await page.getByLabel('Mật khẩu tạm').fill('QaCrud#2026');
  await page.getByRole('button', { name: /^(Tạo|Tạo người dùng)$/ }).last().click();
  await page.goto('/admin/users');
  await page.getByLabel('Tìm kiếm').fill(NEW_USER_EMAIL);
  await page.getByRole('button', { name: 'Lọc' }).click();
  await expect(page.locator('.ez-datatable tbody tr', { hasText: NEW_USER_EMAIL })).toHaveCount(1, { timeout: 20_000 });
});

/* ── Pha 2: SỬA ────────────────────────────────────────────────────────── */

test('sửa: đổi tên lớp và sửa hồ sơ người dùng', async ({ page }) => {
  test.setTimeout(180_000);

  await login(page, TEACHER);
  await page.goto('/classes');
  // Thao tác nằm trong dropdown của từng lớp
  await page.getByRole('button', { name: `Thêm thao tác cho lớp ${CLASS_NAME}`, exact: true }).click();
  await page.getByRole('menuitem', { name: 'Đổi tên / mô tả' }).click();
  await page.getByRole('dialog').getByLabel('Tên lớp').fill(CLASS_NAME_UPDATED);
  await page.getByRole('button', { name: 'Lưu thay đổi' }).click();
  await page.goto('/classes');
  await expect(page.getByText(CLASS_NAME_UPDATED).first()).toBeVisible({ timeout: 20_000 });

  await login(page, ADMIN);
  await page.goto('/admin/users');
  await page.getByLabel('Tìm kiếm').fill(NEW_USER_EMAIL);
  await page.getByRole('button', { name: 'Lọc' }).click();
  const userRow = page.locator('.ez-datatable tbody tr', { hasText: NEW_USER_EMAIL });
  await userRow.getByRole('button', { name: 'Sửa' }).click();
  await page.getByLabel('Họ tên').fill(NEW_USER_NAME_UPDATED);
  await page.getByRole('button', { name: 'Lưu' }).click();
  await page.goto('/admin/users');
  await page.getByLabel('Tìm kiếm').fill(NEW_USER_EMAIL);
  await page.getByRole('button', { name: 'Lọc' }).click();
  await expect(page.locator('.ez-datatable tbody tr', { hasText: NEW_USER_NAME_UPDATED }))
    .toHaveCount(1, { timeout: 20_000 });
});

/* ── Pha 3: XOÁ ────────────────────────────────────────────────────────── */

test('xoá: lớp học và người dùng', async ({ page }) => {
  test.setTimeout(180_000);

  await login(page, TEACHER);
  await page.goto('/classes');
  await page.getByRole('button', { name: `Thêm thao tác cho lớp ${CLASS_NAME_UPDATED}`, exact: true }).click();
  await page.getByRole('menuitem', { name: 'Xoá lớp' }).click();
  await page.getByLabel('Nhập XÓA để xác nhận').fill('XÓA');
  await page.getByRole('dialog').getByRole('button', { name: /^(Xoá|Xóa)/ }).last().click();
  await page.goto('/classes');
  await expect(page.getByText(CLASS_NAME_UPDATED)).toHaveCount(0, { timeout: 20_000 });

  await login(page, ADMIN);
  await page.goto('/admin/users');
  await page.getByLabel('Tìm kiếm').fill(NEW_USER_EMAIL);
  await page.getByRole('button', { name: 'Lọc' }).click();
  const userRow = page.locator('.ez-datatable tbody tr', { hasText: NEW_USER_EMAIL });
  await userRow.getByRole('button', { name: 'Xóa' }).click();
  await page.getByLabel('Lý do').fill('Dọn dữ liệu bộ kiểm CRUD');
  await page.getByLabel(/Nhập email người dùng để xác nhận/).fill(NEW_USER_EMAIL);
  await page.getByRole('button', { name: 'Xác nhận' }).click();

  // Xoá người dùng là xoá MỀM: bản ghi rời khỏi danh sách mặc định nhưng vẫn
  // tra lại được bằng bộ lọc trạng thái — đúng như thiết kế để còn khôi phục.
  await expect(userRow).toHaveCount(0, { timeout: 20_000 });
  await page.getByLabel('Trạng thái').selectOption({ label: 'Đã xóa' });
  await page.getByRole('button', { name: 'Lọc' }).click();
  await expect(page.locator('.ez-datatable tbody tr', { hasText: NEW_USER_EMAIL }))
    .toHaveCount(1, { timeout: 20_000 });
});
