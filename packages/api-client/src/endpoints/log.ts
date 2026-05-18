import { apiClient } from '../client';
import type {
  DailyLog,
  LogEntry,
  MealSlot,
  AddLogEntryPayload,
  UpdateLogEntryPayload,
  CopyLogPayload,
} from '../nutrition';

export interface FrequentFood {
  foodId: number;
  name: string;
  brand: string | null;
  logCount: number;
  servingSizeId: number;
  servingLabel: string;
  servingGrams: number;
  caloriesPerServing: number;
  proteinPerServing: number;
  carbsPerServing: number;
  fatPerServing: number;
}

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

  logModifiedRecipe: (payload: {
    recipeId: number;
    meal: string;
    logDate?: string;
    name: string;
    calories: number;
    carbs_g: number;
    protein_g: number;
    fat_g: number;
    fiber_g?: number | null;
    sodium_mg?: number | null;
  }) =>
    apiClient.post<{ success: boolean }>('/log/recipe-modified', payload).then((r) => r.data),

  logInline: (payload: {
    name: string;
    meal: string;
    logDate?: string;
    calories: number;
    carbs_g: number;
    protein_g: number;
    fat_g: number;
    fiber_g?: number | null;
    sodium_mg?: number | null;
  }) =>
    apiClient.post<{ success: boolean }>('/log/inline', payload).then((r) => r.data),

  getFrequent: () =>
    apiClient.get<FrequentFood[]>('/log/frequent').then((r) => r.data),

  copyEntry: (entry: LogEntry, targetMeal: MealSlot, targetDate: string) =>
    apiClient.post<LogEntry>('/log', {
      logDate: targetDate,
      meal: targetMeal,
      foodId: entry.food.id,
      servingSizeId: entry.servingSize.id,
      quantity: entry.quantity,
      notes: entry.notes,
      dramRecipeId: entry.dramRecipeId,
    }).then((r) => r.data),
};
