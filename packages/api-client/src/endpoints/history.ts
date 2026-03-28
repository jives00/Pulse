import { apiClient } from '../client';
import type { DailyHistoryEntry, WeeklyHistoryEntry } from '../types';

export const historyApi = {
  daily: (start: string, end: string) =>
    apiClient
      .get<DailyHistoryEntry[]>('/history/daily', { params: { start, end } })
      .then((r) => r.data),

  weekly: (year: number, week?: number) =>
    apiClient
      .get<WeeklyHistoryEntry[]>('/history/weekly', { params: { year, week } })
      .then((r) => r.data),

  monthly: (year: number, month?: number) =>
    apiClient
      .get<WeeklyHistoryEntry[]>('/history/monthly', { params: { year, month } })
      .then((r) => r.data),
};
