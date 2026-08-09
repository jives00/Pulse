// Goal Progress: 'trend' variant — history + linear-regression projection + target
// line. Used for body_weight and the other body measurements. Mirrors
// apps/web/src/components/goals/dashboard/TrendGoalCard.tsx; all math (slope, ETA,
// TDEE pace, direction, status) comes from @pulse/api-client's goalCardLogic — this
// file only builds the chart series and lays out RN views.

import { View, Text } from 'react-native';
import {
  KG_TO_LBS, GOAL_CARD_WINDOW_DAYS, TDEE_PROJECTION_KEYS, localDateStr,
  goalDirection, goalStatusFor, linregSlope, etaDaysFor, tdeeSlopePerDay, resolveUnit,
  fmtGoalValue, fmtETA, emptyMessageFor,
  type Goal, type GoalCardConfig, type BodyMeasurement, type FoodLogHistoryDay, type TDEEBreakdown,
} from '../../../../../packages/api-client/src/index';
import { fontSize, type Colors } from '../../theme';
import { MiniLineChart } from '../dashboard/MiniLineChart';
import { GoalCardShell, type GoalCardStat } from './GoalCardShell';
import { COL_GOLD, TREND_COLOR, TDEE_COLOR } from './goalCardTheme';

// Body-measurement catalog keys map onto the BodyMeasurement.metric column; weight
// gets its own branch because it also converts kg entries and can plot a TDEE-based
// projection alongside the trend line.
const BODY_METRIC_FOR: Record<string, string> = {
  body_waist:       'waist',
  body_bicep:       'bicep',
  body_chest:       'chest',
  body_hips:        'hips',
  body_fat_pct:     'body_fat',
  body_muscle_mass: 'muscle_mass',
  body_water_pct:   'water_pct',
};

