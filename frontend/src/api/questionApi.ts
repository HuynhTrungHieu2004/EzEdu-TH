import client from './client';

export interface QuestionItem {
  question: string;
  options: Record<string, string> | null;
  correct_answer: string;
  explanation: string;
  difficulty: string;
  question_type: string;
  bloom_level?: string | null;
  tags?: string[];
  status?: 'draft' | 'review_pending' | 'approved' | 'published';
  reviewed_by?: string | null;
  reviewed_at?: string | null;
  published_at?: string | null;
}

export interface KeywordItem {
  keyword: string;
  score: number;
}

export interface ValidationStats {
  cross_validated: boolean;
  total_generated: number;
  valid_count: number;
  invalid_count: number;
  fixed_count: number;
  replaced_count: number;
  validator: string | null;
}

export interface QuestionSetResponse {
  id: string;
  document_id: string;
  user_id: string;
  document_name: string;
  question_count: number;
  difficulty: string;
  question_type: string;
  questions: QuestionItem[];
  validation_stats?: ValidationStats | null;
  keywords?: KeywordItem[] | null;
  bloom_distribution?: Record<string, number> | null;
  workflow_counts?: Record<string, number> | null;
  published_question_count: number;
  audience_type?: 'all' | 'classes';
  target_class_ids?: string[];
  created_at: string;
  updated_at: string;
}

/** Lightweight summary for history listing — no questions array. */
export interface QuestionSetSummary {
  id: string;
  document_id: string;
  document_name: string;
  question_count: number;
  difficulty: string;
  question_type: string;
  bloom_distribution?: Record<string, number> | null;
  workflow_counts?: Record<string, number> | null;
  published_question_count: number;
  audience_type?: 'all' | 'classes';
  target_class_ids?: string[];
  subject_id?: string | null;
  subject_name?: string | null;
  chapter_id?: string | null;
  chapter_name?: string | null;
  created_at: string;
}

export interface QuestionItemUpdatePayload {
  question?: string;
  options?: Record<string, string> | null;
  correct_answer?: string;
  explanation?: string;
  difficulty?: string;
  question_type?: string;
  bloom_level?: string;
  tags?: string[];
}

export interface AttemptAnswerPayload {
  question_index: number;
  answer: string;
}

export interface QuestionQualityItem {
  question_index: number;
  attempt_count: number;
  correct_count: number;
  /** Độ khó thực nghiệm: tỉ lệ học sinh trả lời đúng (0-1). */
  p_value: number | null;
  /** Độ phân biệt point-biserial (-1..1). Âm là dấu hiệu sai đáp án. */
  discrimination: number | null;
  cluster_id?: number;
  distance_to_centroid?: number;
  reasons?: string[];
}

export interface QuestionSetQualityResponse {
  status: 'ok' | 'insufficient_attempts' | 'insufficient_questions' | 'clustering_unavailable';
  attempt_count: number;
  question_count: number;
  min_attempts_required?: number;
  items: QuestionQualityItem[];
  clustering: {
    selected_k: number;
    silhouette_score: number;
    davies_bouldin_index: number;
    calinski_harabasz_score: number;
    cluster_sizes: number[];
  } | null;
  flagged: Array<{
    question_index: number;
    reasons: string[];
    p_value: number | null;
    discrimination: number | null;
  }>;
}

export interface QuestionAttemptResponse {
  id: string;
  question_set_id: string;
  document_id: string;
  user_id: string;
  score: number;
  max_score: number;
  percent: number;
  answers: Array<{
    question_index: number;
    answer: string;
    correct_answer: string;
    is_correct: boolean;
  }>;
  created_at: string;
}

export interface TeacherQuestionAttempt extends QuestionAttemptResponse {
  student_name: string | null;
  student_email: string | null;
}

export interface SubjectChapterNode {
  id: string;
  name: string;
  count: number;
}

/** Một môn trong mục lục "Học theo môn". */
export interface SubjectCatalogNode {
  id: string;
  name: string;
  count: number;
  chapters: SubjectChapterNode[];
}

