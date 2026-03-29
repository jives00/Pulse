import { apiClient } from '../client';

export interface LinkItem {
  id: number;
  url: string;
  title: string;
  favicon_url: string | null;
  created_at: string;
}

export const linksApi = {
  getAll: () =>
    apiClient.get<LinkItem[]>('/links').then((r) => r.data),

  add: (url: string) =>
    apiClient.post<LinkItem>('/links', { url }).then((r) => r.data),

  update: (id: number, data: { title: string; favicon_url?: string | null; url?: string }) =>
    apiClient.put(`/links/${id}`, data).then(() => {}),

  delete: (id: number) =>
    apiClient.delete(`/links/${id}`).then(() => {}),
};
