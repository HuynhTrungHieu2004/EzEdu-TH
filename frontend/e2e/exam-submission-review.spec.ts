import { expect, test, type Route } from '@playwright/test';
import { ADMIN_USER, TEACHER_USER, stubApi } from './helpers';

async function json(route: Route, body: unknown, status = 200) {
  await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
}

test('teacher opens a submitted class exam from its notification', async ({ page }) => {
  await stubApi(page, TEACHER_USER);
  const notification = {
    id: 'notification-1',
    title: 'Học sinh đã nộp Kiểm tra Toán 10',
    content: 'Đã chấm xong: 1/1 điểm.',
    type: 'exam',
    priority: 'normal',
    created_at: '2026-08-24T08:00:00Z',
    is_read: false,
    action_url: '/gv/de-thi/set-1/bai-lam',
  };
  await page.route('**/api/v1/notifications**', async (route) => {
    if (route.request().method() === 'GET') return json(route, [notification]);
    return json(route, { ...notification, is_read: true });
  });
  await page.route('**/api/v1/questions/set-1/attempts', (route) => json(route, [
    {
      id: 'attempt-1',
      question_set_id: 'set-1',
      document_id: 'document-1',
      user_id: 'student-1',
      student_name: 'Nguyễn Minh Anh',
      student_email: 'minh.anh@example.com',
      score: 1,
      max_score: 1,
      percent: 100,
      answers: [
        { question_index: 0, answer: 'A', correct_answer: 'A', is_correct: true },
      ],
      created_at: '2026-08-24T08:00:00Z',
    },
  ]));

  await page.goto('/teacher/notifications');
  await page.getByRole('button', { name: 'Xem bài làm' }).click();

  await expect(page).toHaveURL(/\/gv\/de-thi\/set-1\/bai-lam$/);
  await expect(page.getByRole('heading', { name: 'Bài làm của học sinh' })).toBeVisible();
  await expect(page.getByText('Nguyễn Minh Anh')).toBeVisible();
  await expect(page.getByText('1 / 1 điểm')).toBeVisible();
  await expect(page.getByText('Đáp án đúng: A')).toBeVisible();
});

test('admin can open the teacher review route', async ({ page }) => {
  await stubApi(page, ADMIN_USER);
  await page.route('**/api/v1/questions/set-1/attempts', (route) => json(route, []));

  await page.goto('/gv/de-thi/set-1/bai-lam');

  await expect(page.getByRole('heading', { name: 'Bài làm của học sinh' })).toBeVisible();
  await expect(page.getByText('Chưa có học sinh nộp bài')).toBeVisible();
});
