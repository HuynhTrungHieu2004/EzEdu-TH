export interface ClassSummary {
  id: string;
  name: string;
  description: string | null;
  owner_id: string;
  class_code: string;
  student_count: number;
  created_at: string;
  updated_at: string | null;
}

export interface ClassMemberView {
  id: string;
  name: string;
  student_count: number;
}

export interface ClassStudentSummary {
  id: string;
  full_name: string;
  email: string;
}

export interface ClassDetail {
  id: string;
  name: string;
  description: string | null;
  owner_id: string;
  class_code: string;
  students: ClassStudentSummary[];
  created_at: string;
  updated_at: string | null;
}

export interface ClassListResponse {
  items: ClassSummary[];
}

export interface ClassMemberListResponse {
  items: ClassMemberView[];
}

export interface StudentSearchResult {
  id: string;
  full_name: string;
  email: string;
}

export interface StudentSearchResponse {
  items: StudentSearchResult[];
}

export interface ClassCreatePayload {
  name: string;
  description?: string;
}

export interface ClassUpdatePayload {
  name?: string;
  description?: string;
}
