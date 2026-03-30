import { apiClient } from '../client';
import type { UserGoals, SaveGoalsPayload } from '../nutrition';

export interface GoalsSummary {
  date: string;
  weekStart: string;
  weekEnd: string;
  nutrition: {
    goals: { calories: number; carbsG: number; proteinG: number; fatG: number } | null;
    actual: { calories: number; carbsG: number; proteinG: number; fatG: number };
  };
  workouts: {
    goals: { workoutsPerWeek: number | null; minutesPerWeek: number | null; volumeLbsPerWeek: number | null } | null;
    actual: { workoutCount: number; totalMinutes: number };
  };
}

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

  saveNutrition: (data: { calories: number; carbsG: number; proteinG: number; fatG: number }) =>
    apiClient.post('/goals', data).then(() => {}),

  getExercise: () =>
    apiClient.get<ExerciseGoals>('/goals/exercise').then((r) => r.data),

  saveExercise: (data: { workoutsPerWeek?: number | null; minutesPerWeek?: number | null; volumeLbsPerWeek?: number | null }) =>
    apiClient.post<ExerciseGoals>('/goals/exercise', data).then((r) => r.data),
};
