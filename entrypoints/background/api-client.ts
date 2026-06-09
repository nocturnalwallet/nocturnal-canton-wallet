import axios from 'axios';
import { sessionStore } from '@lib/storage';
import { refreshAuthTokenOnce } from '@lib/auth-refresh';

let currentBaseUrl = import.meta.env.VITE_API_BASE_URL ?? '';

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
    return Promise.reject(error);
  },
);

export default apiClient;
