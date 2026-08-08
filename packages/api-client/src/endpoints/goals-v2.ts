import { apiClient } from '../client';
import type { GoalCatalogKey, GoalCategory, GoalCardType, GoalSourceType } from '../goalCatalog';
import type { GoalCardConfig } from '../goalCardConfig';

export type GoalStatus      = 'active' | 'achieved' | 'missed' | 'abandoned';
export type MilestoneStatus = 'active' | 'achieved' | 'missed';
export type ProgressSource  = 'manual' | 'auto';

export interface Goal {
  id:                 number;
  catalogKey:         GoalCatalogKey;
  name:               string;
  category:           GoalCategory;
  cardType:           GoalCardType;
  sourceType:         GoalSourceType | null;
  sourceId:           number | null;
  sourceName:         string | null;
  startValue:         number | null;
  targetValue:        number;
  unit:               string;
  startedAt:          string;
  deadline:           string | null;
  showOnDashboard:    boolean;
  sortOrder:          number;
  status:             GoalStatus;
  closedAt:           string | null;
  actualValueAtClose: number | null;
  notes:              string | null;
  currentValue:       number | null;
  /** Raw stored card presentation config, or null when unset. resolveGoalCard sanitizes it on read. */
  cardConfig:         Partial<GoalCardConfig> | null;
}

export interface GoalDetail extends Goal {
  milestones: GoalMilestone[];
  progress:   GoalProgressEntry[];
}

export interface GoalMilestone {
  id:                 number;
  goalId:             number;
  targetValue:        number;
  targetDate:         string;
  label:              string | null;
  status:             MilestoneStatus;
  closedAt:           string | null;
  actualValueAtClose: number | null;
  notes:              string | null;
}

export interface GoalMilestoneWithGoal extends GoalMilestone {
  catalogKey: GoalCatalogKey;
  goalName:   string;
  goalUnit:   string;
}

export interface GoalProgressEntry {
  id:       number;
  goalId:   number;
  value:    number;
  loggedAt: string;
  source:   ProgressSource;
  notes:    string | null;
}

export type CreateGoalPayload = {
  catalogKey:      GoalCatalogKey;
  name:            string;
  category:        GoalCategory;
  cardType:        GoalCardType;
  targetValue:     number;
  unit:            string;
  startedAt:       string;
  startValue?:     number | null;
  deadline?:       string | null;
  sourceType?:     GoalSourceType | null;
  sourceId?:       number | null;
  sourceName?:     string | null;
  showOnDashboard?: boolean;
  sortOrder?:      number;
  notes?:          string | null;
};

export type UpdateGoalPayload = Partial<Pick<Goal,
  'name' | 'targetValue' | 'unit' | 'deadline' | 'showOnDashboard' | 'sortOrder' | 'sourceName' | 'notes'
>> & {
  cardConfig?: Partial<GoalCardConfig> | null;
};

export type CloseGoalPayload = {
  status: 'achieved' | 'missed' | 'abandoned';
  actualValueAtClose?: number | null;
};

export type CreateMilestonePayload = {
  targetValue: number;
  targetDate:  string;
  label?:      string | null;
  notes?:      string | null;
};

export type UpdateMilestonePayload = Partial<Pick<GoalMilestone,
  'targetValue' | 'targetDate' | 'label' | 'status' | 'actualValueAtClose' | 'notes'
>>;

export type CreateProgressPayload = {
  value:     number;
  loggedAt?: string;
  notes?:    string | null;
};

// ─── API ──────────────────────────────────────────────────────────────────────

export const goalsV2Api = {
  // Goals
  getAll: (status: GoalStatus = 'active') =>
    apiClient.get<Goal[]>('/goals-v2', { params: { status } }).then(r => r.data),

  getById: (id: number) =>
    apiClient.get<GoalDetail>(`/goals-v2/${id}`).then(r => r.data),

  getNudges: () =>
    apiClient.get<Goal[]>('/goals-v2/nudges').then(r => r.data),

  create: (data: CreateGoalPayload) =>
    apiClient.post<Goal>('/goals-v2', data).then(r => r.data),

  update: (id: number, data: UpdateGoalPayload) =>
    apiClient.patch<Goal>(`/goals-v2/${id}`, data).then(r => r.data),

  close: (id: number, data: CloseGoalPayload) =>
    apiClient.post<Goal>(`/goals-v2/${id}/close`, data).then(r => r.data),

  delete: (id: number) =>
    apiClient.delete(`/goals-v2/${id}`).then(() => {}),

  // Milestones
  getAllMilestones: () =>
    apiClient.get<GoalMilestoneWithGoal[]>('/goals-v2/milestones').then(r => r.data),

  getMilestones: (goalId: number) =>
    apiClient.get<GoalMilestone[]>(`/goals-v2/${goalId}/milestones`).then(r => r.data),

  createMilestone: (goalId: number, data: CreateMilestonePayload) =>
    apiClient.post<GoalMilestone>(`/goals-v2/${goalId}/milestones`, data).then(r => r.data),

  updateMilestone: (goalId: number, milestoneId: number, data: UpdateMilestonePayload) =>
    apiClient.patch<GoalMilestone>(`/goals-v2/${goalId}/milestones/${milestoneId}`, data).then(r => r.data),

  deleteMilestone: (goalId: number, milestoneId: number) =>
    apiClient.delete(`/goals-v2/${goalId}/milestones/${milestoneId}`).then(() => {}),

  // Progress
  getProgress: (goalId: number, limit?: number) =>
    apiClient.get<GoalProgressEntry[]>(`/goals-v2/${goalId}/progress`, { params: limit ? { limit } : undefined }).then(r => r.data),

  logProgress: (goalId: number, data: CreateProgressPayload) =>
    apiClient.post<GoalProgressEntry>(`/goals-v2/${goalId}/progress`, data).then(r => r.data),

  deleteProgress: (goalId: number, progressId: number) =>
    apiClient.delete(`/goals-v2/${goalId}/progress/${progressId}`).then(() => {}),
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

export function goalsByCategory(goals: Goal[]): Record<GoalCategory, Goal[]> {
  return {
    body:      goals.filter(g => g.category === 'body'),
    nutrition: goals.filter(g => g.category === 'nutrition'),
    exercise:  goals.filter(g => g.category === 'exercise'),
    activity:  goals.filter(g => g.category === 'activity'),
  };
}
