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
  id:          number;
  name:        string;
  category:    GoalCategory;
  metricType:  GoalMetricType;
  sourceType:  GoalSourceType;
  sourceId:    number | null;
  sourceKey:   string | null;
  sourceName:  string | null;
  targetValue: number;
  unit:        string;
  targetDate:  string | null;
  sortOrder:   number;
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
