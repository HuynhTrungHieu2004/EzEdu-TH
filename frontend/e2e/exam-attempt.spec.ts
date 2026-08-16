import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { STUDENT_USER, stubApi } from './helpers';

const EXAM_ID = '507f1f77bcf86cd799439025';
const ATTEMPT_ID = '507f1f77bcf86cd799439026';

const QUESTIONS = [
  {
    question_id: 'q1',
    order: 1,
    content: 'Đạo hàm của x^2 là gì?',
    options: { A: '2x', B: 'x', C: '2', D: 'x^3' },
    correct_answer: null,
    explanation: null,
    points: 1,
    bloom_level: 'apply',
    difficulty: 'medium',
    question_type: 'multiple_choice',
    source_document_id: null,
    citation: null,
  },
  {
    question_id: 'q2',
    order: 2,
    content: 'Tổng ba góc trong tam giác bằng 180 độ.',
    options: null,
    correct_answer: null,
    explanation: null,
    points: 1,
    bloom_level: 'remember',
    difficulty: 'easy',
    question_type: 'true_false',
    source_document_id: null,
    citation: null,
  },
  {
    question_id: 'q3',
    order: 3,
    content: 'Nêu định nghĩa hàm số đồng biến.',
    options: null,
    correct_answer: null,
    explanation: null,
    points: 2,
    bloom_level: 'understand',
    difficulty: 'medium',
    question_type: 'short_answer',
    source_document_id: null,
    citation: null,
  },
];

function attemptBody(overrides: Record<string, unknown> = {}) {
  const now = Date.now();
  return {
    id: ATTEMPT_ID,
    exam_id: EXAM_ID,
    exam_code: 'DE-E2E-01',
    student_id: STUDENT_USER.id,
    status: 'in_progress',
    answers: {},
    started_at: new Date(now - 60_000).toISOString(),
    due_at: new Date(now + 1_800_000).toISOString(),
    server_now: new Date(now).toISOString(),
    submitted_at: null,
    auto_submitted: false,
    total_score: 0,
    max_score: 4,
    results: [],
    version: 1,
    ...overrides,
  };
}

const GRADED_ATTEMPT = () =>
  attemptBody({
    status: 'graded',
    answers: { q1: 'A', q2: 'true', q3: 'Hàm tăng trên khoảng.' },
    submitted_at: new Date().toISOString(),
    total_score: 4,
    max_score: 4,
    version: 2,
    results: [
      { question_id: 'q1', question_type: 'multiple_choice', points_possible: 1, student_answer: 'A', is_correct: true, ai_score: null, ai_confidence: null, ai_feedback: null, teacher_score: null, teacher_feedback: null, final_score: 1 },
      { question_id: 'q2', question_type: 'true_false', points_possible: 1, student_answer: 'true', is_correct: true, ai_score: null, ai_confidence: null, ai_feedback: null, teacher_score: null, teacher_feedback: null, final_score: 1 },
      { question_id: 'q3', question_type: 'short_answer', points_possible: 2, student_answer: 'Hàm tăng trên khoảng.', is_correct: null, ai_score: 2, ai_confidence: 0.9, ai_feedback: 'Đúng ý chính.', teacher_score: null, teacher_feedback: null, final_score: 2 },
    ],
  });

/** Đề ba câu đang làm; submit trả về bài đã chấm 4/4. */
async function stubExam(page: Page) {
  await stubApi(page, STUDENT_USER);
  await page.route(`**/api/v1/exams/${EXAM_ID}/attempts/start`, async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(attemptBody()) });
  });
  await page.route(`**/api/v1/exams/${EXAM_ID}/questions`, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ exam: { id: EXAM_ID, exam_code: 'DE-E2E-01' }, questions: QUESTIONS, hide_answers: true }),
    });
  });
  await page.route(`**/api/v1/exam-attempts/${ATTEMPT_ID}/submit`, async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(GRADED_ATTEMPT()) });
  });
  await page.route(`**/api/v1/exam-attempts/${ATTEMPT_ID}/autosave`, async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(attemptBody()) });
  });
  await page.route(`**/api/v1/exam-attempts/${ATTEMPT_ID}`, async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(attemptBody()) });
  });
}

