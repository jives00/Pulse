import {
  authApi, foodsApi, logApi, waterApi, historyApi,
  recipesApi, tagsApi, linksApi, workoutsApi, exercisesApi, measurementsApi,
  routinesApi, schedulesApi, stepsApi, recoveryApi, mealPlanApi,
  profileApi, assistantApi,
  goalCheckpointsApi, dayTypesApi, mealSchedulesApi, nutritionSchedulesApi,
  nutritionTargetsApi,
  localDateStr,
} from '../../../../packages/api-client/src/index';

import type {
  WorkoutSchedule, UpcomingSession, ProgramTemplate, RecurrenceType,
} from '../../../../packages/api-client/src/endpoints/schedules';

export type { WorkoutSchedule, UpcomingSession, ProgramTemplate, RecurrenceType };

import type {
  Recipe, RecipeDetail, RecipeFormData, ScrapedRecipe, Ingredient,
  RecipeFilters, MakeLogEntry, LinkItem, HistoryEntry, TagDefinitions,
  MealSlot, ServingSize, NutritionSnapshot, Food, LogEntry as NutritionLogEntry,
  DailyLog, WaterDay, WaterEntry, GoalsSummary, Exercise, ExerciseSet, WorkoutExercise,
  WorkoutSummary, WorkoutDetail, ExerciseStats, ExerciseHistoryEntry,
  RoutineSummary, RoutineExercise, RoutineExerciseSet, RoutineDetail,
  RecipeSearchResult, PersonalBests, BodyMeasurement, MeasurementGoal,
  WaterHistoryDay, WaterHistory, FoodLogHistoryEntry, FoodLogHistoryDay,
  UserProfile, ActivityLevel, TDEEBreakdown, TDEEUnavailable, TDEEResult,
  ExerciseGoals, DailyHistoryEntry, DeleteScope,
  ConversationMessage, AssistantScreenContext, AssistantActionType,
  AssistantAction, AssistantResponse,
  StepsEntry, FrequentFood,
  MealPlanEntry, MealPlanDay, MealPlanWeek, MealPlanTemplate,
  GoalCheckpoint, DayTypePreset, DailyNutritionOverride,
  MealSchedule, MealScheduleEvent, MealRecurrenceType,
  NutritionSchedule, NutritionScheduleEvent,
  UserGoal, UserGoalPayload, GoalCategory, GoalMetricType, GoalSourceType,
  RoutineGoal, FromBarcodeResult,
} from '../../../../packages/api-client/src/index';

export type {
  Recipe, RecipeDetail, RecipeFormData, ScrapedRecipe, Ingredient, MakeLogEntry,
  LinkItem, HistoryEntry, TagDefinitions,
  MealSlot, ServingSize, NutritionSnapshot, Food, NutritionLogEntry, DailyLog, WaterDay, WaterEntry,
  GoalsSummary, Exercise, ExerciseSet, WorkoutExercise, WorkoutSummary, WorkoutDetail,
  ExerciseStats, ExerciseHistoryEntry,
  RoutineSummary, RoutineExercise, RoutineExerciseSet, RoutineDetail,
  RecipeSearchResult, PersonalBests, BodyMeasurement, MeasurementGoal,
  WaterHistoryDay, WaterHistory, FoodLogHistoryEntry, FoodLogHistoryDay,
  UserProfile, ActivityLevel, TDEEBreakdown, TDEEUnavailable, TDEEResult,
  ExerciseGoals, DailyHistoryEntry, DeleteScope,
  StepsEntry, FrequentFood,
  MealPlanEntry, MealPlanDay, MealPlanWeek, MealPlanTemplate,
  GoalCheckpoint, DayTypePreset, DailyNutritionOverride,
  MealSchedule, MealScheduleEvent, MealRecurrenceType,
  NutritionSchedule, NutritionScheduleEvent,
  UserGoal, UserGoalPayload, GoalCategory, GoalMetricType, GoalSourceType,
  RoutineGoal, FromBarcodeResult,
};

export type { ConversationMessage as AssistantMessage };
export type { AssistantScreenContext, AssistantActionType, AssistantAction, AssistantResponse };

