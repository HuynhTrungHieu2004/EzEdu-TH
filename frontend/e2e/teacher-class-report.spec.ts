import { expect, test, type Route } from '@playwright/test';
import { TEACHER_USER } from './helpers';

async function json(route: Route, body: unknown, status = 200) {
  await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
}

test('teacher filters result rows by an owned class', async ({ page }) => {
  let requestedClass = '';
  await page.addInitScript(() => localStorage.setItem('access_token', 'class-report-token'));
  await page.route('**/api/v1/**', async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === '/api/v1/auth/me') return json(route, TEACHER_USER);
    if (url.pathname === '/api/v1/runtime-config') return json(route, { feature_flags: {} });
    if (url.pathname === '/api/v1/classes') return json(route, { items: [{ id: 'class-1', name: 'Lớp 10A1', description: null, owner_id: TEACHER_USER.id, student_count: 1, created_at: '2026-01-01T00:00:00Z' }] });
    if (url.pathname === '/api/v1/exam-results') {
      requestedClass = url.searchParams.get('class_id') ?? '';
      return json(route, requestedClass ? [{ id: 'a1', exam_id: 'e1', exam_code: 'T-01', student_id: 's1', student_name: 'Học sinh A', student_email: 'a@example.com', status: 'graded', score: 8, total_score: 8, max_score: 10, submitted_at: '2026-01-01T00:00:00Z' }] : []);
    }
    return json(route, { detail: 'fixture unavailable' }, 503);
  });

  await page.goto('/teacher/results');
  await page.getByLabel('Lớp học').selectOption('class-1');
  await expect(page.getByText('Học sinh A')).toBeVisible();
  expect(requestedClass).toBe('class-1');
});

test('teacher filters statistics by an owned class', async ({ page }) => {
  let requestedClass = '';
  await page.addInitScript(() => localStorage.setItem('access_token', 'class-stats-token'));
  await page.route('**/api/v1/**', async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === '/api/v1/auth/me') return json(route, TEACHER_USER);
    if (url.pathname === '/api/v1/runtime-config') return json(route, { feature_flags: {} });
    if (url.pathname === '/api/v1/classes') return json(route, { items: [{ id: 'class-1', name: 'Lớp 10A1', description: null, owner_id: TEACHER_USER.id, student_count: 1, created_at: '2026-01-01T00:00:00Z' }] });
    if (url.pathname === '/api/v1/exam-results/statistics') {
      requestedClass = url.searchParams.get('class_id') ?? '';
      return json(route, { total_attempts: requestedClass ? 1 : 0, graded_attempts: requestedClass ? 1 : 0, average_score: requestedClass ? 8 : 0, pass_rate: requestedClass ? 100 : 0, excellent_rate: requestedClass ? 100 : 0, score_distribution: { '0-3': 0, '3-5': 0, '5-6.5': 0, '6.5-8': 0, '8-9': requestedClass ? 1 : 0, '9-10': 0 } });
    }
    return json(route, { detail: 'fixture unavailable' }, 503);
  });

  await page.goto('/teacher/stats');
  await page.getByLabel('Lớp học').selectOption('class-1');
  await expect(page.getByText('8 / 10')).toBeVisible();
  expect(requestedClass).toBe('class-1');
});
