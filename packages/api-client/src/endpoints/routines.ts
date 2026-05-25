import { apiClient } from '../client';
import type { Exercise, WorkoutDetail } from './workouts';
import type { RoutineType } from '../utils/calculations';

export interface RoutineSummary {
  id: number;
  name: string;
  notes: string | null;
  routineType: RoutineType;
  exerciseCount: number;
  lastUsedDate: string | null;
  nextOccurrenceDate: string | null;
  lastVolumeLbs: number | null;
  lastPrimaryMetric: number | null;
  lastCaloriesBurned: number | null;
  coverImageUrl: string | null;
  createdAt: string;
}

export interface RoutineExerciseSet {
  id: number;
  setNumber: number;
  reps: number | null;
  weightKg: number | null;
  durationSeconds: number | null;
  distanceMeters: number | null;
  steps: number | null;
}

export interface RoutineExercise {
  id: number;
  sortOrder: number;
  notes: string | null;
  exercise: Exercise;
  templateSets: RoutineExerciseSet[];
  lastPerformedSets: Array<{
    setNumber: number;
    reps: number | null;
    weightKg: number | null;
    durationSeconds: number | null;
    distanceMeters: number | null;
    steps: number | null;
  }> | null;
}

export interface RoutineDetail {
  id: number;
  name: string;
  notes: string | null;
  routineType: RoutineType;
  coverImageUrl: string | null;
  createdAt: string;
  updatedAt: string;
  exercises: RoutineExercise[];
}

export interface RoutineGoal {
  id: number;
  routineId: number;
  targetPerWeek: number;
  effectiveFrom: string;
}

export const routinesApi = {
  getAll: () =>
    apiClient.get<RoutineSummary[]>('/routines').then((r) => r.data),

  get: (id: number) =>
    apiClient.get<RoutineDetail>(`/routines/${id}`).then((r) => r.data),

  create: (data: { name: string; notes?: string; routineType?: RoutineType }) =>
    apiClient.post<RoutineDetail>('/routines', data).then((r) => r.data),

  update: (id: number, data: { name?: string; notes?: string; coverImageKey?: string | null; routineType?: RoutineType }) =>
    apiClient.put<RoutineDetail>(`/routines/${id}`, data).then((r) => r.data),

  getPhotoUploadUrl: (id: number, contentType: string) =>
    apiClient.post<{ uploadUrl: string; key: string }>(`/routines/${id}/photo`, { contentType }).then((r) => r.data),

  delete: (id: number) =>
    apiClient.delete(`/routines/${id}`).then(() => {}),

  addExercise: (routineId: number, exerciseId: number) =>
    apiClient.post<RoutineExercise>(`/routines/${routineId}/exercises`, { exerciseId }).then((r) => r.data),

  removeExercise: (routineId: number, reId: number) =>
    apiClient.delete(`/routines/${routineId}/exercises/${reId}`).then(() => {}),

  reorderExercises: (routineId: number, order: { id: number; sortOrder: number }[]) =>
    apiClient.put(`/routines/${routineId}/exercises/reorder`, { order }).then(() => {}),

  addTemplateSet: (routineId: number, reId: number, data: { reps?: number; weightKg?: number; durationSeconds?: number; distanceMeters?: number; steps?: number }) =>
    apiClient.post<RoutineExerciseSet>(`/routines/${routineId}/exercises/${reId}/sets`, data).then((r) => r.data),

  updateTemplateSet: (routineId: number, reId: number, setId: number, data: { reps?: number; weightKg?: number; durationSeconds?: number; distanceMeters?: number; steps?: number }) =>
    apiClient.put(`/routines/${routineId}/exercises/${reId}/sets/${setId}`, data).then(() => {}),

  deleteTemplateSet: (routineId: number, reId: number, setId: number) =>
    apiClient.delete(`/routines/${routineId}/exercises/${reId}/sets/${setId}`).then(() => {}),

  start: (id: number) =>
    apiClient.post<WorkoutDetail>(`/routines/${id}/start`).then((r) => r.data),

  getGoal: (id: number) =>
    apiClient.get<RoutineGoal | null>(`/routines/${id}/goal`).then((r) => r.data),

  setGoal: (id: number, targetPerWeek: number) =>
    apiClient.put<RoutineGoal>(`/routines/${id}/goal`, { targetPerWeek }).then((r) => r.data),

  deleteGoal: (id: number) =>
    apiClient.delete(`/routines/${id}/goal`).then(() => {}),

  getAllGoals: () =>
    apiClient.get<RoutineGoal[]>('/routines/goals').then((r) => r.data),
};
