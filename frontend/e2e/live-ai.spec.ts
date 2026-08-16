import { expect, test, type Page } from '@playwright/test';

/**
 * Luồng TỐN HẠN MỨC AI, chạy với backend thật.
 *
 * Tách khỏi `live-smoke` vì mỗi lượt chạy gọi Gemini thật (embedding học liệu,
 * sinh câu hỏi, chấm tự luận) và đẩy tệp lên Cloudinary. Chạy bằng
 * `npm run test:ai` khi thực sự muốn tiêu hạn mức, không nằm trong bộ thường.
 *
 * Chuẩn bị: `python scripts/qa_live_accounts.py --setup` và worker nền đang chạy
 * (`python -m app.worker`) cho bài chấm tự luận.
 */

const API = process.env.VITE_API_BASE_URL || 'http://127.0.0.1:8000';
const TEACHER = { email: 'qa-live-lecturer@example.com', password: 'QaLive#2026' };
const STUDENT = { email: 'qa-live-student@example.com', password: 'QaLive#2026' };
const FIXTURE = 'e2e/fixtures/bai-hoc-dong-luong.docx';

async function token(account: { email: string; password: string }): Promise<string> {
  const response = await fetch(`${API}/api/v1/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(account),
  });
  if (!response.ok) {
    throw new Error(`Đăng nhập ${account.email} thất bại (${response.status}). `
      + 'Chạy: cd backend && python scripts/qa_live_accounts.py --setup');
  }
  return (await response.json()).access_token;
}

async function api(path: string, init: RequestInit & { token: string }) {
  const { token: bearer, ...rest } = init;
  const response = await fetch(`${API}/api/v1${path}`, {
    ...rest,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${bearer}`, ...(rest.headers || {}) },
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`${init.method || 'GET'} ${path} -> ${response.status}: ${text.slice(0, 300)}`);
  return text ? JSON.parse(text) : null;
}

async function login(page: Page, account: { email: string; password: string }) {
  await page.goto('/login');
  await page.getByLabel('Email đăng nhập').fill(account.email);
  await page.getByLabel('Mật khẩu').fill(account.password);
  await page.locator('#pub-main-content').getByRole('button', { name: 'Đăng nhập', exact: true }).click();
  await page.waitForURL(/\/(dashboard|published-questions|student-onboarding)/, { timeout: 30_000 });
}

