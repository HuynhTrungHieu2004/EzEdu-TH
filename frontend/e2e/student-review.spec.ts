import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { expect, test, type Page, type Route, type TestInfo } from '@playwright/test';
import { captureBrowserErrors, expectNoPageOverflow, TEACHER_USER } from './helpers';

const student = {
  ...TEACHER_USER,
  email: 'student.review.e2e@example.test',
  full_name: 'Học sinh Ôn tập E2E',
  role: 'student',
  student_profile_completed: true,
};

const documentId = 'document-review-1';
const reviewId = 'review-1';
const longFilename = 'Toan12_KhaoSatHamSo_BanDemo_DungDeKiemTraTenTaiLieuRatDai.pdf';
const pdf = readFileSync(fileURLToPath(new URL('../../deliverables/demo-learning-materials/Toan12_KhaoSatHamSo.pdf', import.meta.url)));
const now = '2026-08-23T12:00:00Z';

const taxonomy = [
  { id: 'subject-math', name: 'Toán học', node_type: 'subject', grade: 12, curriculum_version: '2018' },
  { id: 'subject-physics', name: 'Vật lý', node_type: 'subject', grade: 12, curriculum_version: '2018' },
  { id: 'chapter-functions', name: 'Ứng dụng đạo hàm khảo sát hàm số', node_type: 'chapter', parent_id: 'subject-math', grade: 12, curriculum_version: '2018' },
  { id: 'chapter-waves', name: 'Sóng cơ', node_type: 'chapter', parent_id: 'subject-physics', grade: 12, curriculum_version: '2018' },
  { id: 'topic-variation', name: 'Sự biến thiên của hàm số', node_type: 'topic', parent_id: 'chapter-functions', grade: 12, curriculum_version: '2018' },
];

const questions = Array.from({ length: 5 }, (_, index) => ({
  id: `question-${index + 1}`,
  text: `Câu hỏi khảo sát hàm số số ${index + 1}?`,
  options: ['A', 'B', 'C', 'D'].map((id) => ({ id, text: `Phương án ${id}${index + 1}` })),
}));

const submittedAnswers = {
  'question-1': 'A',
  'question-2': 'B',
  'question-3': 'C',
  'question-4': 'D',
  'question-5': 'A',
};

function review(state: 'classifying' | 'needs_confirmation' | 'ready_to_generate' | 'generating' | 'ready' | 'failed') {
  const classification = state === 'classifying' ? undefined : {
    subject_id: state === 'needs_confirmation' ? 'subject-physics' : 'subject-math',
    subject_name: state === 'needs_confirmation' ? 'Vật lý' : 'Toán học',
    grade: 12,
    curriculum_version: '2018',
    chapter_id: state === 'needs_confirmation' ? 'chapter-waves' : 'chapter-functions',
    topic_ids: state === 'needs_confirmation' ? [] : ['topic-variation'],
    confidence: 0.72,
    method: state === 'needs_confirmation' ? 'ai' : 'student_corrected',
    status: state === 'needs_confirmation' ? 'needs_confirmation' : 'confirmed',
    classified_at: now,
  };
  const configured = state === 'generating' || state === 'ready' || state === 'failed';
  return {
    id: reviewId,
    title: 'Ôn tập khảo sát hàm số',
    state,
    document_id: documentId,
    question_set_id: state === 'ready' ? 'question-set-1' : null,
    subject_name: classification?.subject_name ?? null,
    question_count: configured ? 5 : null,
    attempt_count: state === 'ready' ? 0 : null,
    latest_score: null,
    best_score: null,
    created_at: now,
    updated_at: now,
    warning: state === 'ready' ? 'Bộ đề này dùng để ôn tập, không phải đề thi chính thức.' : null,
    error_message: state === 'failed' ? 'Không thể sinh bộ câu hỏi. Vui lòng thử lại sau.' : null,
    failed_step: state === 'failed' ? 'generation' : null,
    classification,
    generation_config: configured ? {
      title: 'Ôn tập khảo sát hàm số',
      question_count: 5,
      difficulty: 'medium',
      question_type: 'multiple_choice',
    } : null,
  };
}