export interface NutritionGoals { calories: number; carbsG: number; proteinG: number; fatG: number; waterGoalOz?: number; }

export interface RecipeMacroResult {
  name: string; calories: number; carbs_g: number; protein_g: number;
  fat_g: number; fiber_g: number; sodium_mg: number;
}

// No longer used — configureClient in _layout.tsx handles unauthorized events
export function setUnauthorizedHandler(_fn: () => void) {}

// ─── Auth ─────────────────────────────────────────────────────────────────────

export async function login(username: string, password: string) {
  return authApi.login({ username, password });
}

export async function changeUsername(_token: string, data: { newUsername: string; currentPassword: string }): Promise<{ token: string }> {
  return authApi.changeUsername(data);
}

export async function changePassword(_token: string, data: { currentPassword: string; newPassword: string }): Promise<{ token: string }> {
  return authApi.changePassword(data);
}

export async function deleteData(_token: string, scope: DeleteScope): Promise<void> {
  await authApi.deleteData(scope);
}

export async function getProfile(_token: string): Promise<UserProfile> {
  return profileApi.get();
}

export async function updateProfile(_token: string, data: Partial<UserProfile>): Promise<void> {
  await profileApi.update(data);
}

// ─── Recipes ─────────────────────────────────────────────────────────────────

export async function getRecipes(_token: string, filters: RecipeFilters = {}): Promise<Recipe[]> {
  return recipesApi.getAll(filters);
}

export async function getRecipe(_token: string, id: number): Promise<RecipeDetail> {
  return recipesApi.get(id);
}

export async function createRecipe(_token: string, data: RecipeFormData): Promise<{ id: number }> {
  return recipesApi.create(data);
}

export async function updateRecipe(_token: string, id: number, data: Partial<RecipeFormData> & { is_favorite?: number; photo_key?: string }): Promise<{ success: boolean }> {
  return recipesApi.update(id, data);
}

export async function deleteRecipe(_token: string, id: number): Promise<{ success: boolean }> {
  return recipesApi.delete(id);
}

export async function logRecipe(_token: string, id: number): Promise<{ success: boolean }> {
  return recipesApi.log(id);
}

export async function getPhotoUploadUrl(_token: string, id: number, contentType: string): Promise<{ uploadUrl: string; key: string }> {
  return recipesApi.getPhotoUploadUrl(id, contentType);
}

export async function uploadPhotoToS3(uploadUrl: string, uri: string, contentType: string): Promise<void> {
  const localRes = await fetch(uri);
  const blob = await localRes.blob();
  await fetch(uploadUrl, { method: 'PUT', headers: { 'Content-Type': contentType }, body: blob });
}

export async function uploadPhotoFromUrl(_token: string, recipeId: number, url: string): Promise<{ key: string }> {
  return recipesApi.uploadPhotoFromUrl(recipeId, url);
}

export async function getRecipeLog(_token: string, recipeId: number): Promise<{ count: number; entries: MakeLogEntry[] }> {
  return recipesApi.getLog(recipeId);
}

export async function clearAllHistory(_token: string): Promise<void> {
  await recipesApi.clearAllHistory();
}

export async function deleteAllRecipes(_token: string): Promise<void> {
  await recipesApi.deleteAll();
}

export async function updateLogEntry(_token: string, recipeId: number, logId: number, made_at: string): Promise<void> {
  await recipesApi.updateLogEntry(recipeId, logId, made_at);
}

export async function deleteLogEntry(_token: string, recipeId: number, logId: number): Promise<void> {
  await recipesApi.deleteLogEntry(recipeId, logId);
}

export async function getHistory(_token: string): Promise<HistoryEntry[]> {
  return recipesApi.getHistory();
}

export async function deleteAllLog(_token: string, recipeId: number): Promise<void> {
  await recipesApi.clearLog(recipeId);
}

export async function scrapeRecipe(_token: string, url: string, typeHint?: string): Promise<ScrapedRecipe> {
  return recipesApi.scrape(url, typeHint);
}

export async function parseRecipeText(_token: string, text: string, typeHint?: string): Promise<ScrapedRecipe> {
  return recipesApi.parseText(text, typeHint);
}

