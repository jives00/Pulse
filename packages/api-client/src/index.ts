// Recipe types (from Dram)
export * from './recipes';

// Nutrition types (from FoodTracker)
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
export { tagsApi }                     from './endpoints/tags';
export { linksApi }                    from './endpoints/links';
export { workoutsApi, exercisesApi, measurementsApi } from './endpoints/workouts';
export { routinesApi }  from './endpoints/routines';
export { schedulesApi } from './endpoints/schedules';
export type { WorkoutSchedule, UpcomingSession, ProgramTemplate, ProgramTemplateDay, RecurrenceType } from './endpoints/schedules';
export { profileApi } from './endpoints/profile';
export type { UserProfile, ActivityLevel } from './endpoints/profile';

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
export type { FoodLogHistoryDay, FoodLogHistoryEntry } from './endpoints/log';
export type { WaterHistory, WaterHistoryDay } from './endpoints/water';

// Shared utilities
export { KG_TO_LBS, kgToLbs, lbsToKg, fmtLbs } from './utils/conversions';
export { localDateStr, getWeekStart, shortDate, formatDate } from './utils/dates';
export { secondsToMMSS, mmssToSeconds, formatElapsed } from './utils/time';
export { SATURATION_DAYS, buildWeeklyData, computeGoalPace, computeCreatineSaturation, defaultTrackedFields, defaultTrackedFieldsForRoutineType, computeWeekDelta, computeWeekStreak, computePlateau, computeHighlights, WEEK_STREAK_MILESTONES } from './utils/calculations';
export type { WeekBucket, PaceStatus, RoutineType } from './utils/calculations';
