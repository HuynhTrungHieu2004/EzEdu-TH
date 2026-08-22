import { expect, test } from '@playwright/test';

test('teacher creates, renames and deletes a class through the live backend', async ({ page }) => {
  const originalName = `Lớp live ${Date.now()}`;
  const renamedName = `${originalName} đã đổi tên`;

  await page.goto('http://127.0.0.1:5173/login');
  await page.getByRole('button', { name: '🎓 Giảng viên', exact: true }).click();
  await page.waitForURL(/\/dashboard$/);
  await page.goto('http://127.0.0.1:5173/classes');

  await page.getByRole('textbox', { name: /^Tên lớp/ }).fill(originalName);
  await page.getByLabel('Mô tả', { exact: true }).fill('Dữ liệu kiểm thử tạm thời');
  await page.getByRole('button', { name: 'Tạo lớp' }).click();
  await expect(page.getByText(originalName, { exact: true })).toBeVisible();

  await page.getByRole('button', { name: `Thêm thao tác cho lớp ${originalName}` }).click();
  await page.getByRole('menuitem', { name: 'Đổi tên / mô tả' }).click();
  await page.getByRole('dialog').getByRole('textbox', { name: /^Tên lớp/ }).fill(renamedName);
  await page.getByRole('button', { name: 'Lưu thay đổi' }).click();
  await expect(page.getByText(renamedName, { exact: true })).toBeVisible();

  await page.reload();
  await expect(page.getByText(renamedName, { exact: true })).toBeVisible();
  await page.getByRole('button', { name: `Thêm thao tác cho lớp ${renamedName}` }).click();
  await page.getByRole('menuitem', { name: 'Xoá lớp' }).click();
  await page.getByLabel('Nhập XÓA để xác nhận').fill('XÓA');
  await page.getByRole('button', { name: 'Xoá lớp', exact: true }).click();
  await expect(page.getByText(renamedName, { exact: true })).toHaveCount(0);
});
