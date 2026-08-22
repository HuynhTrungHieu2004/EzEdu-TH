export type CourseStatus = 'draft' | 'published' | 'archived';
export type CourseEnrollmentStatus = 'not_started' | 'learning' | 'completed' | 'cancelled';
export type LessonStatus = 'draft' | 'published' | 'archived';
export type StudentLessonStatus = 'not_started' | 'learning' | 'completed';
export type AssignmentType = 'essay' | 'quiz' | 'practice';
export type SubmissionStatus = 'submitted' | 'ai_graded' | 'teacher_confirmed';

export interface CourseAttachment {
  id: string;
  name: string;
  type: 'video' | 'pdf' | 'document' | 'link';
  url: string;
  size?: string;
}

export interface Lesson {
  id: string;
  course_id: string;
  chapter_title: string;
  title: string;
  description: string;
  content: string;
  duration_mins: number;
  sort_order: number;
  status: LessonStatus;
  attachments: CourseAttachment[];
  student_status?: StudentLessonStatus;
  created_at: string;
  updated_at?: string | null;
}

export interface Course {
  id: string;
  code: string;
  title: string;
  description: string;
  thumbnail: string;
  subject: string;
  grade: string;
  teacher_ids: string[];
  teacher_id: string;
  teacher_name: string;
  assistant_teacher_id?: string;
  assistant_teacher_name?: string;
  goals: string[];
  syllabus_overview: string;
  lesson_count: number;
  assignment_count: number;
  exam_count: number;
  student_count: number;
  start_date: string;
  end_date: string;
  status: CourseStatus;
  created_at: string;
  updated_at?: string | null;
}

export interface CourseEnrollment {
  id: string;
  course_id: string;
  course_code: string;
  course_title: string;
  subject: string;
  grade: string;
  student_id: string;
  student_code: string;
  student_name: string;
  student_email: string;
  teacher_name: string;
  enrollment_date: string;
  status: CourseEnrollmentStatus;
  progress_pct: number;
  gpa_average: number;
  completed_lessons: number;
  total_lessons: number;
  last_activity_at?: string | null;
}

export interface Assignment {
  id: string;
  course_id: string;
  lesson_id?: string | null;
  course_title: string;
  title: string;
  description: string;
  instructions: string;
  assignment_type: AssignmentType;
  due_at: string;
  max_score: number;
  auto_grade: boolean;
  status: 'draft' | 'published' | 'archived';
  submitted_count: number;
  total_students: number;
  created_by: string;
  created_at: string;
  updated_at?: string | null;
}

export interface AIGradingResult {
  score: number;
  feedback: string;
  rubric: Array<Record<string, string | number>>;
}

export interface StudentSubmission {
  id: string;
  assignment_id: string;
  assignment_title: string;
  course_id: string;
  course_title: string;
  student_id: string;
  student_code: string;
  student_name: string;
  submitted_at: string;
  content: string;
  attachment_ids: string[];
  revision_count: number;
  status: 'submitted' | 'ai_grading' | 'ai_suggested' | 'grading_failed' | 'teacher_graded';
  ai_grade?: AIGradingResult | null;
  teacher_score?: number | null;
  teacher_feedback?: string | null;
  graded_by?: string | null;
  graded_at?: string | null;
  final_score?: number | null;
  grading_error?: string | null;
}

export interface AssignmentCreate {
  course_id: string;
  lesson_id?: string | null;
  title: string;
  description?: string;
  instructions?: string;
  assignment_type?: AssignmentType;
  due_at: string;
  max_score: number;
  auto_grade?: boolean;
  status?: Assignment['status'];
}

export type AssignmentUpdate = Partial<Omit<AssignmentCreate, 'course_id'>>;

export interface SubmissionCreate {
  content: string;
  attachment_ids?: string[];
}

export interface TeacherGrade {
  score: number;
  feedback: string;
}

export interface CourseStatSummary {
  total_courses: number;
  active_courses: number;
  total_teachers: number;
  total_students: number;
  total_enrollments: number;
  total_assignments: number;
  total_submissions: number;
  ai_graded_submissions: number;
}