export async function searchRecipes(_token: string, q: string): Promise<RecipeSearchResult[]> {
  return recipesApi.search(q);
}

export async function getRecipeBarcode(_token: string, recipeId: number): Promise<{ barcode: string | null }> {
  try {
    return await recipesApi.getBarcode(recipeId);
  } catch {
    return { barcode: null };
  }
}

export async function setRecipeBarcode(_token: string, recipeId: number, barcode: string): Promise<void> {
  await recipesApi.setBarcode(recipeId, barcode);
}

export async function getRecipeByBarcode(_token: string, barcode: string): Promise<RecipeSearchResult | null> {
  try {
    return await recipesApi.getByBarcode(barcode);
  } catch {
    return null;
  }
}

export async function createRecipeFromBarcode(_token: string, params: { barcode: string; name?: string }): Promise<FromBarcodeResult> {
  return recipesApi.createFromBarcode(params);
}

export async function aiModifyRecipe(_token: string, id: number, prompt: string, mode: 'update' | 'log'): Promise<{ modified: any }> {
  return recipesApi.aiModify(id, prompt, mode);
}

export async function logRecipeToNutrition(_token: string, payload: { recipeId: number; meal: string; servings: number; logDate?: string }): Promise<void> {
  await logApi.logRecipe(payload);
}

export async function logModifiedRecipe(_token: string, payload: {
  recipeId: number; meal: string; logDate?: string; name: string;
  calories: number; carbs_g: number; protein_g: number; fat_g: number;
  fiber_g?: number | null; sodium_mg?: number | null;
}): Promise<void> {
  await logApi.logModifiedRecipe(payload);
}

// ─── Tags ─────────────────────────────────────────────────────────────────────

export async function getTags(_token: string): Promise<string[]> {
  return tagsApi.getAll();
}

export async function getTagDefinitions(_token: string): Promise<TagDefinitions> {
  return tagsApi.getDefinitions();
}

export async function saveTagDefinitions(_token: string, defs: TagDefinitions): Promise<void> {
  await tagsApi.saveDefinitions(defs);
}

// ─── Links ────────────────────────────────────────────────────────────────────

export async function getLinks(_token: string): Promise<LinkItem[]> {
  return linksApi.getAll();
}

export async function addLink(_token: string, url: string): Promise<LinkItem> {
  return linksApi.add(url);
}

export async function updateLink(_token: string, id: number, title: string): Promise<void> {
  await linksApi.update(id, { title });
}

export async function deleteLink(_token: string, id: number): Promise<void> {
  await linksApi.delete(id);
}

// ─── Nutrition log ────────────────────────────────────────────────────────────

export async function getDailyLog(_token: string, date: string): Promise<DailyLog> {
  return logApi.getDay(date);
}

export async function addLogEntry(_token: string, payload: { logDate: string; meal: MealSlot; foodId: number; servingSizeId: number; quantity: number }): Promise<NutritionLogEntry> {
  return logApi.add(payload);
}

export async function deleteNutritionLogEntry(_token: string, id: number): Promise<void> {
  await logApi.delete(id);
}

export async function moveLogEntry(_token: string, id: number, meal: MealSlot, logDate: string): Promise<void> {
  await logApi.update(id, { meal, logDate });
}

export async function copyLogEntry(_token: string, entry: NutritionLogEntry, meal: MealSlot, logDate: string): Promise<void> {
  await logApi.copyEntry(entry, meal, logDate);
}

export async function editNutritionLogEntry(_token: string, id: number, payload: { servingSizeId: number; quantity: number }): Promise<NutritionLogEntry> {
  return logApi.update(id, payload);
}

export async function getFoodById(_token: string, id: number): Promise<Food> {
  return foodsApi.getById(id);
}

export async function logInline(_token: string, payload: {
  name: string; meal: string; logDate?: string;
  calories: number; carbs_g: number; protein_g: number; fat_g: number;
  fiber_g?: number | null; sodium_mg?: number | null;
}): Promise<void> {
  await logApi.logInline(payload);
}

export async function getFrequentFoods(_token: string): Promise<FrequentFood[]> {
  return logApi.getFrequent();
}

