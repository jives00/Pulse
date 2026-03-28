import { apiClient } from '../client';
import type {
  DailyLog,
  LogEntry,
  AddLogEntryPayload,
  UpdateLogEntryPayload,
  CopyLogPayload,
} from '../types';

export const logApi = {
  getDay: (date: string) =>
    apiClient.get<DailyLog>('/log', { params: { date } }).then((r) => r.data),

  add: (payload: AddLogEntryPayload) =>
    apiClient.post<LogEntry>('/log', payload).then((r) => r.data),

  update: (id: number, payload: UpdateLogEntryPayload) =>
    apiClient.put<LogEntry>(`/log/${id}`, payload).then((r) => r.data),

  delete: (id: number) =>
    apiClient.delete(`/log/${id}`).then((r) => r.data),

  copy: (payload: CopyLogPayload) =>
    apiClient.post<{ copied: number }>('/log/copy', payload).then((r) => r.data),
};