export interface LearningHistoryItem {
  id: string;
  item_type: 'practice' | 'exam';
  question_set_id?: string;
  document_id?: string;
  exam_id?: string;
  title: string;
  score: number;
  max_score: number;
  percent: number;
  created_at: string;
  source_deleted: boolean;
  can_retake: boolean;
}

export interface HistoryListResponse {
  items: QuestionSetSummary[];
  next_cursor: string | null;
  has_more: boolean;
}

export interface HistoryParams {
  search?: string;
  question_type?: string;
  difficulty?: string;
  document_id?: string;
  cursor?: string;
  limit?: number;
}

type ExportFormat = 'docx' | 'pdf';

function parseFilename(contentDisposition?: string, fallback = 'question-set') {
  if (!contentDisposition) {
    return fallback;
  }

  const utf8Match = contentDisposition.match(/filename\*=UTF-8''([^;]+)/i);
  if (utf8Match?.[1]) {
    return decodeURIComponent(utf8Match[1]);
  }

  const basicMatch = contentDisposition.match(/filename="?([^";]+)"?/i);
  if (basicMatch?.[1]) {
    return basicMatch[1];
  }

  return fallback;
}

function downloadBlob(blob: Blob, filename: string) {
  const objectUrl = window.URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = objectUrl;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  window.URL.revokeObjectURL(objectUrl);
}

async function exportQuestionSet(id: string, format: ExportFormat) {
  const response = await client.get<Blob>(`/questions/${id}/export/${format}`, {
    responseType: 'blob',
  });

  const extension = format === 'docx' ? 'docx' : 'pdf';
  const fallbackName = `question-set.${extension}`;
  const filename = parseFilename(response.headers['content-disposition'], fallbackName);
  downloadBlob(response.data, filename);
}

