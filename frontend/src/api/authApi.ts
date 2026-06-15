import client from './client';
import type { Token, UserResponse } from '../types/auth';

export const authApi = {
  register: async (userData: any): Promise<UserResponse> => {
    const response = await client.post<UserResponse>('/auth/register', userData);
    return response.data;
  },

  login: async (credentials: any): Promise<Token> => {
    const response = await client.post<Token>('/auth/login', credentials);
    return response.data;
  },

  getMe: async (): Promise<UserResponse> => {
    const response = await client.get<UserResponse>('/auth/me');
    return response.data;
  },
};
