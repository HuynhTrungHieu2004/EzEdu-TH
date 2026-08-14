import { expect, test, type Page } from '@playwright/test';
import { ADMIN_USER, STUDENT_USER, TEACHER_USER, captureBrowserErrors, stubApi } from './helpers';

/**
 * QA toàn hệ thống (lát 9) — kiểm các tiêu chuẩn hoàn thành ở spec §11 mà từng
 * lát riêng không phủ: route nghiệp vụ chặn đúng vai trò chứ không chỉ ẩn menu,
 * chuyển động dọn sạch sau khi điều hướng, và ba vai trò đi hết luồng chính mà
 * không sinh lỗi trình duyệt.
 */

const TEACHER_ONLY_ROUTES = [
  '/documents',
  '/question-bank',
  '/exam-blueprints',
  '/question-history',
  '/classes',
  '/teacher/content-history',
];

const STUDENT_ONLY_ROUTES = [
  '/published-questions',
  '/learning-history',
  '/take-exam/507f1f77bcf86cd799439025',
];

const ADMIN_ROUTES = ['/admin/dashboard', '/admin/users', '/admin/settings'];

test('học sinh gõ thẳng URL của giáo viên vẫn bị đưa về khu vực của mình', async ({ page }) => {
  test.setTimeout(60_000);
  await stubApi(page, STUDENT_USER);
  for (const path of TEACHER_ONLY_ROUTES) {
    await page.goto(path);
    await expect(page, `route ${path} phải chặn học sinh`).toHaveURL(/\/dashboard$/);
  }
});

test('giáo viên gõ thẳng URL của học sinh vẫn bị đưa về khu vực của mình', async ({ page }) => {
  test.setTimeout(60_000);
  await stubApi(page, TEACHER_USER);
  for (const path of STUDENT_ONLY_ROUTES) {
    await page.goto(path);
    await expect(page, `route ${path} phải chặn giáo viên`).toHaveURL(/\/dashboard$/);
  }
});

test('vai trò nghiệp vụ không vào được khu quản trị', async ({ page }) => {
  await stubApi(page, TEACHER_USER);
  for (const path of ADMIN_ROUTES) {
    await page.goto(path);
    await expect(page, `route ${path} phải chặn giáo viên`).not.toHaveURL(new RegExp(`${path}$`));
  }
});

test('quản trị viên không lạc vào khu nghiệp vụ của giáo viên', async ({ page }) => {
  await stubApi(page, ADMIN_USER);
  await page.goto('/documents');
  await expect(page).toHaveURL(/\/admin\/dashboard$/);
});

/** Trang trái phép không được render dù chỉ một khung hình trước khi chuyển hướng. */
test('trang bị chặn không lộ nội dung trước khi chuyển hướng', async ({ page }) => {
  await stubApi(page, STUDENT_USER);
  await page.goto('/question-bank');
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByRole('heading', { name: 'Ngân hàng câu hỏi' })).toHaveCount(0);
});

async function inlineMotionLeftovers(page: Page) {
  return page.evaluate(() => {
    const nodes = Array.from(document.querySelectorAll<HTMLElement>('[style]'));
    return nodes
      .filter((node) => {
        const style = node.style;
        // GSAP đặt tạm opacity/visibility/transform rồi phải clearProps khi xong
        return (style.opacity !== '' && style.opacity !== '1')
          || style.visibility === 'hidden'
          || (style.transform !== '' && style.transform !== 'none');
      })
      .map((node) => `${node.tagName}.${node.className}`.slice(0, 80));
  });
}

test('chuyển route nhiều lần không để lại transform hay opacity tạm của GSAP', async ({ page }) => {
  // Nhiều lượt điều hướng thật, mỗi lượt chờ entrance chạy xong -> nới hạn giờ.
  test.setTimeout(90_000);
  await stubApi(page, STUDENT_USER);
  for (const path of ['/dashboard', '/chat-advanced', '/learning-history', '/dashboard', '/tools']) {
    await page.goto(path);
    await expect.poll(async () => inlineMotionLeftovers(page), { timeout: 10_000 }).toEqual([]);
  }
});

test('rời trang landing thì ScrollTrigger không giữ lại phần tử ẩn', async ({ page }) => {
  test.setTimeout(60_000);
  await stubApi(page, STUDENT_USER);
  await page.goto('/');
  await expect(page.locator('.ezp-hero')).toBeVisible();
  await page.goto('/dashboard');
  await expect.poll(async () => inlineMotionLeftovers(page), { timeout: 10_000 }).toEqual([]);
});

const ROLE_FLOWS = [
  { name: 'học sinh', user: STUDENT_USER, routes: ['/dashboard', '/published-questions', '/chat-advanced', '/learning-history'] },
  { name: 'giáo viên', user: TEACHER_USER, routes: ['/dashboard', '/documents', '/question-bank', '/exam-blueprints', '/classes'] },
  { name: 'quản trị', user: ADMIN_USER, routes: ['/admin/dashboard', '/admin/users', '/admin/documents', '/admin/settings'] },
];

for (const flow of ROLE_FLOWS) {
  test(`luồng chính của ${flow.name} không sinh lỗi trình duyệt`, async ({ page }) => {
    test.setTimeout(90_000);
    const errors = captureBrowserErrors(page);
    await stubApi(page, flow.user);
    for (const path of flow.routes) {
      await page.goto(path);
      await expect(page.locator('#main')).not.toBeEmpty();
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(overflow, `tràn ngang tại ${path}`).toBeLessThanOrEqual(1);
    }
    expect(errors).toEqual([]);
  });
}
