import { expect, test, type Page, type Route } from '@playwright/test';
import { TEACHER_USER, stubApi } from './helpers';

const studentUser = {
  ...TEACHER_USER,
  id: '507f1f77bcf86cd799439012',
  email: 'student.assignment@example.test',
  full_name: 'Học sinh Bài tập',
  role: 'student',
  student_profile_completed: true,
};

const course = {
  id: '507f1f77bcf86cd799439021', code: 'BT-E2E', title: 'Khóa Bài tập E2E', description: '', thumbnail: '',
  subject: 'Toán học', grade: 'Lớp 10', teacher_ids: [TEACHER_USER.id], teacher_id: TEACHER_USER.id,
  teacher_name: TEACHER_USER.full_name, goals: [], syllabus_overview: '', lesson_count: 0, assignment_count: 1,
  exam_count: 0, student_count: 1, start_date: '', end_date: '', status: 'published',
  created_at: '2026-08-22T00:00:00Z', updated_at: null,
};

const assignment = {
  id: '507f1f77bcf86cd799439022', course_id: course.id, lesson_id: null, course_title: course.title,
  title: 'Bài tự luận E2E', description: '', instructions: 'Trình bày lời giải', assignment_type: 'essay',
  due_at: '2027-08-22T23:59:00Z', max_score: 10, auto_grade: false, status: 'published',
  submitted_count: 0, total_students: 1, created_by: TEACHER_USER.id,
  created_at: '2026-08-22T00:00:00Z', updated_at: null,
};

function submission(overrides: Record<string, unknown> = {}) {
  return {
    id: '507f1f77bcf86cd799439023', assignment_id: assignment.id, assignment_title: assignment.title,
    course_id: course.id, course_title: course.title, student_id: studentUser.id, student_code: 'HS-E2E',
    student_name: studentUser.full_name, submitted_at: '2026-08-22T01:00:00Z', content: 'Lời giải E2E',
    attachment_ids: [], revision_count: 1, status: 'submitted', ai_grade: null, teacher_score: null,
    teacher_feedback: null, graded_by: null, graded_at: null, final_score: null, grading_error: null,
    ...overrides,
  };
}

async function json(route: Route, body: unknown, status = 200) {
  await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
}

async function stubData(page: Page, options: { assignments?: (typeof assignment)[]; submissions?: ReturnType<typeof submission>[]; aiFails?: boolean } = {}) {
  const assignments = [...(options.assignments ?? [assignment])];
  const submissions = [...(options.submissions ?? [])];
  let submitCount = 0;

  await page.route('**/api/v1/courses**', async (route) => {
    const path = new URL(route.request().url()).pathname.replace('/api/v1', '');
    if (path === '/courses') return json(route, [course]);
    if (path === `/courses/${course.id}`) return json(route, course);
    if (path === `/courses/${course.id}/lessons`) return json(route, []);
    if (path === '/courses/mine') return json(route, []);
    return json(route, { detail: 'Not found' }, 404);
  });

  await page.route('**/api/v1/assignments**', async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname.replace('/api/v1', '');
    if (path === '/assignments' && request.method() === 'GET') return json(route, assignments);
    if (path === '/assignments' && request.method() === 'POST') {
      const body = request.postDataJSON();
      expect(body.course_id).toBe(course.id);
      const created = { ...assignment, ...body, id: assignment.id, status: body.status || 'draft' };
      assignments.splice(0, assignments.length, created);
      return json(route, created, 201);
    }
    if (path === `/assignments/${assignment.id}` && request.method() === 'PATCH') {
      assignments[0] = { ...assignments[0], ...request.postDataJSON() };
      return json(route, assignments[0]);
    }
    if (path === `/assignments/${assignment.id}/submissions` && request.method() === 'POST') {
      submitCount += 1;
      const body = request.postDataJSON();
      const saved = submission({ content: body.content, revision_count: submitCount, status: 'submitted' });
      submissions.splice(0, submissions.length, saved);
      return json(route, saved);
    }
    return json(route, { detail: 'Not found' }, 404);
  });

  await page.route('**/api/v1/submissions**', async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname.replace('/api/v1', '');
    if (path === '/submissions' && request.method() === 'GET') return json(route, submissions);
    if (path.endsWith('/ai-grade') && request.method() === 'POST') {
      if (options.aiFails) {
        submissions[0] = { ...submissions[0], status: 'grading_failed', grading_error: 'provider timeout', final_score: null };
        return json(route, { detail: 'Không thể chấm AI' }, 502);
      }
      submissions[0] = { ...submissions[0], status: 'ai_suggested', ai_grade: { score: 8.5, feedback: 'AI đề xuất', rubric: [] } };
      return json(route, submissions[0]);
    }
    if (path.endsWith('/teacher-grade') && request.method() === 'PATCH') {
      expect(request.postDataJSON()).toEqual({ score: 9, feedback: 'Giáo viên xác nhận' });
      submissions[0] = { ...submissions[0], status: 'teacher_graded', teacher_score: 9, teacher_feedback: 'Giáo viên xác nhận', final_score: 9 };
      return json(route, submissions[0]);
    }
    return json(route, { detail: 'Not found' }, 404);
  });

  return { getSubmitCount: () => submitCount };
}

