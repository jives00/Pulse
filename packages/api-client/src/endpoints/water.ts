import { apiClient } from '../client';
import type { WaterDay } from '../nutrition';

export const waterApi = {
  getDay: (date: string) =>
    apiClient.get<WaterDay>('/water', { params: { date } }).then((r) => r.data),

  add: (date: string, amountMl: number) =>
    apiClient.post('/water', { date, amountMl }).then((r) => r.data),

  delete: (id: number) =>
    apiClient.delete(`/water/${id}`).then((r) => r.data),
};
