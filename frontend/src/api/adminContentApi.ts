import client from './client';
import type {
  AdminDocumentDetail,
  AdminDocumentListParams,
  AdminDocumentListResponse,
  AdminExamListParams,
  AdminExamListResponse,
  AdminQuestionDetail,
  AdminQuestionListParams,
  AdminQuestionListResponse,
  AdminQuestionUpdatePayload,
} from '../types/adminContent';

export const adminContentApi = {
  listDocuments: async (params: AdminDocumentListParams, signal?: AbortSignal): Promise<AdminDocumentListResponse> => {
    const response = await client.get<AdminDocumentListResponse>('/admin/content/documents', { params, signal });
    return response.data;
  },
  documentDetail: async (documentId: string, signal?: AbortSignal): Promise<AdminDocumentDetail> => {
    const response = await client.get<AdminDocumentDetail>(`/admin/content/documents/${documentId}`, { signal });
    return response.data;
  },
  reprocessDocument: async (documentId: string, reason: string): Promise<AdminDocumentDetail> => {
    const response = await client.post<AdminDocumentDetail>(`/admin/content/documents/${documentId}/reprocess`, { reason });
    return response.data;
  },
  quarantineDocument: async (documentId: string, reason: string): Promise<AdminDocumentDetail> => {
    const response = await client.post<AdminDocumentDetail>(`/admin/content/documents/${documentId}/quarantine`, { reason });
    return response.data;
  },
  unquarantineDocument: async (documentId: string): Promise<AdminDocumentDetail> => {
    const response = await client.post<AdminDocumentDetail>(`/admin/content/documents/${documentId}/unquarantine`);
    return response.data;
  },
  deleteDocument: async (documentId: string, reason: string): Promise<AdminDocumentDetail> => {
    const response = await client.delete<AdminDocumentDetail>(`/admin/content/documents/${documentId}`, { data: { reason } });
    return response.data;
  },
  restoreDocument: async (documentId: string): Promise<AdminDocumentDetail> => {
    const response = await client.post<AdminDocumentDetail>(`/admin/content/documents/${documentId}/restore`);
    return response.data;
  },
  listQuestions: async (params: AdminQuestionListParams, signal?: AbortSignal): Promise<AdminQuestionListResponse> => {
    const response = await client.get<AdminQuestionListResponse>('/admin/content/questions', { params, signal });
    return response.data;
  },
  questionDetail: async (questionId: string, signal?: AbortSignal): Promise<AdminQuestionDetail> => {
    const response = await client.get<AdminQuestionDetail>(`/admin/content/questions/${questionId}`, { signal });
    return response.data;
  },
  updateQuestion: async (questionId: string, payload: AdminQuestionUpdatePayload): Promise<AdminQuestionDetail> => {
    const response = await client.patch<AdminQuestionDetail>(`/admin/content/questions/${questionId}`, payload);
    return response.data;
  },
  moderateQuestion: async (questionId: string, status: string, reason?: string): Promise<AdminQuestionDetail> => {
    const response = await client.post<AdminQuestionDetail>(`/admin/content/questions/${questionId}/moderate`, { status, reason });
    return response.data;
  },
  deleteQuestion: async (questionId: string, reason: string): Promise<AdminQuestionDetail> => {
    const response = await client.delete<AdminQuestionDetail>(`/admin/content/questions/${questionId}`, { data: { reason } });
    return response.data;
  },
  restoreQuestion: async (questionId: string): Promise<AdminQuestionDetail> => {
    const response = await client.post<AdminQuestionDetail>(`/admin/content/questions/${questionId}/restore`);
    return response.data;
  },
  regenerateQuestion: async (questionId: string, reason: string): Promise<{ detail?: string }> => {
    const response = await client.post(`/admin/content/questions/${questionId}/regenerate`, { reason });
    return response.data;
  },
  listExams: async (params: AdminExamListParams, signal?: AbortSignal): Promise<AdminExamListResponse> => {
    const response = await client.get<AdminExamListResponse>('/admin/content/exams', { params, signal });
    return response.data;
  },
};