export async function getFoodLogHistory(_token: string, params?: { limit?: number; start?: string; end?: string }): Promise<FoodLogHistoryDay[]> {
  return logApi.getHistory(params);
}

// ─── Water ────────────────────────────────────────────────────────────────────

export async function getWaterDay(_token: string, date: string): Promise<WaterDay> {
  return waterApi.getDay(date);
}

export async function addWater(_token: string, date: string, amountOz: number): Promise<WaterEntry> {
  return waterApi.add(date, amountOz);
}

export async function getWaterHistory(_token: string, start: string, end: string): Promise<WaterHistory> {
  return waterApi.getHistory(start, end);
}

// New nutrition targets API wrappers (replace legacy goalsApi calls)
export async function getNutritionSummary(_token: string, date?: string) {
  return nutritionTargetsApi.getSummary(date);
}

export async function getNutritionTDEE(_token: string, date?: string) {
  return nutritionTargetsApi.getTDEE(date);
}

// ─── Workouts ─────────────────────────────────────────────────────────────────

export async function getWorkouts(_token: string, params?: { limit?: number; offset?: number; routineId?: number; start?: string; end?: string }): Promise<WorkoutSummary[]> {
  return workoutsApi.getAll(params);
}

export async function getWorkout(_token: string, id: number): Promise<WorkoutDetail> {
  return workoutsApi.get(id);
}

export async function createWorkout(_token: string, data?: { name?: string }): Promise<WorkoutDetail> {
  return workoutsApi.create(data);
}

export async function updateWorkout(_token: string, id: number, data: { name?: string; durationMinutes?: number; completed?: boolean; workoutDate?: string }): Promise<WorkoutDetail> {
  return workoutsApi.update(id, data);
}

export async function getActiveWorkout(_token: string): Promise<WorkoutDetail | null> {
  return workoutsApi.getActive();
}

export async function deleteWorkout(_token: string, id: number): Promise<void> {
  await workoutsApi.delete(id);
}

export async function startWorkoutTimer(_token: string, id: number): Promise<{ startedAt: string; pausedAt: string | null; totalPausedSeconds: number }> {
  return workoutsApi.startTimer(id);
}

export async function pauseWorkout(_token: string, id: number): Promise<void> {
  await workoutsApi.pause(id);
}

export async function resumeWorkout(_token: string, id: number): Promise<{ totalPausedSeconds: number }> {
  return workoutsApi.resume(id);
}

export async function estimateWorkoutCalories(_token: string, id: number): Promise<{ caloriesBurned: number }> {
  return workoutsApi.estimateCalories(id);
}

export async function addWorkoutExercise(_token: string, workoutId: number, exerciseId: number): Promise<WorkoutExercise> {
  return workoutsApi.addExercise(workoutId, exerciseId);
}

export async function removeWorkoutExercise(_token: string, workoutId: number, weId: number): Promise<void> {
  await workoutsApi.removeExercise(workoutId, weId);
}

export async function updateWorkoutExercise(_token: string, workoutId: number, weId: number, data: { notes?: string | null }): Promise<void> {
  await workoutsApi.updateExercise(workoutId, weId, data);
}

export async function addWorkoutSet(_token: string, workoutId: number, weId: number, data: { reps?: number; weightKg?: number }): Promise<ExerciseSet> {
  return workoutsApi.addSet(workoutId, weId, data);
}

export async function updateWorkoutSet(_token: string, workoutId: number, weId: number, setId: number, data: { reps?: number | null; weightKg?: number | null; durationSeconds?: number | null; distanceMeters?: number | null; steps?: number | null; completed?: boolean }): Promise<void> {
  await workoutsApi.updateSet(workoutId, weId, setId, data);
}

export async function deleteWorkoutSet(_token: string, workoutId: number, weId: number, setId: number): Promise<void> {
  await workoutsApi.deleteSet(workoutId, weId, setId);
}

export async function getPersonalBests(_token: string): Promise<PersonalBests> {
  return workoutsApi.getPersonalBests();
}

// ─── Exercises ────────────────────────────────────────────────────────────────

export async function getExercises(_token: string, params?: { search?: string; category?: string }): Promise<Exercise[]> {
  return exercisesApi.getAll(params);
}

