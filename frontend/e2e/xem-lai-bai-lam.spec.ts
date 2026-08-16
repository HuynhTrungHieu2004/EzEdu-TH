import { expect, test, type Page } from '@playwright/test';
import { STUDENT_USER, stubApi } from './helpers';

/**
 * Xem lại bài đã nộp kèm nhận xét AI.
 *
 * Trước tính năng này, lịch sử học tập trỏ thẳng vào đường LÀM LẠI: đề không
 * cho làm lại thì học sinh bấm vào lịch sử của chính mình và nhận 403, đề cho
 * làm lại thì mở ra lượt mới và bài cũ biến mất. Nhận xét AI chỉ xem được đúng
 * một lần ngay sau khi nộp.
 */

const ATTEMPT_ID = '507f1f77bcf86cd799439101';

const BAI_DA_CHAM = {
  id: ATTEMPT_ID,
  exam_id: '507f1f77bcf86cd799439025',
  exam_code: 'DE-04',
  student_id: STUDENT_USER.id,
  status: 'graded',
  answers: {},
  started_at: '2026-08-10T01:00:00Z',
  due_at: '2026-08-10T01:45:00Z',
  server_now: '2026-08-16T02:00:00Z',
  submitted_at: '2026-08-10T01:40:00Z',
  auto_submitted: false,
  total_score: 8,
  max_score: 10,
  version: 3,
  results: [
    {
      question_id: 'q1',
      question_type: 'multiple_choice',
      is_correct: true,
      final_score: 5,
      points_possible: 5,
      ai_score: null,
      ai_confidence: null,
      ai_feedback: null,
      teacher_score: null,
    },
    {
      question_id: 'q2',
      question_type: 'short_answer',
      is_correct: null,
      final_score: 3,
      points_possible: 5,
      ai_score: 3,
      ai_confidence: 0.82,
      ai_feedback: 'Bạn nêu đúng định nghĩa nhưng thiếu ví dụ minh hoạ.',
      teacher_score: null,
    },
  ],
};

/** Bắt mọi request tới attempt và ghi lại method — để phát hiện đường ghi. */
async function gaAttempt(page: Page) {
  const daGoi: string[] = [];
  await page.route('**/api/v1/exam-attempts/**', async (route) => {
    daGoi.push(`${route.request().method()} ${new URL(route.request().url()).pathname}`);
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(BAI_DA_CHAM),
    });
  });
  return daGoi;
}

test('xem lại đề thi: hiện điểm và nhận xét AI từng câu', async ({ page }) => {
  await stubApi(page, STUDENT_USER);
  await gaAttempt(page);

  await page.goto(`/bai-lam/${ATTEMPT_ID}`);

  await expect(page.getByRole('heading', { name: 'Xem lại bài làm' })).toBeVisible();
  await expect(page.getByText('Mã đề DE-04')).toBeVisible();
  await expect(page.getByText('80%')).toBeVisible();

  // Lý do tồn tại của cả tính năng: nhận xét AI phải đọc lại được.
  await expect(page.getByText('Bạn nêu đúng định nghĩa nhưng thiếu ví dụ minh hoạ.')).toBeVisible();
  await expect(page.getByText('Độ tin cậy AI: 82%')).toBeVisible();
});

test('trang xem lại KHÔNG gửi bất kỳ request ghi nào', async ({ page }) => {
  // Chốt quan trọng nhất. Trang làm bài chạy autosave ngầm mỗi 10 giây; nếu
  // trang xem lại lỡ dùng lại luồng đó thì mở bài cũ sẽ ghi đè bài đã nộp —
  // hỏng dữ liệu thật, không phải hỏng giao diện.
  await stubApi(page, STUDENT_USER);
  const daGoi = await gaAttempt(page);

  await page.goto(`/bai-lam/${ATTEMPT_ID}`);
  await expect(page.getByText('Bạn nêu đúng định nghĩa nhưng thiếu ví dụ minh hoạ.')).toBeVisible();

  // Chờ quá một chu kỳ autosave của trang làm bài.
  await page.waitForTimeout(12_000);

  const ghi = daGoi.filter((m) => !m.startsWith('GET'));
  expect(ghi, `trang chỉ đọc mà gọi: ${ghi.join(', ')}`).toEqual([]);
});

test('không có nút Làm lại khi đề không cho phép', async ({ page }) => {
  await stubApi(page, STUDENT_USER);
  await gaAttempt(page);

  await page.goto(`/bai-lam/${ATTEMPT_ID}`);
  await expect(page.getByText('Mã đề DE-04')).toBeVisible();

  await expect(page.getByRole('button', { name: 'Làm lại đề này' })).toHaveCount(0);
});

test('có nút Làm lại khi đề cho phép, và nó dẫn sang trang làm bài', async ({ page }) => {
  await stubApi(page, STUDENT_USER);
  await gaAttempt(page);

  await page.goto(`/bai-lam/${ATTEMPT_ID}?lam_lai=1`);

  const nut = page.getByRole('button', { name: 'Làm lại đề này' });
  await expect(nut).toBeVisible();
  await nut.click();
  await expect(page).toHaveURL(/\/take-exam\/507f1f77bcf86cd799439025/);
});

test('backend từ chối thì hiện đúng câu backend trả về, không trắng trang', async ({ page }) => {
  await stubApi(page, STUDENT_USER);
  await page.route('**/api/v1/exam-attempts/**', async (route) => {
    await route.fulfill({
      status: 404,
      contentType: 'application/json',
      body: JSON.stringify({ detail: 'Không tìm thấy bài làm.' }),
    });
  });

  await page.goto(`/bai-lam/${ATTEMPT_ID}`);

  await expect(page.getByText('Không xem lại được bài làm')).toBeVisible();
  await expect(page.getByText('Không tìm thấy bài làm.')).toBeVisible();
});

test('xem lại bài luyện tập: nói rõ không có nhận xét AI', async ({ page }) => {
  await stubApi(page, STUDENT_USER);
  await page.route('**/api/v1/questions/*/attempts/my', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([
        {
          id: 'pa-1',
          question_set_id: 'qs-1',
          document_id: 'doc-1',
          user_id: STUDENT_USER.id,
          score: 1,
          max_score: 2,
          percent: 50,
          created_at: '2026-08-10T01:00:00Z',
          answers: [
            { question_index: 0, answer: 'A', correct_answer: 'A', is_correct: true },
            { question_index: 1, answer: 'B', correct_answer: 'C', is_correct: false },
          ],
        },
      ]),
    });
  });

  await page.goto('/bai-lam/pa-1?loai=practice&bo=qs-1');

  await expect(page.getByText('50%')).toBeVisible();
  await expect(page.getByText('Đáp án đúng: C')).toBeVisible();
  // Để trống thì học sinh vừa xem đề thi có nhận xét AI sẽ tưởng trang hỏng.
  await expect(page.getByText('không có nhận xét của AI')).toBeVisible();
});