test('làm bài hiện một câu mỗi lần và đi tiến/lùi được', async ({ page }) => {
  await stubExam(page);
  await page.goto(`/take-exam/${EXAM_ID}`);

  await expect(page.getByRole('heading', { name: 'Câu 1/3 (1 điểm)' })).toBeVisible();
  await expect(page.getByText('Đạo hàm của x^2 là gì?')).toBeVisible();
  await expect(page.getByText('Tổng ba góc trong tam giác bằng 180 độ.')).toHaveCount(0);

  await expect(page.getByRole('button', { name: 'Câu trước' })).toBeDisabled();
  await page.getByRole('button', { name: 'Câu sau' }).click();
  await expect(page.getByRole('heading', { name: 'Câu 2/3 (1 điểm)' })).toBeVisible();

  await page.getByRole('button', { name: 'Câu trước' }).click();
  await expect(page.getByRole('heading', { name: 'Câu 1/3 (1 điểm)' })).toBeVisible();

  // Dải chọn câu nhảy thẳng tới câu cuối; câu cuối không còn nút "Câu sau"
  await page.getByRole('button', { name: 'Câu 3 — chưa trả lời' }).click();
  await expect(page.getByRole('heading', { name: 'Câu 3/3 (2 điểm)' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Câu sau' })).toHaveCount(0);
});

test('dải chọn câu và tiến độ phản ánh câu đã trả lời', async ({ page }) => {
  await stubExam(page);
  await page.goto(`/take-exam/${EXAM_ID}`);

  const progress = page.getByRole('progressbar');
  await expect(progress).toHaveAttribute('aria-valuenow', '0');

  await page.getByRole('radio', { name: 'A. 2x' }).check();
  await expect(progress).toHaveAttribute('aria-valuenow', '1');
  await expect(page.getByRole('button', { name: 'Câu 1 — đã trả lời' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Câu 2 — chưa trả lời' })).toBeVisible();

  // Câu đang mở giữ nền tím đậm dù đã trả lời (style current phải thắng [data-answered])
  const currentChip = page.locator('.ez-question-chip-current');
  await expect(currentChip).toHaveAttribute('data-answered', 'true');
  await expect(currentChip).toHaveCSS('background-color', 'rgb(51, 17, 111)');
});

test('vòng đếm ngược hiện thời gian còn lại và không dùng animation JS', async ({ page }) => {
  await stubExam(page);
  await page.goto(`/take-exam/${EXAM_ID}`);

  const timer = page.getByRole('timer');
  await expect(timer).toBeVisible();
  await expect(timer).toHaveText(/^\d+:\d{2}$/);

  const ring = page.locator('.ez-timer-ring-value');
  const dash = await ring.evaluate((el) => ({
    array: el.getAttribute('stroke-dasharray'),
    offset: Number(el.getAttribute('stroke-dashoffset')),
  }));
  expect(Number(dash.array)).toBeGreaterThan(0);
  expect(dash.offset).toBeGreaterThanOrEqual(0);
});

test('kết quả reveal tuần tự, đủ chi tiết từng câu và không giữ transform', async ({ page }) => {
  await stubExam(page);
  await page.goto(`/take-exam/${EXAM_ID}`);

  await page.getByRole('radio', { name: 'A. 2x' }).check();
  await page.getByRole('button', { name: 'Nộp bài' }).click();
  await page.getByRole('button', { name: 'Nộp bài' }).last().click();

  await expect(page.getByRole('heading', { name: 'Kết quả bài làm' })).toBeVisible();
  await expect(page.getByText('Đã chấm xong')).toBeVisible();
  await expect(page.locator('.ez-result-score-value')).toHaveText('100%');
  await expect(page.getByText('4 / 4 điểm · 2/3 câu đúng')).toBeVisible();

  const rows = page.locator('[data-result-row]');
  await expect(rows).toHaveCount(3);
  await expect
    .poll(async () => rows.first().evaluate((el) => getComputedStyle(el).transform))
    .toBe('none');
  await expect(page.getByText('Độ tin cậy AI: 90%')).toBeVisible();

  // 100% ≥ ngưỡng ăn mừng nên confetti phải chạy ở chế độ full motion
  expect(await page.locator('.ez-confetti-piece').count()).toBeGreaterThan(0);
});

test('trang làm bài và trang kết quả không có vi phạm axe A/AA', async ({ page }) => {
  await stubExam(page);
  await page.goto(`/take-exam/${EXAM_ID}`);
  await expect(page.getByRole('heading', { name: 'Câu 1/3 (1 điểm)' })).toBeVisible();

  const attemptAxe = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();
  expect(attemptAxe.violations).toEqual([]);

  await page.getByRole('button', { name: 'Nộp bài' }).click();
  await page.getByRole('button', { name: 'Nộp bài' }).last().click();
  await expect(page.getByRole('heading', { name: 'Kết quả bài làm' })).toBeVisible();
  // Chờ reveal xong để axe không đo giữa lúc GSAP còn đặt opacity tạm thời
  await expect
    .poll(async () => page.locator('[data-result-row]').first().evaluate((el) => el.style.opacity))
    .toBe('');

  const resultAxe = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();
  expect(resultAxe.violations).toEqual([]);
});

test('reduced motion: không confetti và điểm hiện ngay', async ({ browser }) => {
  const context = await browser.newContext({ reducedMotion: 'reduce' });
  const page = await context.newPage();
  await stubExam(page);
  await page.goto(`/take-exam/${EXAM_ID}`);

  await page.getByRole('button', { name: 'Nộp bài' }).click();
  await page.getByRole('button', { name: 'Nộp bài' }).last().click();

  await expect(page.locator('.ez-result-score-value')).toHaveText('100%');
  await expect(page.locator('.ez-confetti-piece')).toHaveCount(0);

  await context.close();
});

test('còn câu chờ AI chấm thì không hiện điểm 0 như điểm thật', async ({ page }) => {
  // Với backend thật, chấm tự luận là job nền mất hàng chục giây. Trước đây đầu
  // trang hiện ngay "0%  0 / 4 điểm · 2/3 câu đúng" trong lúc chờ, nên bài làm
  // đúng trông như bị 0 điểm.
  await stubExam(page);
  const pending = () => {
    const graded = GRADED_ATTEMPT();
    graded.status = 'submitted';
    graded.total_score = 2;
    graded.results[2] = { ...graded.results[2], ai_score: null, ai_confidence: null, ai_feedback: null, final_score: 0 };
    return graded;
  };
  await page.route(`**/api/v1/exam-attempts/${ATTEMPT_ID}/submit`, async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(pending()) });
  });

  await page.goto(`/take-exam/${EXAM_ID}`);
  await page.getByRole('button', { name: 'Nộp bài' }).click();
  await page.getByRole('button', { name: 'Nộp bài' }).last().click();

  await expect(page.getByText('Đang chấm câu tự luận…')).toBeVisible();
  await expect(page.locator('.ez-result-score-value')).toHaveText('—');
  await expect(page.locator('.ez-result-score-meta')).toHaveText('Đã chấm 2/3 câu');
  await expect(page.locator('[data-result-row]').last().getByText('Đang chấm…')).toBeVisible();
  await expect(page.locator('.ez-confetti-piece')).toHaveCount(0);
});
