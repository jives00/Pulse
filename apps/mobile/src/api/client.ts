import type {
  WorkoutSchedule,
  UpcomingSession,
  ProgramTemplate,
  RecurrenceType,
} from '../../../../packages/api-client/src/endpoints/schedules';

export type { WorkoutSchedule, UpcomingSession, ProgramTemplate, RecurrenceType };

import type {
  Recipe,
  RecipeDetail,
  RecipeFormData,
  ScrapedRecipe,
  Ingredient,
  RecipeFilters,
  MakeLogEntry,
  LinkItem,
  HistoryEntry,
  TagDefinitions,
  MealSlot,
  ServingSize,
  NutritionSnapshot,
  Food,
  LogEntry as NutritionLogEntry,
  DailyLog,
  WaterDay,
  GoalsSummary,
  Exercise,
  ExerciseSet,
  WorkoutExercise,
  WorkoutSummary,
  WorkoutDetail,
  ExerciseStats,
  ExerciseHistoryEntry,
  RoutineSummary,
  RoutineExercise,
  RoutineExerciseSet,
  RoutineDetail,
  RecipeSearchResult,
  PersonalBests,
  BodyMeasurement,
  MeasurementGoal,
  WaterHistoryDay,
  WaterHistory,
  FoodLogHistoryEntry,
  FoodLogHistoryDay,
  UserProfile,
  ActivityLevel,
  TDEEBreakdown,
  TDEEUnavailable,
  TDEEResult,
  ExerciseGoals,
  DailyHistoryEntry,
  DeleteScope,
} from '../../../../packages/api-client/src/index';
import { buildRecipeParams } from '../../../../packages/api-client/src/index';
import { API_BASE } from './config';

export type {
  Recipe, RecipeDetail, RecipeFormData, ScrapedRecipe, Ingredient, MakeLogEntry,
  LinkItem, HistoryEntry, TagDefinitions,
  MealSlot, ServingSize, NutritionSnapshot, Food, NutritionLogEntry, DailyLog, WaterDay,
  GoalsSummary, Exercise, ExerciseSet, WorkoutExercise, WorkoutSummary, WorkoutDetail,
  ExerciseStats, ExerciseHistoryEntry,
  RoutineSummary, RoutineExercise, RoutineExerciseSet, RoutineDetail,
  RecipeSearchResult, PersonalBests, BodyMeasurement, MeasurementGoal,
  WaterHistoryDay, WaterHistory, FoodLogHistoryEntry, FoodLogHistoryDay,
  UserProfile, ActivityLevel, TDEEBreakdown, TDEEUnavailable, TDEEResult,
  ExerciseGoals, DailyHistoryEntry, DeleteScope,
};

function headers(token: string) {
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
  };
}

let _onUnauthorized: (() => void) | null = null;
export function setUnauthorizedHandler(fn: () => void) { _onUnauthorized = fn; }

async function handle<T>(res: Response): Promise<T> {
  if (res.status === 401) {
    _onUnauthorized?.();
    throw new Error('Unauthorized');
  }
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as any).error || `HTTP ${res.status}`);
  }
  return res.json();
}

