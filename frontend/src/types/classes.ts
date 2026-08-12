export interface ClassSummary {
  id: string;
  name: string;
  description: string | null;
  owner_id: string;
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

export interface ClassAbilityGroup {
  cluster_id: number;
  size: number;
  student_ids: string[];
  /** Toạ độ tâm cụm: điểm phần trăm trung bình của nhóm ở từng bộ đề. */
  centroid: Record<string, number>;
  average_percent: number;
  weakest_set_id: string;
  strongest_set_id: string;
}

export interface ClassAbilityStudent {
  user_id: string;
  full_name: string;
  cluster_id: number | null;
  distance_to_centroid: number;
  average_percent: number;
  scores?: Record<string, number>;
  imputed_set_ids: string[];
  /** Nằm xa tâm nhóm của chính mình — dạy theo nhóm sẽ không trúng. */
  needs_attention: boolean;
}

export interface ClassAbilityGroupsResponse {
  status: 'ok' | 'insufficient_students' | 'clustering_unavailable';
  student_count: number;
  analyzed_count: number;
  min_students_required?: number;
  question_set_ids: string[];
  question_set_names: Record<string, string>;
  groups: ClassAbilityGroup[];
  students: ClassAbilityStudent[];
  clustering: {
    selected_k: number;
    silhouette_score: number;
    cluster_sizes: number[];
  } | null;
}