test('giáo viên: tải học liệu, trích xuất, lập chỉ mục rồi sinh câu hỏi bằng AI', async ({ page }) => {
  test.setTimeout(600_000); // AI thật: sinh câu hỏi có thể mất vài phút
  const failures: string[] = [];
  page.on('pageerror', (error) => failures.push(`pageerror: ${error.message}`));
  page.on('response', (response) => {
    const url = response.url();
    if (url.includes('/api/v1/') && response.status() >= 400) {
      failures.push(`http-${response.status()} ${response.request().method()} ${url.replace(/^https?:\/\/[^/]+/, '')}`);
    }
  });

  await login(page, TEACHER);
  await page.goto('/generate');

  await page.setInputFiles('input[aria-label="Chọn tệp học liệu"]', FIXTURE);

  // Upload -> extract -> index chạy nối tiếp rồi tự chuyển sang trang sinh câu hỏi
  await page.waitForURL(/\/documents\/[a-f\d]{24}\/questions$/, { timeout: 300_000 });
  const documentId = page.url().match(/documents\/([a-f\d]{24})/)?.[1];
  expect(documentId).toBeTruthy();

  // Cấu hình rẻ nhất: 3 câu, tự luận ngắn (dùng luôn cho bài chấm tự luận)
  // `exact`: lịch sử đề đã sinh cũng có nút chứa chuỗi "3 câu"
  await page.getByRole('button', { name: '3 câu', exact: true }).click();
  await page.getByRole('radio', { name: /Tự luận ngắn/ }).click();
  await page.getByRole('button', { name: /Sinh 3 câu hỏi bằng AI/ }).click();
  await page.getByRole('button', { name: 'Bắt đầu sinh câu hỏi' }).click();

  // Sinh xong thì chuyển sang bộ câu hỏi
  await page.waitForURL(/\/question-sets\/[a-f\d]{24}$/, { timeout: 300_000 });
  await expect(page.locator('#main')).not.toBeEmpty();

  const setId = page.url().match(/question-sets\/([a-f\d]{24})/)?.[1];
  const teacherToken = await token(TEACHER);
  const set = await api(`/questions/${setId}`, { token: teacherToken });

  // Trường đề bài trong `question_sets` tên là `question` (không phải `content`
  // như bên ngân hàng câu hỏi của exam_bank).
  expect(set.questions).toHaveLength(3);
  for (const question of set.questions) {
    expect(question.question_type).toBe('short_answer');
    expect(String(question.question ?? '').length).toBeGreaterThan(10);
    expect(String(question.correct_answer ?? '').length).toBeGreaterThan(0);
    expect(String(question.explanation ?? '').length).toBeGreaterThan(10);
  }
  // Câu hỏi phải bám nội dung học liệu, không phải văn bản chung chung
  const corpus = set.questions.map((q: { question: string }) => q.question).join(' ').toLowerCase();
  expect(corpus).toMatch(/động lượng|va chạm|bảo toàn|phản lực/);

  console.log('AI_QUESTIONS=' + JSON.stringify(
    set.questions.map((q: { question: string }) => q.question), null, 1));
  console.log(`AI_DOCUMENT_ID=${documentId} AI_SET_ID=${setId}`);
  expect(failures).toEqual([]);
});

const MAX_POINTS = 2;

const ANSWERS = [
  {
    label: 'đúng',
    text: 'Tổng động lượng của một hệ kín luôn được bảo toàn, nghĩa là không đổi theo thời gian. '
      + 'Điều kiện áp dụng là hệ phải kín: các vật chỉ tương tác với nhau, hoặc ngoại lực tác dụng '
      + 'lên hệ cân bằng nhau, ví dụ va chạm giữa hai viên bi trong thời gian rất ngắn.',
    // Đáp án đúng phải được hơn nửa số điểm
    check: (score: number) => score > MAX_POINTS / 2,
  },
  {
    label: 'sai',
    text: 'Động lượng luôn tăng dần theo thời gian vì vật càng đi lâu thì càng nhanh. '
      + 'Định luật này chỉ áp dụng cho vật đứng yên và không liên quan tới khối lượng.',
    // Đối chứng: nếu AI cho điểm cao cả bài sai thì việc chấm là vô nghĩa
    check: (score: number) => score < MAX_POINTS / 2,
  },
];

