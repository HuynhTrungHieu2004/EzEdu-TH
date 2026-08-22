import { expect, test, type Page, type Route } from '@playwright/test';
import { ADMIN_USER, TEACHER_USER, stubApi } from './helpers';

const teacher = {
  id: TEACHER_USER.id,
  full_name: TEACHER_USER.full_name,
  email: TEACHER_USER.email,
  role: 'lecturer',
  status: 'active',
  is_active: true,
  email_verified: true,
  created_at: TEACHER_USER.created_at,
  updated_at: null,
  last_login_at: null,
  deleted_at: null,
  current_quota: null,
};

const studentUser = {
  ...TEACHER_USER,
  id: '507f1f77bcf86cd799439012',
  email: 'student.course@example.test',
  full_name: 'Học sinh Khóa học',
  role: 'student',
  student_profile_completed: true,
};

const student = {
  ...teacher,
  id: studentUser.id,
  full_name: studentUser.full_name,
  email: studentUser.email,
  role: 'student',
  student_code: 'HS-E2E-01',
};

const course = {
  id: '507f1f77bcf86cd799439021',
  code: 'TOAN-E2E',
  title: 'Toán E2E',
  description: 'Khóa học kiểm thử tích hợp',
  thumbnail: '',
  subject: 'Toán học',
  grade: 'Lớp 10',
  teacher_ids: [teacher.id],
  teacher_id: teacher.id,
  teacher_name: teacher.full_name,
  goals: [],
  syllabus_overview: '',
  lesson_count: 0,
  assignment_count: 0,
  exam_count: 0,
  student_count: 0,
  start_date: '2026-09-05',
  end_date: '2027-01-15',
  status: 'draft',
  created_at: '2026-08-22T00:00:00Z',
  updated_at: null,
};

const enrollment = {
  id: '507f1f77bcf86cd799439031',
  course_id: course.id,
  course_code: course.code,
  course_title: course.title,
  subject: course.subject,
  grade: course.grade,
  student_id: student.id,
  student_code: student.student_code,
  student_name: student.full_name,
  student_email: student.email,
  teacher_name: teacher.full_name,
  enrollment_date: '2026-08-22T00:00:00Z',
  status: 'learning',
  progress_pct: 0,
  gpa_average: 0,
  completed_lessons: 0,
  total_lessons: 1,
  last_activity_at: '2026-08-22T00:00:00Z',
};

async function json(route: Route, body: unknown, status = 200) {
  await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
}

async function stubCourseApi(page: Page, initialCourses = [course]) {
  const courses = [...initialCourses];
  const lessons: unknown[] = [];
  const enrollments: unknown[] = [];

  await page.route('**/api/v1/admin/users**', async (route) => {
    const role = new URL(route.request().url()).searchParams.get('role');
    const items = role === 'student' ? [student] : [teacher];
    await json(route, { items, total: items.length, page: 1, page_size: 100, total_pages: 1, generated_at: '2026-08-22T00:00:00Z' });
  });

  await page.route('**/api/v1/courses**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname.replace('/api/v1', '');

    if (path === '/courses' && request.method() === 'GET') return json(route, courses);
    if (path === '/courses' && request.method() === 'POST') {
      const body = request.postDataJSON();
      expect(body.teacher_ids).toEqual([teacher.id]);
      const created = { ...course, ...body };
      courses.splice(0, courses.length, created);
      return json(route, created, 201);
    }
    if (path === `/courses/${course.id}` && request.method() === 'GET') return json(route, courses[0]);
    if (path === `/courses/${course.id}` && request.method() === 'PATCH') {
      const body = request.postDataJSON();
      courses[0] = { ...courses[0], ...body };
      return json(route, courses[0]);
    }
    if (path === `/courses/${course.id}/lessons` && request.method() === 'GET') return json(route, lessons);
    if (path === `/courses/${course.id}/lessons` && request.method() === 'POST') {
      const body = request.postDataJSON();
      expect(body.title).toBe('Bài học E2E');
      const created = { ...body, id: '507f1f77bcf86cd799439041', course_id: course.id, sort_order: 1, created_at: '2026-08-22T00:00:00Z' };
      lessons.push(created);
      return json(route, created, 201);
    }
    if (path === '/courses/enrollments' && request.method() === 'GET') return json(route, enrollments);
    if (path === `/courses/${course.id}/enrollments` && request.method() === 'POST') {
      expect(request.postDataJSON()).toEqual({ student_id: student.id });
      enrollments.push(enrollment);
      return json(route, enrollment, 201);
    }
    if (path === '/courses/mine' && request.method() === 'GET') return json(route, [enrollment]);
    return json(route, { detail: 'Unexpected course fixture request' }, 404);
  });
}

test('admin tạo khóa học, bài học và ghi danh qua API thật', async ({ page }) => {
  await stubApi(page, ADMIN_USER);
  await stubCourseApi(page, []);

  await page.goto('/admin/courses');
  await page.getByRole('button', { name: /Thêm khóa học mới/ }).click();
  await page.getByLabel('Mã khóa học').fill(course.code);
  await page.getByLabel('Tên khóa học').fill(course.title);
  await page.getByRole('button', { name: 'Tạo khóa học', exact: true }).click();
  await expect(page.getByText(course.title, { exact: true })).toBeVisible();

  await page.getByRole('button', { name: /Bài học/ }).click();
  await page.getByRole('button', { name: /Thêm bài học mới/ }).click();
  await page.getByLabel('Tiêu đề bài học').fill('Bài học E2E');
  await page.getByRole('button', { name: 'Tạo bài học', exact: true }).click();
  await expect(page.getByText('Bài học E2E', { exact: true })).toBeVisible();

  await page.goto('/admin/course-enrollments');
  await page.getByRole('button', { name: /Ghi danh học sinh/ }).click();
  await page.getByRole('button', { name: 'Ghi danh', exact: true }).click();
  await expect(page.getByText(student.full_name, { exact: true })).toBeVisible();
});

test('giáo viên chỉ quản lý khóa được phân công và không có thao tác ghi danh', async ({ page }) => {
  await stubApi(page, TEACHER_USER);
  await stubCourseApi(page);

  await page.goto('/teacher/courses');
  await expect(page.getByText(course.title, { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: /Ghi danh/ })).toHaveCount(0);
  await page.getByRole('button', { name: /Xem bài học/ }).click();
  await page.getByRole('button', { name: 'Xuất bản' }).click();
  await expect(page.getByRole('button', { name: 'Chuyển về nháp' })).toBeVisible();
});

test('học sinh chỉ thấy khóa đã ghi danh; lỗi 403 không sinh dữ liệu giả', async ({ page }) => {
  await stubApi(page, studentUser);
  await stubCourseApi(page);

  await page.goto('/student/courses');
  await expect(page.getByText(course.title, { exact: true })).toBeVisible();
  await expect(page.getByText('Vật lý giả')).toHaveCount(0);

  await page.route('**/api/v1/courses/mine', (route) => json(route, { detail: 'Forbidden' }, 403));
  await page.reload();
  await expect(page.getByText('Không thể tải khóa học của bạn.')).toBeVisible();
  await expect(page.getByText(course.title, { exact: true })).toHaveCount(0);
});
