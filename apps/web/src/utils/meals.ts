import type { MealSlot } from '@pulse/api-client';

export const MEAL_META: Record<MealSlot, { label: string; emoji: string; from: string; color: string }> = {
  breakfast: { label: 'Breakfast', emoji: '🍳', from: 'from-amber-500/20',  color: '#f59e0b' },
  lunch:     { label: 'Lunch',     emoji: '🥗', from: 'from-green-500/20',  color: '#22c55e' },
  dinner:    { label: 'Dinner',    emoji: '🍽️', from: 'from-blue-500/20',   color: '#60a5fa' },
  snack:     { label: 'Snacks',    emoji: '🍎', from: 'from-rose-500/20',   color: '#f87171' },
};

export const MEAL_LABELS: Record<MealSlot, string> = {
  breakfast: 'Breakfast',
  lunch:     'Lunch',
  dinner:    'Dinner',
  snack:     'Snacks',
};

export const MEAL_SLOTS: MealSlot[] = ['breakfast', 'lunch', 'dinner', 'snack'];
