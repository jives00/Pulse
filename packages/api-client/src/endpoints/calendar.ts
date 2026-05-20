import { apiClient } from '../client';

export type MealSlotType = 'breakfast' | 'lunch' | 'dinner' | 'snack';
export type MealRecurrenceType = 'once' | 'daily' | 'every_other_day' | 'days_of_week' | 'every_x_days' | 'day_of_month';

export interface GoalCheckpoint {
  id: number;
  metric: string;
  targetValue: number;
  unit: string;
  targetDate: string;
  notes: string | null;
}

export interface DayTypePreset {
  id: number;
  name: string;
  calories: number | null;
  proteinG: number | null;
  carbsG: number | null;
  fatG: number | null;
  waterGoalOz: number | null;
}

export interface DailyNutritionOverride {
  date: string;
  dayTypeId: number | null;
  dayTypeName: string | null;
  calories: number | null;
  proteinG: number | null;
  carbsG: number | null;
  fatG: number | null;
  waterGoalOz: number | null;
}

export interface MealSchedule {
  id: number;
  mealSlot: MealSlotType | null;
  label: string;
  foodId?: number | null;
  servingSizeId?: number | null;
  quantity?: number | null;
  recipeId?: number | null;
  recipeServings?: number | null;
  recurrenceType: MealRecurrenceType;
  recurrenceConfig: any;
  recurrenceDescription: string;
  startDate: string;
  endDate: string | null;
}

export interface MealScheduleEvent {
  date: string;
  scheduleId: number;
  mealSlot: MealSlotType | null;
  label: string;
  calories?: number | null;
  proteinG?: number | null;
  carbsG?: number | null;
  fatG?: number | null;
}

export const goalCheckpointsApi = {
  getAll: () =>
    apiClient.get<GoalCheckpoint[]>('/goal-checkpoints').then((r) => r.data),
  create: (data: Omit<GoalCheckpoint, 'id'>) =>
    apiClient.post<GoalCheckpoint>('/goal-checkpoints', data).then((r) => r.data),
  update: (id: number, data: Omit<GoalCheckpoint, 'id'>) =>
    apiClient.put<GoalCheckpoint>(`/goal-checkpoints/${id}`, data).then((r) => r.data),
  delete: (id: number) =>
    apiClient.delete(`/goal-checkpoints/${id}`).then(() => {}),
};

export const dayTypesApi = {
  getPresets: () =>
    apiClient.get<DayTypePreset[]>('/day-types/presets').then((r) => r.data),
  createPreset: (data: Omit<DayTypePreset, 'id'>) =>
    apiClient.post<DayTypePreset>('/day-types/presets', data).then((r) => r.data),
  updatePreset: (id: number, data: Omit<DayTypePreset, 'id'>) =>
    apiClient.put<DayTypePreset>(`/day-types/presets/${id}`, data).then((r) => r.data),
  deletePreset: (id: number) =>
    apiClient.delete(`/day-types/presets/${id}`).then(() => {}),

  getOverrides: (from: string, to: string) =>
    apiClient.get<DailyNutritionOverride[]>('/day-types/overrides', { params: { from, to } }).then((r) => r.data),
  upsertOverride: (date: string, data: Omit<DailyNutritionOverride, 'date' | 'dayTypeName'>) =>
    apiClient.put<DailyNutritionOverride>(`/day-types/overrides/${date}`, data).then((r) => r.data),
  deleteOverride: (date: string) =>
    apiClient.delete(`/day-types/overrides/${date}`).then(() => {}),
};

export interface NutritionSchedule {
  id: number;
  dayTypeId: number | null;
  calories: number | null;
  proteinG: number | null;
  carbsG: number | null;
  fatG: number | null;
  waterGoalOz: number | null;
  recurrenceType: MealRecurrenceType;
  recurrenceConfig: any;
  recurrenceDescription: string;
  startDate: string;
  endDate: string | null;
}

export interface NutritionScheduleEvent {
  date: string;
  scheduleId: number;
  dayTypeId: number | null;
  dayTypeName: string | null;
  calories: number | null;
  proteinG: number | null;
  carbsG: number | null;
  fatG: number | null;
  waterGoalOz: number | null;
  recurrenceDescription: string;
}

export const nutritionSchedulesApi = {
  getAll: () =>
    apiClient.get<NutritionSchedule[]>('/nutrition-schedules').then((r) => r.data),
  getUpcoming: (days = 60) =>
    apiClient.get<NutritionScheduleEvent[]>(`/nutrition-schedules/upcoming?days=${days}`).then((r) => r.data),
  create: (data: { dayTypeId?: number | null; calories?: number | null; proteinG?: number | null; carbsG?: number | null; fatG?: number | null; waterGoalOz?: number | null; recurrenceType: MealRecurrenceType; recurrenceConfig: any; startDate: string; endDate?: string | null }) =>
    apiClient.post<NutritionSchedule>('/nutrition-schedules', data).then((r) => r.data),
  update: (id: number, data: Partial<NutritionSchedule>) =>
    apiClient.put<NutritionSchedule>(`/nutrition-schedules/${id}`, data).then((r) => r.data),
  delete: (id: number) =>
    apiClient.delete(`/nutrition-schedules/${id}`).then(() => {}),
};

export const mealSchedulesApi = {
  getAll: () =>
    apiClient.get<MealSchedule[]>('/meal-schedules').then((r) => r.data),
  getUpcoming: (days = 30) =>
    apiClient.get<MealScheduleEvent[]>(`/meal-schedules/upcoming?days=${days}`).then((r) => r.data),
  create: (data: {
    mealSlot?: MealSlotType | null;
    label: string;
    foodId?: number | null;
    servingSizeId?: number | null;
    quantity?: number | null;
    recipeId?: number | null;
    recipeServings?: number | null;
    calories?: number | null;
    proteinG?: number | null;
    carbsG?: number | null;
    fatG?: number | null;
    recurrenceType: MealRecurrenceType;
    recurrenceConfig: any;
    startDate: string;
    endDate?: string | null;
  }) =>
    apiClient.post<MealSchedule>('/meal-schedules', data).then((r) => r.data),
  update: (id: number, data: Partial<{
    mealSlot: MealSlotType | null;
    label: string;
    foodId: number | null;
    servingSizeId: number | null;
    quantity: number | null;
    recipeId: number | null;
    recipeServings: number | null;
    recurrenceType: MealRecurrenceType;
    recurrenceConfig: any;
    startDate: string;
    endDate: string | null;
  }>) =>
    apiClient.put<MealSchedule>(`/meal-schedules/${id}`, data).then((r) => r.data),
  delete: (id: number) =>
    apiClient.delete(`/meal-schedules/${id}`).then(() => {}),
};
