import { expect, test, type Page } from '@playwright/test';
import { STUDENT_USER, TEACHER_USER, stubApi } from './helpers';

/**
 * Phân hệ tắt thì giao diện phải nói đúng là "đang tắt".
 *
 * Lỗi thật phát hiện khi chạy với backend thật: `ENABLE_WEB_KNOWLEDGE` và
 * `ENABLE_CURRICULUM_KB` tắt (mặc định), backend trả 403 cho mọi endpoint, còn
 * giao diện vẫn hiện form đầy đủ và danh sách "Chưa lưu học liệu nào" — người
 * dùng tưởng chưa có dữ liệu, bấm gì cũng hỏng. Hai cờ đó cũng chưa từng xuất
 * hiện trong `/runtime-config` nên frontend không có cách nào biết.
 */

const OFF_FLAGS = {
  enable_video_upload: true,
  enable_advanced_chat: true,
  enable_personalization: false,
  enable_web_knowledge: false,
  enable_curriculum_kb: false,
};

const ON_FLAGS = { ...OFF_FLAGS, enable_web_knowledge: true, enable_curriculum_kb: true };

async function stubWithFlags(page: Page, user: typeof TEACHER_USER, flags: Record<string, boolean>) {
  await stubApi(page, user);
  await page.route('**/api/v1/runtime-config', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ settings: {}, feature_flags: flags, generated_at: '2026-08-15T00:00:00Z' }),
    });
  });
}

for (const { path, title, flag } of [
  { path: '/web-knowledge', title: 'Khám phá kiến thức Internet đang tắt', flag: 'enable_web_knowledge' },
  { path: '/curriculum-kb', title: 'Kho tri thức chuẩn đang tắt', flag: 'enable_curriculum_kb' },
]) {
  test(`${path} nói rõ đang tắt và không gọi API khi ${flag} tắt`, async ({ page }) => {
    const calls: string[] = [];
    page.on('request', (request) => {
      const url = request.url();
      if (url.includes('/api/v1/') && !url.includes('runtime-config') && !url.includes('/auth/')) {
        calls.push(url.replace(/^https?:\/\/[^/]+/, ''));
      }
    });

    await stubWithFlags(page, TEACHER_USER, OFF_FLAGS);
    await page.goto(path);

    await expect(page.getByRole('heading', { name: title })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Tới kho học liệu' })).toBeVisible();
    // Không bắn request chắc chắn trả 403
    expect(calls.filter((url) => url.includes('web-knowledge') || url.includes('curriculum-kb'))).toEqual([]);
  });

  test(`${path} hoạt động bình thường khi ${flag} bật`, async ({ page }) => {
    await stubWithFlags(page, TEACHER_USER, ON_FLAGS);
    await page.goto(path);
    await expect(page.getByRole('heading', { name: title })).toHaveCount(0);
    await expect(page.locator('#main')).not.toBeEmpty();
  });
}

test('thư viện công cụ ẩn công cụ của phân hệ đang tắt', async ({ page }) => {
  await stubWithFlags(page, TEACHER_USER, OFF_FLAGS);
  await page.goto('/tools');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await expect(page.getByRole('link', { name: /Khám phá kiến thức Internet/ })).toHaveCount(0);
  await expect(page.getByRole('link', { name: /Kho tri thức chuẩn/ })).toHaveCount(0);

  await stubWithFlags(page, TEACHER_USER, ON_FLAGS);
  await page.goto('/tools');
  await expect(page.getByRole('link', { name: /Kho tri thức chuẩn/ }).first()).toBeVisible();
});

test('cá nhân hoá tắt thì không gọi API cá nhân hoá', async ({ page }) => {
  const calls: string[] = [];
  page.on('request', (request) => {
    if (request.url().includes('/api/v1/personalization/')) {
      calls.push(request.url().replace(/^https?:\/\/[^/]+/, ''));
    }
  });

  await stubWithFlags(page, STUDENT_USER, OFF_FLAGS);
  await page.goto('/personalization');

  await expect(page.getByRole('heading', { name: 'Cá nhân hóa đang tạm tắt' })).toBeVisible();
  expect(calls).toEqual([]);
});
