import { expect, test } from '@playwright/test';
import { STUDENT_USER, stubApi } from './helpers';

const PUBLISHED_SETS = {
  items: [
    {
      id: '68b2f1f77bcf86cd79943801',
      document_name: 'Đại số chương 1',
      question_count: 12,
      published_question_count: 12,
      created_at: '2026-08-01T02:00:00Z',
    },
    {
      id: '68b2f1f77bcf86cd79943802',
      document_name: 'Hình học chương 2',
      question_count: 10,
      published_question_count: 10,
      created_at: '2026-08-04T02:00:00Z',
    },
  ],
  total: 2,
};

const MY_HISTORY = [
  {
    id: '68b2f1f77bcf86cd79943901',
    item_type: 'practice',
    question_set_id: '68b2f1f77bcf86cd79943803',
    title: 'Đại số chương 0',
    score: 8,
    max_score: 10,
    percent: 80,
    created_at: '2026-08-10T02:00:00Z',
  },
];

/** Dữ liệu học tập thật để dashboard render stat tile thay vì error state. */
async function stubStudentDashboard(page: import('@playwright/test').Page) {
  await stubApi(page, STUDENT_USER);
  await page.route('**/api/v1/questions/published*', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(PUBLISHED_SETS) });
  });
  await page.route('**/api/v1/questions/attempts/my-history', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(MY_HISTORY) });
  });
}

test('trang chat vừa khít khung, ô nhập câu hỏi nằm trong viewport', async ({ page }) => {
  await stubApi(page, STUDENT_USER);
  await page.goto('/chat-advanced');

  const composer = page.getByPlaceholder(/Nhập câu hỏi/);
  await expect(composer).toBeVisible();

  const viewport = page.viewportSize();
  expect(viewport).not.toBeNull();

  const composerBox = await composer.boundingBox();
  expect(composerBox).not.toBeNull();
  expect(composerBox!.y + composerBox!.height).toBeLessThanOrEqual(viewport!.height);

  const overflow = await page.evaluate(() => ({
    vertical: document.documentElement.scrollHeight - document.documentElement.clientHeight,
    horizontal: document.documentElement.scrollWidth - document.documentElement.clientWidth,
  }));
  expect(overflow.vertical).toBeLessThanOrEqual(1);
  expect(overflow.horizontal).toBeLessThanOrEqual(1);
});

test('panel bên của chat theo bề ngang: ba cột desktop, drawer trên mobile', async ({ page }) => {
  await stubApi(page, STUDENT_USER);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/chat-advanced');

  const asides = page.locator('.ez-chat-aside');
  await expect(asides).toHaveCount(2);
  await expect(asides.first()).toBeVisible();
  await expect(asides.last()).toBeVisible();
  await expect(page.getByRole('button', { name: 'Nguồn trích dẫn' })).toHaveCount(0);

  await page.setViewportSize({ width: 390, height: 844 });
  await expect(asides.first()).toBeHidden();
  await expect(asides.last()).toBeHidden();

  // Khối chọn phạm vi cũng vào drawer để hội thoại lên ngay đầu màn hình
  const scopeTrigger = page.getByRole('button', { name: 'Phạm vi kiến thức' });
  await expect(scopeTrigger).toBeVisible();
  await expect(page.locator('.ez-chat-scope')).toBeHidden();

  const citationTrigger = page.getByRole('button', { name: 'Nguồn trích dẫn' });
  await expect(citationTrigger).toBeVisible();
  await citationTrigger.click();

  const drawer = page.getByRole('dialog', { name: 'Nguồn trích dẫn' });
  await expect(drawer).toBeVisible();
  const drawerBox = await drawer.boundingBox();
  expect(drawerBox!.width).toBeLessThanOrEqual(390);
  await page.keyboard.press('Escape');
  await expect(drawer).toBeHidden();

  await page.getByRole('button', { name: 'Hội thoại' }).click();
  await expect(page.getByRole('dialog', { name: 'Hội thoại' })).toBeVisible();
});

test('banner dashboard dùng nền tím đậm của bảng màu mới', async ({ page }) => {
  await stubStudentDashboard(page);
  await page.goto('/dashboard');

  const banner = page.locator('.ez-dashboard-banner');
  await expect(banner).toBeVisible();
  const backgroundImage = await banner.evaluate((el) => getComputedStyle(el).backgroundImage);
  expect(backgroundImage).toContain('rgb(51, 17, 111)');
  expect(backgroundImage).toContain('rgb(89, 6, 235)');
});

test('stat tile của học sinh đếm tới giá trị thật và không giữ transform', async ({ page }) => {
  await stubStudentDashboard(page);
  await page.goto('/dashboard');

  const completed = page.locator('.ez-stat', { hasText: 'Bài đã hoàn thành' }).locator('.ez-stat-value');
  const average = page.locator('.ez-stat', { hasText: 'Điểm trung bình' }).locator('.ez-stat-value');

  await expect(completed).toHaveText('1');
  await expect(average).toHaveText('80%');

  await expect
    .poll(async () => page.locator('.ez-stat').first().evaluate((el) => getComputedStyle(el).transform))
    .toBe('none');
});

test('reduced motion hiển thị ngay số liệu dashboard', async ({ browser }) => {
  const context = await browser.newContext({ reducedMotion: 'reduce' });
  const page = await context.newPage();
  await stubStudentDashboard(page);
  await page.goto('/dashboard');

  const completed = page.locator('.ez-stat', { hasText: 'Bài đã hoàn thành' }).locator('.ez-stat-value');
  await expect(completed).toHaveText('1');
  const transform = await page.locator('.ez-stat').first().evaluate((el) => getComputedStyle(el).transform);
  expect(transform).toBe('none');

  await context.close();
});
