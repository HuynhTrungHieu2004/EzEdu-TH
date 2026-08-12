import client from './client';

export type BloomLevel = 'remember' | 'understand' | 'apply' | 'analyze';
export type Difficulty = 'easy' | 'medium' | 'hard';
export type QuestionType = 'multiple_choice' | 'true_false' | 'short_answer';
export type QuestionBankStatus = 'draft' | 'reviewing' | 'approved' | 'published' | 'archived';
export type BlueprintStatus = 'draft' | 'validated' | 'published' | 'archived';
export type ExamStatus = 'draft' | 'ready' | 'published' | 'closed' | 'archived';
export type SolverStatus = 'OPTIMAL' | 'FEASIBLE' | 'INFEASIBLE' | 'UNKNOWN';

export interface QuestionBankItem {
  id: string;
  subject_id: string;
  grade: number;
  curriculum_version: string;
  chapter_id: string | null;
  topic_id: string | null;
  learning_outcome_id: string | null;
  bloom_level: BloomLevel;
  difficulty: Difficulty;
  question_type: QuestionType;
  content: string;
  options: Record<string, string> | null;
  correct_answer: string;
  explanation: string;
  points: number;
  expected_time_seconds: number;
  source_document_id: string | null;
  citation: string | null;
  quality_status: 'unreviewed' | 'flagged' | 'verified';
  tags: string[];
  usage_count: number;
  status: QuestionBankStatus;
  version: number;
  owner_id: string;
  created_at: string;
  updated_at: string;
}

export interface QuestionBankCreatePayload {
  subject_id: string;
  grade: number;
  curriculum_version: string;
  chapter_id?: string | null;
  topic_id?: string | null;
  learning_outcome_id?: string | null;
  bloom_level: BloomLevel;
  difficulty: Difficulty;
  question_type: QuestionType;
  content: string;
  options?: Record<string, string> | null;
  correct_answer: string;
  explanation: string;
  points?: number;
  expected_time_seconds?: number;
  tags?: string[];
}

export interface QuestionBankListResponse {
  items: QuestionBankItem[];
  total: number;
  skip: number;
  limit: number;
}

export interface QuestionBankListParams {
  subject_id?: string;
  grade?: number;
  topic_id?: string;
  bloom_level?: BloomLevel;
  difficulty?: Difficulty;
  question_type?: QuestionType;
  status?: QuestionBankStatus;
  tag?: string;
  skip?: number;
  limit?: number;
}

export interface CountOrPointsConstraint {
  question_count?: number | null;
  points?: number | null;
}

export interface TopicConstraint extends CountOrPointsConstraint {
  topic_id: string;
}
export interface BloomConstraint extends CountOrPointsConstraint {
  bloom_level: BloomLevel;
}
export interface DifficultyConstraint extends CountOrPointsConstraint {
  difficulty: Difficulty;
}
export interface QuestionTypeConstraint extends CountOrPointsConstraint {
  question_type: QuestionType;
}

export interface BlueprintConstraints {
  topics: TopicConstraint[];
  bloom_distribution: BloomConstraint[];
  difficulty_distribution: DifficultyConstraint[];
  question_type_distribution: QuestionTypeConstraint[];
  max_time_seconds?: number | null;
  exclude_recently_used_days?: number | null;
  /** Số câu tối đa lấy từ cùng một cụm nội dung (K-Means trên embedding câu hỏi). */
  max_questions_per_content_cluster?: number | null;
}

export interface ExamBlueprint {
  id: string;
  name: string;
  subject_id: string;
  grade: number;
  curriculum_version: string;
  total_points: number;
  duration_minutes: number;
  constraints: BlueprintConstraints;
  status: BlueprintStatus;
  version: number;
  owner_id: string;
  created_at: string;
  updated_at: string;
}

export interface MissingQuestionGroup {
  group_type: 'topic' | 'bloom_level' | 'difficulty' | 'question_type' | 'total';
  group_key: string | null;
  required_count: number;
  available_count: number;
  shortfall: number;
}

export interface BlueprintValidationResult {
  status: SolverStatus;
  message: string;
  missing: MissingQuestionGroup[];
  solve_time_seconds: number;
}

