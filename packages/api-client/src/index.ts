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
export { userGoalsApi, goalsByCategory as legacyGoalsByCategory, findGoalByKey, findGoalByMetric, updateNutritionGoals, updateExerciseGoals } from './endpoints/user-goals';
export type { UserGoal, UserGoalPayload, GoalMetricType } from './endpoints/user-goals';

// Nutrition targets (operational nutrition settings — replaces legacy /api/goals nutrition endpoints)
export { nutritionTargetsApi } from './endpoints/nutrition-targets';
export type { NutritionSummary } from './endpoints/nutrition-targets';

// New unified goals system
export { goalsV2Api, goalsByCategory } from './endpoints/goals-v2';
export type { Goal, GoalDetail, GoalMilestone, GoalMilestoneWithGoal, GoalProgressEntry, GoalSincePoint, GoalStatus, MilestoneStatus, ProgressSource,
              CreateGoalPayload, UpdateGoalPayload, CloseGoalPayload,
              CreateMilestonePayload, UpdateMilestonePayload, CreateProgressPayload } from './endpoints/goals-v2';
export { GOAL_CATALOG, CATALOG_BY_KEY, CATALOG_BY_CATEGORY } from './goalCatalog';
export type { GoalCatalogKey, GoalCategory, GoalCardType, GoalSourceType, GoalCatalogEntry } from './goalCatalog';

// Feature modules
export { FEATURE_CATALOG, FEATURE_BY_KEY, FEATURE_KEYS, TOP_LEVEL_FEATURES, DEFAULT_FEATURES,
         subFeatures, resolveFeatures, featuresSatisfied } from './featureCatalog';
export type { FeatureKey, FeatureCatalogEntry, EnabledFeatures } from './featureCatalog';

// Dashboard layout
export { DASHBOARD_CATALOG, WIDGET_BY_KEY, WIDGET_GROUPS, SPAN_OPTIONS, defaultLayout, resolveLayout,
         groupLayout, sectionFor,
         resolveSinceGoalIds, withSinceGoalIds,
         defaultSinceDate, resolveSinceDate, withSinceDate } from './dashboardCatalog';
export type { DashboardWidgetKey, DashboardWidget, WidgetPlatform, WidgetGroup, FeatureRequirement,
              LayoutEntry, DashboardLayout, StoredDashboardLayout, DashboardWidgetSettings,
              LayoutPlatform, SpanOption } from './dashboardCatalog';

// Per-goal card presentation
export { GOAL_CARD_WINDOW_DAYS, TDEE_PROJECTION_KEYS, defaultVariantFor, allowedVariantsFor,
         defaultGoalCardConfig, resolveGoalCard, editableOptionsFor } from './goalCardConfig';
export type { GoalCardConfig, GoalCardVariant, GoalCardWindow, GoalCardProjection,
              GoalCardDirection, GoalCardMetricLine } from './goalCardConfig';

// Goal card logic shared by web + mobile (pure — no colors, no React)
export { fmt2, titleFor, resolveUnit, fmtGoalValue, normDateStr, fmtDeadline, fmtETA, daysUntil,
         goalDirection, isGoalAchieved, goalStatusFor, goalStatusForStreak, goalStatusForProgress,
         emptyMessageFor, linregSlope, etaDaysFor, tdeeSlopePerDay, supportsTdeeProjection } from './goalCardLogic';
export type { GoalCardStatus, GoalCardSubject, DatedValue, TDEEProjectionInput } from './goalCardLogic';

// "Progress since a date" widget logic shared by web + mobile
export { buildGoalSinceRows, changeLabelFor, fmtSinceDate,
         shiftDate, pointAt, averageAt, readingAt,
         SINCE_LOOKBACK_DAYS, SINCE_AVERAGE_WINDOW_DAYS, SINCE_AVERAGED_KEYS } from './goalSince';
export type { GoalSinceRow, DatedReading } from './goalSince';

// User preferences (features + dashboard layout)
export { preferencesApi } from './endpoints/preferences';
export type { UserPreferences } from './endpoints/preferences';
export type { GoalCheckpoint, DayTypePreset, DailyNutritionOverride, MealSchedule, MealScheduleEvent, MealSlotType, MealRecurrenceType, NutritionSchedule, NutritionScheduleEvent } from './endpoints/calendar';

// Shared utilities
export { KG_TO_LBS, kgToLbs, lbsToKg, fmtLbs } from './utils/conversions';
export { localDateStr, getWeekStart, shortDate, formatDate, longDate } from './utils/dates';
export { secondsToMMSS, mmssToSeconds, formatElapsed } from './utils/time';
export { SATURATION_DAYS, buildWeeklyData, computeGoalPace, computeCreatineSaturation, defaultTrackedFields, defaultTrackedFieldsForRoutineType, computeWeekDelta, computeWeekStreak, computePlateau, computeHighlights, WEEK_STREAK_MILESTONES } from './utils/calculations';
export type { WeekBucket, PaceStatus, RoutineType } from './utils/calculations';
export { buildWorkoutLine, formatDuration } from './utils/workoutLine';
export { buildStepsStats, STEPS_KCAL_PER_STEP } from './utils/steps';
export type { StepsStats, StepsWindowDay, StepsDayPoint, BuildStepsStatsOptions } from './utils/steps';
