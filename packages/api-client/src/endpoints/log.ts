import { apiClient } from '../client';
import type {
  DailyLog,
  LogEntry,
  AddLogEntryPayload,
  UpdateLogEntryPayload,
  CopyLogPayload,
} from '../nutrition';

export interface FoodLogHistoryEntry {
  id: number;
  meal: string;
  foodName: string;
  brand: string | null;
  servingLabel: string;
  quantity: number;
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
}

export interface FoodLogHistoryDay {
  date: string;
  calories: number;
  protein: number;
  entries: FoodLogHistoryEntry[];
}

export const logApi = {
  getDay: (date: string) =>
    apiClient.get<DailyLog>('/log', { params: { date } }).then((r) => r.data),

  getHistory: (limit = 90) =>
    apiClient.get<FoodLogHistoryDay[]>('/log/history', { params: { limit } }).then((r) => r.data),

  add: (payload: AddLogEntryPayload) =>
    apiClient.post<LogEntry>('/log', payload).then((r) => r.data),

  update: (id: number, payload: UpdateLogEntryPayload) =>
    apiClient.put<LogEntry>(`/log/${id}`, payload).then((r) => r.data),

  delete: (id: number) =>
    apiClient.delete(`/log/${id}`).then((r) => r.data),

  copy: (payload: CopyLogPayload) =>
    apiClient.post<{ copied: number }>('/log/copy', payload).then((r) => r.data),

  logRecipe: (payload: { recipeId: number; meal: string; servings: number; logDate?: string }) =>
    apiClient.post<{ success: boolean }>('/log/recipe', payload).then((r) => r.data),
};
