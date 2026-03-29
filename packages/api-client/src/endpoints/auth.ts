import { apiClient } from '../client';
import type { AuthResponse, LoginPayload } from '../nutrition';

export const authApi = {
  login: (payload: LoginPayload) =>
    apiClient.post<AuthResponse>('/auth/login', payload).then((r) => r.data),

  verify: () =>
    apiClient.get<{ ok: true }>('/auth/verify').then((r) => r.data),
};
