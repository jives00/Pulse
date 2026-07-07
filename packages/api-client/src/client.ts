import axios, { AxiosInstance, InternalAxiosRequestConfig } from 'axios';

let _apiBase = '/api';
let _getToken: (() => string | null) | null = null;
let _onUnauthorized: (() => void) | null = null;
// Optional (mobile): on a network error, re-resolve a reachable base URL to retry with.
// Returns the new base, or null if nothing is reachable. Web leaves this unset.
let _resolveBaseOnError: (() => Promise<string | null>) | null = null;

export function configureClient(options: {
  apiBase?: string;
  getToken: () => string | null;
  onUnauthorized?: () => void;
  resolveBaseOnError?: () => Promise<string | null>;
}) {
  if (options.apiBase) _apiBase = options.apiBase;
  _getToken = options.getToken;
  _onUnauthorized = options.onUnauthorized ?? null;
  _resolveBaseOnError = options.resolveBaseOnError ?? null;
}

// Point the client at a different base URL at runtime (mobile LAN/Tailscale fallback).
export function setApiBase(base: string) {
  _apiBase = base;
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

// Handle network errors (re-resolve base + retry once) and 401 globally
apiClient.interceptors.response.use(
  (res) => res,
  async (err) => {
    const config = err.config as (InternalAxiosRequestConfig & { __baseRetried?: boolean }) | undefined;
    // Network error (no HTTP response) — the cached base may be unreachable (network
    // changed / Tailscale toggled). Let the app re-resolve a base and retry once.
    if (!err.response && _resolveBaseOnError && config && !config.__baseRetried) {
      const newBase = await _resolveBaseOnError();
      if (newBase) {
        _apiBase = newBase;
        config.__baseRetried = true;
        config.baseURL = newBase;
        return apiClient(config);
      }
    }
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