export interface ExamItem {
  id: string;
  blueprint_id: string;
  blueprint_version: number;
  code: string;
  equivalent_group_id: string;
  question_ids: string[];
  total_points: number;
  duration_minutes: number;
  status: ExamStatus;
  published_at: string | null;
  audience_type: 'all' | 'classes';
  target_class_ids: string[];
  allow_retake: boolean;
  version: number;
  owner_id: string;
  created_at: string;
  updated_at: string;
}

export interface ExamGenerateResponse {
  solver_status: 'OPTIMAL' | 'FEASIBLE';
  exams: ExamItem[];
}

export interface ExamPreviewQuestionItem {
  question_id: string;
  order: number;
  content: string;
  options: Record<string, string> | null;
  correct_answer: string | null;
  explanation: string | null;
  points: number;
  bloom_level: string;
  difficulty: string;
  question_type: string;
  source_document_id: string | null;
  citation: string | null;
}

export interface ExamPreviewResponse {
  exam: ExamItem;
  questions: ExamPreviewQuestionItem[];
  hide_answers: boolean;
}

export type AttemptStatus = 'in_progress' | 'submitted' | 'graded';

export interface AttemptStart {
  id: string;
  exam_id: string;
  exam_code: string;
  started_at: string;
  due_at: string;
  server_now: string;
  status: AttemptStatus;
}

export interface AttemptQuestionResult {
  question_id: string;
  question_type: QuestionType;
  points_possible: number;
  student_answer: string | null;
  is_correct: boolean | null;
  ai_score: number | null;
  ai_confidence: number | null;
  ai_feedback: string | null;
  teacher_score: number | null;
  teacher_feedback: string | null;
  final_score: number;
}

export interface Attempt {
  id: string;
  exam_id: string;
  exam_code: string;
  student_id: string;
  student_name?: string | null;
  student_email?: string | null;
  status: AttemptStatus;
  answers: Record<string, string>;
  started_at: string;
  due_at: string;
  server_now: string;
  submitted_at: string | null;
  auto_submitted: boolean;
  total_score: number;
  max_score: number;
  results: AttemptQuestionResult[];
  version: number;
}

