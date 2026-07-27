import client from './client';
import type {
  ClassCreatePayload,
  ClassDetail,
  ClassListResponse,
  ClassMemberListResponse,
  ClassSummary,
  ClassUpdatePayload,
  StudentSearchResponse,
} from '../types/classes';

export const classesApi = {
  /** Lecturer/admin: classes I own. */
  list: async (signal?: AbortSignal): Promise<ClassListResponse> => {
    const response = await client.get<ClassListResponse>('/classes', { signal });
    return response.data;
  },

  /** Student: classes I belong to. */
  listMine: async (signal?: AbortSignal): Promise<ClassMemberListResponse> => {
    const response = await client.get<ClassMemberListResponse>('/classes/mine', { signal });
    return response.data;
  },

  searchStudents: async (q: string, signal?: AbortSignal): Promise<StudentSearchResponse> => {
    const response = await client.get<StudentSearchResponse>('/classes/search-students', {
      params: { q },
      signal,
    });
    return response.data;
  },

  detail: async (classId: string, signal?: AbortSignal): Promise<ClassDetail> => {
    const response = await client.get<ClassDetail>(`/classes/${classId}`, { signal });
    return response.data;
  },

  create: async (payload: ClassCreatePayload): Promise<ClassSummary> => {
    const response = await client.post<ClassSummary>('/classes', payload);
    return response.data;
  },

  update: async (classId: string, payload: ClassUpdatePayload): Promise<ClassSummary> => {
    const response = await client.patch<ClassSummary>(`/classes/${classId}`, payload);
    return response.data;
  },

  remove: async (classId: string): Promise<void> => {
    await client.delete(`/classes/${classId}`);
  },

  addStudents: async (classId: string, studentIds: string[]): Promise<ClassDetail> => {
    const response = await client.post<ClassDetail>(`/classes/${classId}/students`, { student_ids: studentIds });
    return response.data;
  },

  removeStudent: async (classId: string, studentId: string): Promise<ClassDetail> => {
    const response = await client.delete<ClassDetail>(`/classes/${classId}/students/${studentId}`);
    return response.data;
  },
};
