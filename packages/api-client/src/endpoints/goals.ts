import { apiClient } from '../client';
import type { UserGoals, SaveGoalsPayload } from '../types';

export const goalsApi = {
  get: () =>
    apiClient.get<UserGoals>('/goals').then((r) => r.data),

  save: (payload: SaveGoalsPayload) =>
    apiClient.post<UserGoals>('/goals', payload).then((r) => r.data),

  history: () =>
    apiClient.get<UserGoals[]>('/goals/history').then((r) => r.data),
};
