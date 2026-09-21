import { apiClient } from '../client';

export interface StepsDay { date: string; steps: number | null; source?: string; }

/**
 * One day in a bulk sync. `overwrite` means "this day is settled, trust the number" —
 * the client sets it only for the date it is currently living in. Every other day is
 * merged with GREATEST server-side, so a partial read can never clobber a full day.
 */
export interface StepsBulkDay { date: string; steps: number; overwrite?: boolean; }

export const stepsApi = {
  getDay: (date: string) =>
    apiClient.get<StepsDay>('/steps', { params: { date } }).then((r) => r.data),

  getHistory: (days = 60) =>
    apiClient.get<StepsDay[]>('/steps/history', { params: { days } }).then((r) => r.data),

  log: (date: string, steps: number, source?: string) =>
    apiClient.post<StepsDay>('/steps', { date, steps, source: source ?? 'manual' }).then((r) => r.data),

  logBulk: (days: StepsBulkDay[], source = 'health_connect') =>
    apiClient.post<{ written: number }>('/steps/bulk', { days, source }).then((r) => r.data),
};