export async function getExerciseCategories(_token: string): Promise<string[]> {
  return exercisesApi.getCategories();
}

export async function createCustomExercise(_token: string, data: { name: string; category: string; exerciseType: string }): Promise<Exercise> {
  return exercisesApi.createCustom(data);
}

export async function updateExercise(_token: string, id: number, data: {
  name?: string; category?: string; exerciseType?: string;
  musclesPrimary?: string[]; musclesSecondary?: string[];
  instructions?: string | null; mediaUrl?: string | null;
  coverImageUrl?: string | null; muscleImageUrl?: string | null;
  notes?: string | null; trackedFields?: string[];
}): Promise<Exercise> {
  return exercisesApi.update(id, data);
}

export async function uploadExerciseCoverImageFromUrl(_token: string, id: number, url: string): Promise<{ key: string }> {
  return exercisesApi.uploadCoverImageFromUrl(id, url);
}

export async function getExerciseCoverImageUploadUrl(_token: string, id: number, contentType: string): Promise<{ uploadUrl: string; key: string }> {
  return exercisesApi.getCoverImageUploadUrl(id, contentType);
}

export async function uploadExerciseMediaFromUrl(_token: string, id: number, url: string): Promise<{ key: string; isYouTube?: boolean }> {
  return exercisesApi.uploadMediaFromUrl(id, url);
}

export async function getExerciseMediaUploadUrl(_token: string, id: number, contentType: string): Promise<{ uploadUrl: string; key: string }> {
  return exercisesApi.getMediaUploadUrl(id, contentType);
}

export async function uploadExerciseMuscleImageFromUrl(_token: string, id: number, url: string): Promise<{ key: string }> {
  return exercisesApi.uploadMuscleImageFromUrl(id, url);
}

export async function getExerciseMuscleImageUploadUrl(_token: string, id: number, contentType: string): Promise<{ uploadUrl: string; key: string }> {
  return exercisesApi.getMuscleImageUploadUrl(id, contentType);
}

export async function deleteExercise(_token: string, id: number): Promise<void> {
  await exercisesApi.deleteCustom(id);
}

export async function getExercise(_token: string, id: number): Promise<Exercise> {
  return exercisesApi.getOne(id);
}

export async function getExerciseStats(_token: string, id: number, metric?: string): Promise<ExerciseStats> {
  return exercisesApi.getStats(id, metric);
}

export async function getExerciseHistory(_token: string, id: number, params?: { limit?: number; offset?: number }): Promise<ExerciseHistoryEntry[]> {
  return exercisesApi.getHistory(id, params);
}

// ─── Routines ─────────────────────────────────────────────────────────────────

export async function getRoutines(_token: string): Promise<RoutineSummary[]> {
  return routinesApi.getAll();
}

export async function getRoutine(_token: string, id: number): Promise<RoutineDetail> {
  return routinesApi.get(id);
}

export async function updateRoutine(_token: string, id: number, data: { name?: string; notes?: string; routineType?: string }): Promise<void> {
  await routinesApi.update(id, data as any);
}

export async function createRoutine(_token: string, data: { name: string; notes?: string }): Promise<{ id: number; name: string }> {
  return routinesApi.create(data);
}

export async function deleteRoutine(_token: string, id: number): Promise<void> {
  await routinesApi.delete(id);
}

export async function startRoutine(_token: string, id: number): Promise<WorkoutDetail> {
  return routinesApi.start(id);
}

export async function addRoutineExercise(_token: string, routineId: number, exerciseId: number): Promise<RoutineExercise> {
  return routinesApi.addExercise(routineId, exerciseId);
}

export async function removeRoutineExercise(_token: string, routineId: number, reId: number): Promise<void> {
  await routinesApi.removeExercise(routineId, reId);
}

export async function reorderRoutineExercises(_token: string, routineId: number, order: { id: number; sortOrder: number }[]): Promise<void> {
  await routinesApi.reorderExercises(routineId, order);
}

export async function addRoutineTemplateSet(_token: string, routineId: number, reId: number, data: { reps?: number; weightKg?: number; durationSeconds?: number; distanceMeters?: number; steps?: number }): Promise<RoutineExerciseSet> {
  return routinesApi.addTemplateSet(routineId, reId, data);
}

