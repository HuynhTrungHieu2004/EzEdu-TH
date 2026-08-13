import client from './client';
import type { GoogleLoginResponse, Token, UserResponse } from '../types/auth';

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

export const authApi = {
  register: async (userData: RegisterPayload): Promise<UserResponse> => {
    const response = await client.post<UserResponse>('/auth/register', userData);
    return response.data;
  },

  login: async (credentials: LoginPayload): Promise<Token> => {
    const response = await client.post<Token>('/auth/login', credentials);
    return response.data;
  },

  getMe: async (): Promise<UserResponse> => {
    const response = await client.get<UserResponse>('/auth/me');
    return response.data;
  },

  loginWithGoogle: async (payload: {
    id_token: string;
    role?: 'student' | 'lecturer';
  }): Promise<GoogleLoginResponse> => {
    const response = await client.post<GoogleLoginResponse>('/auth/google', payload);
    return response.data;
  },
};
