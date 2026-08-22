export interface UserResponse {
  id: string;
  email: string;
  full_name: string;
  role?: 'user' | 'student' | 'lecturer' | 'analyst' | 'support' | 'moderator' | 'admin' | 'super_admin';
  status?: 'active' | 'locked' | 'deleted';
  student_profile_completed?: boolean;
  is_active?: boolean;
  permissions_override?: string[];
  created_at: string;
  updated_at?: string | null;
  last_login_at?: string | null;
  deleted_at?: string | null;
}

export interface Token {
  access_token: string;
  token_type: string;
}
