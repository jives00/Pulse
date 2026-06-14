import type { GoalCategory } from '@pulse/api-client';

export const CATEGORY_COLORS: Record<GoalCategory, string> = {
  body:      '#7BB389',
  nutrition: '#60a5fa',
  exercise:  '#f97316',
  activity:  '#a78bfa',
};

export const CATEGORY_LABELS: Record<GoalCategory, string> = {
  body:      'Body',
  nutrition: 'Nutrition',
  exercise:  'Exercise',
  activity:  'Activity',
};
