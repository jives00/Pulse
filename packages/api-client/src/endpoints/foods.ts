import { apiClient } from '../client';
import type {
  Food,
  CreateFoodPayload,
  MacroEstimatePayload,
  MacroEstimateResult,
} from '../types';

export const foodsApi = {
  search: (q: string, limit = 20) =>
    apiClient.get<Food[]>('/foods/search', { params: { q, limit } }).then((r) => r.data),

  lookupBarcode: (barcode: string) =>
    apiClient.get<Food>(`/foods/barcode/${barcode}`).then((r) => r.data),

  getById: (id: number) =>
    apiClient.get<Food>(`/foods/${id}`).then((r) => r.data),

  create: (payload: CreateFoodPayload) =>
    apiClient.post<Food>('/foods', payload).then((r) => r.data),

  update: (id: number, payload: Partial<CreateFoodPayload>) =>
    apiClient.put<Food>(`/foods/${id}`, payload).then((r) => r.data),

  delete: (id: number) =>
    apiClient.delete(`/foods/${id}`).then((r) => r.data),

  estimateMacros: (payload: MacroEstimatePayload) =>
    apiClient.post<MacroEstimateResult>('/foods/estimate-macros', payload).then((r) => r.data),
};
