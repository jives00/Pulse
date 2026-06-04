import { apiClient } from '../client';
import type { UserGoals, SaveGoalsPayload } from '../nutrition';
import type { TDEEResult } from './goals';

export interface NutritionSummary {
  date: string;
  weekStart: string;
  weekEnd: string;
  nutrition: {
    goals: {
      calories: number; carbsG: number; proteinG: number; fatG: number; waterGoalOz: number;
      weeklyCalories: number | null; weeklyProteinG: number | null; weeklyCarbsG: number | null;
      weeklyFatG: number | null; weeklyWaterGoalOz: number | null;
    } | null;
    actual: { calories: number; carbsG: number; proteinG: number; fatG: number };
  };
}

export const nutritionTargetsApi = {
  get: () =>
    apiClient.get<UserGoals>('/nutrition-targets').then((r) => r.data),

  save: (payload: SaveGoalsPayload) =>
    apiClient.post<UserGoals>('/nutrition-targets', payload).then((r) => r.data),

  saveWeekly: (data: { weeklyCalories?: number | null; weeklyProteinG?: number | null; weeklyCarbsG?: number | null; weeklyFatG?: number | null; weeklyWaterGoalOz?: number | null }) =>
    apiClient.patch('/nutrition-targets/weekly', data).then((r) => r.data),

  history: () =>
    apiClient.get<UserGoals[]>('/nutrition-targets/history').then((r) => r.data),

  getSummary: (date?: string) =>
    apiClient.get<NutritionSummary>('/nutrition-targets/summary', { params: date ? { date } : undefined }).then((r) => r.data),

  getTDEE: (date?: string) =>
    apiClient.get<TDEEResult>('/nutrition-targets/tdee', { params: date ? { date } : undefined }).then((r) => r.data),
};
