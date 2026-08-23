import client from './client';

export type ReviewStatus =
  | 'classifying'
  | 'needs_confirmation'
  | 'ready_to_generate'
  | 'generating'
  | 'ready'
  | 'failed';

export type ReviewDifficulty = 'easy' | 'medium' | 'hard';
export type ReviewFailedStep = 'classification' | 'generation';
export type ReviewBloomLevel = 'remember' | 'understand' | 'apply' | 'analyze';
export type ReviewQuestionStyle = 'knowledge' | 'cloze' | 'calculation';
export type TaxonomyNodeType = 'subject' | 'chapter' | 'topic';

export type ReviewQuestionStyleCounts = Record<ReviewQuestionStyle, number>;

export interface TaxonomyOption {
  id: string;
  name: string;
  nodeType: TaxonomyNodeType;
  parentId?: string;
  grade?: number;
  curriculumVersion?: string;
}

export interface CreateReviewInput {
  documentId: string;
  clientRequestId: string;
}

export interface ClassificationInput {
  subjectId: string;
  grade: number;
  curriculumVersion: string;
  chapterId: string;
  topicIds: string[];
}

export interface GenerateReviewInput {
  title: string;
  questionCount: number;
  difficulty: ReviewDifficulty;
  questionType: 'multiple_choice';
  bloomLevel?: ReviewBloomLevel;
  questionStyleCounts: ReviewQuestionStyleCounts;
}

export interface StudentReviewClassification extends ClassificationInput {
  confidence?: number;
  method?: 'ai' | 'student_corrected';
  status?: 'confirmed' | 'needs_confirmation' | 'manual_required';
  classifiedAt?: string;
}

export type StudentReviewGenerationConfig = GenerateReviewInput;

export interface StudentReviewSummary {
  id: string;
  title: string;
  status: ReviewStatus;
  subjectName?: string;
  questionCount?: number;
  attemptCount: number;
  latestScore?: number;
  bestScore?: number;
  createdAt: string;
  warning?: string;
  errorMessage?: string;
  failedStep?: ReviewFailedStep;
}

export interface StudentReview extends StudentReviewSummary {
  documentId?: string;
  questionSetId?: string;
  classification?: StudentReviewClassification;
  generationConfig?: StudentReviewGenerationConfig;
  updatedAt?: string;
}

export interface ReviewAttemptOption {
  id: string;
  text: string;
}

export interface ReviewAttemptQuestion {
  id: string;
  text: string;
  options: ReviewAttemptOption[];
}

interface ReviewAttemptBase {
  id: string;
  reviewId: string;
  startedAt: string;
  createdAt: string;
  questions: ReviewAttemptQuestion[];
}

export interface ReviewAttemptInProgress extends ReviewAttemptBase {
  status: 'in_progress';
}

export interface ReviewAttemptSource {
  groundingExcerpt?: string;
  sourceChunkIds?: string[];
  sourceDocumentId?: string;
}

export interface ReviewAttemptResultItem {
  questionId: string;
  selectedOptionId: string;
  correctOptionId: string;
  isCorrect: boolean;
  explanation: string;
  source: ReviewAttemptSource;
}

export interface ReviewAttemptCompleted extends ReviewAttemptBase {
  status: 'completed';
  score: number;
  correctCount: number;
  totalCount: number;
  answers: Record<string, string>;
  results: ReviewAttemptResultItem[];
  completedAt: string;
}

export type ReviewAttempt = ReviewAttemptInProgress | ReviewAttemptCompleted;

interface ClassificationTransport {
  subject_id: string;
  subject_name?: string | null;
  grade: number;
  curriculum_version: string;
  chapter_id: string;
  topic_ids: string[];
  confidence?: number | null;
  method?: 'ai' | 'student_corrected' | null;
  status?: 'confirmed' | 'needs_confirmation' | 'manual_required' | null;
  classified_at?: string | null;
}

interface GenerationConfigTransport {
  title: string;
  question_count: number;
  difficulty: ReviewDifficulty;
  question_type: 'multiple_choice';
  bloom_level?: ReviewBloomLevel | null;
  question_style_counts?: ReviewQuestionStyleCounts | null;
}

