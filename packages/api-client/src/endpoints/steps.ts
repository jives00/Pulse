import { apiClient } from '../client';

export interface StepsDay { date: string; steps: number | null; source?: string; }

export const stepsApi = {
  getDay: (date: string) =>
    apiClient.get<StepsDay>('/steps', { params: { date } }).then((r) => r.data),

  getHistory: (days = 60) =>
    apiClient.get<StepsDay[]>('/steps/history', { params: { days } }).then((r) => r.data),

  log: (date: string, steps: number, source?: string) =>
    apiClient.post<StepsDay>('/steps', { date, steps, source: source ?? 'manual' }).then((r) => r.data),
};
