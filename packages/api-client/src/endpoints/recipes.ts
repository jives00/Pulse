import { apiClient } from '../client';
import type { Recipe, RecipeDetail, RecipeFormData, RecipeMacroResult, ScrapedRecipe, RecipeSuggestion, RecipeFilters, MakeLogEntry, RecipeSearchResult } from '../recipes';
import { buildRecipeParams } from '../recipes';

export type FromBarcodeResult =
  | { found: false }
  | { recipeId: number; created: boolean };

export interface HistoryEntry {
  log_id: number;
  made_at: string;
  recipe_id: number;
  name: string;
  photo_key: string | null;
  photo_url: string | null;
  type: string;
  subcategory: string | null;
}

export const recipesApi = {
  getAll: (filters: RecipeFilters = {}) => {
    const params = buildRecipeParams(filters);
    return apiClient.get<Recipe[]>(`/recipes?${params}`).then((r) => r.data);
  },

  get: (id: number) =>
    apiClient.get<RecipeDetail>(`/recipes/${id}`).then((r) => r.data),

  create: (data: RecipeFormData) =>
    apiClient.post<{ id: number }>('/recipes', data).then((r) => r.data),

  update: (id: number, data: Partial<RecipeFormData> & { is_favorite?: number; photo_key?: string }) =>
    apiClient.put<{ success: boolean }>(`/recipes/${id}`, data).then((r) => r.data),

  delete: (id: number) =>
    apiClient.delete<{ success: boolean }>(`/recipes/${id}`).then((r) => r.data),

  search: (q: string) =>
    apiClient.get<RecipeSearchResult[]>(`/recipes/search?q=${encodeURIComponent(q)}`).then((r) => r.data),

  getByBarcode: (barcode: string) =>
    apiClient.get<RecipeSearchResult>(`/recipes/barcode/${encodeURIComponent(barcode)}`).then((r) => r.data),

  getBarcode: (id: number) =>
    apiClient.get<{ barcode: string | null }>(`/recipes/${id}/barcode`).then((r) => r.data),

  setBarcode: (id: number, barcode: string) =>
    apiClient.put<{ success: boolean }>(`/recipes/${id}/barcode`, { barcode }).then((r) => r.data),

  deleteBarcode: (id: number) =>
    apiClient.delete<{ success: boolean }>(`/recipes/${id}/barcode`).then((r) => r.data),

  log: (id: number, payload?: { meal?: string; servings?: number; logDate?: string }) =>
    apiClient.post<{ success: boolean; nutritionLogged?: boolean; nutritionSkipped?: 'no_nutrition' | null }>(`/recipes/${id}/log`, payload ?? {}).then((r) => r.data),

  getLog: (id: number) =>
    apiClient.get<{ count: number; entries: MakeLogEntry[] }>(`/recipes/${id}/log`).then((r) => r.data),

  updateLogEntry: (recipeId: number, logId: number, made_at: string) =>
    apiClient.patch(`/recipes/${recipeId}/log/${logId}`, { made_at }).then(() => {}),

  deleteLogEntry: (recipeId: number, logId: number) =>
    apiClient.delete(`/recipes/${recipeId}/log/${logId}`).then(() => {}),

  clearLog: (id: number) =>
    apiClient.delete(`/recipes/${id}/log`).then(() => {}),

  getPhotoUploadUrl: (id: number, contentType: string) =>
    apiClient.post<{ uploadUrl: string; key: string }>(`/recipes/${id}/photo`, { contentType }).then((r) => r.data),

  uploadPhotoFromUrl: (recipeId: number, url: string) =>
    apiClient.post<{ key: string }>(`/recipes/${recipeId}/photo-from-url`, { url }).then((r) => r.data),

  scrape: (url: string, typeHint?: string) =>
    apiClient.post<ScrapedRecipe>('/recipes/scrape', { url, typeHint }).then((r) => r.data),

  parseText: (text: string, typeHint?: string) =>
    apiClient.post<ScrapedRecipe>('/recipes/scrape/parse-text', { text, typeHint }).then((r) => r.data),

  suggest: (prompt?: string) =>
    apiClient.get<RecipeSuggestion[]>('/recipes/suggest', { params: prompt ? { prompt } : undefined }).then((r) => r.data),

  getHistory: () =>
    apiClient.get<HistoryEntry[]>('/recipes/history').then((r) => r.data),

  aiModify: (id: number, prompt: string, mode: 'update' | 'log') =>
    apiClient.post<{ modified: RecipeFormData | RecipeMacroResult }>(`/recipes/${id}/ai-modify`, { prompt, mode }).then((r) => r.data),

  clearAllHistory: () =>
    apiClient.delete('/recipes/history').then(() => {}),

  deleteAll: () =>
    apiClient.delete('/recipes').then(() => {}),

  createFromBarcode: (params: { barcode: string; name?: string }) =>
    apiClient.post<FromBarcodeResult>('/recipes/from-barcode', params).then((r) => r.data),
};

// Direct S3 upload — uses fetch directly against the presigned URL (no API client)
export async function uploadPhotoToS3(uploadUrl: string, file: File): Promise<void> {
  await fetch(uploadUrl, {
    method: 'PUT',
    headers: { 'Content-Type': file.type },
    body: file,
  });
}