export const questionApi = {
  generate: async (documentId: string, count: number, difficulty: string, type: string, bloomLevel?: string): Promise<QuestionSetResponse> => {
    const body: Record<string, unknown> = {
      document_id: documentId,
      question_count: count,
      difficulty,
      question_type: type,
    };
    if (bloomLevel) {
      body.bloom_level = bloomLevel;
    }
    const response = await client.post<QuestionSetResponse>('/questions/generate', body);
    return response.data;
  },

  listByDocument: async (documentId: string): Promise<QuestionSetResponse[]> => {
    const response = await client.get<QuestionSetResponse[]>(`/questions/document/${documentId}`);
    return response.data;
  },

  get: async (id: string): Promise<QuestionSetResponse> => {
    const response = await client.get<QuestionSetResponse>(`/questions/${id}`);
    return response.data;
  },

  /** Fetch paginated history of all user's question sets. */
  listMyHistory: async (params: HistoryParams = {}, signal?: AbortSignal): Promise<HistoryListResponse> => {
    const query: Record<string, string> = {};
    if (params.search) query.search = params.search;
    if (params.question_type) query.question_type = params.question_type;
    if (params.difficulty) query.difficulty = params.difficulty;
    if (params.document_id) query.document_id = params.document_id;
    if (params.cursor) query.cursor = params.cursor;
    if (params.limit) query.limit = String(params.limit);

    const response = await client.get<HistoryListResponse>('/questions/my-history', {
      params: query,
      signal,
    });
    return response.data;
  },

  listPublished: async (
    search = '',
    signal?: AbortSignal,
    loc: { subject_id?: string; chapter_id?: string } = {},
  ): Promise<HistoryListResponse> => {
    const params: Record<string, string> = {};
    if (search) params.search = search;
    if (loc.subject_id) params.subject_id = loc.subject_id;
    if (loc.chapter_id) params.chapter_id = loc.chapter_id;
    const response = await client.get<HistoryListResponse>('/questions/published', {
      params: Object.keys(params).length ? params : undefined,
      signal,
    });
    return response.data;
  },

  /** Mục lục môn → chương của học liệu học sinh này xem được. */
  listPublishedSubjects: async (signal?: AbortSignal): Promise<SubjectCatalogNode[]> => {
    const response = await client.get<SubjectCatalogNode[]>('/questions/published/subjects', { signal });
    return response.data;
  },

  pendingPublishedCount: async (signal?: AbortSignal): Promise<number> => {
    const response = await client.get<{ pending_count: number }>('/questions/published/pending-count', { signal });
    return response.data.pending_count;
  },

  /** Soft-delete a question set. */
  deleteQuestionSet: async (id: string): Promise<void> => {
    await client.delete(`/questions/${id}`);
  },

  updateQuestionItem: async (id: string, questionIndex: number, payload: QuestionItemUpdatePayload): Promise<QuestionSetResponse> => {
    const response = await client.patch<QuestionSetResponse>(`/questions/${id}/items/${questionIndex}`, payload);
    return response.data;
  },

  updateQuestionWorkflow: async (id: string, questionIndex: number, status: 'draft' | 'review_pending' | 'approved' | 'published'): Promise<QuestionSetResponse> => {
    const response = await client.post<QuestionSetResponse>(`/questions/${id}/items/${questionIndex}/workflow`, { status });
    return response.data;
  },

  /** Cây môn → chương để giáo viên gắn nhãn lúc công bố. */
  listSubjectOptions: async (signal?: AbortSignal): Promise<SubjectCatalogNode[]> => {
    const response = await client.get<SubjectCatalogNode[]>('/questions/taxonomy/subject-options', { signal });
    return response.data;
  },

  createTaxonomyNode: async (payload: {
    node_type: 'subject' | 'chapter';
    name: string;
    parent_id?: string | null;
  }): Promise<{ id: string; name: string; node_type: string }> => {
    const response = await client.post('/questions/taxonomy/nodes', payload);
    return response.data;
  },

  renameTaxonomyNode: async (nodeId: string, name: string): Promise<{ id: string; name: string }> => {
    const response = await client.patch(`/questions/taxonomy/nodes/${nodeId}`, { name });
    return response.data;
  },

  deleteTaxonomyNode: async (nodeId: string): Promise<void> => {
    await client.delete(`/questions/taxonomy/nodes/${nodeId}`);
  },

  publishQuestionSet: async (
    id: string,
    payload?: {
      audience_type: 'all' | 'classes';
      target_class_ids?: string[];
      subject_id?: string | null;
      chapter_id?: string | null;
    },
  ): Promise<QuestionSetResponse> => {
    const response = await client.post<QuestionSetResponse>(`/questions/${id}/publish`, payload ?? { audience_type: 'all' });
    return response.data;
  },

  submitAttempt: async (id: string, answers: AttemptAnswerPayload[]): Promise<QuestionAttemptResponse> => {
    const response = await client.post<QuestionAttemptResponse>(`/questions/${id}/attempts`, { answers });
    return response.data;
  },

  /** Phân tích chất lượng từng câu từ bài làm thật của học sinh (chỉ chủ bộ đề). */
  getQuality: async (id: string): Promise<QuestionSetQualityResponse> => {
    const response = await client.get<QuestionSetQualityResponse>(`/questions/${id}/quality`);
    return response.data;
  },

  listMyAttempts: async (id: string): Promise<QuestionAttemptResponse[]> => {
    const response = await client.get<QuestionAttemptResponse[]>(`/questions/${id}/attempts/my`);
    return response.data;
  },

  listAttemptsForTeacher: async (id: string): Promise<TeacherQuestionAttempt[]> => {
    const response = await client.get<TeacherQuestionAttempt[]>(`/questions/${id}/attempts`);
    return response.data;
  },

  listMyLearningHistory: async (): Promise<LearningHistoryItem[]> => {
    const response = await client.get<LearningHistoryItem[]>('/questions/attempts/my-history');
    return response.data;
  },

  downloadDocx: async (id: string) => {
    await exportQuestionSet(id, 'docx');
  },

  downloadPdf: async (id: string) => {
    await exportQuestionSet(id, 'pdf');
  },
};
