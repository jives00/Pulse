import type {
  Recipe,
  RecipeDetail,
  RecipeFormData,
  ScrapedRecipe,
  RecipeSuggestion,
  RecipeFilters,
  MakeLogEntry,
} from '../../../../packages/api-client/src/index';
import { buildRecipeParams } from '../../../../packages/api-client/src/index';

// In production nginx proxies /pulse/api/ → localhost:3000/api/
// VITE_API_URL overrides for custom deployments (e.g. mobile dev)
const BASE = (import.meta.env.VITE_API_URL as string | undefined) ?? (import.meta.env.PROD ? '/pulse' : '');

function headers(token: string) {
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
  };
}

async function handle<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as any).error || `HTTP ${res.status}`);
  }
  return res.json();
}

export async function login(username: string, password: string) {
  const res = await fetch(`${BASE}/api/auth/login`, {
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
  const res = await fetch(`${BASE}/api/recipes?${params}`, {
    headers: headers(token),
  });
  return handle<Recipe[]>(res);
}

export async function getRecipe(token: string, id: number): Promise<RecipeDetail> {
  const res = await fetch(`${BASE}/api/recipes/${id}`, { headers: headers(token) });
  return handle<RecipeDetail>(res);
}

export async function createRecipe(token: string, data: RecipeFormData): Promise<{ id: number }> {
  const res = await fetch(`${BASE}/api/recipes`, {
    method: 'POST',
    headers: headers(token),
    body: JSON.stringify(data),
  });
  return handle<{ id: number }>(res);
}

export async function updateRecipe(token: string, id: number, data: Partial<RecipeFormData> & { is_favorite?: number; photo_key?: string }) {
  const res = await fetch(`${BASE}/api/recipes/${id}`, {
    method: 'PUT',
    headers: headers(token),
    body: JSON.stringify(data),
  });
  return handle<{ success: boolean }>(res);
}

export async function clearAllHistory(token: string): Promise<void> {
  const res = await fetch(`${BASE}/api/recipes/history`, { method: 'DELETE', headers: headers(token) });
  await handle(res);
}

export async function deleteAllRecipes(token: string): Promise<void> {
  const res = await fetch(`${BASE}/api/recipes`, { method: 'DELETE', headers: headers(token) });
  await handle(res);
}

export async function deleteRecipe(token: string, id: number) {
  const res = await fetch(`${BASE}/api/recipes/${id}`, {
    method: 'DELETE',
    headers: headers(token),
  });
  return handle<{ success: boolean }>(res);
}

export async function logRecipe(token: string, id: number) {
  const res = await fetch(`${BASE}/api/recipes/${id}/log`, {
    method: 'POST',
    headers: headers(token),
  });
  return handle<{ success: boolean }>(res);
}

export async function getPhotoUploadUrl(token: string, id: number, contentType: string) {
  const res = await fetch(`${BASE}/api/recipes/${id}/photo`, {
    method: 'POST',
    headers: headers(token),
    body: JSON.stringify({ contentType }),
  });
  return handle<{ uploadUrl: string; key: string }>(res);
}

export async function uploadPhotoFromUrl(token: string, recipeId: number, url: string): Promise<{ key: string }> {
  const res = await fetch(`${BASE}/api/recipes/${recipeId}/photo-from-url`, {
    method: 'POST',
    headers: headers(token),
    body: JSON.stringify({ url }),
  });
  return handle<{ key: string }>(res);
}

export async function uploadPhotoToS3(uploadUrl: string, file: File) {
  await fetch(uploadUrl, {
    method: 'PUT',
    headers: { 'Content-Type': file.type },
    body: file,
  });
}

export async function suggestTags(token: string, data: {
  name: string;
  type: string;
  ingredients: string[];
  steps: string[];
}): Promise<string[]> {
  const res = await fetch(`${BASE}/api/tags/suggest`, {
    method: 'POST',
    headers: headers(token),
    body: JSON.stringify(data),
  });
  return handle<string[]>(res);
}

export async function getRecipeLog(token: string, recipeId: number): Promise<{ count: number; entries: MakeLogEntry[] }> {
  const res = await fetch(`${BASE}/api/recipes/${recipeId}/log`, { headers: headers(token) });
  return handle(res);
}

export async function updateLogEntry(token: string, recipeId: number, logId: number, made_at: string): Promise<void> {
  const res = await fetch(`${BASE}/api/recipes/${recipeId}/log/${logId}`, {
    method: 'PATCH',
    headers: headers(token),
    body: JSON.stringify({ made_at }),
  });
  await handle(res);
}

export async function deleteLogEntry(token: string, recipeId: number, logId: number): Promise<void> {
  const res = await fetch(`${BASE}/api/recipes/${recipeId}/log/${logId}`, { method: 'DELETE', headers: headers(token) });
  await handle(res);
}

export async function deleteAllLog(token: string, recipeId: number): Promise<void> {
  const res = await fetch(`${BASE}/api/recipes/${recipeId}/log`, { method: 'DELETE', headers: headers(token) });
  await handle(res);
}

export async function getTags(token: string): Promise<string[]> {
  const res = await fetch(`${BASE}/api/tags`, { headers: headers(token) });
  const data = await handle<{ id: number; name: string }[]>(res);
  return data.map((t) => t.name);
}

export async function scrapeRecipe(token: string, url: string, typeHint?: string): Promise<ScrapedRecipe> {
  const res = await fetch(`${BASE}/api/recipes/scrape`, {
    method: 'POST',
    headers: headers(token),
    body: JSON.stringify({ url, typeHint }),
  });
  return handle<ScrapedRecipe>(res);
}

export async function parseRecipeText(token: string, text: string, typeHint?: string): Promise<ScrapedRecipe> {
  const res = await fetch(`${BASE}/api/recipes/scrape/parse-text`, {
    method: 'POST',
    headers: headers(token),
    body: JSON.stringify({ text, typeHint }),
  });
  return handle<ScrapedRecipe>(res);
}

export interface LinkItem {
  id: number;
  url: string;
  title: string;
  favicon_url: string | null;
  created_at: string;
}

export interface HistoryEntry {
  log_id: number;
  made_at: string;
  recipe_id: number;
  name: string;
  photo_key: string | null;
  photo_url: string | null;
  type: string;
  subcategory: string | null;
}

export async function getHistory(token: string): Promise<HistoryEntry[]> {
  const res = await fetch(`${BASE}/api/recipes/history`, { headers: headers(token) });
  return handle<HistoryEntry[]>(res);
}

export async function getLinks(token: string): Promise<LinkItem[]> {
  const res = await fetch(`${BASE}/api/links`, { headers: headers(token) });
  return handle<LinkItem[]>(res);
}

export async function addLink(token: string, url: string): Promise<LinkItem> {
  const res = await fetch(`${BASE}/api/links`, {
    method: 'POST',
    headers: headers(token),
    body: JSON.stringify({ url }),
  });
  return handle<LinkItem>(res);
}

export async function updateLink(token: string, id: number, title: string, favicon_url?: string | null, url?: string): Promise<void> {
  const res = await fetch(`${BASE}/api/links/${id}`, {
    method: 'PUT',
    headers: headers(token),
    body: JSON.stringify({ title, favicon_url, url }),
  });
  await handle(res);
}

export async function deleteLink(token: string, id: number): Promise<void> {
  const res = await fetch(`${BASE}/api/links/${id}`, {
    method: 'DELETE',
    headers: headers(token),
  });
  await handle(res);
}

export async function getSuggestions(token: string, prompt?: string): Promise<RecipeSuggestion[]> {
  const params = new URLSearchParams();
  if (prompt) params.set('prompt', prompt);
  const res = await fetch(`${BASE}/api/recipes/suggest?${params}`, { headers: headers(token) });
  return handle<RecipeSuggestion[]>(res);
}

// ─── Goals ───────────────────────────────────────────────────

export interface GoalsSummary {
  date: string;
  weekStart: string;
  weekEnd: string;
  nutrition: {
    goals: { calories: number; carbsG: number; proteinG: number; fatG: number } | null;
    actual: { calories: number; carbsG: number; proteinG: number; fatG: number };
  };
  workouts: {
    goals: { workoutsPerWeek: number | null; minutesPerWeek: number | null } | null;
    actual: { workoutCount: number; totalMinutes: number };
  };
}

export interface ExerciseGoals {
  id?: number;
  workoutsPerWeek: number | null;
  minutesPerWeek: number | null;
}

export async function getGoalsSummary(token: string, date?: string): Promise<GoalsSummary> {
  const params = new URLSearchParams();
  if (date) params.set('date', date);
  const res = await fetch(`${BASE}/api/goals/summary?${params}`, { headers: headers(token) });
  return handle<GoalsSummary>(res);
}

export async function getExerciseGoals(token: string): Promise<ExerciseGoals> {
  const res = await fetch(`${BASE}/api/goals/exercise`, { headers: headers(token) });
  return handle<ExerciseGoals>(res);
}

export async function saveExerciseGoals(token: string, data: { workoutsPerWeek?: number | null; minutesPerWeek?: number | null }): Promise<ExerciseGoals> {
  const res = await fetch(`${BASE}/api/goals/exercise`, {
    method: 'POST',
    headers: headers(token),
    body: JSON.stringify(data),
  });
  return handle<ExerciseGoals>(res);
}

export async function saveNutritionGoals(token: string, data: { calories: number; carbsG: number; proteinG: number; fatG: number }): Promise<void> {
  const res = await fetch(`${BASE}/api/goals`, {
    method: 'POST',
    headers: headers(token),
    body: JSON.stringify(data),
  });
  await handle(res);
}

// ─── Workout / Exercise types ────────────────────────────────

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

// ─── Exercise endpoints ──────────────────────────────────────

export async function getExercises(token: string, params?: { search?: string; category?: string }): Promise<Exercise[]> {
  const q = new URLSearchParams();
  if (params?.search) q.set('search', params.search);
  if (params?.category) q.set('category', params.category);
  const res = await fetch(`${BASE}/api/exercises?${q}`, { headers: headers(token) });
  return handle<Exercise[]>(res);
}

export async function getExerciseCategories(token: string): Promise<string[]> {
  const res = await fetch(`${BASE}/api/exercises/categories`, { headers: headers(token) });
  return handle<string[]>(res);
}

export async function createCustomExercise(token: string, data: { name: string; category: string; exerciseType: string }): Promise<Exercise> {
  const res = await fetch(`${BASE}/api/exercises`, {
    method: 'POST', headers: headers(token), body: JSON.stringify(data),
  });
  return handle<Exercise>(res);
}

// ─── Workout endpoints ───────────────────────────────────────

export async function getWorkouts(token: string, params?: { limit?: number; offset?: number }): Promise<WorkoutSummary[]> {
  const q = new URLSearchParams();
  if (params?.limit) q.set('limit', String(params.limit));
  if (params?.offset) q.set('offset', String(params.offset));
  const res = await fetch(`${BASE}/api/workouts?${q}`, { headers: headers(token) });
  return handle<WorkoutSummary[]>(res);
}

export async function createWorkout(token: string, data?: { name?: string; workoutDate?: string }): Promise<WorkoutDetail> {
  const res = await fetch(`${BASE}/api/workouts`, {
    method: 'POST', headers: headers(token), body: JSON.stringify(data ?? {}),
  });
  return handle<WorkoutDetail>(res);
}

export async function getWorkout(token: string, id: number): Promise<WorkoutDetail> {
  const res = await fetch(`${BASE}/api/workouts/${id}`, { headers: headers(token) });
  return handle<WorkoutDetail>(res);
}

export async function updateWorkout(token: string, id: number, data: Partial<{ name: string; notes: string; durationMinutes: number; caloriesBurned: number; workoutDate: string }>): Promise<WorkoutDetail> {
  const res = await fetch(`${BASE}/api/workouts/${id}`, {
    method: 'PUT', headers: headers(token), body: JSON.stringify(data),
  });
  return handle<WorkoutDetail>(res);
}

export async function deleteWorkout(token: string, id: number): Promise<void> {
  const res = await fetch(`${BASE}/api/workouts/${id}`, { method: 'DELETE', headers: headers(token) });
  await handle(res);
}

export async function addExerciseToWorkout(token: string, workoutId: number, exerciseId: number): Promise<WorkoutExercise> {
  const res = await fetch(`${BASE}/api/workouts/${workoutId}/exercises`, {
    method: 'POST', headers: headers(token), body: JSON.stringify({ exerciseId }),
  });
  return handle<WorkoutExercise>(res);
}

export async function removeExerciseFromWorkout(token: string, workoutId: number, weId: number): Promise<void> {
  const res = await fetch(`${BASE}/api/workouts/${workoutId}/exercises/${weId}`, {
    method: 'DELETE', headers: headers(token),
  });
  await handle(res);
}

export async function addSet(token: string, workoutId: number, weId: number, data: { reps?: number; weightKg?: number; durationSeconds?: number; distanceMeters?: number }): Promise<ExerciseSet> {
  const res = await fetch(`${BASE}/api/workouts/${workoutId}/exercises/${weId}/sets`, {
    method: 'POST', headers: headers(token), body: JSON.stringify(data),
  });
  return handle<ExerciseSet>(res);
}

export async function updateSet(token: string, workoutId: number, weId: number, setId: number, data: { reps?: number; weightKg?: number; durationSeconds?: number; distanceMeters?: number; completed?: boolean }): Promise<void> {
  const res = await fetch(`${BASE}/api/workouts/${workoutId}/exercises/${weId}/sets/${setId}`, {
    method: 'PUT', headers: headers(token), body: JSON.stringify(data),
  });
  await handle(res);
}

export async function deleteSet(token: string, workoutId: number, weId: number, setId: number): Promise<void> {
  const res = await fetch(`${BASE}/api/workouts/${workoutId}/exercises/${weId}/sets/${setId}`, {
    method: 'DELETE', headers: headers(token),
  });
  await handle(res);
}