export interface TaxonomyOptionTransport {
  id: string;
  name: string;
  node_type: TaxonomyNodeType;
  parent_id?: string | null;
  grade?: number | null;
  curriculum_version?: string | null;
}

export interface StudentReviewTransport {
  id: string;
  title: string;
  state: ReviewStatus;
  document_id?: string | null;
  question_set_id?: string | null;
  subject_name?: string | null;
  question_count?: number | null;
  attempt_count?: number | null;
  latest_score?: number | null;
  best_score?: number | null;
  created_at: string;
  updated_at?: string | null;
  warning?: string | null;
  error_message?: string | null;
  failed_step?: ReviewFailedStep | null;
  classification?: ClassificationTransport | null;
  generation_config?: GenerationConfigTransport | null;
}

interface ReviewAttemptQuestionTransport {
  id: string;
  text: string;
  options: Array<{ id: string; text: string }>;
}

interface ReviewAttemptTransportBase {
  id: string;
  review_id: string;
  started_at: string;
  created_at: string;
  questions: ReviewAttemptQuestionTransport[];
}

interface ReviewAttemptInProgressTransport extends ReviewAttemptTransportBase {
  status: 'in_progress';
}

interface ReviewAttemptCompletedTransport extends ReviewAttemptTransportBase {
  status: 'completed';
  score: number;
  correct_count: number;
  total_count: number;
  answers: Record<string, string>;
  completed_at: string;
  results: Array<{
    question_id: string;
    selected_option_id: string;
    correct_option_id: string;
    is_correct: boolean;
    explanation: string;
    source: {
      grounding_excerpt?: string | null;
      source_chunk_ids?: string[] | null;
      source_document_id?: string | null;
    };
  }>;
}

export type ReviewAttemptTransport =
  | ReviewAttemptInProgressTransport
  | ReviewAttemptCompletedTransport;

const mapClassification = (
  value: ClassificationTransport | null | undefined,
): StudentReviewClassification | undefined => value ? {
  subjectId: value.subject_id,
  grade: value.grade,
  curriculumVersion: value.curriculum_version,
  chapterId: value.chapter_id,
  topicIds: value.topic_ids,
  confidence: value.confidence ?? undefined,
  method: value.method ?? undefined,
  status: value.status ?? undefined,
  classifiedAt: value.classified_at ?? undefined,
} : undefined;

const mapGenerationConfig = (
  value: GenerationConfigTransport | null | undefined,
): StudentReviewGenerationConfig | undefined => value ? {
  title: value.title,
  questionCount: value.question_count,
  difficulty: value.difficulty,
  questionType: value.question_type,
  bloomLevel: value.bloom_level ?? undefined,
  questionStyleCounts: value.question_style_counts ?? {
    knowledge: value.question_count,
    cloze: 0,
    calculation: 0,
  },
} : undefined;

export function mapStudentReview(value: StudentReviewTransport): StudentReview {
  const generationConfig = mapGenerationConfig(value.generation_config);
  return {
    id: value.id,
    title: value.title,
    status: value.state,
    subjectName: value.subject_name ?? value.classification?.subject_name ?? undefined,
    questionCount: value.question_count ?? generationConfig?.questionCount,
    attemptCount: value.attempt_count ?? 0,
    latestScore: value.latest_score ?? undefined,
    bestScore: value.best_score ?? undefined,
    createdAt: value.created_at,
    warning: value.warning ?? undefined,
    errorMessage: value.error_message ?? undefined,
    failedStep: value.failed_step ?? undefined,
    documentId: value.document_id ?? undefined,
    questionSetId: value.question_set_id ?? undefined,
    classification: mapClassification(value.classification),
    generationConfig,
    updatedAt: value.updated_at ?? undefined,
  };
}

export function mapTaxonomyOption(value: TaxonomyOptionTransport): TaxonomyOption {
  return {
    id: value.id,
    name: value.name,
    nodeType: value.node_type,
    parentId: value.parent_id ?? undefined,
    grade: value.grade ?? undefined,
    curriculumVersion: value.curriculum_version ?? undefined,
  };
}