test('học sinh: làm đề tự luận và được AI chấm', async ({ page }) => {
  test.setTimeout(900_000);
  const teacherToken = await token(TEACHER);

  // Dựng đề qua API: phần này là thủ tục ngân hàng câu hỏi (không AI), bộ kiểm
  // stub và pytest đã phủ; ở đây chỉ cần tới được bước chấm tự luận thật.
  const bankQuestion = await api('/question-bank/questions', {
    token: teacherToken,
    method: 'POST',
    body: JSON.stringify({
      subject_id: 'physics', grade: 10, curriculum_version: '2018',
      bloom_level: 'understand', difficulty: 'medium', question_type: 'short_answer',
      content: 'Phát biểu định luật bảo toàn động lượng và nêu điều kiện áp dụng.',
      correct_answer: 'Tổng động lượng của một hệ kín được bảo toàn, không đổi theo thời gian. '
        + 'Điều kiện: hệ kín, tức các vật chỉ tương tác với nhau hoặc ngoại lực cân bằng nhau.',
      explanation: 'Xem mục định luật bảo toàn động lượng trong bài học.',
      points: MAX_POINTS,
    }),
  });
  let version = bankQuestion.version;
  for (const target of ['reviewing', 'approved']) {
    const updated = await api(`/question-bank/questions/${bankQuestion.id}/review`, {
      token: teacherToken, method: 'POST',
      body: JSON.stringify({ version, target_status: target }),
    });
    version = updated.version;
  }

  const blueprint = await api('/exam-blueprints', {
    token: teacherToken, method: 'POST',
    body: JSON.stringify({
      name: 'QA Live đề tự luận', subject_id: 'physics', grade: 10, curriculum_version: '2018',
      total_points: MAX_POINTS, duration_minutes: 15, constraints: {},
    }),
  });
  await api(`/exam-blueprints/${blueprint.id}/validate`, { token: teacherToken, method: 'POST' });

  await login(page, STUDENT);
  const studentToken = await token(STUDENT);

  for (const [index, answer] of ANSWERS.entries()) {
    // Mỗi bài trả lời cần một đề riêng: mặc định đề không cho làm lại.
    // Khoá idempotency đi trong HTTP header nên phải thuần ASCII.
    const generated = await api('/exams/generate', {
      token: teacherToken, method: 'POST',
      headers: { 'Idempotency-Key': `qa-live-${blueprint.id}-${index}` },
      body: JSON.stringify({ blueprint_id: blueprint.id, code_count: 1, seed: 1 }),
    });
    const exam = generated.exams[0];
    await api(`/exams/${exam.id}/publish`, {
      token: teacherToken, method: 'POST',
      body: JSON.stringify({ version: exam.version, audience_type: 'all', target_class_ids: [] }),
    });

    // Từ đây là giao diện thật
    await page.goto(`/take-exam/${exam.id}`);
    await expect(page.getByRole('heading', { name: /Câu 1\/1/ })).toBeVisible({ timeout: 30_000 });
    await page.getByRole('textbox').first().fill(answer.text);
    await page.getByRole('button', { name: /Nộp bài/ }).click();
    await page.getByRole('button', { name: /^(Xác nhận|Nộp bài)$/ }).last().click();

    // Chấm tự luận là job nền: trang kết quả phải tự cập nhật, không cần tải lại.
    // Nếu polling hỏng thì học sinh kẹt ở "Đang chấm…" vĩnh viễn.
    // Bám vào dòng của câu hỏi, không phải dòng tổng kết ở đầu trang.
    const resultRow = page.locator('[data-result-row]').first();
    await expect(resultRow.getByText(new RegExp(`\\d+ / ${MAX_POINTS} điểm`)))
      .toBeVisible({ timeout: 240_000 });
    await expect(resultRow.getByText(/Độ tin cậy AI: \d+%/)).toBeVisible();
    await expect(page.getByText('Đã chấm xong')).toBeVisible();

    const attempts = await api('/questions/attempts/my-history', { token: studentToken });
    const attemptId = attempts.find(
      (item: { item_type: string; exam_id?: string }) => item.item_type === 'exam' && item.exam_id === exam.id,
    )?.id ?? attempts.find((item: { item_type: string }) => item.item_type === 'exam')?.id;
    expect(attemptId, 'không tìm thấy lượt làm bài vừa nộp').toBeTruthy();

    const graded = await api(`/exam-attempts/${attemptId}`, { token: studentToken });
    const result: { ai_score: number | null; ai_confidence: number | null; ai_feedback: string | null } | undefined
      = graded?.results?.[0];

    console.log(`AI_GRADING_${answer.label}=` + JSON.stringify(result, null, 1));
    expect(result?.ai_score, 'worker chưa chấm — kiểm tra `python -m app.worker` có đang chạy không')
      .not.toBeNull();
    expect(
      answer.check(result?.ai_score ?? -1),
      `bài ${answer.label} được ${result?.ai_score}/${MAX_POINTS} điểm`,
    ).toBe(true);
    expect(String(result?.ai_feedback ?? '').length).toBeGreaterThan(10);
  }
});
