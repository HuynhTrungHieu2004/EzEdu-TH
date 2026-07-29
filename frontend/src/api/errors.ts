import axios from 'axios';

interface ApiErrorPayload {
  detail?: unknown;
}

export function getApiErrorDetail(error: unknown) {
  if (!axios.isAxiosError<ApiErrorPayload>(error)) {
    return undefined;
  }

  const detail = error.response?.data?.detail;
  return typeof detail === 'string' ? detail : undefined;
}

export function isUnauthorizedError(error: unknown) {
  return axios.isAxiosError(error) && error.response?.status === 401;
}

export function getApiErrorStatus(error: unknown) {
  return axios.isAxiosError(error) ? error.response?.status : undefined;
}

export async function getBlobErrorDetail(error: unknown) {
  if (!axios.isAxiosError(error)) {
    return undefined;
  }

  const data = error.response?.data;
  if (!(data instanceof Blob)) {
    return getApiErrorDetail(error);
  }

  try {
    const payload = JSON.parse(await data.text()) as ApiErrorPayload;
    return typeof payload.detail === 'string' ? payload.detail : undefined;
  } catch {
    return undefined;
  }
}
