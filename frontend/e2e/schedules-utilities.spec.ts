import { expect, test, type Route } from '@playwright/test';
import { ADMIN_USER, TEACHER_USER, stubApi } from './helpers';

const student = { ...TEACHER_USER, id: '507f1f77bcf86cd799439099', role: 'student', student_profile_completed: true };
const course = { id: '507f1f77bcf86cd799439021', code: 'UTIL-E2E', title: 'Khóa Tiện ích E2E', subject: 'Toán', grade: '10', teacher_ids: [TEACHER_USER.id], status: 'published', created_at: '2026-08-22T00:00:00Z' };

async function json(route: Route, body: unknown, status = 200) {
  await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
}

test('admin tạo và hủy lịch thi bằng API', async ({ page }) => {
  await stubApi(page, ADMIN_USER);
  const schedules: Record<string, unknown>[] = [];
  await page.route('**/api/v1/courses**', (route) => json(route, [course]));
  await page.route('**/api/v1/schedules**', async (route) => {
    if (route.request().method() === 'GET') return json(route, schedules);
    if (route.request().method() === 'POST') {
      const body = route.request().postDataJSON();
      schedules.push({ ...body, id: '507f1f77bcf86cd799439022', course_title: course.title, status: 'scheduled', created_by: ADMIN_USER.id, created_at: '2026-08-22T00:00:00Z' });
      return json(route, schedules[0], 201);
    }
    schedules[0] = { ...schedules[0], status: 'cancelled' };
    return json(route, null, 204);
  });

  await page.goto('/admin/exam-schedules');
  await page.getByRole('button', { name: 'Thêm lịch' }).click();
  await page.getByLabel('Tiêu đề').fill('Lịch thi E2E');
  await page.getByLabel('Bắt đầu').fill('2027-08-22T08:00');
  await page.getByLabel('Kết thúc').fill('2027-08-22T09:00');
  await page.getByRole('button', { name: 'Tạo lịch' }).click();
  await expect(page.getByText('Lịch thi E2E', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Hủy Lịch thi E2E' }).click();
  await expect(page.getByText('Đã hủy')).toBeVisible();
});

test('yêu thích tải từ backend và xóa theo chủ sở hữu', async ({ page }) => {
  await stubApi(page, ADMIN_USER);
  const favorites = [{ id: '507f1f77bcf86cd799439031', user_id: ADMIN_USER.id, resource_type: 'document', resource_id: '507f1f77bcf86cd799439032', title: 'Tài liệu E2E', created_at: '2026-08-22T00:00:00Z' }];
  await page.route('**/api/v1/favorites**', async (route) => {
    if (route.request().method() === 'GET') return json(route, favorites);
    favorites.splice(0);
    return json(route, null, 204);
  });
  await page.goto('/admin/favorites');
  await expect(page.getByText('Tài liệu E2E')).toBeVisible();
  await page.getByRole('button', { name: 'Xóa Tài liệu E2E' }).click();
  await expect(page.getByText('Chưa có tài nguyên yêu thích.')).toBeVisible();
});

test('giáo viên đánh dấu đọc và ẩn thông báo cá nhân', async ({ page }) => {
  await stubApi(page, TEACHER_USER);
  let item = { id: '507f1f77bcf86cd799439041', title: 'Thông báo E2E', content: 'Nội dung từ quản trị viên', type: 'system', priority: 'normal', created_at: '2026-08-22T00:00:00Z', is_read: false };
  let dismissed = false;
  await page.route('**/api/v1/notifications**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (route.request().method() === 'GET') return json(route, dismissed ? [] : [item]);
    if (path.endsWith('/read')) {
      item = { ...item, is_read: true };
      return json(route, item);
    }
    if (route.request().method() === 'DELETE') {
      dismissed = true;
      return json(route, null, 204);
    }
    return json(route, null, 204);
  });
  await page.goto('/teacher/notifications');
  await page.getByRole('button', { name: 'Đánh dấu đã đọc Thông báo E2E' }).click();
  await expect(page.getByRole('button', { name: 'Đánh dấu đã đọc Thông báo E2E' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Ẩn Thông báo E2E' }).click();
  await expect(page.getByText('Không có thông báo nào')).toBeVisible();
});

test('admin xem điểm, thống kê thật và xuất CSV', async ({ page }) => {
  await stubApi(page, ADMIN_USER);
  await page.route('**/api/v1/exam-results/statistics', (route) => json(route, { total_attempts: 2, graded_attempts: 1, average_score: 7.5, pass_rate: 100, excellent_rate: 50, score_distribution: { '0-3': 0, '3-5': 0, '5-6.5': 1, '6.5-8': 0, '8-9': 1, '9-10': 0 } }));
  await page.route('**/api/v1/exam-results', (route) => json(route, [{ id: 'result-1', exam_id: 'exam-1', exam_code: 'EXAM-E2E', student_id: student.id, student_name: 'Học sinh E2E', student_email: 'student@example.test', status: 'graded', score: 8.5, total_score: 8.5, max_score: 10, submitted_at: '2026-08-22T00:00:00Z' }]));

  await page.goto('/admin/exam-results');
  await expect(page.getByText('Học sinh E2E')).toBeVisible();
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Xuất CSV' }).click();
  expect((await download).suggestedFilename()).toBe('ket-qua-thi.csv');

  await page.goto('/admin/exam-stats');
  await expect(page.getByText('7.5 / 10')).toBeVisible();
  await expect(page.getByText('2', { exact: true }).first()).toBeVisible();
});

test('học sinh chỉ thấy đề thi backend cấp cho mình', async ({ page }) => {
  await stubApi(page, student);
  await page.route('**/api/v1/student/exams', (route) => json(route, [{ id: 'exam-1', code: 'STUDENT-E2E', question_count: 20, total_points: 10, duration_minutes: 45, published_at: '2026-08-22T00:00:00Z', attempt_id: null, attempt_status: null, score: null }]));
  await page.goto('/student/exams');
  await expect(page.getByText('STUDENT-E2E')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Vào thi' })).toBeEnabled();
  await expect(page.getByText('Đề giả')).toHaveCount(0);
});
