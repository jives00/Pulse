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
  ExerciseGoals, DailyHistoryEntry,
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
export async function getWorkouts(token: string, params?: { limit?: number; offset?: number; routineId?: number }): Promise<WorkoutSummary[]> {
  const p = new URLSearchParams();
  if (params?.limit != null) p.set('limit', String(params.limit));
  if (params?.offset != null) p.set('offset', String(params.offset));
  if (params?.routineId != null) p.set('routineId', String(params.routineId));
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

// Nutrition goals
export interface NutritionGoals { calories: number; carbsG: number; proteinG: number; fatG: number; waterGoalOz?: number; }
export async function saveNutritionGoals(token: string, data: NutritionGoals): Promise<void> {
  const res = await fetch(`${API_BASE}/api/goals/nutrition`, { method: 'POST', headers: headers(token), body: JSON.stringify(data) });
  await handle(res);
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
  const res = await fetch(`${API_BASE}/api/goals/exercise`, { method: 'POST', headers: headers(token), body: JSON.stringify(data) });
  await handle(res);
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

// Nutrition history
export async function getDailyHistory(token: string, start: string, end: string): Promise<DailyHistoryEntry[]> {
  const res = await fetch(`${API_BASE}/api/history/daily?start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}`, { headers: headers(token) });
  return handle<DailyHistoryEntry[]>(res);
}

// Workout personal bests
export async function getPersonalBests(token: string): Promise<PersonalBests> {
  const res = await fetch(`${API_BASE}/api/workouts/personal-bests`, { headers: headers(token) });
  return handle<PersonalBests>(res);
}

// Body measurements
export async function getMeasurements(token: string): Promise<BodyMeasurement[]> {
  const res = await fetch(`${API_BASE}/api/measurements`, { headers: headers(token) });
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

export async function getWaterHistory(token: string, start: string, end: string): Promise<WaterHistory> {
  const res = await fetch(`${API_BASE}/api/water/history?start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}`, { headers: headers(token) });
  return handle<WaterHistory>(res);
}

export async function getFoodLogHistory(token: string, limit = 30): Promise<FoodLogHistoryDay[]> {
  const res = await fetch(`${API_BASE}/api/log/history?limit=${limit}`, { headers: headers(token) });
  return handle<FoodLogHistoryDay[]>(res);
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
