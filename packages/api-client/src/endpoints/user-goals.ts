import { apiClient } from '../client';

export type GoalCategory   = 'body' | 'nutrition' | 'exercise';
export type GoalSourceType = 'exercise' | 'routine' | 'measurement' | 'nutrition' | 'steps';
export type GoalMetricType =
  | 'exercise_max_weight'
  | 'exercise_max_reps'
  | 'exercise_session_volume'
  | 'exercise_weekly_volume'
  | 'exercise_session_reps'
  | 'exercise_weekly_reps'
  | 'exercise_session_steps'
  | 'exercise_weekly_steps'
  | 'exercise_session_distance'
  | 'exercise_weekly_distance'
  | 'exercise_session_duration'
  | 'exercise_weekly_duration'
  | 'exercise_weekly_sessions'
  | 'daily_steps_avg'
  | 'weekly_steps_total'
  | 'body_measurement'
  | 'nutrition_daily_avg';

export interface UserGoal {
  id:              number;
  name:            string;
  category:        GoalCategory;
  metricType:      GoalMetricType;
  sourceType:      GoalSourceType;
  sourceId:        number | null;
  sourceKey:       string | null;
  sourceName:      string | null;
  targetValue:     number;
  unit:            string;
  targetDate:      string | null;
  sortOrder:       number;
  showOnDashboard?: boolean;
}

export type UserGoalPayload = Omit<UserGoal, 'id' | 'category' | 'sourceName' | 'sortOrder'>;

export const userGoalsApi = {
  getAll: () =>
    apiClient.get<UserGoal[]>('/user-goals').then((r) => r.data),
  create: (data: UserGoalPayload) =>
    apiClient.post<UserGoal>('/user-goals', data).then((r) => r.data),
  update: (id: number, data: Partial<UserGoalPayload>) =>
    apiClient.put<UserGoal>(`/user-goals/${id}`, data).then((r) => r.data),
  delete: (id: number) =>
    apiClient.delete(`/user-goals/${id}`).then(() => {}),
};

// ─── Helper functions for goal splitting/merging ──────────────────────────────

export function goalsByCategory(goals: UserGoal[]) {
  return {
    nutrition: goals.filter(g => g.category === 'nutrition'),
    exercise: goals.filter(g => g.category === 'exercise'),
    body: goals.filter(g => g.category === 'body'),
  };
}

export function findGoalByKey(goals: UserGoal[], sourceKey: string): UserGoal | undefined {
  return goals.find(g => g.sourceKey === sourceKey);
}

export function findGoalByMetric(goals: UserGoal[], metricType: GoalMetricType): UserGoal | undefined {
  return goals.find(g => g.metricType === metricType);
}

export async function updateNutritionGoals(data: {
  calories: number;
  carbsG: number;
  proteinG: number;
  fatG: number;
  waterGoalOz?: number;
}): Promise<void> {
  const existing = await userGoalsApi.getAll();
  const nutrition = existing.filter(g => g.category === 'nutrition');

  const updates = [
    { sourceKey: 'calories', value: data.calories, unit: 'kcal', label: 'Calories' },
    { sourceKey: 'carbs_g', value: data.carbsG, unit: 'g', label: 'Carbs' },
    { sourceKey: 'protein_g', value: data.proteinG, unit: 'g', label: 'Protein' },
    { sourceKey: 'fat_g', value: data.fatG, unit: 'g', label: 'Fat' },
    ...(data.waterGoalOz ? [{ sourceKey: 'water_oz', value: data.waterGoalOz, unit: 'oz', label: 'Water' }] : []),
  ];

  for (const { sourceKey, value, unit, label } of updates) {
    const goal = findGoalByKey(nutrition, sourceKey);
    const payload: UserGoalPayload = {
      name: `Daily ${label}`,
      metricType: 'nutrition_daily_avg',
      sourceType: 'nutrition',
      sourceId: null,
      sourceKey,
      targetValue: value,
      unit,
      targetDate: null,
    };
    if (goal) {
      await userGoalsApi.update(goal.id, payload);
    } else {
      await userGoalsApi.create(payload);
    }
  }
}

export async function updateExerciseGoals(data: {
  workoutsPerWeek?: number | null;
  minutesPerWeek?: number | null;
  volumeLbsPerWeek?: number | null;
}): Promise<void> {
  const existing = await userGoalsApi.getAll();
  const exercise = existing.filter(g => g.category === 'exercise');

  const updates = [
    { metricType: 'exercise_weekly_sessions' as GoalMetricType, value: data.workoutsPerWeek, unit: 'sessions' },
    { metricType: 'exercise_weekly_duration' as GoalMetricType, value: data.minutesPerWeek, unit: 'minutes' },
    { metricType: 'exercise_weekly_volume' as GoalMetricType, value: data.volumeLbsPerWeek, unit: 'lbs' },
  ];

  for (const { metricType, value, unit } of updates) {
    if (value == null) continue;
    const goal = findGoalByMetric(exercise, metricType);
    const payload: UserGoalPayload = {
      name: metricType.replace(/_/g, ' '),
      metricType,
      sourceType: 'exercise',
      sourceId: null,
      sourceKey: null,
      targetValue: value,
      unit,
      targetDate: null,
    };
    if (goal) {
      await userGoalsApi.update(goal.id, payload);
    } else {
      await userGoalsApi.create(payload);
    }
  }
}
