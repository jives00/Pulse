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
  bestStairPace: {
    exerciseName: string;
    durationSeconds: number;
    reps: number;
    secsPerRep: number;
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
  instructions: string | null;
  /** Presigned S3 URL or legacy external URL (display use only) */
  mediaUrl: string | null;
  /** Presigned S3 URL or legacy external URL (display use only) */
  coverImageUrl: string | null;
  /** Presigned S3 URL or legacy external URL (display use only) */
  muscleImageUrl: string | null;
  /** Raw stored value: S3 key or YouTube/legacy URL (use in edit forms) */
  mediaKey: string | null;
  /** Raw stored value: S3 key or legacy URL (use in edit forms) */
  coverImageKey: string | null;
  /** Raw stored value: S3 key or legacy URL (use in edit forms) */
  muscleImageKey: string | null;
  notes: string | null;
  /** Which fields to log for each set: 'reps' | 'weight' | 'duration' | 'distance' */
  trackedFields: string[];
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
  totalDurationSeconds: number | null;
}

export interface WorkoutSummary {
  id: number;
  workoutDate: string;
  name: string | null;
  routineName: string | null;
  durationMinutes: number | null;
  caloriesBurned: number | null;
  exerciseCount: number;
  setCount: number;
  totalVolumeKg: number;
  createdAt: string;
  routineId: number | null;
  exercises: WorkoutExerciseSummary[];
}

export interface WorkoutDetail extends Omit<WorkoutSummary, 'exercises'> {
  notes: string | null;
  startedAt: string | null;
  routineId: number | null;
  exercises: WorkoutExercise[];
}

export interface ExerciseStats {
  exerciseId: number;
  personalBests: {
    heaviestWeightKg: number | null;
    heaviestWeightReps: number | null;
    estimatedOneRepMaxKg: number | null;
    bestSetVolumeKg: number | null;
    bestSessionVolumeKg: number | null;
  };
  setRecords: Array<{ reps: number; weightKg: number }>;
  progressSeries: Array<{ date: string; value: number }>;
}

export interface ExerciseHistoryEntry {
  workoutId: number;
  workoutDate: string;
  workoutName: string | null;
  sets: Array<{
    setNumber: number;
    reps: number | null;
    weightKg: number | null;
    durationSeconds: number | null;
    distanceMeters: number | null;
    completed: boolean;
  }>;
}

export const exercisesApi = {
  getAll: (params?: { search?: string; category?: string }) =>
    apiClient.get<Exercise[]>('/exercises', { params }).then((r) => r.data),

  getCategories: () =>
    apiClient.get<string[]>('/exercises/categories').then((r) => r.data),

  createCustom: (data: { name: string; category: string; exerciseType: string }) =>
    apiClient.post<Exercise>('/exercises', data).then((r) => r.data),

  getOne: (id: number) =>
    apiClient.get<Exercise>(`/exercises/${id}`).then((r) => r.data),

  getStats: (id: number, metric?: string) =>
    apiClient.get<ExerciseStats>(`/exercises/${id}/stats`, { params: metric ? { metric } : undefined }).then((r) => r.data),

  getHistory: (id: number, params?: { limit?: number; offset?: number }) =>
    apiClient.get<ExerciseHistoryEntry[]>(`/exercises/${id}/history`, { params }).then((r) => r.data),

  update: (id: number, data: {
    name?: string; category?: string; exerciseType?: string;
    musclesPrimary?: string[]; musclesSecondary?: string[];
    instructions?: string | null; mediaUrl?: string | null;
    coverImageUrl?: string | null; muscleImageUrl?: string | null; notes?: string | null; trackedFields?: string[];
  }) =>
    apiClient.put<Exercise>(`/exercises/${id}`, data).then((r) => r.data),

  deleteCustom: (id: number) =>
    apiClient.delete(`/exercises/${id}`).then(() => {}),

  uploadCoverImageFromUrl: (id: number, url: string) =>
    apiClient.post<{ key: string }>(`/exercises/${id}/cover-image-from-url`, { url }).then((r) => r.data),

  getCoverImageUploadUrl: (id: number, contentType: string) =>
    apiClient.post<{ uploadUrl: string; key: string }>(`/exercises/${id}/cover-image`, { contentType }).then((r) => r.data),

  uploadMediaFromUrl: (id: number, url: string) =>
    apiClient.post<{ key: string; isYouTube?: boolean }>(`/exercises/${id}/media-from-url`, { url }).then((r) => r.data),

  getMediaUploadUrl: (id: number, contentType: string) =>
    apiClient.post<{ uploadUrl: string; key: string }>(`/exercises/${id}/media`, { contentType }).then((r) => r.data),

  uploadMuscleImageFromUrl: (id: number, url: string) =>
    apiClient.post<{ key: string }>(`/exercises/${id}/muscle-image-from-url`, { url }).then((r) => r.data),

  getMuscleImageUploadUrl: (id: number, contentType: string) =>
    apiClient.post<{ uploadUrl: string; key: string }>(`/exercises/${id}/muscle-image`, { contentType }).then((r) => r.data),
};

export const workoutsApi = {
  getAll: (params?: { limit?: number; offset?: number; routineId?: number }) =>
    apiClient.get<WorkoutSummary[]>('/workouts', { params }).then((r) => r.data),

  get: (id: number) =>
    apiClient.get<WorkoutDetail>(`/workouts/${id}`).then((r) => r.data),

  create: (data?: { name?: string; workoutDate?: string }) =>
    apiClient.post<WorkoutDetail>('/workouts', data ?? {}).then((r) => r.data),

  update: (id: number, data: Partial<{ name: string; notes: string; durationMinutes: number; caloriesBurned: number; workoutDate: string; completed: boolean }>) =>
    apiClient.put<WorkoutDetail>(`/workouts/${id}`, data).then((r) => r.data),

  delete: (id: number) =>
    apiClient.delete(`/workouts/${id}`).then(() => {}),

  addExercise: (workoutId: number, exerciseId: number) =>
    apiClient.post<WorkoutExercise>(`/workouts/${workoutId}/exercises`, { exerciseId }).then((r) => r.data),

  removeExercise: (workoutId: number, weId: number) =>
    apiClient.delete(`/workouts/${workoutId}/exercises/${weId}`).then(() => {}),

  addSet: (workoutId: number, weId: number, data: { reps?: number; weightKg?: number; durationSeconds?: number; distanceMeters?: number }) =>
    apiClient.post<ExerciseSet>(`/workouts/${workoutId}/exercises/${weId}/sets`, data).then((r) => r.data),

  updateSet: (workoutId: number, weId: number, setId: number, data: { reps?: number | null; weightKg?: number | null; durationSeconds?: number | null; distanceMeters?: number | null; completed?: boolean }) =>
    apiClient.put(`/workouts/${workoutId}/exercises/${weId}/sets/${setId}`, data).then(() => {}),

  deleteSet: (workoutId: number, weId: number, setId: number) =>
    apiClient.delete(`/workouts/${workoutId}/exercises/${weId}/sets/${setId}`).then(() => {}),

  getPersonalBests: () =>
    apiClient.get<PersonalBests>('/workouts/personal-bests').then((r) => r.data),

  startTimer: (id: number) =>
    apiClient.post<{ startedAt: string }>(`/workouts/${id}/start-timer`).then((r) => r.data),

  estimateCalories: (id: number) =>
    apiClient.post<{ caloriesBurned: number }>(`/workouts/${id}/estimate-calories`).then((r) => r.data),
};