function inProgressAttempt(id: string) {
  return {
    id,
    review_id: reviewId,
    status: 'in_progress',
    started_at: now,
    created_at: now,
    questions,
  };
}

async function json(route: Route, body: unknown, status = 200) {
  await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
}

async function installWorkflowApi(page: Page) {
  const calls: string[] = [];
  const unexpectedCalls: string[] = [];
  let lifecycle: 'new' | 'classifying' | 'needs_confirmation' | 'ready_to_generate' | 'generating' | 'ready' | 'failed' = 'new';
  let startCount = 0;
  let generationCount = 0;
  let attemptCount = 0;

  await page.addInitScript(() => localStorage.setItem('access_token', 'student-review-e2e-token'));
  await page.route('**/api/v1/**', async (route) => {
    const request = route.request();
    const method = request.method();
    const pathname = new URL(request.url()).pathname;

    if (pathname === '/api/v1/auth/me') return json(route, student);
    if (pathname === '/api/v1/runtime-config') return json(route, { feature_flags: {} });
    if (pathname === '/api/v1/website-content') return json(route, { items: [] });
    if (pathname === '/api/v1/notifications') return json(route, { items: [], total: 0 });

    if (pathname === '/api/v1/documents/upload' && method === 'POST') {
      expect(lifecycle).toBe('new');
      const multipart = request.postDataBuffer()?.toString('latin1') ?? '';
      expect(multipart).toContain(`filename="${longFilename}"`);
      expect(multipart).toContain('%PDF-');
      calls.push('upload');
      lifecycle = 'classifying';
      return json(route, {
        document_id: documentId,
        user_id: student.id,
        original_filename: longFilename,
        file_type: 'pdf',
        file_size: pdf.length,
        cloudinary_url: 'https://example.test/student-review.pdf',
        cloudinary_public_id: documentId,
        media_kind: 'document',
        status: 'uploaded',
        created_at: now,
        updated_at: now,
      }, 201);
    }

    if (pathname === `/api/v1/documents/${documentId}/extract` && method === 'POST') {
      expect(calls).toEqual(['upload']);
      calls.push('extract');
      return json(route, { status: 'extracted', message: 'ok', text_length: 1234 });
    }

    if (pathname === `/api/v1/documents/${documentId}/index` && method === 'POST') {
      expect(calls).toEqual(['upload', 'extract']);
      calls.push('index');
      return json(route, { status: 'indexed', message: 'ok', chunk_count: 4 });
    }

    if (pathname === '/api/v1/student-reviews' && method === 'POST') {
      expect(calls).toEqual(['upload', 'extract', 'index']);
      const body = request.postDataJSON();
      expect(body.document_id).toBe(documentId);
      expect(body.client_request_id).toMatch(/^[0-9a-f-]{36}$/i);
      calls.push('create');
      return json(route, review('classifying'), 202);
    }

    if (pathname === `/api/v1/student-reviews/${reviewId}` && method === 'GET') {
      calls.push(`poll:${lifecycle}`);
      if (lifecycle === 'classifying') {
        lifecycle = 'needs_confirmation';
        return json(route, review('needs_confirmation'));
      }
      if (lifecycle === 'generating') {
        lifecycle = 'ready';
        return json(route, review('ready'));
      }
      return json(route, review(lifecycle === 'new' ? 'classifying' : lifecycle));
    }

    if (pathname === '/api/v1/student-reviews/taxonomy-options' && method === 'GET') {
      expect(lifecycle).toBe('needs_confirmation');
      calls.push('taxonomy');
      return json(route, { items: taxonomy });
    }

    if (pathname === `/api/v1/student-reviews/${reviewId}/classification` && method === 'PATCH') {
      expect(request.postDataJSON()).toEqual({
        subject_id: 'subject-math',
        grade: 12,
        curriculum_version: '2018',
        chapter_id: 'chapter-functions',
        topic_ids: ['topic-variation'],
      });
      calls.push('confirm');
      lifecycle = 'ready_to_generate';
      return json(route, review('ready_to_generate'));
    }

    if (pathname === `/api/v1/student-reviews/${reviewId}/generate` && method === 'POST') {
      generationCount += 1;
      expect(request.postDataJSON()).toEqual({
        title: 'Ôn tập khảo sát hàm số',
        question_count: 5,
        difficulty: 'medium',
        question_type: 'multiple_choice',
      });
      calls.push('generate');
      lifecycle = 'failed';
      return json(route, review('failed'));
    }

    if (pathname === `/api/v1/student-reviews/${reviewId}/retry` && method === 'POST') {
      expect(lifecycle).toBe('failed');
      calls.push('retry:generation');
      lifecycle = 'generating';
      return json(route, review('generating'), 202);
    }

    if (pathname === `/api/v1/student-reviews/${reviewId}/attempts` && method === 'POST') {
      startCount += 1;
      attemptCount += 1;
      calls.push(`attempt:${attemptCount}`);
      await new Promise((resolve) => setTimeout(resolve, 80));
      return json(route, inProgressAttempt(`attempt-${attemptCount}`), 201);
    }

    if (pathname === '/api/v1/student-reviews/attempts/attempt-1/submit' && method === 'POST') {
      expect(request.postDataJSON()).toEqual({ answers: submittedAnswers });
      calls.push('submit');
      return json(route, {
        ...inProgressAttempt('attempt-1'),
        status: 'completed',
        score: 80,
        correct_count: 4,
        total_count: 5,
        answers: submittedAnswers,
        completed_at: '2026-08-23T12:05:00Z',
        results: questions.map((question, index) => ({
          question_id: question.id,
          selected_option_id: submittedAnswers[question.id as keyof typeof submittedAnswers],
          correct_option_id: index === 2 ? 'A' : submittedAnswers[question.id as keyof typeof submittedAnswers],
          is_correct: index !== 2,
          explanation: index === 2
            ? 'Đáp án đúng được suy ra từ dấu của đạo hàm.'
            : 'Lời giải dựa trên bảng biến thiên trong học liệu.',
          source: {
            grounding_excerpt: `Trích đoạn học liệu cho câu ${index + 1}.`,
            source_chunk_ids: [`${documentId}:${index}`],
            source_document_id: documentId,
          },
        })),
      });
    }

    if (pathname === '/api/v1/student-reviews' && method === 'GET') {
      calls.push('history');
      return json(route, { items: [{
        ...review('ready'),
        attempt_count: 1,
        latest_score: 80,
        best_score: 80,
      }] });
    }

    unexpectedCalls.push(`${method} ${pathname}`);
    return json(route, { detail: `No student-review E2E fixture for ${method} ${pathname}` }, 404);
  });

  return {
    calls,
    unexpectedCalls,
    get generationCount() { return generationCount; },
    get startCount() { return startCount; },
  };
}

