// Goal Progress: 'daily' variant — a value series (usually a daily average) plotted
// against a target line. Covers nutrition/steps goals and, per resolveGoalCard's
// catalog-driven variant selection (fix #11), the per-week exercise totals too.
//
// Fix #7: this variant now gets the same hover tooltip, legend and target label the
// trend cards have (previously bare, unlabeled, no legend).
// Fix #9: a 1-point (or 0-point) series no longer produces NaN coordinates.

import { useRef, useState } from 'react';
import {
  GOAL_CARD_WINDOW_DAYS, localDateStr,
  type Goal, type GoalCardConfig, type FoodLogHistoryDay, type FoodLogHistoryEntry, type StepsDay,
  type WeekBucket,
} from '@pulse/api-client';
import { ACCENT, CARD, LINE, LINE_SOFT, MUTED, MUTED2, CHART_W, CHART_H } from './goalCardTheme';
import { GoalCardShell, type GoalCardStat } from './GoalCardShell';
import { emptyMessageFor, fmtGoalValue, goalDirection, goalStatusFor, resolveUnit } from './goalCardHelpers';

type SeriesPoint = { date: string; val: number };

const NUTRIENT_FIELD: Record<string, (day: FoodLogHistoryDay) => number> = {
  nutrition_calories_daily_avg: d => d.calories,
  nutrition_protein_daily_avg:  d => d.protein,
  nutrition_carbs_daily_avg:    d => (d.entries as FoodLogHistoryEntry[]).reduce((s, e) => s + (e.carbsG ?? 0), 0),
  nutrition_fat_daily_avg:      d => (d.entries as FoodLogHistoryEntry[]).reduce((s, e) => s + (e.fatG ?? 0), 0),
};

function seriesFor(
  goal: Goal, windowDays: number | null,
  foodLogHistory: FoodLogHistoryDay[], stepsHistory: StepsDay[], weeklyData: WeekBucket[],
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
  // Weekly exercise totals — one point per week rather than per day.
  const weeklyField: Record<string, (w: WeekBucket) => number> = {
    exercise_workouts_per_week: w => w.workouts,
    exercise_minutes_per_week:  w => w.minutes,
    exercise_volume_per_week:   w => w.volumeLbs,
  };
  const getter = weeklyField[goal.catalogKey];
  if (getter) return weeklyData.map(w => ({ date: w.weekStart, val: getter(w) }));

  // No known data source for this catalog key (fix #10) — fall back to a single
  // point at the goal's last known value rather than rendering nothing.
  return goal.currentValue != null ? [{ date: localDateStr(), val: goal.currentValue }] : [];
}

