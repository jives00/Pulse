import axios, { AxiosInstance, InternalAxiosRequestConfig } from 'axios';

let _apiBase = '/api';
let _getToken: (() => string | null) | null = null;
let _onUnauthorized: (() => void) | null = null;

export function configureClient(options: {
  apiBase?: string;
  getToken: () => string | null;
  onUnauthorized?: () => void;
}) {
  if (options.apiBase) _apiBase = options.apiBase;
  _getToken = options.getToken;
  _onUnauthorized = options.onUnauthorized ?? null;
}

export const apiClient: AxiosInstance = axios.create({
  baseURL: _apiBase,
  headers: { 'Content-Type': 'application/json' },
});

// Attach Bearer token on every request
apiClient.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  const token = _getToken?.();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  // Pick up dynamic baseURL changes (e.g. mobile sets it from env)
  config.baseURL = _apiBase;
  return config;
});

// Handle 401 globally
apiClient.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401 && _onUnauthorized) {
      _onUnauthorized();
    }
    const serverMessage = err.response?.data?.error;
    if (serverMessage) {
      err.message = serverMessage;
    }
    return Promise.reject(err);
  }
);