export async function updateRoutineTemplateSet(_token: string, routineId: number, reId: number, setId: number, data: { reps?: number; weightKg?: number; durationSeconds?: number; distanceMeters?: number; steps?: number }): Promise<void> {
  await routinesApi.updateTemplateSet(routineId, reId, setId, data);
}

export async function deleteRoutineTemplateSet(_token: string, routineId: number, reId: number, setId: number): Promise<void> {
  await routinesApi.deleteTemplateSet(routineId, reId, setId);
}


export async function setRoutineGoal(_token: string, routineId: number, targetPerWeek: number): Promise<void> {
  await routinesApi.setGoal(routineId, targetPerWeek);
}

export async function deleteRoutineGoal(_token: string, routineId: number): Promise<void> {
  await routinesApi.deleteGoal(routineId);
}

// ─── Workout Schedules ────────────────────────────────────────────────────────

export async function getSchedules(_token: string) {
  return schedulesApi.getAll();
}

export async function getUpcomingSchedule(_token: string, days = 14) {
  return schedulesApi.getUpcoming(days);
}

// ─── Foods ────────────────────────────────────────────────────────────────────

export async function searchFoods(_token: string, q: string): Promise<Food[]> {
  return foodsApi.search(q);
}

export async function getFoodByBarcode(_token: string, barcode: string): Promise<Food | null> {
  try {
    return await foodsApi.lookupBarcode(barcode);
  } catch {
    return null;
  }
}

export async function estimateMacros(
  _token: string,
  payload: { name: string; brand?: string; description?: string }
): Promise<{ calories: number; carbs: number; protein: number; fat: number; fiber?: number | null; sodium?: number | null }> {
  const result = await foodsApi.estimateMacros(payload);
  return result.nutrition;
}

// ─── Steps ────────────────────────────────────────────────────────────────────

export async function getSteps(_token: string, date?: string): Promise<StepsEntry> {
  return stepsApi.getDay(date ?? localDateStr());
}

export async function logSteps(_token: string, steps: number, date?: string, source?: string): Promise<StepsEntry> {
  return stepsApi.log(date ?? localDateStr(), steps, source);
}

export async function getStepsHistory(_token: string, days = 14): Promise<StepsEntry[]> {
  return stepsApi.getHistory(days);
}

// ─── Body Measurements ────────────────────────────────────────────────────────

export async function getMeasurements(_token: string, params?: { start?: string; end?: string }): Promise<BodyMeasurement[]> {
  return measurementsApi.getAll(params);
}

export async function addMeasurement(_token: string, data: { metric: string; value: number; unit: string; measuredAt: string }): Promise<BodyMeasurement> {
  return measurementsApi.add(data);
}

export async function updateMeasurement(_token: string, id: number, data: { value: number; measuredAt?: string; notes?: string }): Promise<BodyMeasurement> {
  return measurementsApi.update(id, data);
}

export async function deleteMeasurement(_token: string, id: number): Promise<void> {
  await measurementsApi.delete(id);
}


export async function setMeasurementGoal(_token: string, metric: string, data: { targetValue: number; unit: string; targetDate: string | null }): Promise<void> {
  await measurementsApi.setGoal(metric, data);
}

export async function deleteMeasurementGoal(_token: string, metric: string): Promise<void> {
  await measurementsApi.deleteGoal(metric);
}

// ─── History ──────────────────────────────────────────────────────────────────

export async function getDailyHistory(_token: string, start: string, end: string): Promise<DailyHistoryEntry[]> {
  return historyApi.daily(start, end);
}

// ─── AI ───────────────────────────────────────────────────────────────────────

export async function getAiInsight(_token: string): Promise<{ text: string }> {
  return assistantApi.getDailyInsight();
}

export async function getRecovery(_token: string): Promise<{ level: 'high' | 'medium' | 'low'; score: number; hint: string }> {
  return recoveryApi.get();
}

export async function sendAssistantMessage(
  _token: string,
  payload: { history: ConversationMessage[]; message: string; context?: AssistantScreenContext }
): Promise<AssistantResponse> {
  return assistantApi.send(payload.history, payload.message, payload.context);
}

