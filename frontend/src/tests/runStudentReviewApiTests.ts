import assert from 'node:assert/strict';
import {
  mapReviewAttempt,
  mapStudentReview,
  mapTaxonomyOption,
  studentReviewApi,
} from '../api/studentReviewApi';
import { createLatestRequestGuard } from '../utils/latestRequest';

const workflow = await import('../pages/student/studentLearningMaterialsWorkflow').catch(() => null);
assert.ok(workflow, 'student learning-material workflow helpers must exist');

const {
  filterTaxonomyOptions,
  reconcileTaxonomySelection,
  retryLabelForFailedStep,
  shouldPollReview,
  suggestQuestionStyleCounts,
  validateLearningMaterialFile,
} = workflow;

const MAX_FILE_SIZE = 20 * 1024 * 1024;
assert.equal(validateLearningMaterialFile({ name: 'BAI-GIANG.PDF', size: MAX_FILE_SIZE }), null);
assert.match(
  validateLearningMaterialFile({ name: 'video.mp4', size: 1 }) ?? '',
  /PDF.*DOCX.*PPTX/,
);
assert.match(
  validateLearningMaterialFile({ name: 'bai-giang.pdf', size: MAX_FILE_SIZE + 1 }) ?? '',
  /20MB/,
);

const taxonomy = [
  { id: 'subject-1', name: 'Toán', nodeType: 'subject', grade: 10, curriculumVersion: '2018' },
  { id: 'subject-2', name: 'Lý', nodeType: 'subject', grade: 10, curriculumVersion: '2018' },
  { id: 'chapter-1', name: 'Hàm số', nodeType: 'chapter', parentId: 'subject-1', grade: 10, curriculumVersion: '2018' },
  { id: 'chapter-2', name: 'Động học', nodeType: 'chapter', parentId: 'subject-2', grade: 10, curriculumVersion: '2018' },
  { id: 'topic-1', name: 'Parabol', nodeType: 'topic', parentId: 'chapter-1', grade: 10, curriculumVersion: '2018' },
  { id: 'topic-2', name: 'Vận tốc', nodeType: 'topic', parentId: 'chapter-2', grade: 10, curriculumVersion: '2018' },
] as const;

assert.deepEqual(
  filterTaxonomyOptions(taxonomy, 'chapter', {
    parentId: 'subject-1',
    grade: 10,
    curriculumVersion: '2018',
  }).map((item) => item.id),
  ['chapter-1'],
);
assert.deepEqual(
  reconcileTaxonomySelection(taxonomy, {
    subjectId: 'subject-2',
    grade: 10,
    curriculumVersion: '2018',
    chapterId: 'chapter-1',
    topicIds: ['topic-1'],
  }),
  {
    subjectId: 'subject-2',
    grade: 10,
    curriculumVersion: '2018',
    chapterId: '',
    topicIds: [],
  },
);
assert.deepEqual(
  reconcileTaxonomySelection(taxonomy, {
    subjectId: 'subject-1',
    grade: 10,
    curriculumVersion: '2018',
    chapterId: 'chapter-1',
    topicIds: ['topic-1', 'topic-2'],
  }).topicIds,
  ['topic-1'],
);
assert.equal(shouldPollReview('classifying'), true);
assert.equal(shouldPollReview('generating'), true);
assert.equal(shouldPollReview('needs_confirmation'), false);
assert.equal(shouldPollReview('ready'), false);
assert.equal(retryLabelForFailedStep('classification'), 'Thử lại bước phân loại');
assert.equal(retryLabelForFailedStep('generation'), 'Thử lại tạo bộ đề');
assert.equal(retryLabelForFailedStep(undefined), null);
assert.equal(typeof studentReviewApi.retry, 'function');
assert.deepEqual(suggestQuestionStyleCounts('Toán học', 10), {
  knowledge: 3, cloze: 2, calculation: 5,
});
assert.deepEqual(suggestQuestionStyleCounts('Ngữ văn', 10), {
  knowledge: 7, cloze: 3, calculation: 0,
});
assert.equal(Object.values(suggestQuestionStyleCounts('Địa lý', 13)).reduce((sum, value) => sum + value, 0), 13);

const review = mapStudentReview({
  id: 'review-1',
  title: 'Hàm số bậc hai',
  state: 'ready',
  subject_name: 'Toán',
  classification: {
    subject_id: 'subject-1',
    grade: 10,
    curriculum_version: '2018',
    chapter_id: 'chapter-1',
    topic_ids: ['topic-1'],
    confidence: 0.9,
    method: 'ai',
    status: 'confirmed',
    classified_at: '2026-08-23T10:00:00Z',
  },
  generation_config: {
    title: 'Hàm số bậc hai',
    question_count: 12,
    difficulty: 'medium',
    question_type: 'multiple_choice',
    bloom_level: 'apply',
    question_style_counts: { knowledge: 4, cloze: 3, calculation: 5 },
  },
  attempt_count: 2,
  latest_score: 0,
  best_score: 80,
  created_at: '2026-08-23T09:00:00Z',
});