test('giáo viên tạo và xuất bản bài tập', async ({ page }) => {
  await stubApi(page, TEACHER_USER);
  await stubData(page, { assignments: [] });
  await page.goto('/teacher/assignments');
  await page.getByRole('button', { name: /Giao bài tập mới/ }).click();
  await page.getByLabel('Tiêu đề').fill(assignment.title);
  await page.getByLabel('Hạn nộp').fill('2027-08-22T23:59');
  await page.getByRole('button', { name: 'Tạo bài tập', exact: true }).click();
  await expect(page.getByText(assignment.title, { exact: true })).toBeVisible();
  await page.getByRole('button', { name: `Xuất bản ${assignment.title}` }).click();
  await expect(page.locator('.ez-badge').filter({ hasText: 'Đang giao' })).toBeVisible();
});

test('học sinh nộp lại tăng revision; AI lỗi không tạo điểm 0 giả', async ({ page }) => {
  await stubApi(page, studentUser);
  const fixture = await stubData(page, { aiFails: true });
  await page.goto(`/student/courses/${course.id}`);
  await page.getByRole('button', { name: /Bài tập & AI Chấm điểm/ }).click();
  await page.getByRole('button', { name: /Nộp bài tự luận/ }).click();
  await page.getByLabel('Lời giải tự luận của bạn').fill('Lần nộp một');
  await page.getByRole('button', { name: /Nộp bài & AI Chấm ngay/ }).click();
  await expect(page.getByText('AI chấm lỗi')).toBeVisible();
  await expect(page.getByText(/0 \/ 10/)).toHaveCount(0);

  await page.getByRole('button', { name: 'Nộp lại' }).click();
  await page.getByLabel('Lời giải tự luận của bạn').fill('Lần nộp hai');
  await page.getByRole('button', { name: /Nộp bài & AI Chấm ngay/ }).click();
  expect(fixture.getSubmitCount()).toBe(2);
});

test('giáo viên nhận đề xuất AI rồi xác nhận điểm cuối', async ({ page }) => {
  await stubApi(page, TEACHER_USER);
  await stubData(page, { submissions: [submission()] });
  await page.goto('/teacher/submissions');
  await page.getByRole('button', { name: /Chấm bài/ }).click();
  await page.getByRole('button', { name: /Nhờ AI đề xuất điểm/ }).click();
  await expect(page.getByText(/AI đề xuất 8.5\/10/)).toBeVisible();
  await page.getByLabel(/Điểm/).fill('9');
  await page.getByLabel('Nhận xét').fill('Giáo viên xác nhận');
  await page.getByRole('button', { name: 'Xác nhận điểm cuối' }).click();
  await expect(page.getByText('Đã chấm', { exact: true })).toBeVisible();
  await expect(page.getByText('9/10')).toBeVisible();
});