export async function login(username: string, password: string) {
  const res = await fetch(`${API_BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });
  return handle<{ token: string }>(res);
}

export async function getRecipes(
  token: string,
  filters: RecipeFilters = {}
): Promise<Recipe[]> {
  const params = buildRecipeParams(filters);
  const res = await fetch(`${API_BASE}/api/recipes?${params}`, {
    headers: headers(token),
  });
  return handle<Recipe[]>(res);
}

export async function getRecipe(token: string, id: number): Promise<RecipeDetail> {
  const res = await fetch(`${API_BASE}/api/recipes/${id}`, { headers: headers(token) });
  return handle<RecipeDetail>(res);
}

export async function createRecipe(token: string, data: RecipeFormData): Promise<{ id: number }> {
  const res = await fetch(`${API_BASE}/api/recipes`, {
    method: 'POST',
    headers: headers(token),
    body: JSON.stringify(data),
  });
  return handle<{ id: number }>(res);
}

export async function updateRecipe(
  token: string,
  id: number,
  data: Partial<RecipeFormData> & { is_favorite?: number; photo_key?: string }
) {
  const res = await fetch(`${API_BASE}/api/recipes/${id}`, {
    method: 'PUT',
    headers: headers(token),
    body: JSON.stringify(data),
  });
  return handle<{ success: boolean }>(res);
}

export async function deleteRecipe(token: string, id: number) {
  const res = await fetch(`${API_BASE}/api/recipes/${id}`, {
    method: 'DELETE',
    headers: headers(token),
  });
  return handle<{ success: boolean }>(res);
}

export async function logRecipe(token: string, id: number) {
  const res = await fetch(`${API_BASE}/api/recipes/${id}/log`, {
    method: 'POST',
    headers: headers(token),
  });
  return handle<{ success: boolean }>(res);
}

export async function getPhotoUploadUrl(token: string, id: number, contentType: string) {
  const res = await fetch(`${API_BASE}/api/recipes/${id}/photo`, {
    method: 'POST',
    headers: headers(token),
    body: JSON.stringify({ contentType }),
  });
  return handle<{ uploadUrl: string; key: string }>(res);
}

export async function uploadPhotoToS3(uploadUrl: string, uri: string, contentType: string) {
  // Read the local file URI into a Blob so fetch sends raw binary data.
  // Passing a plain object as body results in "[object Object]" being uploaded.
  const localRes = await fetch(uri);
  const blob = await localRes.blob();
  await fetch(uploadUrl, {
    method: 'PUT',
    headers: { 'Content-Type': contentType },
    body: blob,
  });
}

export async function uploadPhotoFromUrl(token: string, recipeId: number, url: string): Promise<{ key: string }> {
  const res = await fetch(`${API_BASE}/api/recipes/${recipeId}/photo-from-url`, {
    method: 'POST',
    headers: headers(token),
    body: JSON.stringify({ url }),
  });
  return handle<{ key: string }>(res);
}

export async function getRecipeLog(token: string, recipeId: number): Promise<{ count: number; entries: MakeLogEntry[] }> {
  const res = await fetch(`${API_BASE}/api/recipes/${recipeId}/log`, { headers: headers(token) });
  return handle(res);
}

export async function clearAllHistory(token: string): Promise<void> {
  const res = await fetch(`${API_BASE}/api/recipes/history`, { method: 'DELETE', headers: headers(token) });
  await handle(res);
}

export async function deleteAllRecipes(token: string): Promise<void> {
  const res = await fetch(`${API_BASE}/api/recipes`, { method: 'DELETE', headers: headers(token) });
  await handle(res);
}

export async function updateLogEntry(token: string, recipeId: number, logId: number, made_at: string): Promise<void> {
  const res = await fetch(`${API_BASE}/api/recipes/${recipeId}/log/${logId}`, {
    method: 'PATCH',
    headers: headers(token),
    body: JSON.stringify({ made_at }),
  });
  await handle(res);
}

export async function deleteLogEntry(token: string, recipeId: number, logId: number): Promise<void> {
  const res = await fetch(`${API_BASE}/api/recipes/${recipeId}/log/${logId}`, { method: 'DELETE', headers: headers(token) });
  await handle(res);
}

export async function getHistory(token: string): Promise<HistoryEntry[]> {
  const res = await fetch(`${API_BASE}/api/recipes/history`, { headers: headers(token) });
  return handle<HistoryEntry[]>(res);
}

export async function deleteAllLog(token: string, recipeId: number): Promise<void> {
  const res = await fetch(`${API_BASE}/api/recipes/${recipeId}/log`, { method: 'DELETE', headers: headers(token) });
  await handle(res);
}

export async function getTags(token: string): Promise<string[]> {
  const res = await fetch(`${API_BASE}/api/tags`, { headers: headers(token) });
  const data = await handle<{ id: number; name: string }[]>(res);
  return data.map((t) => t.name);
}

export async function getTagDefinitions(token: string): Promise<TagDefinitions> {
  const res = await fetch(`${API_BASE}/api/tags/definitions`, { headers: headers(token) });
  return handle<TagDefinitions>(res);
}
export async function saveTagDefinitions(token: string, defs: TagDefinitions): Promise<void> {
  const res = await fetch(`${API_BASE}/api/tags/definitions`, { method: 'PUT', headers: headers(token), body: JSON.stringify(defs) });
  await handle(res);
}

export async function scrapeRecipe(
  token: string,
  url: string,
  typeHint?: string
): Promise<ScrapedRecipe> {
  const res = await fetch(`${API_BASE}/api/recipes/scrape`, {
    method: 'POST',
    headers: headers(token),
    body: JSON.stringify({ url, typeHint }),
  });
  return handle<ScrapedRecipe>(res);
}

export async function parseRecipeText(
  token: string,
  text: string,
  typeHint?: string
): Promise<ScrapedRecipe> {
  const res = await fetch(`${API_BASE}/api/recipes/scrape/parse-text`, {
    method: 'POST',
    headers: headers(token),
    body: JSON.stringify({ text, typeHint }),
  });
  return handle<ScrapedRecipe>(res);
}

export async function getLinks(token: string): Promise<LinkItem[]> {
  const res = await fetch(`${API_BASE}/api/links`, { headers: headers(token) });
  return handle<LinkItem[]>(res);
}

export async function addLink(token: string, url: string): Promise<LinkItem> {
  const res = await fetch(`${API_BASE}/api/links`, {
    method: 'POST',
    headers: headers(token),
    body: JSON.stringify({ url }),
  });
  return handle<LinkItem>(res);
}

export async function updateLink(token: string, id: number, title: string): Promise<void> {
  const res = await fetch(`${API_BASE}/api/links/${id}`, {
    method: 'PUT',
    headers: headers(token),
    body: JSON.stringify({ title }),
  });
  await handle(res);
}

export async function deleteLink(token: string, id: number): Promise<void> {
  const res = await fetch(`${API_BASE}/api/links/${id}`, {
    method: 'DELETE',
    headers: headers(token),
  });
  await handle(res);
}

// ─── Nutrition / Workouts / Goals ───────────────────────────────────────────

// Nutrition log
export async function getDailyLog(token: string, date: string): Promise<DailyLog> {
  const res = await fetch(`${API_BASE}/api/log?date=${encodeURIComponent(date)}`, { headers: headers(token) });
  return handle<DailyLog>(res);
}
export async function addLogEntry(token: string, payload: { logDate: string; meal: MealSlot; foodId: number; servingSizeId: number; quantity: number; }): Promise<NutritionLogEntry> {
  const res = await fetch(`${API_BASE}/api/log`, { method: 'POST', headers: headers(token), body: JSON.stringify(payload) });
  return handle<NutritionLogEntry>(res);
}
export async function deleteNutritionLogEntry(token: string, id: number): Promise<void> {
  const res = await fetch(`${API_BASE}/api/log/${id}`, { method: 'DELETE', headers: headers(token) });
  await handle(res);
}
export async function moveLogEntry(token: string, id: number, meal: MealSlot, logDate: string): Promise<void> {
  const res = await fetch(`${API_BASE}/api/log/${id}`, { method: 'PUT', headers: headers(token), body: JSON.stringify({ meal, logDate }) });
  await handle(res);
}
export async function copyLogEntry(token: string, entry: NutritionLogEntry, meal: MealSlot, logDate: string): Promise<void> {
  const res = await fetch(`${API_BASE}/api/log`, {
    method: 'POST',
    headers: headers(token),
    body: JSON.stringify({ logDate, meal, foodId: entry.food.id, servingSizeId: entry.servingSize.id, quantity: entry.quantity }),
  });
  await handle(res);
}
export async function editNutritionLogEntry(token: string, id: number, payload: { servingSizeId: number; quantity: number }): Promise<void> {
  const res = await fetch(`${API_BASE}/api/log/${id}`, { method: 'PUT', headers: headers(token), body: JSON.stringify(payload) });
  await handle(res);
}
export async function getFoodById(token: string, id: number): Promise<Food> {
  const res = await fetch(`${API_BASE}/api/foods/${id}`, { headers: headers(token) });
  return handle<Food>(res);
}

// Water
export async function getWaterDay(token: string, date: string): Promise<WaterDay> {
  const res = await fetch(`${API_BASE}/api/water?date=${encodeURIComponent(date)}`, { headers: headers(token) });
  return handle<WaterDay>(res);
}
export async function addWater(token: string, date: string, amountOz: number): Promise<void> {
  const res = await fetch(`${API_BASE}/api/water`, { method: 'POST', headers: headers(token), body: JSON.stringify({ date, amountOz }) });
  await handle(res);
}

// Goals summary
export async function getGoalsSummary(token: string, date?: string): Promise<GoalsSummary> {
  const url = date ? `${API_BASE}/api/goals/summary?date=${encodeURIComponent(date)}` : `${API_BASE}/api/goals/summary`;
  const res = await fetch(url, { headers: headers(token) });
  return handle<GoalsSummary>(res);
}

// Workouts
export async function getWorkouts(token: string, params?: { limit?: number; offset?: number; routineId?: number; start?: string; end?: string }): Promise<WorkoutSummary[]> {
  const p = new URLSearchParams();
  if (params?.limit != null) p.set('limit', String(params.limit));
  if (params?.offset != null) p.set('offset', String(params.offset));
  if (params?.routineId != null) p.set('routineId', String(params.routineId));
  if (params?.start) p.set('start', params.start);
  if (params?.end) p.set('end', params.end);
  const qs = p.toString() ? `?${p.toString()}` : '';
  const res = await fetch(`${API_BASE}/api/workouts${qs}`, { headers: headers(token) });
  return handle<WorkoutSummary[]>(res);
}
export async function getWorkout(token: string, id: number): Promise<WorkoutDetail> {
  const res = await fetch(`${API_BASE}/api/workouts/${id}`, { headers: headers(token) });
  return handle<WorkoutDetail>(res);
}
export async function createWorkout(token: string, data?: { name?: string }): Promise<WorkoutDetail> {
  const res = await fetch(`${API_BASE}/api/workouts`, { method: 'POST', headers: headers(token), body: JSON.stringify(data ?? {}) });
  return handle<WorkoutDetail>(res);
}
export async function updateWorkout(token: string, id: number, data: { name?: string; durationMinutes?: number; completed?: boolean; workoutDate?: string }): Promise<void> {
  const res = await fetch(`${API_BASE}/api/workouts/${id}`, { method: 'PUT', headers: headers(token), body: JSON.stringify(data) });
  await handle(res);
}
export async function getActiveWorkout(token: string): Promise<WorkoutDetail | null> {
  const res = await fetch(`${API_BASE}/api/workouts/active`, { headers: headers(token) });
  return handle<WorkoutDetail | null>(res);
}
export async function deleteWorkout(token: string, id: number): Promise<void> {
  const res = await fetch(`${API_BASE}/api/workouts/${id}`, { method: 'DELETE', headers: headers(token) });
  await handle(res);
}
export async function startWorkoutTimer(token: string, id: number): Promise<{ startedAt: string; pausedAt: string | null; totalPausedSeconds: number }> {
  const res = await fetch(`${API_BASE}/api/workouts/${id}/start-timer`, { method: 'POST', headers: headers(token) });
  return handle<{ startedAt: string; pausedAt: string | null; totalPausedSeconds: number }>(res);
}
export async function pauseWorkout(token: string, id: number): Promise<void> {
  const res = await fetch(`${API_BASE}/api/workouts/${id}/pause`, { method: 'POST', headers: headers(token) });
  await handle(res);
}
export async function resumeWorkout(token: string, id: number): Promise<{ totalPausedSeconds: number }> {
  const res = await fetch(`${API_BASE}/api/workouts/${id}/resume`, { method: 'POST', headers: headers(token) });
  return handle<{ totalPausedSeconds: number }>(res);
}
export async function estimateWorkoutCalories(token: string, id: number): Promise<{ caloriesBurned: number }> {
  const res = await fetch(`${API_BASE}/api/workouts/${id}/estimate-calories`, { method: 'POST', headers: headers(token) });
  return handle<{ caloriesBurned: number }>(res);
}
export async function addWorkoutExercise(token: string, workoutId: number, exerciseId: number): Promise<WorkoutExercise> {
  const res = await fetch(`${API_BASE}/api/workouts/${workoutId}/exercises`, { method: 'POST', headers: headers(token), body: JSON.stringify({ exerciseId }) });
  return handle<WorkoutExercise>(res);
}
export async function removeWorkoutExercise(token: string, workoutId: number, weId: number): Promise<void> {
  const res = await fetch(`${API_BASE}/api/workouts/${workoutId}/exercises/${weId}`, { method: 'DELETE', headers: headers(token) });
  await handle(res);
}
export async function updateWorkoutExercise(token: string, workoutId: number, weId: number, data: { notes?: string | null }): Promise<void> {
  const res = await fetch(`${API_BASE}/api/workouts/${workoutId}/exercises/${weId}`, { method: 'PUT', headers: headers(token), body: JSON.stringify(data) });
  await handle(res);
}
export async function addWorkoutSet(token: string, workoutId: number, weId: number, data: { reps?: number; weightKg?: number }): Promise<ExerciseSet> {
  const res = await fetch(`${API_BASE}/api/workouts/${workoutId}/exercises/${weId}/sets`, { method: 'POST', headers: headers(token), body: JSON.stringify(data) });
  return handle<ExerciseSet>(res);
}
export async function updateWorkoutSet(token: string, workoutId: number, weId: number, setId: number, data: { reps?: number | null; weightKg?: number | null; durationSeconds?: number | null; distanceMeters?: number | null; completed?: boolean }): Promise<void> {
  const res = await fetch(`${API_BASE}/api/workouts/${workoutId}/exercises/${weId}/sets/${setId}`, { method: 'PUT', headers: headers(token), body: JSON.stringify(data) });
  await handle(res);
}
export async function deleteWorkoutSet(token: string, workoutId: number, weId: number, setId: number): Promise<void> {
  const res = await fetch(`${API_BASE}/api/workouts/${workoutId}/exercises/${weId}/sets/${setId}`, { method: 'DELETE', headers: headers(token) });
  await handle(res);
}

// Exercises
export async function getExercises(token: string, params?: { search?: string; category?: string }): Promise<Exercise[]> {
  const qs = new URLSearchParams();
  if (params?.search) qs.set('search', params.search);
  if (params?.category) qs.set('category', params.category);
  const res = await fetch(`${API_BASE}/api/exercises?${qs}`, { headers: headers(token) });
  return handle<Exercise[]>(res);
}
export async function getExerciseCategories(token: string): Promise<string[]> {
  const res = await fetch(`${API_BASE}/api/exercises/categories`, { headers: headers(token) });
  return handle<string[]>(res);
}
export async function createCustomExercise(token: string, data: { name: string; category: string; exerciseType: string }): Promise<Exercise> {
  const res = await fetch(`${API_BASE}/api/exercises`, { method: 'POST', headers: headers(token), body: JSON.stringify(data) });
  return handle<Exercise>(res);
}
export async function updateExercise(token: string, id: number, data: { name?: string; category?: string; exerciseType?: string; musclesPrimary?: string[]; musclesSecondary?: string[]; instructions?: string | null; mediaUrl?: string | null; coverImageUrl?: string | null; muscleImageUrl?: string | null; notes?: string | null; trackedFields?: string[] }): Promise<Exercise> {
  const res = await fetch(`${API_BASE}/api/exercises/${id}`, { method: 'PUT', headers: headers(token), body: JSON.stringify(data) });
  return handle<Exercise>(res);
}
export async function uploadExerciseCoverImageFromUrl(token: string, id: number, url: string): Promise<{ key: string }> {
  const res = await fetch(`${API_BASE}/api/exercises/${id}/cover-image-from-url`, { method: 'POST', headers: headers(token), body: JSON.stringify({ url }) });
  return handle<{ key: string }>(res);
}
export async function getExerciseCoverImageUploadUrl(token: string, id: number, contentType: string): Promise<{ uploadUrl: string; key: string }> {
  const res = await fetch(`${API_BASE}/api/exercises/${id}/cover-image`, { method: 'POST', headers: headers(token), body: JSON.stringify({ contentType }) });
  return handle<{ uploadUrl: string; key: string }>(res);
}
export async function uploadExerciseMediaFromUrl(token: string, id: number, url: string): Promise<{ key: string; isYouTube?: boolean }> {
  const res = await fetch(`${API_BASE}/api/exercises/${id}/media-from-url`, { method: 'POST', headers: headers(token), body: JSON.stringify({ url }) });
  return handle<{ key: string; isYouTube?: boolean }>(res);
}
export async function getExerciseMediaUploadUrl(token: string, id: number, contentType: string): Promise<{ uploadUrl: string; key: string }> {
  const res = await fetch(`${API_BASE}/api/exercises/${id}/media`, { method: 'POST', headers: headers(token), body: JSON.stringify({ contentType }) });
  return handle<{ uploadUrl: string; key: string }>(res);
}
export async function uploadExerciseMuscleImageFromUrl(token: string, id: number, url: string): Promise<{ key: string }> {
  const res = await fetch(`${API_BASE}/api/exercises/${id}/muscle-image-from-url`, { method: 'POST', headers: headers(token), body: JSON.stringify({ url }) });
  return handle<{ key: string }>(res);
}
export async function getExerciseMuscleImageUploadUrl(token: string, id: number, contentType: string): Promise<{ uploadUrl: string; key: string }> {
  const res = await fetch(`${API_BASE}/api/exercises/${id}/muscle-image`, { method: 'POST', headers: headers(token), body: JSON.stringify({ contentType }) });
  return handle<{ uploadUrl: string; key: string }>(res);
}
export async function deleteExercise(token: string, id: number): Promise<void> {
  const res = await fetch(`${API_BASE}/api/exercises/${id}`, { method: 'DELETE', headers: headers(token) });
  await handle(res);
}
export async function getExercise(token: string, id: number): Promise<Exercise> {
  const res = await fetch(`${API_BASE}/api/exercises/${id}`, { headers: headers(token) });
  return handle<Exercise>(res);
}
export async function getExerciseStats(token: string, id: number, metric?: string): Promise<ExerciseStats> {
  const qs = metric ? `?metric=${encodeURIComponent(metric)}` : '';
  const res = await fetch(`${API_BASE}/api/exercises/${id}/stats${qs}`, { headers: headers(token) });
  return handle<ExerciseStats>(res);
}
export async function getExerciseHistory(token: string, id: number, params?: { limit?: number; offset?: number }): Promise<ExerciseHistoryEntry[]> {
  const qs = new URLSearchParams();
  if (params?.limit) qs.set('limit', String(params.limit));
  if (params?.offset) qs.set('offset', String(params.offset));
  const res = await fetch(`${API_BASE}/api/exercises/${id}/history?${qs}`, { headers: headers(token) });
  return handle<ExerciseHistoryEntry[]>(res);
}

// Routines
export async function getRoutines(token: string): Promise<RoutineSummary[]> {
  const res = await fetch(`${API_BASE}/api/routines`, { headers: headers(token) });
  return handle<RoutineSummary[]>(res);
}
export async function getRoutine(token: string, id: number): Promise<RoutineDetail> {
  const res = await fetch(`${API_BASE}/api/routines/${id}`, { headers: headers(token) });
  return handle<RoutineDetail>(res);
}
export async function updateRoutine(token: string, id: number, data: { name?: string; notes?: string; routineType?: string }): Promise<void> {
  const res = await fetch(`${API_BASE}/api/routines/${id}`, { method: 'PUT', headers: headers(token), body: JSON.stringify(data) });
  await handle(res);
}
export async function createRoutine(token: string, data: { name: string; notes?: string }): Promise<{ id: number; name: string }> {
  const res = await fetch(`${API_BASE}/api/routines`, { method: 'POST', headers: headers(token), body: JSON.stringify(data) });
  return handle(res);
}
export async function deleteRoutine(token: string, id: number): Promise<void> {
  const res = await fetch(`${API_BASE}/api/routines/${id}`, { method: 'DELETE', headers: headers(token) });
  await handle(res);
}
export async function startRoutine(token: string, id: number): Promise<WorkoutDetail> {
  const res = await fetch(`${API_BASE}/api/routines/${id}/start`, { method: 'POST', headers: headers(token) });
  return handle<WorkoutDetail>(res);
}
export async function addRoutineExercise(token: string, routineId: number, exerciseId: number): Promise<RoutineExercise> {
  const res = await fetch(`${API_BASE}/api/routines/${routineId}/exercises`, { method: 'POST', headers: headers(token), body: JSON.stringify({ exerciseId }) });
  return handle<RoutineExercise>(res);
}
export async function removeRoutineExercise(token: string, routineId: number, reId: number): Promise<void> {
  const res = await fetch(`${API_BASE}/api/routines/${routineId}/exercises/${reId}`, { method: 'DELETE', headers: headers(token) });
  await handle(res);
}
export async function reorderRoutineExercises(token: string, routineId: number, order: { id: number; sortOrder: number }[]): Promise<void> {
  const res = await fetch(`${API_BASE}/api/routines/${routineId}/exercises/reorder`, { method: 'PUT', headers: headers(token), body: JSON.stringify({ order }) });
  await handle(res);
}
export async function addRoutineTemplateSet(token: string, routineId: number, reId: number, data: { reps?: number; weightKg?: number; durationSeconds?: number; distanceMeters?: number; steps?: number }): Promise<RoutineExerciseSet> {
  const res = await fetch(`${API_BASE}/api/routines/${routineId}/exercises/${reId}/sets`, { method: 'POST', headers: headers(token), body: JSON.stringify(data) });
  return handle<RoutineExerciseSet>(res);
}
export async function updateRoutineTemplateSet(token: string, routineId: number, reId: number, setId: number, data: { reps?: number; weightKg?: number; durationSeconds?: number; distanceMeters?: number; steps?: number }): Promise<void> {
  const res = await fetch(`${API_BASE}/api/routines/${routineId}/exercises/${reId}/sets/${setId}`, { method: 'PUT', headers: headers(token), body: JSON.stringify(data) });
  await handle(res);
}
export async function getRoutineGoals(token: string): Promise<{ routineId: number; targetPerWeek: number }[]> {
  const res = await fetch(`${API_BASE}/api/routines/goals`, { headers: headers(token) });
  return handle(res);
}
export async function deleteRoutineTemplateSet(token: string, routineId: number, reId: number, setId: number): Promise<void> {
  const res = await fetch(`${API_BASE}/api/routines/${routineId}/exercises/${reId}/sets/${setId}`, { method: 'DELETE', headers: headers(token) });
  await handle(res);
}

// Foods search
export async function searchFoods(token: string, q: string): Promise<Food[]> {
  const res = await fetch(`${API_BASE}/api/foods/search?q=${encodeURIComponent(q)}&limit=20`, { headers: headers(token) });
  return handle<Food[]>(res);
}

export async function getFoodByBarcode(token: string, barcode: string): Promise<Food | null> {
  const res = await fetch(`${API_BASE}/api/foods/barcode/${encodeURIComponent(barcode)}`, { headers: headers(token) });
  if (res.status === 404) return null;
  return handle<Food>(res);
}

export async function searchRecipes(token: string, q: string): Promise<RecipeSearchResult[]> {
  const res = await fetch(`${API_BASE}/api/recipes/search?q=${encodeURIComponent(q)}`, { headers: headers(token) });
  return handle<RecipeSearchResult[]>(res);
}

export async function getRecipeBarcode(token: string, recipeId: number): Promise<{ barcode: string | null }> {
  const res = await fetch(`${API_BASE}/api/recipes/${recipeId}/barcode`, { headers: headers(token) });
  if (res.status === 404) return { barcode: null };
  return handle<{ barcode: string | null }>(res);
}

export async function setRecipeBarcode(token: string, recipeId: number, barcode: string): Promise<void> {
  const res = await fetch(`${API_BASE}/api/recipes/${recipeId}/barcode`, { method: 'PUT', headers: headers(token), body: JSON.stringify({ barcode }) });
  await handle<unknown>(res);
}

export async function getRecipeByBarcode(token: string, barcode: string): Promise<RecipeSearchResult | null> {
  const res = await fetch(`${API_BASE}/api/recipes/barcode/${encodeURIComponent(barcode)}`, { headers: headers(token) });
  if (res.status === 404) return null;
  return handle<RecipeSearchResult>(res);
}

export type FromBarcodeResult =
  | { found: false }
  | { recipeId: number; created: boolean };

export async function createRecipeFromBarcode(
  token: string,
  params: { barcode: string; name?: string }
): Promise<FromBarcodeResult> {
  const res = await fetch(`${API_BASE}/api/recipes/from-barcode`, {
    method: 'POST',
    headers: headers(token),
    body: JSON.stringify(params),
  });
  return handle<FromBarcodeResult>(res);
}

// Auth / account
export async function changeUsername(token: string, data: { newUsername: string; currentPassword: string }): Promise<{ token: string }> {
  const res = await fetch(`${API_BASE}/api/auth/username`, { method: 'PUT', headers: headers(token), body: JSON.stringify(data) });
  return handle<{ token: string }>(res);
}
export async function changePassword(token: string, data: { currentPassword: string; newPassword: string }): Promise<{ token: string }> {
  const res = await fetch(`${API_BASE}/api/auth/password`, { method: 'PUT', headers: headers(token), body: JSON.stringify(data) });
  return handle<{ token: string }>(res);
}
export async function deleteData(token: string, scope: DeleteScope): Promise<void> {
  const res = await fetch(`${API_BASE}/api/auth/data?scope=${scope}`, { method: 'DELETE', headers: headers(token) });
  await handle(res);
}

export async function getProfile(token: string): Promise<UserProfile> {
  const res = await fetch(`${API_BASE}/api/auth/profile`, { headers: headers(token) });
  return handle<UserProfile>(res);
}
export async function updateProfile(token: string, data: Partial<UserProfile>): Promise<void> {
  const res = await fetch(`${API_BASE}/api/auth/profile`, { method: 'PUT', headers: headers(token), body: JSON.stringify(data) });
  await handle(res);
}

// Nutrition goals (wrapper for /user-goals endpoints)
export interface NutritionGoals { calories: number; carbsG: number; proteinG: number; fatG: number; waterGoalOz?: number; }
export async function saveNutritionGoals(token: string, data: NutritionGoals): Promise<void> {
  // Fetch existing goals to get IDs if they exist
  const res = await fetch(`${API_BASE}/api/user-goals`, { headers: headers(token) });
  const allGoals = await handle<any[]>(res);

  // Nutrition goals: map old format to new sourceKey format
  const nutritionGoals = [
    { sourceKey: 'calories', name: 'Calories', value: data.calories, unit: 'kcal' },
    { sourceKey: 'carbs_g', name: 'Carbs', value: data.carbsG, unit: 'g' },
    { sourceKey: 'protein_g', name: 'Protein', value: data.proteinG, unit: 'g' },
    { sourceKey: 'fat_g', name: 'Fat', value: data.fatG, unit: 'g' },
  ];

  for (const goal of nutritionGoals) {
    const existing = allGoals.find((g) => g.sourceKey === goal.sourceKey);
    const payload = {
      name: goal.name,
      metricType: 'nutrition_daily_avg' as const,
      sourceType: 'nutrition' as const,
      sourceId: null,
      sourceKey: goal.sourceKey,
      targetValue: goal.value,
      unit: goal.unit,
      targetDate: null,
    };

    if (existing) {
      // Update existing goal
      const updateRes = await fetch(`${API_BASE}/api/user-goals/${existing.id}`, {
        method: 'PUT',
        headers: headers(token),
        body: JSON.stringify({ targetValue: goal.value }),
      });
      await handle(updateRes);
    } else {
      // Create new goal
      const createRes = await fetch(`${API_BASE}/api/user-goals`, {
        method: 'POST',
        headers: headers(token),
        body: JSON.stringify(payload),
      });
      await handle(createRes);
    }
  }

  // Handle water goal separately if provided
  if (data.waterGoalOz != null) {
    const existing = allGoals.find((g) => g.sourceKey === 'water_oz');
    const waterPayload = {
      name: 'Water',
      metricType: 'nutrition_daily_avg' as const,
      sourceType: 'nutrition' as const,
      sourceId: null,
      sourceKey: 'water_oz',
      targetValue: data.waterGoalOz,
      unit: 'oz',
      targetDate: null,
    };

    if (existing) {
      const updateRes = await fetch(`${API_BASE}/api/user-goals/${existing.id}`, {
        method: 'PUT',
        headers: headers(token),
        body: JSON.stringify({ targetValue: data.waterGoalOz }),
      });
      await handle(updateRes);
    } else {
      const createRes = await fetch(`${API_BASE}/api/user-goals`, {
        method: 'POST',
        headers: headers(token),
        body: JSON.stringify(waterPayload),
      });
      await handle(createRes);
    }
  }
}

// TDEE
export async function getTDEE(token: string, date?: string): Promise<TDEEResult> {
  const qs = date ? `?date=${date}` : '';
  const res = await fetch(`${API_BASE}/api/goals/tdee${qs}`, { headers: headers(token) });
  return handle<TDEEResult>(res);
}

// Exercise goals
export async function getExerciseGoals(token: string): Promise<ExerciseGoals> {
  const res = await fetch(`${API_BASE}/api/goals/exercise`, { headers: headers(token) });
  return handle<ExerciseGoals>(res);
}

export async function saveExerciseGoals(token: string, data: ExerciseGoals): Promise<void> {
  const res = await fetch(`${API_BASE}/api/user-goals`, { headers: headers(token) });
  const allGoals = await handle<any[]>(res);

  // Exercise goals with sourceKey mapping
  const exerciseGoals = [
    { sourceKey: 'workouts_per_week', name: 'Workouts per week', metricType: 'exercise_weekly_sessions', value: data.workoutsPerWeek, unit: 'sessions' },
    { sourceKey: 'minutes_per_week', name: 'Minutes per week', metricType: 'exercise_weekly_duration', value: data.minutesPerWeek, unit: 'minutes' },
    { sourceKey: 'volume_lbs_per_week', name: 'Volume per week', metricType: 'exercise_weekly_volume', value: data.volumeLbsPerWeek, unit: 'lbs' },
  ];

  for (const goal of exerciseGoals) {
    const existing = allGoals.find((g) => g.sourceKey === goal.sourceKey);

    if (goal.value == null) {
      // Delete if null
      if (existing) {
        const deleteRes = await fetch(`${API_BASE}/api/user-goals/${existing.id}`, { method: 'DELETE', headers: headers(token) });
        await handle(deleteRes);
      }
    } else {
      const payload = {
        name: goal.name,
        metricType: goal.metricType,
        sourceType: 'exercise' as const,
        sourceId: null,
        sourceKey: goal.sourceKey,
        targetValue: goal.value,
        unit: goal.unit,
        targetDate: null,
      };

      if (existing) {
        // Update existing goal
        const updateRes = await fetch(`${API_BASE}/api/user-goals/${existing.id}`, {
          method: 'PUT',
          headers: headers(token),
          body: JSON.stringify({ targetValue: goal.value }),
        });
        await handle(updateRes);
      } else {
        // Create new goal
        const createRes = await fetch(`${API_BASE}/api/user-goals`, {
          method: 'POST',
          headers: headers(token),
          body: JSON.stringify(payload),
        });
        await handle(createRes);
      }
    }
  }
}

// Measurement goals
export async function getMeasurementGoals(token: string): Promise<Record<string, MeasurementGoal>> {
  const res = await fetch(`${API_BASE}/api/measurements/goals`, { headers: headers(token) });
  return handle<Record<string, MeasurementGoal>>(res);
}
export async function setMeasurementGoal(token: string, metric: string, data: { targetValue: number; unit: string; targetDate: string | null }): Promise<void> {
  const res = await fetch(`${API_BASE}/api/measurements/goals/${metric}`, { method: 'PUT', headers: headers(token), body: JSON.stringify(data) });
  await handle(res);
}
export async function deleteMeasurementGoal(token: string, metric: string): Promise<void> {
  const res = await fetch(`${API_BASE}/api/measurements/goals/${metric}`, { method: 'DELETE', headers: headers(token) });
  await handle(res);
}

// Nutrition history
export async function getDailyHistory(token: string, start: string, end: string): Promise<DailyHistoryEntry[]> {
  const res = await fetch(`${API_BASE}/api/history/daily?start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}`, { headers: headers(token) });
  return handle<DailyHistoryEntry[]>(res);
}

// AI insight + recovery (Phase 4 endpoints — graceful-fail callers)
export async function getAiInsight(token: string): Promise<{ text: string }> {
  const res = await fetch(`${API_BASE}/api/ai/insight`, { headers: headers(token) });
  return handle<{ text: string }>(res);
}
export async function getRecovery(token: string): Promise<{ level: 'high' | 'medium' | 'low'; score: number; hint: string }> {
  const res = await fetch(`${API_BASE}/api/recovery`, { headers: headers(token) });
  return handle<{ level: 'high' | 'medium' | 'low'; score: number; hint: string }>(res);
}

// Workout personal bests
export async function getPersonalBests(token: string): Promise<PersonalBests> {
  const res = await fetch(`${API_BASE}/api/workouts/personal-bests`, { headers: headers(token) });
  return handle<PersonalBests>(res);
}

// Body measurements
export async function getMeasurements(token: string, params?: { start?: string; end?: string }): Promise<BodyMeasurement[]> {
  const p = new URLSearchParams();
  if (params?.start) p.set('start', params.start);
  if (params?.end) p.set('end', params.end);
  const qs = p.toString() ? `?${p.toString()}` : '';
  const res = await fetch(`${API_BASE}/api/measurements${qs}`, { headers: headers(token) });
  return handle<BodyMeasurement[]>(res);
}
export async function addMeasurement(token: string, data: { metric: string; value: number; unit: string; measuredAt: string }): Promise<BodyMeasurement> {
  const res = await fetch(`${API_BASE}/api/measurements`, { method: 'POST', headers: headers(token), body: JSON.stringify(data) });
  return handle<BodyMeasurement>(res);
}
export async function updateMeasurement(token: string, id: number, data: { value: number; measuredAt?: string; notes?: string }): Promise<BodyMeasurement> {
  const res = await fetch(`${API_BASE}/api/measurements/${id}`, { method: 'PUT', headers: headers(token), body: JSON.stringify(data) });
  return handle<BodyMeasurement>(res);
}
export async function deleteMeasurement(token: string, id: number): Promise<void> {
  const res = await fetch(`${API_BASE}/api/measurements/${id}`, { method: 'DELETE', headers: headers(token) });
  await handle(res);
}

export interface StepsEntry { date: string; steps: number | null; source?: string; }
export async function getSteps(token: string, date?: string): Promise<StepsEntry> {
  const qs = date ? `?date=${encodeURIComponent(date)}` : '';
  const res = await fetch(`${API_BASE}/api/steps${qs}`, { headers: headers(token) });
  return handle<StepsEntry>(res);
}
export async function logSteps(token: string, steps: number, date?: string): Promise<StepsEntry> {
  const res = await fetch(`${API_BASE}/api/steps`, {
    method: 'POST',
    headers: headers(token),
    body: JSON.stringify({ steps, date }),
  });
  return handle<StepsEntry>(res);
}

export async function getWaterHistory(token: string, start: string, end: string): Promise<WaterHistory> {
  const res = await fetch(`${API_BASE}/api/water/history?start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}`, { headers: headers(token) });
  return handle<WaterHistory>(res);
}

export async function getFoodLogHistory(token: string, params?: { limit?: number; start?: string; end?: string }): Promise<FoodLogHistoryDay[]> {
  const p = new URLSearchParams();
  if (params?.limit != null) p.set('limit', String(params.limit));
  if (params?.start) p.set('start', params.start);
  if (params?.end) p.set('end', params.end);
  const qs = p.toString() ? `?${p.toString()}` : '';
  const res = await fetch(`${API_BASE}/api/log/history${qs}`, { headers: headers(token) });
  return handle<FoodLogHistoryDay[]>(res);
}

export interface FrequentFood {
  foodId: number;
  name: string;
  brand: string | null;
  logCount: number;
  servingSizeId: number;
  servingLabel: string;
  servingGrams: number;
  caloriesPerServing: number;
  proteinPerServing: number;
  carbsPerServing: number;
  fatPerServing: number;
}

export async function getFrequentFoods(token: string): Promise<FrequentFood[]> {
  const res = await fetch(`${API_BASE}/api/log/frequent`, { headers: headers(token) });
  return handle<FrequentFood[]>(res);
}

export async function logRecipeToNutrition(
  token: string,
  payload: { recipeId: number; meal: string; servings: number; logDate?: string }
): Promise<void> {
  const res = await fetch(`${API_BASE}/api/log/recipe`, {
    method: 'POST',
    headers: headers(token),
    body: JSON.stringify(payload),
  });
  await handle(res);
}

export interface RecipeMacroResult {
  name: string;
  calories: number;
  carbs_g: number;
  protein_g: number;
  fat_g: number;
  fiber_g: number;
  sodium_mg: number;
}

export async function aiModifyRecipe(
  token: string,
  id: number,
  prompt: string,
  mode: 'update' | 'log'
): Promise<{ modified: any }> {
  const res = await fetch(`${API_BASE}/api/recipes/${id}/ai-modify`, {
    method: 'POST',
    headers: headers(token),
    body: JSON.stringify({ prompt, mode }),
  });
  return handle<{ modified: any }>(res);
}

export async function estimateMacros(
  token: string,
  payload: { name: string; brand?: string; description?: string }
): Promise<{ calories: number; carbs: number; protein: number; fat: number; fiber?: number | null; sodium?: number | null }> {
  const res = await fetch(`${API_BASE}/api/foods/estimate-macros`, {
    method: 'POST',
    headers: headers(token),
    body: JSON.stringify(payload),
  });
  const data = await handle<{ nutrition: { calories: number; carbs: number; protein: number; fat: number; fiber?: number | null; sodium?: number | null } }>(res);
  return data.nutrition;
}

export async function logInline(
  token: string,
  payload: {
    name: string;
    meal: string;
    logDate?: string;
    calories: number;
    carbs_g: number;
    protein_g: number;
    fat_g: number;
    fiber_g?: number | null;
    sodium_mg?: number | null;
  }
): Promise<void> {
  const res = await fetch(`${API_BASE}/api/log/inline`, {
    method: 'POST',
    headers: headers(token),
    body: JSON.stringify(payload),
  });
  await handle(res);
}

// Workout schedules
export async function getSchedules(token: string): Promise<WorkoutSchedule[]> {
  const res = await fetch(`${API_BASE}/api/schedules`, { headers: headers(token) });
  return handle<WorkoutSchedule[]>(res);
}
export async function getUpcomingSchedule(token: string, days = 14): Promise<UpcomingSession[]> {
  const res = await fetch(`${API_BASE}/api/schedules/upcoming?days=${days}`, { headers: headers(token) });
  return handle<UpcomingSession[]>(res);
}
export async function createSchedule(token: string, data: {
  routineId?: number | null;
  exerciseId?: number | null;
  label?: string;
  isRestDay?: boolean;
  recurrenceType: RecurrenceType;
  recurrenceConfig: any;
  startDate: string;
  endDate?: string | null;
}): Promise<WorkoutSchedule> {
  const res = await fetch(`${API_BASE}/api/schedules`, { method: 'POST', headers: headers(token), body: JSON.stringify(data) });
  return handle<WorkoutSchedule>(res);
}
export async function updateSchedule(token: string, id: number, data: Partial<{
  routineId: number | null;
  label: string | null;
  isRestDay: boolean;
  recurrenceType: RecurrenceType;
  recurrenceConfig: any;
  startDate: string;
  endDate: string | null;
}>): Promise<WorkoutSchedule> {
  const res = await fetch(`${API_BASE}/api/schedules/${id}`, { method: 'PUT', headers: headers(token), body: JSON.stringify(data) });
  return handle<WorkoutSchedule>(res);
}
export async function deleteSchedule(token: string, id: number): Promise<void> {
  const res = await fetch(`${API_BASE}/api/schedules/${id}`, { method: 'DELETE', headers: headers(token) });
  await handle(res);
}
export async function overrideScheduleDay(token: string, scheduleId: number, data: { date: string; status: 'completed' | 'skipped' | 'rest'; workoutLogId?: number }): Promise<void> {
  const res = await fetch(`${API_BASE}/api/schedules/${scheduleId}/override`, { method: 'POST', headers: headers(token), body: JSON.stringify(data) });
  await handle(res);
}
export async function getProgramTemplates(token: string): Promise<ProgramTemplate[]> {
  const res = await fetch(`${API_BASE}/api/schedules/program-templates`, { headers: headers(token) });
  return handle<ProgramTemplate[]>(res);
}
export async function importProgramTemplate(token: string, templateId: number, data: { startDate: string; slotMap: Record<string, number | null> }): Promise<WorkoutSchedule[]> {
  const res = await fetch(`${API_BASE}/api/schedules/program-templates/${templateId}/import`, { method: 'POST', headers: headers(token), body: JSON.stringify(data) });
  return handle<WorkoutSchedule[]>(res);
}

// Meal planning
export interface MealPlanEntry {
  id: number;
  type: 'food' | 'recipe';
  name: string;
  foodId?: number;
  servingSizeId?: number;
  servingLabel?: string;
  quantity?: number;
  recipeId?: number;
  recipeServings?: number;
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  sortOrder: number;
}
export interface MealPlanDay {
  date: string;
  dayLabel: string;
  meals: Record<MealSlot, MealPlanEntry[]>;
  totals: { calories: number; proteinG: number; carbsG: number; fatG: number };
}
export interface MealPlanWeek { weekStart: string; days: MealPlanDay[] }
export interface MealPlanTemplate { id: number; name: string; createdAt: string }

export async function getMealPlanWeek(token: string, weekStart: string): Promise<MealPlanWeek> {
  const res = await fetch(`${API_BASE}/api/meal-plan?week=${weekStart}`, { headers: headers(token) });
  return handle<MealPlanWeek>(res);
}
export async function addMealPlanFoodEntry(token: string, payload: { planDate: string; meal: MealSlot; foodId: number; servingSizeId: number; quantity: number }): Promise<MealPlanEntry> {
  const res = await fetch(`${API_BASE}/api/meal-plan/entries`, { method: 'POST', headers: headers(token), body: JSON.stringify(payload) });
  return handle<MealPlanEntry>(res);
}
export async function addMealPlanRecipeEntry(token: string, payload: { planDate: string; meal: MealSlot; recipeId: number; recipeServings: number }): Promise<MealPlanEntry> {
  const res = await fetch(`${API_BASE}/api/meal-plan/entries`, { method: 'POST', headers: headers(token), body: JSON.stringify(payload) });
  return handle<MealPlanEntry>(res);
}
export async function deleteMealPlanEntry(token: string, id: number): Promise<void> {
  const res = await fetch(`${API_BASE}/api/meal-plan/entries/${id}`, { method: 'DELETE', headers: headers(token) });
  await handle(res);
}
export async function getMealPlanTemplates(token: string): Promise<MealPlanTemplate[]> {
  const res = await fetch(`${API_BASE}/api/meal-plan/templates`, { headers: headers(token) });
  return handle<MealPlanTemplate[]>(res);
}
export async function saveMealPlanTemplate(token: string, name: string, weekStart: string): Promise<{ id: number; name: string }> {
  const res = await fetch(`${API_BASE}/api/meal-plan/templates`, { method: 'POST', headers: headers(token), body: JSON.stringify({ name, weekStart }) });
  return handle<{ id: number; name: string }>(res);
}
export async function applyMealPlanTemplate(token: string, templateId: number, weekStart: string): Promise<{ applied: number }> {
  const res = await fetch(`${API_BASE}/api/meal-plan/templates/${templateId}/apply`, { method: 'POST', headers: headers(token), body: JSON.stringify({ weekStart }) });
  return handle<{ applied: number }>(res);
}
export async function deleteMealPlanTemplate(token: string, id: number): Promise<void> {
  const res = await fetch(`${API_BASE}/api/meal-plan/templates/${id}`, { method: 'DELETE', headers: headers(token) });
  await handle(res);
}

// AI Assistant
export interface AssistantMessage { role: 'user' | 'assistant'; content: string }
export interface AssistantScreenContext { screen: string; data?: Record<string, unknown> }
export type AssistantActionType = 'log_food' | 'update_nutrition_goal';
export interface AssistantAction { type: AssistantActionType; payload: Record<string, unknown> }
export interface AssistantResponse { type: 'answer' | 'action'; text: string; action?: AssistantAction }

export async function sendAssistantMessage(
  token: string,
  payload: { history: AssistantMessage[]; message: string; context?: AssistantScreenContext }
): Promise<AssistantResponse> {
  const res = await fetch(`${API_BASE}/api/ai/assistant`, {
    method: 'POST',
    headers: headers(token),
    body: JSON.stringify(payload),
  });
  return handle<AssistantResponse>(res);
}

// ─── User Goals CRUD ────────────────────────────────────────────────────────────
export type {
  UserGoal, UserGoalPayload, GoalMetricType, GoalSourceType, GoalCategory,
} from '../../../../packages/api-client/src/endpoints/user-goals';

export async function getUserGoals(token: string): Promise<import('../../../../packages/api-client/src/endpoints/user-goals').UserGoal[]> {
  const res = await fetch(`${API_BASE}/api/user-goals`, { headers: headers(token) });
  return handle(res);
}
export async function createUserGoal(token: string, data: import('../../../../packages/api-client/src/endpoints/user-goals').UserGoalPayload): Promise<import('../../../../packages/api-client/src/endpoints/user-goals').UserGoal> {
  const res = await fetch(`${API_BASE}/api/user-goals`, { method: 'POST', headers: headers(token), body: JSON.stringify(data) });
  return handle(res);
}
export async function updateUserGoal(token: string, id: number, data: Partial<import('../../../../packages/api-client/src/endpoints/user-goals').UserGoalPayload>): Promise<import('../../../../packages/api-client/src/endpoints/user-goals').UserGoal> {
  const res = await fetch(`${API_BASE}/api/user-goals/${id}`, { method: 'PUT', headers: headers(token), body: JSON.stringify(data) });
  return handle(res);
}
export async function deleteUserGoal(token: string, id: number): Promise<void> {
  const res = await fetch(`${API_BASE}/api/user-goals/${id}`, { method: 'DELETE', headers: headers(token) });
  await handle(res);
}

// ─── Weekly nutrition goals ──────────────────────────────────────────────────
export async function saveWeeklyNutritionGoals(token: string, data: {
  weeklyCalories?: number | null;
  weeklyProteinG?: number | null;
  weeklyCarbsG?: number | null;
  weeklyFatG?: number | null;
}): Promise<void> {
  const res = await fetch(`${API_BASE}/api/goals/weekly`, { method: 'PATCH', headers: headers(token), body: JSON.stringify(data) });
  await handle(res);
}

// ─── Routine goals ───────────────────────────────────────────────────────────
export type { RoutineGoal } from '../../../../packages/api-client/src/endpoints/routines';
export async function setRoutineGoal(token: string, routineId: number, targetPerWeek: number): Promise<void> {
  const res = await fetch(`${API_BASE}/api/routines/${routineId}/goal`, { method: 'PUT', headers: headers(token), body: JSON.stringify({ targetPerWeek }) });
  await handle(res);
}
export async function deleteRoutineGoal(token: string, routineId: number): Promise<void> {
  const res = await fetch(`${API_BASE}/api/routines/${routineId}/goal`, { method: 'DELETE', headers: headers(token) });
  await handle(res);
}

// ─── Goal checkpoints ────────────────────────────────────────────────────────
export type { GoalCheckpoint } from '../../../../packages/api-client/src/endpoints/calendar';
export async function getGoalCheckpoints(token: string): Promise<import('../../../../packages/api-client/src/endpoints/calendar').GoalCheckpoint[]> {
  const res = await fetch(`${API_BASE}/api/goal-checkpoints`, { headers: headers(token) });
  return handle(res);
}
export async function createGoalCheckpoint(token: string, data: Omit<import('../../../../packages/api-client/src/endpoints/calendar').GoalCheckpoint, 'id'>): Promise<import('../../../../packages/api-client/src/endpoints/calendar').GoalCheckpoint> {
  const res = await fetch(`${API_BASE}/api/goal-checkpoints`, { method: 'POST', headers: headers(token), body: JSON.stringify(data) });
  return handle(res);
}
export async function updateGoalCheckpoint(token: string, id: number, data: Omit<import('../../../../packages/api-client/src/endpoints/calendar').GoalCheckpoint, 'id'>): Promise<import('../../../../packages/api-client/src/endpoints/calendar').GoalCheckpoint> {
  const res = await fetch(`${API_BASE}/api/goal-checkpoints/${id}`, { method: 'PUT', headers: headers(token), body: JSON.stringify(data) });
  return handle(res);
}
export async function deleteGoalCheckpoint(token: string, id: number): Promise<void> {
  const res = await fetch(`${API_BASE}/api/goal-checkpoints/${id}`, { method: 'DELETE', headers: headers(token) });
  await handle(res);
}

// ─── Day type presets + overrides ───────────────────────────────────────────
export type { DayTypePreset, DailyNutritionOverride } from '../../../../packages/api-client/src/endpoints/calendar';
export async function getDayTypePresets(token: string): Promise<import('../../../../packages/api-client/src/endpoints/calendar').DayTypePreset[]> {
  const res = await fetch(`${API_BASE}/api/day-types/presets`, { headers: headers(token) });
  return handle(res);
}
export async function createDayTypePreset(token: string, data: Omit<import('../../../../packages/api-client/src/endpoints/calendar').DayTypePreset, 'id'>): Promise<import('../../../../packages/api-client/src/endpoints/calendar').DayTypePreset> {
  const res = await fetch(`${API_BASE}/api/day-types/presets`, { method: 'POST', headers: headers(token), body: JSON.stringify(data) });
  return handle(res);
}
export async function updateDayTypePreset(token: string, id: number, data: Omit<import('../../../../packages/api-client/src/endpoints/calendar').DayTypePreset, 'id'>): Promise<import('../../../../packages/api-client/src/endpoints/calendar').DayTypePreset> {
  const res = await fetch(`${API_BASE}/api/day-types/presets/${id}`, { method: 'PUT', headers: headers(token), body: JSON.stringify(data) });
  return handle(res);
}
export async function deleteDayTypePreset(token: string, id: number): Promise<void> {
  const res = await fetch(`${API_BASE}/api/day-types/presets/${id}`, { method: 'DELETE', headers: headers(token) });
  await handle(res);
}
export async function getDailyNutritionOverrides(token: string, from: string, to: string): Promise<import('../../../../packages/api-client/src/endpoints/calendar').DailyNutritionOverride[]> {
  const res = await fetch(`${API_BASE}/api/day-types/overrides?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`, { headers: headers(token) });
  return handle(res);
}
export async function upsertDailyNutritionOverride(token: string, date: string, data: Omit<import('../../../../packages/api-client/src/endpoints/calendar').DailyNutritionOverride, 'date' | 'dayTypeName'>): Promise<import('../../../../packages/api-client/src/endpoints/calendar').DailyNutritionOverride> {
  const res = await fetch(`${API_BASE}/api/day-types/overrides/${date}`, { method: 'PUT', headers: headers(token), body: JSON.stringify(data) });
  return handle(res);
}
export async function deleteDailyNutritionOverride(token: string, date: string): Promise<void> {
  const res = await fetch(`${API_BASE}/api/day-types/overrides/${date}`, { method: 'DELETE', headers: headers(token) });
  await handle(res);
}

// ─── Meal schedules (recurring) ──────────────────────────────────────────────
export type { MealSchedule, MealRecurrenceType, MealScheduleEvent } from '../../../../packages/api-client/src/endpoints/calendar';
export async function getMealSchedules(token: string): Promise<import('../../../../packages/api-client/src/endpoints/calendar').MealSchedule[]> {
  const res = await fetch(`${API_BASE}/api/meal-schedules`, { headers: headers(token) });
  return handle(res);
}
export async function getMealScheduleUpcoming(token: string, days = 30): Promise<import('../../../../packages/api-client/src/endpoints/calendar').MealScheduleEvent[]> {
  const res = await fetch(`${API_BASE}/api/meal-schedules/upcoming?days=${days}`, { headers: headers(token) });
  return handle(res);
}
export async function createMealSchedule(token: string, data: any): Promise<import('../../../../packages/api-client/src/endpoints/calendar').MealSchedule> {
  const res = await fetch(`${API_BASE}/api/meal-schedules`, { method: 'POST', headers: headers(token), body: JSON.stringify(data) });
  return handle(res);
}
export async function deleteMealSchedule(token: string, id: number): Promise<void> {
  const res = await fetch(`${API_BASE}/api/meal-schedules/${id}`, { method: 'DELETE', headers: headers(token) });
  await handle(res);
}

// ─── Nutrition schedules (recurring) ────────────────────────────────────────
export type { NutritionSchedule, NutritionScheduleEvent } from '../../../../packages/api-client/src/endpoints/calendar';
export async function getNutritionSchedules(token: string): Promise<import('../../../../packages/api-client/src/endpoints/calendar').NutritionSchedule[]> {
  const res = await fetch(`${API_BASE}/api/nutrition-schedules`, { headers: headers(token) });
  return handle(res);
}
export async function getNutritionScheduleUpcoming(token: string, days = 60): Promise<import('../../../../packages/api-client/src/endpoints/calendar').NutritionScheduleEvent[]> {
  const res = await fetch(`${API_BASE}/api/nutrition-schedules/upcoming?days=${days}`, { headers: headers(token) });
  return handle(res);
}
export async function createNutritionSchedule(token: string, data: any): Promise<import('../../../../packages/api-client/src/endpoints/calendar').NutritionSchedule> {
  const res = await fetch(`${API_BASE}/api/nutrition-schedules`, { method: 'POST', headers: headers(token), body: JSON.stringify(data) });
  return handle(res);
}
export async function deleteNutritionSchedule(token: string, id: number): Promise<void> {
  const res = await fetch(`${API_BASE}/api/nutrition-schedules/${id}`, { method: 'DELETE', headers: headers(token) });
  await handle(res);
}

export async function logModifiedRecipe(
  token: string,
  payload: {
    recipeId: number;
    meal: string;
    logDate?: string;
    name: string;
    calories: number;
    carbs_g: number;
    protein_g: number;
    fat_g: number;
    fiber_g?: number | null;
    sodium_mg?: number | null;
  }
): Promise<void> {
  const res = await fetch(`${API_BASE}/api/log/recipe-modified`, {
    method: 'POST',
    headers: headers(token),
    body: JSON.stringify(payload),
  });
  await handle(res);
}
