import { apiClient } from '../client';
import type { WaterDay } from '../nutrition';

export interface WaterHistoryDay { date: string; totalOz: number; }
export interface WaterHistory { goalOz: number; days: WaterHistoryDay[]; }

export const waterApi = {
  getDay: (date: string) =>
    apiClient.get<WaterDay>('/water', { params: { date } }).then((r) => r.data),

  getHistory: (start: string, end: string) =>
    apiClient.get<WaterHistory>('/water/history', { params: { start, end } }).then((r) => r.data),

  add: (date: string, amountOz: number) =>
    apiClient.post('/water', { date, amountOz }).then((r) => r.data),

  delete: (id: number) =>
    apiClient.delete(`/water/${id}`).then((r) => r.data),
};
