import axios from 'axios';
import { buildApiUrl, createApiConfigError, isApiBaseUrlConfigured } from '../config/api';

const client = axios.create({
  baseURL: isApiBaseUrlConfigured ? buildApiUrl('/api/v1') : undefined,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Interceptor to add Authorization header automatically
client.interceptors.request.use(
  (config) => {
    if (!isApiBaseUrlConfigured) {
      return Promise.reject(createApiConfigError());
    }

    const token = localStorage.getItem('access_token');
    if (token && config.headers) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Interceptor to handle authentication expiration (401 Unauthorized) and
// system-wide maintenance mode (503 Service Unavailable, error_code MAINTENANCE_MODE)
client.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response && error.response.status === 401) {
      localStorage.removeItem('access_token');
      // If we are not on login page, redirect to login page
      if (!window.location.pathname.endsWith('/login') && !window.location.pathname.endsWith('/register')) {
        window.location.href = '/login';
      }
    }
    if (
      error.response &&
      error.response.status === 503 &&
      error.response.data?.error_code === 'MAINTENANCE_MODE' &&
      !window.location.pathname.endsWith('/maintenance')
    ) {
      window.location.href = '/maintenance';
    }
    return Promise.reject(error);
  }
);

export default client;
