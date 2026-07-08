import axios, { AxiosInstance, InternalAxiosRequestConfig } from 'axios';

let _apiBase = '/api';
let _getToken: (() => string | null) | null = null;
let _onUnauthorized: (() => void) | null = null;
// Optional (mobile): resolve the reachable base URL for each request (cached after the
// first probe). Returns null when nothing is reachable, so the request fails fast instead
// of hanging on a dead base. Web leaves this unset (uses the fixed same-origin base).
let _baseResolver: (() => Promise<string | null>) | null = null;
// Optional (mobile): on a network error, re-resolve a reachable base URL and retry once.
let _resolveBaseOnError: (() => Promise<string | null>) | null = null;

export function configureClient(options: {
  apiBase?: string;
  getToken: () => string | null;
  onUnauthorized?: () => void;
  baseResolver?: () => Promise<string | null>;
  resolveBaseOnError?: () => Promise<string | null>;
}) {
  if (options.apiBase) _apiBase = options.apiBase;
  _getToken = options.getToken;
  _onUnauthorized = options.onUnauthorized ?? null;
  _baseResolver = options.baseResolver ?? null;
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

// Attach Bearer token and resolve a reachable base URL on every request
apiClient.interceptors.request.use(async (config: InternalAxiosRequestConfig) => {
  const token = _getToken?.();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  // Mobile: pick the reachable base (Tailscale ↔ LAN) before sending. Fail fast when
  // nothing is reachable rather than hanging on a dead host. Cached after first probe.
  if (_baseResolver) {
    const base = await _baseResolver();
    if (!base) throw new Error("Can't reach the server (off-network without Tailscale?)");
    _apiBase = base;
  }
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
