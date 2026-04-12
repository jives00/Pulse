import { apiClient } from '../client';

export type ActivityLevel = 'sedentary' | 'lightly_active' | 'moderately_active' | 'very_active';

export interface UserProfile {
  heightCm: number | null;
  sex: 'male' | 'female' | null;
  dob: string | null;       // YYYY-MM-DD
  activityLevel: ActivityLevel;
}

export const profileApi = {
  get: () =>
    apiClient.get<UserProfile>('/auth/profile').then((r) => r.data),

  update: (payload: Partial<UserProfile>) =>
    apiClient.put<{ ok: boolean }>('/auth/profile', payload).then((r) => r.data),
};
