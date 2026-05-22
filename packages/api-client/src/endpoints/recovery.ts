import { apiClient } from '../client';

export type RecoveryLevel = 'high' | 'medium' | 'low';

export interface RecoveryData {
  level: RecoveryLevel;
  score: number;
  hint: string;
}

export const recoveryApi = {
  get: (): Promise<RecoveryData> =>
    apiClient.get<RecoveryData>('/recovery').then((r) => r.data),
};
