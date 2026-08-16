import { expect, test, type Page } from '@playwright/test';
import { STUDENT_USER, TEACHER_USER, stubApi } from './helpers';

/**
 * Học theo môn — mục lục Môn → Chương → bài luyện tập.
 *
 * Trước trang này học sinh chỉ có một danh sách phẳng xếp theo ngày công bố, nên
 * muốn ôn một môn thì phải tự lọc bằng mắt hoặc hỏi AI từng câu.
 */

const QS_DA_CONG_BO = {
  id: '507f1f77bcf86cd799439022',
  document_id: 'd1',
  user_id: 'teacher-1',
  document_name: 'Chương 1',
  question_count: 2,
  difficulty: 'medium',
  question_type: 'multiple_choice',
  questions: [
    { question: 'Câu 1?', options: ['A', 'B'], correct_answer: 'A', status: 'draft' },
    { question: 'Câu 2?', options: ['A', 'B'], correct_answer: 'B', status: 'draft' },
  ],
  published_question_count: 0,
  audience_type: 'all',
  target_class_ids: [],
  created_at: '2026-08-01T00:00:00Z',
  updated_at: '2026-08-01T00:00:00Z',
};

const MUC_LUC = [
  {
    id: 's1',
    name: 'Toán',
    count: 4,
    chapters: [
      { id: 'c1', name: 'Hàm số bậc hai', count: 2 },
      { id: 'c2', name: 'Lượng giác', count: 1 },
    ],
  },
  { id: 's2', name: 'Ngữ văn', count: 2, chapters: [] },
  { id: 'chua-phan-mon', name: 'Chưa phân môn', count: 7, chapters: [] },
];

/** Trả mục lục, và ghi lại query của mỗi lần gọi danh sách bài. */
async function gaApi(page: Page, mucLuc = MUC_LUC) {
  const daLoc: Array<Record<string, string>> = [];

  await page.route('**/api/v1/questions/published/subjects', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(mucLuc) });
  });

  await page.route('**/api/v1/questions/published?*', async (route) => {
    const url = new URL(route.request().url());
    daLoc.push(Object.fromEntries(url.searchParams.entries()));
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        items: [
          {
            id: 'qs1',
            document_id: 'd1',
            document_name: 'Chương 1 — Hàm số bậc hai',
            question_count: 10,
            difficulty: 'medium',
            question_type: 'multiple_choice',
            published_question_count: 10,
            chapter_name: 'Hàm số bậc hai',
            created_at: '2026-08-01T00:00:00Z',
          },
        ],
        has_more: false,
      }),
    });
  });

  return daLoc;
}

