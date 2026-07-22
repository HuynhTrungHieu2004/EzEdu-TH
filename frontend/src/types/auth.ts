export interface UserResponse {
  id: string;
  email: string;
  full_name: string;
  role?: 'user' | 'student' | 'lecturer' | 'admin';
  created_at: string;
}

export interface Token {
  access_token: string;
  token_type: string;
}
