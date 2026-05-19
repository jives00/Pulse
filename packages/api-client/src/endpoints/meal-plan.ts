import { apiClient } from '../client';
import type { MealSlot } from '../nutrition';

export type MealPlanEntryType = 'food' | 'recipe';

export interface MealPlanEntry {
  id: number;
  type: MealPlanEntryType;
  name: string;
  foodId?: number;
  servingSizeId?: number;
  servingLabel?: string;
  quantity?: number;
  recipeId?: number;
  recipeServings?: number;
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  sortOrder: number;
}

export interface MealPlanDayTotals {
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
}

export interface MealPlanDay {
  date: string;
  dayLabel: string;
  meals: Record<MealSlot, MealPlanEntry[]>;
  totals: MealPlanDayTotals;
}

export interface MealPlanWeek {
  weekStart: string;
  days: MealPlanDay[];
}

export interface MealPlanTemplate {
  id: number;
  name: string;
  createdAt: string;
}

export interface AddFoodEntryPayload {
  planDate: string;
  meal: MealSlot;
  foodId: number;
  servingSizeId: number;
  quantity: number;
}

export interface AddRecipeEntryPayload {
  planDate: string;
  meal: MealSlot;
  recipeId: number;
  recipeServings: number;
}

export const mealPlanApi = {
  getWeek: (weekStart: string) =>
    apiClient.get<MealPlanWeek>('/meal-plan', { params: { week: weekStart } }).then((r) => r.data),

  addFoodEntry: (payload: AddFoodEntryPayload) =>
    apiClient.post<MealPlanEntry>('/meal-plan/entries', payload).then((r) => r.data),

  addRecipeEntry: (payload: AddRecipeEntryPayload) =>
    apiClient.post<MealPlanEntry>('/meal-plan/entries', payload).then((r) => r.data),

  deleteEntry: (id: number) =>
    apiClient.delete(`/meal-plan/entries/${id}`).then((r) => r.data),

  getTemplates: () =>
    apiClient.get<MealPlanTemplate[]>('/meal-plan/templates').then((r) => r.data),

  saveTemplate: (name: string, weekStart: string) =>
    apiClient.post<{ id: number; name: string }>('/meal-plan/templates', { name, weekStart }).then((r) => r.data),

  applyTemplate: (id: number, weekStart: string) =>
    apiClient.post<{ applied: number }>(`/meal-plan/templates/${id}/apply`, { weekStart }).then((r) => r.data),

  deleteTemplate: (id: number) =>
    apiClient.delete(`/meal-plan/templates/${id}`).then((r) => r.data),
};
