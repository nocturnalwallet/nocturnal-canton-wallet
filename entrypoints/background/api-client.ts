import axios from 'axios';
import { sessionStore } from '@lib/storage';
import { refreshAuthTokenOnce } from '@lib/auth-refresh';
import { extractApiErrorMessage } from '@lib/api-error';

let currentBaseUrl = '';

export function setApiBaseUrl(url: string): void {
  currentBaseUrl = url;
  apiClient.defaults.baseURL = url;
}

export function getApiBaseUrl(): string {
  return currentBaseUrl;
}

const apiClient = axios.create({
  baseURL: currentBaseUrl,
  headers: { 'Content-Type': 'application/json' },
});

apiClient.interceptors.request.use(async (config) => {
  const token = await sessionStore.get('authToken');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

apiClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;
    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true;
      const newToken = await refreshAuthTokenOnce(currentBaseUrl);
      if (newToken) {
        originalRequest.headers.Authorization = `Bearer ${newToken}`;
        return apiClient(originalRequest);
      }
    }
    // Prefer backend `{ message }` over Axios's "Request failed with status code N"
    // so popup handlers that surface `error.message` show actionable text
    // (e.g. insufficient balance on /transfer-offer/prepare).
    const apiMessage = extractApiErrorMessage(error.response?.data);
    if (apiMessage) {
      error.message = apiMessage;
    }
    return Promise.reject(error);
  },
);

export default apiClient;