// ─── Milestones (replaces goal checkpoints) ───────────────────────────────────

export async function getAllMilestones(_token: string) {
  return import('../../../../packages/api-client/src/index').then(m => m.goalsV2Api.getAllMilestones());
}

export async function getActiveGoals(_token: string) {
  return import('../../../../packages/api-client/src/index').then(m => m.goalsV2Api.getAll('active'));
}

export async function createMilestone(_token: string, goalId: number, data: { targetValue: number; targetDate: string; notes?: string | null }) {
  return import('../../../../packages/api-client/src/index').then(m => m.goalsV2Api.createMilestone(goalId, data));
}

export async function updateMilestone(_token: string, goalId: number, milestoneId: number, data: { targetValue?: number; targetDate?: string; notes?: string | null }) {
  return import('../../../../packages/api-client/src/index').then(m => m.goalsV2Api.updateMilestone(goalId, milestoneId, data));
}

export async function deleteMilestone(_token: string, goalId: number, milestoneId: number) {
  return import('../../../../packages/api-client/src/index').then(m => m.goalsV2Api.deleteMilestone(goalId, milestoneId));
}

// ─── Day Type Presets & Overrides ─────────────────────────────────────────────

export async function getDayTypePresets(_token: string): Promise<DayTypePreset[]> {
  return dayTypesApi.getPresets();
}

export async function createDayTypePreset(_token: string, data: Omit<DayTypePreset, 'id'>): Promise<DayTypePreset> {
  return dayTypesApi.createPreset(data);
}

export async function updateDayTypePreset(_token: string, id: number, data: Omit<DayTypePreset, 'id'>): Promise<DayTypePreset> {
  return dayTypesApi.updatePreset(id, data);
}

export async function deleteDayTypePreset(_token: string, id: number): Promise<void> {
  await dayTypesApi.deletePreset(id);
}

export async function getDailyNutritionOverrides(_token: string, from: string, to: string): Promise<DailyNutritionOverride[]> {
  return dayTypesApi.getOverrides(from, to);
}

export async function upsertDailyNutritionOverride(_token: string, date: string, data: Omit<DailyNutritionOverride, 'date' | 'dayTypeName'>): Promise<DailyNutritionOverride> {
  return dayTypesApi.upsertOverride(date, data);
}

export async function deleteDailyNutritionOverride(_token: string, date: string): Promise<void> {
  await dayTypesApi.deleteOverride(date);
}

// ─── Meal Schedules ───────────────────────────────────────────────────────────

export async function getMealSchedules(_token: string): Promise<MealSchedule[]> {
  return mealSchedulesApi.getAll();
}

export async function getMealScheduleUpcoming(_token: string, days = 30): Promise<MealScheduleEvent[]> {
  return mealSchedulesApi.getUpcoming(days);
}

export async function createMealSchedule(_token: string, data: any): Promise<MealSchedule> {
  return mealSchedulesApi.create(data);
}

export async function updateMealSchedule(_token: string, id: number, data: any): Promise<MealSchedule> {
  return mealSchedulesApi.update(id, data);
}

export async function deleteMealSchedule(_token: string, id: number): Promise<void> {
  await mealSchedulesApi.delete(id);
}

// ─── Nutrition Schedules ──────────────────────────────────────────────────────

export async function getNutritionSchedules(_token: string): Promise<NutritionSchedule[]> {
  return nutritionSchedulesApi.getAll();
}

export async function getNutritionScheduleUpcoming(_token: string, days = 60): Promise<NutritionScheduleEvent[]> {
  return nutritionSchedulesApi.getUpcoming(days);
}

export async function createNutritionSchedule(_token: string, data: any): Promise<NutritionSchedule> {
  return nutritionSchedulesApi.create(data);
}

export async function updateNutritionSchedule(_token: string, id: number, data: any): Promise<NutritionSchedule> {
  return nutritionSchedulesApi.update(id, data);
}

export async function deleteNutritionSchedule(_token: string, id: number): Promise<void> {
  await nutritionSchedulesApi.delete(id);
}