function newIdempotencyKey(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export const examBankApi = {
  // ── Ngân hàng câu hỏi ──────────────────────────────────────────────
  createQuestion: async (payload: QuestionBankCreatePayload): Promise<QuestionBankItem> => {
    const response = await client.post<QuestionBankItem>('/question-bank/questions', payload);
    return response.data;
  },

  listQuestions: async (params: QuestionBankListParams = {}): Promise<QuestionBankListResponse> => {
    const response = await client.get<QuestionBankListResponse>('/question-bank/questions', { params });
    return response.data;
  },

  getQuestion: async (id: string): Promise<QuestionBankItem> => {
    const response = await client.get<QuestionBankItem>(`/question-bank/questions/${id}`);
    return response.data;
  },

  reviewQuestion: async (id: string, version: number, targetStatus: QuestionBankStatus): Promise<QuestionBankItem> => {
    const response = await client.post<QuestionBankItem>(`/question-bank/questions/${id}/review`, {
      version,
      target_status: targetStatus,
    });
    return response.data;
  },

  bulkApprove: async (questionIds: string[]): Promise<{ updated_count: number }> => {
    const response = await client.post('/question-bank/questions/bulk-approve', { question_ids: questionIds });
    return response.data;
  },

  bulkArchive: async (questionIds: string[]): Promise<{ updated_count: number }> => {
    const response = await client.post('/question-bank/questions/bulk-archive', { question_ids: questionIds });
    return response.data;
  },

  // ── Ma trận đề ─────────────────────────────────────────────────────
  createBlueprint: async (payload: {
    name: string;
    subject_id: string;
    grade: number;
    curriculum_version: string;
    total_points: number;
    duration_minutes: number;
    constraints: BlueprintConstraints;
  }): Promise<ExamBlueprint> => {
    const response = await client.post<ExamBlueprint>('/exam-blueprints', payload);
    return response.data;
  },

  listBlueprints: async (): Promise<{ items: ExamBlueprint[]; total: number }> => {
    const response = await client.get('/exam-blueprints');
    return response.data;
  },

  getBlueprint: async (id: string): Promise<ExamBlueprint> => {
    const response = await client.get<ExamBlueprint>(`/exam-blueprints/${id}`);
    return response.data;
  },

  updateBlueprint: async (
    id: string,
    version: number,
    payload: Partial<{
      name: string;
      total_points: number;
      duration_minutes: number;
      constraints: BlueprintConstraints;
    }>,
  ): Promise<ExamBlueprint> => {
    const response = await client.patch<ExamBlueprint>(`/exam-blueprints/${id}`, { ...payload, version });
    return response.data;
  },

  validateBlueprint: async (id: string): Promise<BlueprintValidationResult> => {
    const response = await client.post<BlueprintValidationResult>(`/exam-blueprints/${id}/validate`);
    return response.data;
  },

  // ── Sinh đề ────────────────────────────────────────────────────────
  generateExams: async (blueprintId: string, codeCount: number, seed?: number): Promise<ExamGenerateResponse> => {
    const response = await client.post<ExamGenerateResponse>(
      '/exams/generate',
      { blueprint_id: blueprintId, code_count: codeCount, seed },
      { headers: { 'Idempotency-Key': newIdempotencyKey() } },
    );
    return response.data;
  },

  listExams: async (blueprintId?: string): Promise<{ items: ExamItem[]; total: number }> => {
    const response = await client.get('/exams', { params: blueprintId ? { blueprint_id: blueprintId } : {} });
    return response.data;
  },

  previewExam: async (id: string, hideAnswers = true): Promise<ExamPreviewResponse> => {
    const response = await client.get<ExamPreviewResponse>(`/exams/${id}/preview`, {
      params: { hide_answers: hideAnswers },
    });
    return response.data;
  },

  publishExam: async (id: string, version: number): Promise<ExamItem> => {
    const response = await client.post<ExamItem>(`/exams/${id}/publish`, {
      version,
      audience_type: 'all',
      target_class_ids: [],
    });
    return response.data;
  },

  setAllowRetake: async (id: string, version: number, allowRetake: boolean): Promise<ExamItem> => {
    const response = await client.patch<ExamItem>(`/exams/${id}/retake-policy`, {
      version,
      allow_retake: allowRetake,
    });
    return response.data;
  },

  deleteExam: async (id: string, version: number): Promise<ExamItem> => {
    const response = await client.delete<ExamItem>(`/exams/${id}`, { params: { version } });
    return response.data;
  },

  // ── Làm bài (học sinh) ─────────────────────────────────────────────
  startAttempt: async (examId: string): Promise<AttemptStart> => {
    const response = await client.post<AttemptStart>(`/exams/${examId}/attempts/start`);
    return response.data;
  },

  getExamQuestions: async (examId: string): Promise<ExamPreviewResponse> => {
    const response = await client.get<ExamPreviewResponse>(`/exams/${examId}/questions`);
    return response.data;
  },

  getAttempt: async (attemptId: string): Promise<Attempt> => {
    const response = await client.get<Attempt>(`/exam-attempts/${attemptId}`);
    return response.data;
  },

  autosaveAttempt: async (attemptId: string, version: number, answers: Record<string, string>): Promise<Attempt> => {
    const response = await client.patch<Attempt>(`/exam-attempts/${attemptId}/autosave`, { version, answers });
    return response.data;
  },

  submitAttempt: async (attemptId: string, version: number, answers: Record<string, string>): Promise<Attempt> => {
    const response = await client.post<Attempt>(`/exam-attempts/${attemptId}/submit`, { version, answers });
    return response.data;
  },

  // ── Chấm bài (giáo viên) ───────────────────────────────────────────
  listAttempts: async (examId: string): Promise<{ items: Attempt[]; total: number }> => {
    const response = await client.get(`/exams/${examId}/attempts`);
    return response.data;
  },

  overrideScore: async (
    attemptId: string,
    version: number,
    questionId: string,
    teacherScore: number,
    teacherFeedback?: string,
  ): Promise<Attempt> => {
    const response = await client.post<Attempt>(`/exam-attempts/${attemptId}/override`, {
      version,
      question_id: questionId,
      teacher_score: teacherScore,
      teacher_feedback: teacherFeedback,
    });
    return response.data;
  },
};
