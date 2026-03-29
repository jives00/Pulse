import { apiClient } from '../client';
import type {
  MealTemplate,
  CreateTemplatePayload,
  CreateTemplateFromLogPayload,
  LogTemplatePayload,
} from '../nutrition';

export const templatesApi = {
  list: () =>
    apiClient.get<MealTemplate[]>('/templates').then((r) => r.data),

  getById: (id: number) =>
    apiClient.get<MealTemplate>(`/templates/${id}`).then((r) => r.data),

  create: (payload: CreateTemplatePayload | CreateTemplateFromLogPayload) =>
    apiClient.post<MealTemplate>('/templates', payload).then((r) => r.data),

  rename: (id: number, name: string) =>
    apiClient.put<MealTemplate>(`/templates/${id}`, { name }).then((r) => r.data),

  delete: (id: number) =>
    apiClient.delete(`/templates/${id}`).then((r) => r.data),

  log: (id: number, payload: LogTemplatePayload) =>
    apiClient.post<{ logged: number }>(`/templates/${id}/log`, payload).then((r) => r.data),
};
