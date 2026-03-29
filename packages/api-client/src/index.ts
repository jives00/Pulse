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
export { workoutsApi, exercisesApi }   from './endpoints/workouts';

// Types from new endpoint modules
export type { DeleteScope }                                            from './endpoints/auth';
export type { GoalsSummary, ExerciseGoals }                           from './endpoints/goals';
export type { TagDefinitions }                                         from './endpoints/tags';
export type { HistoryEntry }                                           from './endpoints/recipes';
export type { LinkItem }                                               from './endpoints/links';
export type { Exercise, ExerciseSet, WorkoutExercise, WorkoutSummary, WorkoutDetail } from './endpoints/workouts';