export function TrendGoalCard({ goal, cfg, measurements, foodLogHistory, tdee, isLoading, c }: {
  goal: Goal;
  cfg: GoalCardConfig;
  measurements: BodyMeasurement[];
  foodLogHistory: FoodLogHistoryDay[];
  tdee: TDEEBreakdown | null;
  isLoading: boolean;
  c: Colors;
}) {
  const isWeight = goal.catalogKey === 'body_weight';
  const metric   = isWeight ? 'weight' : BODY_METRIC_FOR[goal.catalogKey];
  const unit     = resolveUnit(goal);

  const sorted = measurements
    .filter(m => m.metric === metric)
    .sort((a, b) => a.measuredAt.localeCompare(b.measuredAt))
    .map(m => ({ date: m.measuredAt, val: isWeight && m.unit === 'kg' ? m.value * KG_TO_LBS : m.value }));

  const target = goal.targetValue;
  const dir    = goalDirection(goal, cfg);

  if (!metric || !sorted.length) {
    return (
      <GoalCardShell
        goal={goal} showTarget={cfg.showTarget} showDeadline={cfg.showDeadline}
        showStatus={false} stats={[]} showLegend={false}
        empty={emptyMessageFor(goal)} isLoading={isLoading} c={c}
      />
    );
  }

  const current = sorted[sorted.length - 1].val;
  const todayMs = new Date(localDateStr() + 'T12:00:00').getTime();

  const windowDays = GOAL_CARD_WINDOW_DAYS[cfg.window];
  const chartData  = windowDays != null
    ? sorted.filter(m => new Date(m.date + 'T12:00:00').getTime() >= todayMs - windowDays * 86400000)
    : sorted;
  const dataForChart = chartData.length > 0 ? chartData : sorted.slice(-30);

  const regrSource  = chartData.length >= 2 ? chartData : sorted;
  const regrT0Ms    = new Date(regrSource[0].date + 'T12:00:00').getTime();
  const slopePerDay = linregSlope(regrSource, regrT0Ms);

  // TDEE-based slope — weight only. Comes straight from the shared implementation, so
  // stepsKcal is always included (previously omitted on mobile — the bug this ports fix for).
  let tdeeSlope: number | null = null;
  const showTdee = cfg.projection === 'trend+tdee' && TDEE_PROJECTION_KEYS.includes(goal.catalogKey);
  if (showTdee && tdee) {
    const recentCalories = foodLogHistory.slice(-30).map(d => d.calories);
    tdeeSlope = tdeeSlopePerDay(tdee, recentCalories);
  }

  const trendEta = cfg.projection !== 'none' ? etaDaysFor(current, target, slopePerDay) : null;
  const tdeeEta  = tdeeSlope != null ? etaDaysFor(current, target, tdeeSlope) : null;
  const status   = goalStatusFor({ current, target, dir, etaDays: trendEta, deadline: goal.deadline });

  // Build a daily (forward-filled) actual series for the chart, plus 28-day projections.
  const chartT0Ms = new Date(dataForChart[0].date + 'T12:00:00').getTime();
  const totalSpanDays = (todayMs - chartT0Ms) / 86400000 + 28;
  const numDays = Math.round(totalSpanDays) + 1;
  const byDate: Record<string, number> = {};
  for (const m of dataForChart) byDate[m.date] = m.val;
  let last: number | null = null;
  const actualSeries: number[] = [];
  for (let i = 0; i < numDays; i++) {
    const d = localDateStr(new Date(chartT0Ms + i * 86400000));
    if (byDate[d] != null) last = byDate[d];
    if (new Date(d + 'T12:00:00').getTime() <= todayMs) actualSeries.push(last ?? 0);
  }
  const showProjection = cfg.projection !== 'none';
  const proj28 = showProjection ? Array.from({ length: 29 }, (_, i) => +(current + slopePerDay * i).toFixed(2)) : undefined;
  const tdeeProj28 = showProjection && tdeeSlope != null
    ? Array.from({ length: 29 }, (_, i) => +(current + tdeeSlope! * i).toFixed(2))
    : undefined;

  const allVals = [...actualSeries.filter(Boolean), ...(proj28 ?? []), ...(tdeeProj28 ?? []), target].filter(v => v > 0);
  const chartMin = allVals.length ? Math.min(...allVals) * 0.994 : 0;
  const chartMax = allVals.length ? Math.max(...allVals) * 1.006 : 1;

  const stats: GoalCardStat[] = [
    { label: 'Current', value: fmtGoalValue(current, unit) },
    ...(cfg.showTarget ? [{ label: 'Target', value: fmtGoalValue(target, unit), color: c.muted } as GoalCardStat] : []),
    ...(trendEta != null ? [{ label: 'ETA · trend', value: fmtETA(trendEta), color: TREND_COLOR, labelColor: TREND_COLOR, kind: 'date' } as GoalCardStat] : []),
    ...(tdeeEta != null ? [{ label: 'ETA · TDEE', value: fmtETA(tdeeEta), color: TDEE_COLOR, labelColor: TDEE_COLOR, kind: 'date' } as GoalCardStat] : []),
  ];

  return (
    <GoalCardShell
      goal={goal} showTarget={cfg.showTarget} showDeadline={cfg.showDeadline}
      showStatus={cfg.showStatus} status={status} stats={stats} showLegend={cfg.showLegend} c={c}
      legend={
        <View style={{ flexDirection: 'row', gap: 14, flexWrap: 'wrap' }}>
          <Text style={{ fontSize: 11, color: COL_GOLD }}>── actual</Text>
          {proj28 && <Text style={{ fontSize: 11, color: TREND_COLOR }}>╌╌ trend proj</Text>}
          {tdeeProj28 && <Text style={{ fontSize: 11, color: TDEE_COLOR }}>╌╌ TDEE proj</Text>}
          <Text style={{ fontSize: 11, color: c.muted }}>╌╌ target {fmtGoalValue(target, unit)}</Text>
        </View>
      }
    >
      <MiniLineChart data={actualSeries} projection={proj28} projection2={tdeeProj28} color={COL_GOLD} goalLine={target} maxOverride={chartMax} minOverride={chartMin} />
    </GoalCardShell>
  );
}
