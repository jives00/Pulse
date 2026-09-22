import { apiClient } from '../client';
import type {
  Food,
  CreateFoodPayload,
  MacroEstimatePayload,
  MacroEstimateResult,
  MealEstimatePayload,
  MealEstimateResult,
} from '../nutrition';

export const foodsApi = {
  search: (q: string, limit = 20) =>
    apiClient.get<Food[]>('/foods/search', { params: { q, limit } }).then((r) => r.data),

  listCustom: () =>
    apiClient.get<Food[]>('/foods/custom').then((r) => r.data),

  lookupBarcode: (barcode: string) =>
    apiClient.get<Food>(`/foods/barcode/${barcode}`).then((r) => r.data),

  getById: (id: number) =>
    apiClient.get<Food>(`/foods/${id}`).then((r) => r.data),

  create: (payload: CreateFoodPayload) =>
    apiClient.post<Food>('/foods', payload).then((r) => r.data),

  update: (id: number, payload: Partial<CreateFoodPayload>) =>
    apiClient.put<Food>(`/foods/${id}`, payload).then((r) => r.data),

  // Per-100g values; works on non-custom (barcode/USDA) foods too.
  correctNutrition: (id: number, nutrition: Partial<Pick<Food['nutrition'], 'calories' | 'carbs' | 'protein' | 'fat'>>) =>
    apiClient.put<Food>(`/foods/${id}/nutrition`, nutrition).then((r) => r.data),

  delete: (id: number) =>
    apiClient.delete(`/foods/${id}`).then((r) => r.data),

  estimateMacros: (payload: MacroEstimatePayload) =>
    apiClient.post<MacroEstimateResult>('/foods/estimate-macros', payload).then((r) => r.data),

  // Totals for a described meal, not per-100g values.
  estimateMeal: (payload: MealEstimatePayload) =>
    apiClient.post<MealEstimateResult>('/foods/estimate-meal', payload).then((r) => r.data),
};