assert.equal(review.status, 'ready');
assert.equal(review.questionCount, 12);
assert.equal(review.latestScore, 0);
assert.equal(review.bestScore, 80);
assert.equal(review.classification?.curriculumVersion, '2018');
assert.equal(review.generationConfig?.questionType, 'multiple_choice');
assert.deepEqual(review.generationConfig?.questionStyleCounts, { knowledge: 4, cloze: 3, calculation: 5 });
assert.ok(!('created_at' in review));

const failedReview = mapStudentReview({
  id: 'review-failed',
  title: 'Hàm số bậc hai',
  state: 'failed',
  failed_step: 'generation',
  error_message: 'Không thể sinh bộ câu hỏi. Vui lòng thử lại sau.',
  created_at: '2026-08-23T09:00:00Z',
});
assert.equal(failedReview.failedStep, 'generation');

assert.deepEqual(
  mapTaxonomyOption({
    id: 'topic-1',
    name: 'Parabol',
    node_type: 'topic',
    parent_id: 'chapter-1',
    grade: 10,
    curriculum_version: '2018',
  }),
  {
    id: 'topic-1',
    name: 'Parabol',
    nodeType: 'topic',
    parentId: 'chapter-1',
    grade: 10,
    curriculumVersion: '2018',
  },
);

const inProgressAttempt = mapReviewAttempt({
  id: 'attempt-1',
  review_id: 'review-1',
  status: 'in_progress',
  started_at: '2026-08-23T10:00:00Z',
  created_at: '2026-08-23T10:00:00Z',
  questions: [{
    id: 'question-1',
    text: 'Đồ thị hàm số bậc hai là gì?',
    options: [
      { id: 'A', text: 'Parabol' },
      { id: 'B', text: 'Đường thẳng' },
      { id: 'C', text: 'Đường tròn' },
      { id: 'D', text: 'Điểm' },
    ],
  }],
});
assert.deepEqual(inProgressAttempt.questions[0], {
  id: 'question-1',
  text: 'Đồ thị hàm số bậc hai là gì?',
  options: [
    { id: 'A', text: 'Parabol' },
    { id: 'B', text: 'Đường thẳng' },
    { id: 'C', text: 'Đường tròn' },
    { id: 'D', text: 'Điểm' },
  ],
});
assert.ok(!('correctOptionId' in inProgressAttempt.questions[0]));
assert.ok(!('results' in inProgressAttempt));

const completedAttempt = mapReviewAttempt({
  id: 'attempt-1',
  review_id: 'review-1',
  status: 'completed',
  started_at: '2026-08-23T10:00:00Z',
  created_at: '2026-08-23T10:00:00Z',
  completed_at: '2026-08-23T10:05:00Z',
  score: 50,
  correct_count: 1,
  total_count: 2,
  answers: { 'question-1': 'B' },
  questions: [{
    id: 'question-1',
    text: 'Đồ thị hàm số bậc hai là gì?',
    options: [
      { id: 'A', text: 'Parabol' },
      { id: 'B', text: 'Đường thẳng' },
      { id: 'C', text: 'Đường tròn' },
      { id: 'D', text: 'Điểm' },
    ],
  }],
  results: [{
    question_id: 'question-1',
    selected_option_id: 'B',
    correct_option_id: 'A',
    is_correct: false,
    explanation: 'Đồ thị là một parabol.',
    source: {
      grounding_excerpt: 'Đồ thị hàm số bậc hai là một parabol.',
      source_chunk_ids: ['document-1:0'],
      source_document_id: 'document-1',
    },
  }],
});
assert.equal(completedAttempt.status, 'completed');
if (completedAttempt.status !== 'completed') throw new Error('completed mapper changed status');
assert.deepEqual(completedAttempt.results[0], {
  questionId: 'question-1',
  selectedOptionId: 'B',
  correctOptionId: 'A',
  isCorrect: false,
  explanation: 'Đồ thị là một parabol.',
  source: {
    groundingExcerpt: 'Đồ thị hàm số bậc hai là một parabol.',
    sourceChunkIds: ['document-1:0'],
    sourceDocumentId: 'document-1',
  },
});

const requests = createLatestRequestGuard();
const firstRequest = requests.begin();
const secondRequest = requests.begin();
assert.equal(requests.isCurrent(firstRequest), false);
assert.equal(requests.isCurrent(secondRequest), true);
requests.cancel();
assert.equal(requests.isCurrent(secondRequest), false);

console.log('studentReviewApi mapper and latest-request guard: ok');
