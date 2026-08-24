import { expect, test, type Page, type Route } from '@playwright/test';
import { TEACHER_USER, stubApi } from './helpers';

const student = {
  ...TEACHER_USER,
  email: 'student.assessment@example.test',
  full_name: 'Học sinh lớp Toán 10',
  role: 'student',
  student_profile_completed: true,
};

const publishedPractice = {
  id: '507f1f77bcf86cd799439099',
  document_id: '507f1f77bcf86cd799439098',
  document_name: 'Đề hàm số giáo viên vừa ban hành',
  question_count: 10,
  published_question_count: 10,
  difficulty: 'medium',
  question_type: 'multiple_choice',
  audience_type: 'classes',
  target_class_ids: ['507f1f77bcf86cd799439097'],
  created_at: '2026-08-24T03:00:00Z',
};

function json(route: Route, body: unknown, status = 200) {
  return route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
}

async function stubAssessmentApi(page: Page) {
  let joined = false;
  await page.route('**/api/v1/**', async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname.replace('/api/v1', '');

    if (path === '/student/exams') return json(route, []);
    if (path === '/questions/published') {
      return json(route, { items: joined ? [publishedPractice] : [], next_cursor: null, has_more: false });
    }
    if (path === '/classes/join' && request.method() === 'POST') {
      joined = true;
      return json(route, { id: '507f1f77bcf86cd799439097', name: 'Lớp Toán 10', student_count: 1 });
    }
    return route.fallback();
  });
}

test('nhập mã lớp tải lại và hiện cả đề giáo viên ban hành', async ({ page }) => {
  await stubApi(page, student);
  await stubAssessmentApi(page);
  await page.goto('/student/exams');

  await expect(page.getByText(publishedPractice.document_name)).toHaveCount(0);
  await page.getByLabel('Mã lớp').fill('ABC123');
  await page.getByRole('button', { name: 'Tham gia lớp' }).click();

  await expect(page.getByText('Đã tham gia lớp Lớp Toán 10.')).toBeVisible();
  await expect(page.getByText(publishedPractice.document_name)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Làm bài' })).toBeVisible();
});
