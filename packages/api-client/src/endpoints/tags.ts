import { apiClient } from '../client';

export interface TagDefinitions {
  health:   string[];
  cuisine:  string[];
  category: string[];
}

export const tagsApi = {
  getAll: (type?: 'food' | 'cocktail') =>
    apiClient
      .get<{ id: number; name: string }[]>('/tags', { params: type ? { type } : undefined })
      .then((r) => r.data.map((t) => t.name)),

  getDefinitions: () =>
    apiClient.get<TagDefinitions>('/tags/definitions').then((r) => r.data),

  saveDefinitions: (defs: TagDefinitions) =>
    apiClient.put('/tags/definitions', defs).then(() => {}),

  suggest: (data: { name: string; type: string; ingredients: string[]; steps: string[] }) =>
    apiClient.post<string[]>('/tags/suggest', data).then((r) => r.data),
};