test('học sinh tải PDF, xác nhận phân loại, tạo 5 câu, làm bài, xem lịch sử và làm lại', async ({ page }, testInfo: TestInfo) => {
  const browserErrors = captureBrowserErrors(page);
  const api = await installWorkflowApi(page);

  await page.goto('/student/learning-materials');
  await expect(page.getByRole('heading', { name: 'Tạo bộ ôn tập từ học liệu' })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath(`student-review-upload-${testInfo.project.name}.png`) });
  await page.getByLabel('Tải học liệu').setInputFiles({
    name: longFilename,
    mimeType: 'application/pdf',
    buffer: pdf,
  });

  await expect(page.getByRole('heading', { name: 'Xác nhận phân loại' })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath(`student-review-classification-${testInfo.project.name}.png`) });
  await expect(page.getByLabel('Môn học')).toHaveValue('subject-physics');
  await page.getByLabel('Môn học').selectOption('subject-math');
  await page.getByRole('combobox', { name: 'Chương (bắt buộc)', exact: true }).selectOption('chapter-functions');
  await page.getByLabel('Sự biến thiên của hàm số').check();
  await page.getByRole('button', { name: 'Xác nhận phân loại' }).click();

  await expect(page.getByRole('heading', { name: 'Cấu hình bộ ôn tập' })).toBeVisible();
  await page.getByLabel('Số câu hỏi').fill('5');
  await page.getByRole('button', { name: 'Tạo bộ đề ôn tập' }).click();
  await expect(page.getByRole('heading', { name: 'Không thể tạo bộ ôn tập' })).toBeVisible();
  await expect(page.getByText('Không thể sinh bộ câu hỏi. Vui lòng thử lại sau.')).toBeVisible();
  await page.getByRole('button', { name: 'Thử lại tạo bộ đề' }).click();
  await expect(page.getByRole('img', { name: 'AI đang xử lý học liệu' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Bộ đề đã sẵn sàng' })).toBeVisible();
  await expect(page.getByText('không phải đề thi chính thức', { exact: false })).toBeVisible();
  await expectNoPageOverflow(page);
  await page.screenshot({ path: testInfo.outputPath(`student-review-ready-${testInfo.project.name}.png`) });

  await page.getByRole('link', { name: 'Bắt đầu ôn tập' }).click();
  await expect(page.getByText('Đây là bộ đề ôn tập cá nhân, không phải đề thi chính thức.')).toBeVisible();
  expect(api.startCount).toBe(1);
  expect(JSON.stringify(inProgressAttempt('attempt-check'))).not.toMatch(/correct|explanation|source/i);

  for (const [questionId, optionId] of Object.entries(submittedAnswers)) {
    const number = questionId.split('-')[1];
    await page.getByLabel(`${optionId}. Phương án ${optionId}${number}`).check();
  }
  await page.getByRole('button', { name: 'Nộp bài ôn tập' }).click();

  await expect(page.getByText('Điểm:', { exact: false })).toContainText('80%');
  await expect(page.getByText('Đáp án đúng:', { exact: false }).first()).toBeVisible();
  await expect(page.getByText('Đáp án đúng được suy ra từ dấu của đạo hàm.')).toBeVisible();
  await expect(page.getByText('“Trích đoạn học liệu cho câu 3.”')).toBeVisible();
  await expectNoPageOverflow(page);

  await page.getByRole('link', { name: 'Về lịch sử ôn tập' }).last().click();
  await expect(page.getByRole('heading', { name: 'Lịch sử ôn tập' })).toBeVisible();
  await expect(page.getByText('1 lượt làm')).toBeVisible();
  await expect(page.getByText('Gần nhất: 80 điểm')).toBeVisible();
  await expect(page.getByText('Cao nhất: 80 điểm')).toBeVisible();
  await expectNoPageOverflow(page);

  await page.getByRole('link', { name: 'Làm lại' }).click();
  await expect(page.getByRole('button', { name: 'Nộp bài ôn tập' })).toBeVisible();
  expect(api.startCount).toBe(2);
  expect(api.generationCount).toBe(1);
  expect(api.calls.slice(0, 4)).toEqual(['upload', 'extract', 'index', 'create']);
  expect(api.calls).toContain('submit');
  expect(api.calls).toContain('retry:generation');
  expect(api.calls.indexOf('history')).toBeGreaterThan(api.calls.indexOf('submit'));
  expect(api.unexpectedCalls).toEqual([]);
  await expectNoPageOverflow(page);
  expect(browserErrors).toEqual([]);

  await page.screenshot({
    path: testInfo.outputPath(`student-review-attempt-${testInfo.project.name}.png`),
    fullPage: true,
  });
});
