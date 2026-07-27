const viteEnv = (import.meta as ImportMeta & { env?: Record<string, string | undefined> }).env ?? {};
const rawApiBaseUrl = viteEnv.VITE_API_BASE_URL?.trim() ?? '';

export const API_BASE_URL = rawApiBaseUrl.replace(/\/+$/, '');
export const isApiBaseUrlConfigured = API_BASE_URL.length > 0;

export function createApiConfigError() {
  return new Error('VITE_API_BASE_URL is not configured');
}

export function buildApiUrl(path: string) {
  if (!isApiBaseUrlConfigured) {
    throw createApiConfigError();
  }

  return `${API_BASE_URL}${path.startsWith('/') ? path : `/${path}`}`;
}
