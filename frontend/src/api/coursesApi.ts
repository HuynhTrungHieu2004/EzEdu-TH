import client from './client';
import type {
  Course,
  CourseEnrollment,
  CourseStatSummary,
  Lesson,
} from '../types/courses';

const coursePayload = (payload: Partial<Course>) => ({
  ...payload,
  teacher_ids: payload.teacher_ids ?? (payload.teacher_id ? [payload.teacher_id] : undefined),
});

export const coursesApi = {
  getStats: async (): Promise<CourseStatSummary> =>
    (await client.get<CourseStatSummary>('/courses/statistics')).data,

  getAllCourses: async (): Promise<Course[]> =>
    (await client.get<Course[]>('/courses')).data,

  getCourseById: async (id: string): Promise<Course> =>
    (await client.get<Course>(`/courses/${id}`)).data,

  createCourse: async (payload: Partial<Course>): Promise<Course> =>
    (await client.post<Course>('/courses', coursePayload(payload))).data,

  updateCourse: async (id: string, payload: Partial<Course>): Promise<Course> =>
    (await client.patch<Course>(`/courses/${id}`, coursePayload(payload))).data,

  deleteCourse: async (id: string): Promise<void> => {
    await client.delete(`/courses/${id}`);
  },

  getEnrollments: async (courseId?: string): Promise<CourseEnrollment[]> =>
    (await client.get<CourseEnrollment[]>(courseId ? `/courses/${courseId}/enrollments` : '/courses/enrollments')).data,

  getStudentEnrollments: async (studentId?: string): Promise<CourseEnrollment[]> => {
    void studentId;
    return (await client.get<CourseEnrollment[]>('/courses/mine')).data;
  },

  createEnrollment: async (payload: Partial<CourseEnrollment>): Promise<CourseEnrollment> =>
    (await client.post<CourseEnrollment>(`/courses/${payload.course_id}/enrollments`, {
      student_id: payload.student_id,
    })).data,

  removeEnrollment: async (id: string): Promise<void> => {
    await client.delete(`/courses/enrollments/${id}`);
  },

  getLessons: async (courseId: string): Promise<Lesson[]> =>
    (await client.get<Lesson[]>(`/courses/${courseId}/lessons`)).data,

  createLesson: async (payload: Partial<Lesson>): Promise<Lesson> => {
    const { course_id: courseId, ...body } = payload;
    return (await client.post<Lesson>(`/courses/${courseId}/lessons`, body)).data;
  },

  updateLesson: async (courseId: string, lessonId: string, payload: Partial<Lesson>): Promise<Lesson> =>
    (await client.patch<Lesson>(`/courses/${courseId}/lessons/${lessonId}`, payload)).data,

  deleteLesson: async (courseId: string, lessonId: string): Promise<void> => {
    await client.delete(`/courses/${courseId}/lessons/${lessonId}`);
  },
};
