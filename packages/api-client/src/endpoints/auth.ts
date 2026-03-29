import { apiClient } from '../client';
import type { AuthResponse, LoginPayload } from '../nutrition';

export type DeleteScope = 'recipes' | 'history' | 'workouts' | 'goals' | 'links';

export const authApi = {
  login: (payload: LoginPayload) =>
    apiClient.post<AuthResponse>('/auth/login', payload).then((r) => r.data),

  verify: () =>
    apiClient.get<{ ok: true }>('/auth/verify').then((r) => r.data),

  changeUsername: (payload: { newUsername: string; currentPassword: string }) =>
    apiClient.put<{ token: string }>('/auth/username', payload).then((r) => r.data),

  changePassword: (payload: { currentPassword: string; newPassword: string }) =>
    apiClient.put<{ token: string }>('/auth/password', payload).then((r) => r.data),

  deleteData: (scope: DeleteScope) =>
    apiClient.delete<{ ok: boolean }>(`/auth/data?scope=${scope}`).then((r) => r.data),
};
