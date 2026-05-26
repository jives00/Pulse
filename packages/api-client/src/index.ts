export * from './recipes';

export * from './nutrition';

// Axios client + configuration
export { configureClient, apiClient } from './client';

// Nutrition API endpoints
export { authApi }      from './endpoints/auth';
export { foodsApi }     from './endpoints/foods';
export { logApi }       from './endpoints/log';
export { goalsApi }     from './endpoints/goals';
export { waterApi }     from './endpoints/water';
export { templatesApi } from './endpoints/templates';
export { historyApi }   from './endpoints/history';

// Recipe/app API endpoints
export { recipesApi, uploadPhotoToS3 } from './endpoints/recipes';
export type { FromBarcodeResult } from './endpoints/recipes';
export { tagsApi }                     from './endpoints/tags';
export { linksApi }                    from './endpoints/links';
export { workoutsApi, exercisesApi, measurementsApi } from './endpoints/workouts';
export { routinesApi }  from './endpoints/routines';
export { schedulesApi } from './endpoints/schedules';
export type { WorkoutSchedule, UpcomingSession, ProgramTemplate, ProgramTemplateDay, RecurrenceType } from './endpoints/schedules';
export { stepsApi } from './endpoints/steps';
export { recoveryApi } from './endpoints/recovery';
export type { RecoveryData, RecoveryLevel } from './endpoints/recovery';
export type { StepsDay } from './endpoints/steps';
// StepsEntry is an alias for StepsDay — kept for mobile compatibility
export type { StepsDay as StepsEntry } from './endpoints/steps';
export { mealPlanApi } from './endpoints/meal-plan';
export type { MealPlanEntry, MealPlanDay, MealPlanWeek, MealPlanTemplate, AddFoodEntryPayload, AddRecipeEntryPayload, MealPlanEntryType, MealPlanDayTotals } from './endpoints/meal-plan';
export { profileApi } from './endpoints/profile';
export type { UserProfile, ActivityLevel } from './endpoints/profile';
export { assistantApi } from './endpoints/ai-assistant';
export type { ConversationMessage, AssistantScreenContext, AssistantActionType, LogFoodPayload, UpdateNutritionGoalPayload, AssistantAction, AssistantResponse, DailyInsight, InsightPeriod } from './endpoints/ai-assistant';

// Types from new endpoint modules
export type { DeleteScope }                                            from './endpoints/auth';
export type { GoalsSummary, ExerciseGoals, TDEEBreakdown, TDEEUnavailable, TDEEResult } from './endpoints/goals';
export { GLASS_OZ }                                                    from './endpoints/goals';
export type { TagDefinitions }                                         from './endpoints/tags';
export type { HistoryEntry }                                           from './endpoints/recipes';
export type { RecipeSearchResult }                                     from './recipes';
export type { LinkItem, LinkCategory }                                 from './endpoints/links';
export type { Exercise, ExerciseSet, WorkoutExercise, WorkoutExerciseSummary, WorkoutSummary, WorkoutDetail,
              BodyMeasurement, MeasurementGoal, PersonalBests,
              ExerciseStats, ExerciseHistoryEntry }                    from './endpoints/workouts';
export type { RoutineSummary, RoutineDetail, RoutineExercise, RoutineExerciseSet, RoutineGoal } from './endpoints/routines';
export type { FoodLogHistoryDay, FoodLogHistoryEntry, FrequentFood } from './endpoints/log';
export type { WaterHistory, WaterHistoryDay } from './endpoints/water';
export { goalCheckpointsApi, dayTypesApi, mealSchedulesApi, nutritionSchedulesApi } from './endpoints/calendar';
export { userGoalsApi, goalsByCategory, findGoalByKey, findGoalByMetric, updateNutritionGoals, updateExerciseGoals } from './endpoints/user-goals';
export type { UserGoal, UserGoalPayload, GoalCategory, GoalMetricType, GoalSourceType } from './endpoints/user-goals';
export type { GoalCheckpoint, DayTypePreset, DailyNutritionOverride, MealSchedule, MealScheduleEvent, MealSlotType, MealRecurrenceType, NutritionSchedule, NutritionScheduleEvent } from './endpoints/calendar';

// Shared utilities
export { KG_TO_LBS, kgToLbs, lbsToKg, fmtLbs } from './utils/conversions';
export { localDateStr, getWeekStart, shortDate, formatDate } from './utils/dates';
export { secondsToMMSS, mmssToSeconds, formatElapsed } from './utils/time';
export { SATURATION_DAYS, buildWeeklyData, computeGoalPace, computeCreatineSaturation, defaultTrackedFields, defaultTrackedFieldsForRoutineType, computeWeekDelta, computeWeekStreak, computePlateau, computeHighlights, WEEK_STREAK_MILESTONES } from './utils/calculations';
export type { WeekBucket, PaceStatus, RoutineType } from './utils/calculations';
export { buildWorkoutLine, formatDuration } from './utils/workoutLine';
