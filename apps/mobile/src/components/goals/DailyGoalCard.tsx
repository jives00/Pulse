// Goal Progress: 'daily' variant — a value series (usually a daily average) plotted
// against a target line. Covers nutrition/steps goals and, per resolveGoalCard's
// catalog-driven variant selection, the per-week exercise totals too. Mirrors
// apps/web/src/components/goals/dashboard/DailyGoalCard.tsx.

import { View, Text } from 'react-native';
import {
  GOAL_CARD_WINDOW_DAYS, localDateStr,
  goalDirection, goalStatusFor, resolveUnit, fmtGoalValue, emptyMessageFor,
  type Goal, type GoalCardConfig, type FoodLogHistoryDay, type FoodLogHistoryEntry, type StepsEntry, type WeekBucket,
} from '../../../../../packages/api-client/src/index';
import type { Colors } from '../../theme';
import { MiniLineChart } from '../dashboard/MiniLineChart';
import { GoalCardShell, type GoalCardStat } from './GoalCardShell';
import { COL_GOLD } from './goalCardTheme';

type SeriesPoint = { date: string; val: number };

const NUTRIENT_FIELD: Record<string, (day: FoodLogHistoryDay) => number> = {
  nutrition_calories_daily_avg: d => d.calories,
  nutrition_protein_daily_avg:  d => d.protein,
  nutrition_carbs_daily_avg:    d => (d.entries as FoodLogHistoryEntry[]).reduce((s, e) => s + (e.carbsG ?? 0), 0),
  nutrition_fat_daily_avg:      d => (d.entries as FoodLogHistoryEntry[]).reduce((s, e) => s + (e.fatG ?? 0), 0),
};

function seriesFor(
  goal: Goal, windowDays: number | null,
  foodLogHistory: FoodLogHistoryDay[], stepsHistory: StepsEntry[], weeklyData: WeekBucket[],
): SeriesPoint[] {
  const nutrientGetter = NUTRIENT_FIELD[goal.catalogKey];
  if (nutrientGetter) {
    const sorted = [...foodLogHistory].sort((a, b) => a.date.localeCompare(b.date)).filter(d => d.calories > 0);
    const windowed = windowDays != null ? sorted.slice(-windowDays) : sorted;
    return windowed.map(d => ({ date: d.date, val: nutrientGetter(d) }));
  }
  if (goal.catalogKey === 'activity_steps_daily_avg') {
    const sorted = [...stepsHistory].sort((a, b) => a.date.localeCompare(b.date)).filter(d => (d.steps ?? 0) > 0);
    const windowed = windowDays != null ? sorted.slice(-windowDays) : sorted;
    return windowed.map(d => ({ date: d.date, val: d.steps ?? 0 }));
  }
  const weeklyField: Record<string, (w: WeekBucket) => number> = {
    exercise_workouts_per_week: w => w.workouts,
    exercise_minutes_per_week:  w => w.minutes,
    exercise_volume_per_week:   w => w.volumeLbs,
  };
  const getter = weeklyField[goal.catalogKey];
  if (getter) return weeklyData.map(w => ({ date: w.weekStart, val: getter(w) }));

  // No known data source for this catalog key — fall back to a single point at the
  // goal's last known value rather than rendering nothing.
  return goal.currentValue != null ? [{ date: localDateStr(), val: goal.currentValue }] : [];
}

export function DailyGoalCard({ goal, cfg, foodLogHistory, stepsHistory, weeklyData, isLoading, c }: {
  goal: Goal;
  cfg: GoalCardConfig;
  foodLogHistory: FoodLogHistoryDay[];
  stepsHistory: StepsEntry[];
  weeklyData: WeekBucket[];
  isLoading: boolean;
  c: Colors;
}) {
  const unit       = resolveUnit(goal);
  const windowDays = GOAL_CARD_WINDOW_DAYS[cfg.window];
  const values     = seriesFor(goal, windowDays, foodLogHistory, stepsHistory, weeklyData);
  const target     = goal.targetValue;
  const dir        = goalDirection(goal, cfg);

  if (!values.length) {
    return (
      <GoalCardShell
        goal={goal} showTarget={cfg.showTarget} showDeadline={cfg.showDeadline}
        showStatus={false} stats={[]} showLegend={false}
        empty={emptyMessageFor(goal)} isLoading={isLoading} c={c}
      />
    );
  }

  const avg     = values.reduce((s, v) => s + v.val, 0) / values.length;
  const latest  = values[values.length - 1].val;
  const current = cfg.metricLine === 'value' ? latest : avg;
  const status  = goalStatusFor({ current, target, dir, etaDays: null, deadline: goal.deadline });

  const stats: GoalCardStat[] = [
    { label: cfg.metricLine === 'value' ? 'Latest' : `${cfg.window} avg`, value: fmtGoalValue(current, unit) },
    ...(cfg.showTarget ? [{ label: 'Target', value: fmtGoalValue(target, unit), color: c.muted } as GoalCardStat] : []),
  ];

  return (
    <GoalCardShell
      goal={goal} showTarget={cfg.showTarget} showDeadline={cfg.showDeadline}
      showStatus={cfg.showStatus} status={status} stats={stats} showLegend={cfg.showLegend} c={c}
      legend={
        <View style={{ flexDirection: 'row', gap: 14, flexWrap: 'wrap' }}>
          <Text style={{ fontSize: 11, color: COL_GOLD }}>── actual</Text>
          <Text style={{ fontSize: 11, color: c.muted }}>╌╌ target {fmtGoalValue(target, unit)}</Text>
        </View>
      }
    >
      <MiniLineChart data={values.map(v => v.val)} color={COL_GOLD} goalLine={target} />
    </GoalCardShell>
  );
}
