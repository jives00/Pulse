import { apiClient } from '../client';

export interface Exercise {
  id: number;
  name: string;
  category: string;
  exerciseType: 'weight' | 'cardio' | 'bodyweight' | 'duration';
  musclesPrimary: string[];
  musclesSecondary: string[];
  isCustom: boolean;
}

export interface ExerciseSet {
  id: number;
  setNumber: number;
  reps: number | null;
  weightKg: number | null;
  durationSeconds: number | null;
  distanceMeters: number | null;
  completed: boolean;
}

export interface WorkoutExercise {
  id: number;
  sortOrder: number;
  notes: string | null;
  exercise: Exercise;
  sets: ExerciseSet[];
}

export interface WorkoutSummary {
  id: number;
  workoutDate: string;
  name: string | null;
  durationMinutes: number | null;
  caloriesBurned: number | null;
  exerciseCount: number;
  setCount: number;
  createdAt: string;
}

export interface WorkoutDetail extends WorkoutSummary {
  notes: string | null;
  exercises: WorkoutExercise[];
}

export const exercisesApi = {
  getAll: (params?: { search?: string; category?: string }) =>
    apiClient.get<Exercise[]>('/exercises', { params }).then((r) => r.data),

  getCategories: () =>
    apiClient.get<string[]>('/exercises/categories').then((r) => r.data),

  createCustom: (data: { name: string; category: string; exerciseType: string }) =>
    apiClient.post<Exercise>('/exercises', data).then((r) => r.data),
};

export const workoutsApi = {
  getAll: (params?: { limit?: number; offset?: number }) =>
    apiClient.get<WorkoutSummary[]>('/workouts', { params }).then((r) => r.data),

  get: (id: number) =>
    apiClient.get<WorkoutDetail>(`/workouts/${id}`).then((r) => r.data),

  create: (data?: { name?: string; workoutDate?: string }) =>
    apiClient.post<WorkoutDetail>('/workouts', data ?? {}).then((r) => r.data),

  update: (id: number, data: Partial<{ name: string; notes: string; durationMinutes: number; caloriesBurned: number; workoutDate: string }>) =>
    apiClient.put<WorkoutDetail>(`/workouts/${id}`, data).then((r) => r.data),

  delete: (id: number) =>
    apiClient.delete(`/workouts/${id}`).then(() => {}),

  addExercise: (workoutId: number, exerciseId: number) =>
    apiClient.post<WorkoutExercise>(`/workouts/${workoutId}/exercises`, { exerciseId }).then((r) => r.data),

  removeExercise: (workoutId: number, weId: number) =>
    apiClient.delete(`/workouts/${workoutId}/exercises/${weId}`).then(() => {}),

  addSet: (workoutId: number, weId: number, data: { reps?: number; weightKg?: number; durationSeconds?: number; distanceMeters?: number }) =>
    apiClient.post<ExerciseSet>(`/workouts/${workoutId}/exercises/${weId}/sets`, data).then((r) => r.data),

  updateSet: (workoutId: number, weId: number, setId: number, data: { reps?: number; weightKg?: number; durationSeconds?: number; distanceMeters?: number; completed?: boolean }) =>
    apiClient.put(`/workouts/${workoutId}/exercises/${weId}/sets/${setId}`, data).then(() => {}),

  deleteSet: (workoutId: number, weId: number, setId: number) =>
    apiClient.delete(`/workouts/${workoutId}/exercises/${weId}/sets/${setId}`).then(() => {}),
};
