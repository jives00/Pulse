import { apiClient } from '../client';

export type LinkCategory = 'food' | 'drinks' | 'nutrition' | 'exercise' | 'other';

export interface LinkItem {
  id: number;
  url: string;
  title: string;
  favicon_url: string | null;
  category: LinkCategory;
  created_at: string;
}

export const linksApi = {
  getAll: () =>
    apiClient.get<LinkItem[]>('/links').then((r) => r.data),

  add: (url: string, category: LinkCategory = 'other') =>
    apiClient.post<LinkItem>('/links', { url, category }).then((r) => r.data),

  update: (id: number, data: { title: string; favicon_url?: string | null; url?: string; category?: LinkCategory }) =>
    apiClient.put(`/links/${id}`, data).then(() => {}),

  delete: (id: number) =>
    apiClient.delete(`/links/${id}`).then(() => {}),
};
