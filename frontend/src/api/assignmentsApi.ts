import client from './client';
import type {
  Assignment,
  AssignmentCreate,
  AssignmentUpdate,
  StudentSubmission,
  SubmissionCreate,
  TeacherGrade,
} from '../types/courses';

export const assignmentsApi = {
  list: async (courseId?: string): Promise<Assignment[]> =>
    (await client.get<Assignment[]>('/assignments', { params: { course_id: courseId } })).data,

  create: async (body: AssignmentCreate): Promise<Assignment> =>
    (await client.post<Assignment>('/assignments', body)).data,

  update: async (id: string, body: AssignmentUpdate): Promise<Assignment> =>
    (await client.patch<Assignment>(`/assignments/${id}`, body)).data,

  delete: async (id: string): Promise<void> => {
    await client.delete(`/assignments/${id}`);
  },

  submit: async (id: string, body: SubmissionCreate): Promise<StudentSubmission> =>
    (await client.post<StudentSubmission>(`/assignments/${id}/submissions`, body)).data,

  listSubmissions: async (assignmentId?: string): Promise<StudentSubmission[]> =>
    (await client.get<StudentSubmission[]>('/submissions', { params: { assignment_id: assignmentId } })).data,

  getSubmission: async (id: string): Promise<StudentSubmission> =>
    (await client.get<StudentSubmission>(`/submissions/${id}`)).data,

  aiGrade: async (id: string): Promise<StudentSubmission> =>
    (await client.post<StudentSubmission>(`/submissions/${id}/ai-grade`)).data,

  teacherGrade: async (id: string, body: TeacherGrade): Promise<StudentSubmission> =>
    (await client.patch<StudentSubmission>(`/submissions/${id}/teacher-grade`, body)).data,
};
