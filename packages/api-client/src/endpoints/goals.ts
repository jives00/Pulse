import { apiClient } from '../client';
import type { UserGoals, SaveGoalsPayload } from '../nutrition';

export const GLASS_OZ = 8;

export interface GoalsSummary {
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
  workouts: {
    goals: { workoutsPerWeek: number | null; minutesPerWeek: number | null; volumeLbsPerWeek: number | null } | null;
    actual: { workoutCount: number; totalMinutes: number };
  };
}

export interface TDEEBreakdown {
  available: true;
  bmr: number;
  neat: number;
  tef: number;
  exercise: number;
  total: number;
  caloriesIn: number;
}

export interface TDEEUnavailable {
  available: false;
  reason: 'profile_incomplete' | 'no_weight';
}

export type TDEEResult = TDEEBreakdown | TDEEUnavailable;

export interface ExerciseGoals {
  id?: number;
  workoutsPerWeek: number | null;
  minutesPerWeek: number | null;
  volumeLbsPerWeek: number | null;
}

export const goalsApi = {
  get: () =>
    apiClient.get<UserGoals>('/goals').then((r) => r.data),

  save: (payload: SaveGoalsPayload) =>
    apiClient.post<UserGoals>('/goals', payload).then((r) => r.data),

  history: () =>
    apiClient.get<UserGoals[]>('/goals/history').then((r) => r.data),

  getSummary: (date?: string) =>
    apiClient.get<GoalsSummary>('/goals/summary', { params: date ? { date } : undefined }).then((r) => r.data),

  saveNutrition: (data: { calories: number; carbsG: number; proteinG: number; fatG: number; waterGoalOz?: number }) =>
    apiClient.post('/goals', data).then(() => {}),

  saveWeeklyNutrition: (data: { weeklyCalories?: number | null; weeklyProteinG?: number | null; weeklyCarbsG?: number | null; weeklyFatG?: number | null; weeklyWaterGoalOz?: number | null }) =>
    apiClient.patch('/goals/weekly', data).then((r) => r.data),

  getExercise: () =>
    apiClient.get<ExerciseGoals>('/goals/exercise').then((r) => r.data),

  saveExercise: (data: { workoutsPerWeek?: number | null; minutesPerWeek?: number | null; volumeLbsPerWeek?: number | null }) =>
    apiClient.post<ExerciseGoals>('/goals/exercise', data).then((r) => r.data),

  getTDEE: (date?: string) =>
    apiClient.get<TDEEResult>('/goals/tdee', { params: date ? { date } : undefined }).then((r) => r.data),
};
