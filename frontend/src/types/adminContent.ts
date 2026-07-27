import type { SortOrder } from './adminUsers';

export type ContentStatus = 'active' | 'deleted' | 'quarantined' | 'all';

export interface AdminOwnerSnapshot {
  id: string | null;
  email: string | null;
  full_name: string | null;
  role: string | null;
}

export interface AdminDocumentSummary {
  id: string;
  original_filename: string;
  owner: AdminOwnerSnapshot;
  file_type: string;
  file_size: number;
  uploaded_at: string;
  processing_status: string;
  page_count: number | null;
  chunk_count: number;
  question_count: number;
  knowledge_verification_status: string | null;
  latest_error: string | null;
  is_quarantined: boolean;
  deleted_at: string | null;
  updated_at: string | null;
}

export interface AdminDocumentDetail extends AdminDocumentSummary {
  media_kind: string;
  cloudinary_resource_type: string | null;
  processing_history: Array<Record<string, unknown>>;
}

export interface AdminDocumentListParams {
  page?: number;
  page_size?: number;
  search?: string;
  user_id?: string;
  file_type?: string;
  processing_status?: string;
  status?: ContentStatus;
  created_from?: string;
  created_to?: string;
  has_error?: boolean;
  knowledge_verification_status?: string;
  sort_by?: string;
  sort_order?: SortOrder;
}

export interface AdminDocumentListResponse {
  items: AdminDocumentSummary[];
  total: number;
  page: number;
  page_size: number;
  total_pages: number;
  generated_at: string;
}

export interface AdminQuestionSummary {
  id: string;
  question_set_id: string;
  question_index: number;
  question_preview: string;
  question_type: string | null;
  difficulty: string | null;
  subject: string | null;
  topic: string | null;
  source_document_id: string | null;
  source_document_name: string | null;
  owner: AdminOwnerSnapshot;
  citation_status: string | null;
  hallucination_risk: string | null;
  moderation_status: string;
  created_at: string;
  updated_at: string | null;
  deleted_at: string | null;
}

export interface AdminQuestionDetail extends AdminQuestionSummary {
  question: string;
  options: Record<string, string> | null;
  correct_answer: string;
  explanation: string;
  tags: string[];
  bloom_level: string | null;
  evidence: Array<Record<string, unknown>>;
}

export interface AdminQuestionListParams {
  page?: number;
  page_size?: number;
  search?: string;
  user_id?: string;
  document_id?: string;
  question_type?: string;
  difficulty?: string;
  moderation_status?: string;
  status?: ContentStatus;
  created_from?: string;
  created_to?: string;
  sort_order?: SortOrder;
}

export interface AdminQuestionListResponse {
  items: AdminQuestionSummary[];
  total: number;
  page: number;
  page_size: number;
  total_pages: number;
  generated_at: string;
}

export interface AdminQuestionUpdatePayload {
  question?: string;
  options?: Record<string, string>;
  correct_answer?: string;
  explanation?: string;
  difficulty?: 'easy' | 'medium' | 'hard';
  question_type?: 'multiple_choice' | 'true_false' | 'short_answer';
  bloom_level?: 'remember' | 'understand' | 'apply' | 'analyze';
  tags?: string[];
  reason?: string;
}

export interface AdminExamSummary {
  id: string;
  name: string;
  owner: AdminOwnerSnapshot;
  question_count: number;
  created_at: string;
  last_exported_at: string | null;
  status: string;
  source_document_id: string | null;
  source_document_name: string | null;
  deleted_at: string | null;
}

export interface AdminExamListParams {
  page?: number;
  page_size?: number;
  search?: string;
  user_id?: string;
  status?: ContentStatus;
  created_from?: string;
  created_to?: string;
  sort_by?: string;
  sort_order?: SortOrder;
}

export interface AdminExamListResponse {
  items: AdminExamSummary[];
  total: number;
  page: number;
  page_size: number;
  total_pages: number;
  generated_at: string;
}