test('hiện mục lục môn kèm số bài và danh sách chương', async ({ page }) => {
  await stubApi(page, STUDENT_USER);
  await gaApi(page);

  await page.goto('/hoc-theo-mon');

  await expect(page.getByRole('heading', { name: 'Toán' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Ngữ văn' })).toBeVisible();
  await expect(page.getByText('4 bài')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Hàm số bậc hai (2)' })).toBeVisible();
});

test('học liệu chưa gắn môn vẫn đến được, và nằm cuối danh sách', async ({ page }) => {
  // Mọi học liệu công bố TRƯỚC tính năng này đều chưa có môn. Bỏ chúng đi nghĩa
  // là trang mới làm biến mất nội dung cũ khỏi tầm mắt học sinh.
  await stubApi(page, STUDENT_USER);
  await gaApi(page);

  await page.goto('/hoc-theo-mon');

  // Hai chốt, hai lý do khác nhau:
  //  - `toHaveCount` vì `allTextContents()` không tự chờ; đọc sớm thì danh sách
  //    còn render dở và "cuối danh sách" là một môn khác.
  //  - `allTextContents()` chứ KHÔNG phải `allInnerTexts()`: innerText phụ thuộc
  //    hiển thị, mà các thẻ vào bằng hiệu ứng GSAP nên thẻ chưa hiện xong trả về
  //    chuỗi rỗng. Ở đây kiểm THỨ TỰ trong DOM, không kiểm đã vẽ xong hay chưa.
  const the = page.locator('[data-subject-card] h2');
  await expect(the).toHaveCount(3);

  const ten = await the.allTextContents();
  expect(ten).toContain('Chưa phân môn');
  expect(ten[ten.length - 1], 'chỗ chứa tạm phải xuống cuối, không che các môn thật').toBe(
    'Chưa phân môn',
  );
});

test('bấm chương thì lọc đúng theo môn VÀ chương', async ({ page }) => {
  await stubApi(page, STUDENT_USER);
  const daLoc = await gaApi(page);

  await page.goto('/hoc-theo-mon');
  await page.getByRole('button', { name: 'Hàm số bậc hai (2)' }).click();

  await expect(page.getByText('Chương 1 — Hàm số bậc hai')).toBeVisible();
  // Thiếu subject_id thì server trả về chương trùng tên của môn khác.
  expect(daLoc.at(-1)).toEqual({ subject_id: 's1', chapter_id: 'c1' });
});

test('bấm "Tất cả" thì chỉ lọc theo môn, không kèm chương', async ({ page }) => {
  await stubApi(page, STUDENT_USER);
  const daLoc = await gaApi(page);

  await page.goto('/hoc-theo-mon');
  await page.locator('[data-subject-card]').first().getByRole('button', { name: 'Tất cả' }).click();

  await expect(page.getByText('Chương 1 — Hàm số bậc hai')).toBeVisible();
  expect(daLoc.at(-1)).toEqual({ subject_id: 's1' });
});

test('chưa có học liệu nào thì nói rõ, không để trang trắng', async ({ page }) => {
  await stubApi(page, STUDENT_USER);
  await gaApi(page, []);

  await page.goto('/hoc-theo-mon');

  await expect(page.getByText('Chưa có học liệu nào')).toBeVisible();
});

test('lỗi mạng thì báo, không treo ở khung xương', async ({ page }) => {
  await stubApi(page, STUDENT_USER);
  await page.route('**/api/v1/questions/published/subjects', async (route) => {
    await route.fulfill({
      status: 500,
      contentType: 'application/json',
      body: JSON.stringify({ detail: 'Máy chủ đang bận.' }),
    });
  });

  await page.goto('/hoc-theo-mon');

  await expect(page.getByText('Không tải được mục lục')).toBeVisible();
  await expect(page.getByText('Máy chủ đang bận.')).toBeVisible();
});

test('có mục Học theo môn trong menu điều hướng của học sinh', async ({ page }) => {
  await stubApi(page, STUDENT_USER);
  await gaApi(page);

  await page.goto('/dashboard');

  await expect(page.getByRole('link', { name: 'Học theo môn' })).toBeVisible();
});

/**
 * Mắt xích giáo viên: không có ô chọn môn thì mục lục "Học theo môn" mãi mãi
 * chỉ có nhóm "Chưa phân môn", và cả tính năng thành đồ trang trí.
 */
test('giáo viên chọn được môn khi công bố, và lựa chọn đó tới được backend', async ({ page }) => {
  await stubApi(page, TEACHER_USER);

  await page.route('**/api/v1/questions/taxonomy/subject-options', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([
        { id: 's1', name: 'Toán', count: 0, chapters: [{ id: 'c1', name: 'Hàm số bậc hai', count: 0 }] },
        { id: 's2', name: 'Ngữ văn', count: 0, chapters: [] },
      ]),
    });
  });

  await page.route('**/api/v1/questions/507f1f77bcf86cd799439022', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(QS_DA_CONG_BO) });
  });

  const daGui: Array<Record<string, unknown>> = [];
  await page.route('**/api/v1/questions/*/publish', async (route) => {
    daGui.push(route.request().postDataJSON());
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(QS_DA_CONG_BO) });
  });

  await page.goto(`/question-sets/${QS_DA_CONG_BO.id}`);
  await page.getByRole('button', { name: 'Duyệt & ban hành' }).click();

  const oMon = page.getByLabel('Môn học (không bắt buộc)');
  await expect(oMon).toBeVisible();
  await oMon.selectOption('s1');
  await page.getByLabel('Chương (không bắt buộc)').selectOption('c1');
  await page.getByRole('button', { name: 'Xác nhận ban hành' }).click();

  await expect.poll(() => daGui.length).toBe(1);
  expect(daGui[0]).toMatchObject({ subject_id: 's1', chapter_id: 'c1' });
});

test('đổi môn thì xoá chương đã chọn', async ({ page }) => {
  // Chương của môn cũ không thuộc môn mới nên backend từ chối, mà giáo viên
  // không hiểu vì sao — lỗi hiện ra sau khi đã bấm xác nhận.
  await stubApi(page, TEACHER_USER);
  await page.route('**/api/v1/questions/taxonomy/subject-options', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([
        { id: 's1', name: 'Toán', count: 0, chapters: [{ id: 'c1', name: 'Hàm số bậc hai', count: 0 }] },
        { id: 's2', name: 'Ngữ văn', count: 0, chapters: [{ id: 'c9', name: 'Truyện ngắn', count: 0 }] },
      ]),
    });
  });
  await page.route('**/api/v1/questions/507f1f77bcf86cd799439022', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(QS_DA_CONG_BO) });
  });

  await page.goto(`/question-sets/${QS_DA_CONG_BO.id}`);
  await page.getByRole('button', { name: 'Duyệt & ban hành' }).click();
  await page.getByLabel('Môn học (không bắt buộc)').selectOption('s1');
  await page.getByLabel('Chương (không bắt buộc)').selectOption('c1');

  await page.getByLabel('Môn học (không bắt buộc)').selectOption('s2');

  await expect(page.getByLabel('Chương (không bắt buộc)')).toHaveValue('');
});