export function DailyGoalCard({ goal, cfg, foodLogHistory, stepsHistory, weeklyData, isLoading }: {
  goal: Goal;
  cfg: GoalCardConfig;
  foodLogHistory: FoodLogHistoryDay[];
  stepsHistory: StepsDay[];
  weeklyData: WeekBucket[];
  isLoading: boolean;
}) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  const unit        = resolveUnit(goal);
  const windowDays  = GOAL_CARD_WINDOW_DAYS[cfg.window];
  const values      = seriesFor(goal, windowDays, foodLogHistory, stepsHistory, weeklyData);
  const target      = goal.targetValue;
  const dir         = goalDirection(goal, cfg);

  if (!values.length) {
    return (
      <GoalCardShell
        goal={goal} span={cfg.span} showTarget={cfg.showTarget} showDeadline={cfg.showDeadline}
        showStatus={false} stats={[]} showLegend={false}
        empty={emptyMessageFor(goal)} isLoading={isLoading}
      />
    );
  }

  const avg     = values.reduce((s, v) => s + v.val, 0) / values.length;
  const latest  = values[values.length - 1].val;
  const current = cfg.metricLine === 'value' ? latest : avg;
  const status  = goalStatusFor({ current, target, dir, etaDays: null, deadline: goal.deadline });

  const W = CHART_W, H = CHART_H;
  // Fix #9: a single point no longer divides by (length - 1); it's centered instead.
  const X = values.length > 1 ? (i: number) => (i / (values.length - 1)) * W : () => W / 2;
  const allY = [...values.map(v => v.val), target];
  const minV = Math.min(...allY) * 0.96;
  const maxV = Math.max(...allY) * 1.04;
  const Y = (v: number) => H - ((v - minV) / (maxV - minV || 1)) * H;
  const path = values.length > 1
    ? values.map((v, i) => `${i ? 'L' : 'M'}${X(i).toFixed(1)},${Y(v.val).toFixed(1)}`).join('')
    : null;
  const targetY = Y(target);

  const stats: GoalCardStat[] = [
    { label: cfg.metricLine === 'value' ? 'Latest' : `${cfg.window} avg`, value: fmtGoalValue(current, unit) },
    ...(cfg.showTarget ? [{ label: 'Target', value: fmtGoalValue(target, unit), color: MUTED } as GoalCardStat] : []),
  ];

  return (
    <GoalCardShell
      goal={goal} span={cfg.span} showTarget={cfg.showTarget} showDeadline={cfg.showDeadline}
      showStatus={cfg.showStatus} status={status} stats={stats} showLegend={cfg.showLegend}
      legend={(
        <>
          <span style={{ color: ACCENT }}>── actual</span>
          <span>╌╌ target {fmtGoalValue(target, unit)}</span>
          <span style={{ marginLeft: 'auto' }}>{values.length} {values.length === 1 ? 'entry' : 'entries'} · {cfg.window} window</span>
        </>
      )}
    >
      <div style={{ position: 'relative' }}>
        <svg
          ref={svgRef}
          viewBox={`0 0 ${W} ${H}`}
          style={{ width: '100%', height: H, display: 'block', cursor: values.length > 1 ? 'crosshair' : 'default' }}
          preserveAspectRatio="none"
          onMouseMove={e => {
            if (!svgRef.current || values.length < 2) return;
            const rect = svgRef.current.getBoundingClientRect();
            const xRatio = (e.clientX - rect.left) / rect.width;
            const idx = Math.round(xRatio * (values.length - 1));
            setHoverIdx(Math.max(0, Math.min(values.length - 1, idx)));
          }}
          onMouseLeave={() => setHoverIdx(null)}
        >
          {[0.25, 0.5, 0.75].map((g, i) => (
            <line key={i} x1="0" x2={W} y1={H * g} y2={H * g} stroke={LINE_SOFT} strokeWidth="1" />
          ))}
          <line x1="0" x2={W} y1={targetY} y2={targetY} stroke={MUTED} strokeWidth="1" strokeDasharray="3 3" opacity="0.5" />
          {path && <path d={path} fill="none" stroke={ACCENT} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />}
          {values.length === 1 && (
            <circle cx={X(0).toFixed(1)} cy={Y(values[0].val).toFixed(1)} r="4" fill={ACCENT} />
          )}
          {hoverIdx !== null && values.length > 1 && (() => {
            const v  = values[hoverIdx];
            const hx = X(hoverIdx);
            const hy = Y(v.val);
            return (
              <>
                <line x1={hx.toFixed(1)} x2={hx.toFixed(1)} y1="0" y2={H} stroke="rgba(255,255,255,0.15)" strokeWidth="1" />
                <circle cx={hx.toFixed(1)} cy={hy.toFixed(1)} r="4" fill={ACCENT} stroke={CARD} strokeWidth="2" />
              </>
            );
          })()}
        </svg>
        {hoverIdx !== null && values.length > 1 && (() => {
          const v  = values[hoverIdx];
          const hx = X(hoverIdx);
          const hy = Y(v.val);
          const leftPct = (hx / W) * 100;
          return (
            <div style={{
              position: 'absolute',
              left: `clamp(0px, calc(${leftPct.toFixed(1)}% - 52px), calc(100% - 104px))`,
              top: Math.max(0, hy - 46),
              background: CARD, border: `1px solid ${LINE}`,
              padding: '5px 10px', borderRadius: 4,
              pointerEvents: 'none', zIndex: 10, minWidth: 104,
            }}>
              <div className="font-mono" style={{ fontSize: 10, color: MUTED2 }}>{v.date}</div>
              <div className="font-display" style={{ fontSize: 14, fontWeight: 600, color: 'white' }}>
                {fmtGoalValue(v.val, unit)}
              </div>
            </div>
          );
        })()}
      </div>
    </GoalCardShell>
  );
}
