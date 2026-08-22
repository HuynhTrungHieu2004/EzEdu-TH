import client from './client';
import type { Token, UserResponse } from '../types/auth';

export interface RegisterPayload {
  email: string;
  full_name: string;
  password: string;
  role?: 'student' | 'lecturer';
}

export interface LoginPayload {
  email: string;
  password: string;
}

export type BypassRole = 'teacher' | 'student' | 'admin';
export type SocialRole = 'student' | 'lecturer';
export interface SocialLoginResponse {
  needs_role: boolean;
  access_token?: string | null;
  token_type: string;
  email?: string | null;
  full_name?: string | null;
}

const viteEnv = (import.meta as ImportMeta & { env?: Record<string, string | undefined> }).env ?? {};
const demoPassword = viteEnv.VITE_DEMO_PASSWORD?.trim();

const DEMO_EMAILS: Record<BypassRole, string> = {
  teacher: 'giaovien.demo@ezedu.vn',
  student: 'hocsinh.demo@ezedu.vn',
  admin: 'admin.demo@ezedu.vn',
};

export const isDemoLoginConfigured = Boolean(demoPassword);

export const authApi = {
  register: async (userData: RegisterPayload): Promise<UserResponse> => {
    const response = await client.post<UserResponse>('/auth/register', userData);
    return response.data;
  },

  login: async (credentials: LoginPayload): Promise<Token> => {
    const response = await client.post<Token>('/auth/login', credentials);
    return response.data;
  },

  forgotPassword: async (email: string): Promise<{ message: string }> =>
    (await client.post<{ message: string }>('/auth/forgot-password', { email })).data,

  resetPassword: async (token: string, newPassword: string): Promise<{ message: string }> =>
    (await client.post<{ message: string }>('/auth/reset-password', { token, new_password: newPassword })).data,

  verifyEmail: async (token: string): Promise<{ message: string }> =>
    (await client.post<{ message: string }>('/auth/verify-email', { token })).data,

  resendVerification: async (): Promise<{ message: string }> =>
    (await client.post<{ message: string }>('/auth/resend-verification')).data,

  googleLogin: async (idToken: string, role?: SocialRole): Promise<SocialLoginResponse> =>
    (await client.post<SocialLoginResponse>('/auth/google', { id_token: idToken, role })).data,

  facebookLogin: async (accessToken: string, role?: SocialRole): Promise<SocialLoginResponse> =>
    (await client.post<SocialLoginResponse>('/auth/facebook', { access_token: accessToken, role })).data,

  bypassLogin: async (role: BypassRole = 'teacher'): Promise<{ token: Token; user: UserResponse }> => {
    if (!demoPassword) throw new Error('Demo login is not configured.');
    const token = await authApi.login({ email: DEMO_EMAILS[role], password: demoPassword });
    localStorage.setItem('access_token', token.access_token);
    return { token, user: await authApi.getMe() };
  },

  getMe: async (): Promise<UserResponse> => {
    const response = await client.get<UserResponse>('/auth/me');
    return response.data;
  },
};