export function mapReviewAttempt(value: ReviewAttemptTransport): ReviewAttempt {
  const base = {
    id: value.id,
    reviewId: value.review_id,
    startedAt: value.started_at,
    createdAt: value.created_at,
    questions: value.questions.map((question) => ({
      id: question.id,
      text: question.text,
      options: question.options.map((option) => ({ id: option.id, text: option.text })),
    })),
  };
  if (value.status === 'in_progress') return { ...base, status: value.status };

  return {
    ...base,
    status: value.status,
    score: value.score,
    correctCount: value.correct_count,
    totalCount: value.total_count,
    answers: value.answers,
    completedAt: value.completed_at,
    results: value.results.map((result) => ({
      questionId: result.question_id,
      selectedOptionId: result.selected_option_id,
      correctOptionId: result.correct_option_id,
      isCorrect: result.is_correct,
      explanation: result.explanation,
      source: {
        groundingExcerpt: result.source.grounding_excerpt ?? undefined,
        sourceChunkIds: result.source.source_chunk_ids ?? undefined,
        sourceDocumentId: result.source.source_document_id ?? undefined,
      },
    })),
  };
}

export const studentReviewApi = {
  taxonomyOptions: async (): Promise<TaxonomyOption[]> => {
    const response = await client.get<{ items: TaxonomyOptionTransport[] }>(
      '/student-reviews/taxonomy-options',
    );
    return response.data.items.map(mapTaxonomyOption);
  },

  create: async (input: CreateReviewInput): Promise<StudentReview> => mapStudentReview(
    (await client.post<StudentReviewTransport>('/student-reviews', {
      document_id: input.documentId,
      client_request_id: input.clientRequestId,
    })).data,
  ),

  list: async (): Promise<StudentReviewSummary[]> => {
    const response = await client.get<{ items: StudentReviewTransport[] }>('/student-reviews');
    return response.data.items.map(mapStudentReview);
  },

  get: async (id: string): Promise<StudentReview> => mapStudentReview(
    (await client.get<StudentReviewTransport>(`/student-reviews/${id}`)).data,
  ),

  confirmClassification: async (id: string, input: ClassificationInput): Promise<StudentReview> => mapStudentReview(
    (await client.patch<StudentReviewTransport>(`/student-reviews/${id}/classification`, {
      subject_id: input.subjectId,
      grade: input.grade,
      curriculum_version: input.curriculumVersion,
      chapter_id: input.chapterId,
      topic_ids: input.topicIds,
    })).data,
  ),

  generate: async (id: string, input: GenerateReviewInput): Promise<StudentReview> => mapStudentReview(
    (await client.post<StudentReviewTransport>(`/student-reviews/${id}/generate`, {
      title: input.title,
      question_count: input.questionCount,
      difficulty: input.difficulty,
      question_type: input.questionType,
      bloom_level: input.bloomLevel,
      question_style_counts: input.questionStyleCounts,
    })).data,
  ),

  retry: async (id: string): Promise<StudentReview> => mapStudentReview(
    (await client.post<StudentReviewTransport>(`/student-reviews/${id}/retry`)).data,
  ),

  startAttempt: async (reviewId: string): Promise<ReviewAttempt> => mapReviewAttempt(
    (await client.post<ReviewAttemptTransport>(`/student-reviews/${reviewId}/attempts`)).data,
  ),

  getAttempt: async (attemptId: string): Promise<ReviewAttempt> => mapReviewAttempt(
    (await client.get<ReviewAttemptTransport>(`/student-reviews/attempts/${attemptId}`)).data,
  ),

  submitAttempt: async (
    attemptId: string,
    answers: Record<string, string>,
  ): Promise<ReviewAttemptCompleted> => {
    const attempt = mapReviewAttempt((await client.post<ReviewAttemptTransport>(
      `/student-reviews/attempts/${attemptId}/submit`,
      { answers },
    )).data);
    if (attempt.status !== 'completed') throw new Error('Attempt submission did not complete.');
    return attempt;
  },
};
