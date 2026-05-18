import { apiClient } from '../client';

export type RecurrenceType = 'daily' | 'every_other_day' | 'days_of_week' | 'every_x_days' | 'day_of_month';

export interface WorkoutSchedule {
  id: number;
  routineId: number | null;
  routineName: string | null;
  label: string | null;
  isRestDay: boolean;
  recurrenceType: RecurrenceType;
  recurrenceConfig: any;
  recurrenceDescription: string;
  startDate: string;
  endDate: string | null;
}

export interface UpcomingSession {
  date: string;
  dayLabel: string;
  scheduleId: number;
  routineId: number | null;
  routineName: string | null;
  isRestDay: boolean;
  status: 'completed' | 'skipped' | 'rest' | 'scheduled';
}

export interface ProgramTemplateDay {
  dayOffset: number;
  slotLabel: string | null;
  isRestDay: boolean;
}

export interface ProgramTemplate {
  id: number;
  name: string;
  description: string | null;
  weeks: number;
  days: ProgramTemplateDay[];
}

export const schedulesApi = {
  getAll: () =>
    apiClient.get<WorkoutSchedule[]>('/schedules').then((r) => r.data),

  getUpcoming: (days = 14) =>
    apiClient.get<UpcomingSession[]>(`/schedules/upcoming?days=${days}`).then((r) => r.data),

  create: (data: {
    routineId?: number | null;
    label?: string;
    isRestDay?: boolean;
    recurrenceType: RecurrenceType;
    recurrenceConfig: any;
    startDate: string;
    endDate?: string | null;
  }) => apiClient.post<WorkoutSchedule>('/schedules', data).then((r) => r.data),

  update: (id: number, data: Partial<{
    routineId: number | null;
    label: string | null;
    isRestDay: boolean;
    recurrenceType: RecurrenceType;
    recurrenceConfig: any;
    startDate: string;
    endDate: string | null;
  }>) => apiClient.put<WorkoutSchedule>(`/schedules/${id}`, data).then((r) => r.data),

  delete: (id: number) =>
    apiClient.delete(`/schedules/${id}`).then(() => {}),

  override: (id: number, data: { date: string; status: 'completed' | 'skipped' | 'rest'; workoutLogId?: number }) =>
    apiClient.post(`/schedules/${id}/override`, data).then(() => {}),

  getProgramTemplates: () =>
    apiClient.get<ProgramTemplate[]>('/schedules/program-templates').then((r) => r.data),

  importProgramTemplate: (templateId: number, data: { startDate: string; slotMap: Record<string, number | null> }) =>
    apiClient.post<WorkoutSchedule[]>(`/schedules/program-templates/${templateId}/import`, data).then((r) => r.data),
};
