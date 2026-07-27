export function apiErrorMessage(error: unknown, fallback: string) {
  if (typeof error === 'object' && error !== null) {
    const response = 'response' in error ? error.response : undefined;
    if (typeof response === 'object' && response !== null && 'data' in response) {
      const data = response.data;
      if (typeof data === 'object' && data !== null && 'detail' in data && typeof data.detail === 'string') {
        return data.detail;
      }
    }
    if ('message' in error && typeof error.message === 'string' && error.message.trim()) {
      return error.message;
    }
  }
  return fallback;
}

export function isCanceledError(error: unknown) {
  return typeof error === 'object' && error !== null && 'name' in error && error.name === 'CanceledError';
}
