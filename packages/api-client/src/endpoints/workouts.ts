import { apiClient } from '../client';

// ─── Body Measurements ────────────────────────────────────────────────────────

export interface BodyMeasurement {
  id: number;
  metric: string;
  value: number;
  unit: string;
  measuredAt: string;
  notes: string | null;
}

export interface MeasurementGoal {
  targetValue: number;
  unit: string;
  targetDate: string | null;
}

export interface PersonalBests {
  heaviestLift: {
    exerciseName: string;
    weightKg: number;
    reps: number | null;
    workoutDate: string;
  } | null;
  bestSessionVolume: {
    workoutId: number;
    workoutName: string | null;
    volumeKg: number;
    workoutDate: string;
  } | null;
  longestSession: {
    workoutId: number;
    workoutName: string | null;
    durationMinutes: number;
    workoutDate: string;
  } | null;
}

export const measurementsApi = {
  getAll: () =>
    apiClient.get<BodyMeasurement[]>('/measurements').then((r) => r.data),

  add: (data: { metric: string; value: number; unit: string; measuredAt?: string; notes?: string }) =>
    apiClient.post<BodyMeasurement>('/measurements', data).then((r) => r.data),

  update: (id: number, data: { value: number; measuredAt?: string; notes?: string }) =>
    apiClient.put<BodyMeasurement>(`/measurements/${id}`, data).then((r) => r.data),

  delete: (id: number) =>
    apiClient.delete(`/measurements/${id}`).then(() => {}),

  getGoals: () =>
    apiClient.get<Record<string, MeasurementGoal>>('/measurements/goals').then((r) => r.data),

  setGoal: (metric: string, data: { targetValue: number; unit: string; targetDate?: string | null }) =>
    apiClient.put<MeasurementGoal>(`/measurements/goals/${metric}`, data).then((r) => r.data),

  deleteGoal: (metric: string) =>
    apiClient.delete(`/measurements/goals/${metric}`).then(() => {}),
};

// ─── Personal Bests ───────────────────────────────────────────────────────────

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

export interface WorkoutExerciseSummary {
  name: string;
  setCount: number;
  avgReps: number | null;
  maxWeightKg: number | null;
}

export interface WorkoutSummary {
  id: number;
  workoutDate: string;
  name: string | null;
  durationMinutes: number | null;
  caloriesBurned: number | null;
  exerciseCount: number;
  setCount: number;
  totalVolumeKg: number;
  createdAt: string;
  exercises: WorkoutExerciseSummary[];
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

  getPersonalBests: () =>
    apiClient.get<PersonalBests>('/workouts/personal-bests').then((r) => r.data),
};
