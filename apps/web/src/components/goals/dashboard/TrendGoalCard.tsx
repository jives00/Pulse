// Goal Progress: 'trend' variant — history + linear-regression projection + target
// line. Used for body_weight and the other body measurements. Unifies what used to
// be two near-duplicate renderers (WeightGoalCard, BodyMeasGoalCard) behind one
// component driven entirely by the resolved GoalCardConfig (fixes #6/#7: window,
// projection horizon and chart geometry no longer differ goal to goal).

import { useRef, useState } from 'react';
import {
  KG_TO_LBS, GOAL_CARD_WINDOW_DAYS, TDEE_PROJECTION_KEYS, localDateStr,
  type Goal, type GoalCardConfig, type BodyMeasurement, type FoodLogHistoryDay, type TDEEBreakdown,
} from '@pulse/api-client';
import { ACCENT, CARD, LINE, LINE_SOFT, MUTED, MUTED2, TEXT, TREND_COLOR, TDEE_COLOR, CHART_W, CHART_H, fmt1 } from './goalCardTheme';
import { T } from '../../../utils/typeScale';
import { GoalCardShell, type GoalCardStat } from './GoalCardShell';
import { emptyMessageFor, fmtETA, fmtGoalValue, goalDirection, goalStatusFor, linregSlope, resolveUnit } from './goalCardHelpers';

// Body-measurement catalog keys map onto the BodyMeasurement.metric column; weight
// gets its own branch below because it also converts kg entries and can plot a
// TDEE-based projection alongside the trend line.
const BODY_METRIC_FOR: Record<string, string> = {
  body_waist:       'waist',
  body_bicep:       'bicep',
  body_chest:       'chest',
  body_hips:        'hips',
  body_fat_pct:     'body_fat',
  body_muscle_mass: 'muscle_mass',
  body_water_pct:   'water_pct',
};

// Fix #6/#7: one projection horizon for every trend card (matches weight's existing 28d).
const PROJECTION_DAYS = 28;


export function TrendGoalCard({ goal, cfg, measurements, foodLogHistory, tdee, isLoading }: {
  goal: Goal;
  cfg: GoalCardConfig;
  measurements: BodyMeasurement[];
  foodLogHistory: FoodLogHistoryDay[];
  tdee: TDEEBreakdown | null;
  isLoading: boolean;
}) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  const isWeight = goal.catalogKey === 'body_weight';
  const metric   = isWeight ? 'weight' : BODY_METRIC_FOR[goal.catalogKey];
  const unit     = resolveUnit(goal);

  const sorted = measurements
    .filter(m => m.metric === metric)
    .sort((a, b) => a.measuredAt.localeCompare(b.measuredAt))
    .map(m => ({ date: m.measuredAt, val: isWeight && m.unit === 'kg' ? m.value * KG_TO_LBS : m.value }));

  const target   = goal.targetValue;
  const dir      = goalDirection(goal, cfg);

  if (!metric || !sorted.length) {
    return (
      <GoalCardShell
        goal={goal} span={cfg.span} showTarget={cfg.showTarget} showDeadline={cfg.showDeadline}
        showStatus={false} stats={[]} showLegend={false}
        empty={emptyMessageFor(goal)} isLoading={isLoading}
      />
    );
  }

  const current = sorted[sorted.length - 1].val;
  const todayMs = new Date(localDateStr() + 'T12:00:00').getTime();

  // Window: source of truth is cfg.window (fix #6/7 — no more per-card hardcoded windows).
  const windowDays = GOAL_CARD_WINDOW_DAYS[cfg.window];
  const chartData  = (windowDays != null
    ? sorted.filter(m => new Date(m.date + 'T12:00:00').getTime() >= todayMs - windowDays * 86400000)
    : sorted);
  const dataForChart = chartData.length > 0 ? chartData : sorted.slice(-30); // fallback if window is empty

  // Regression slope over the same window used for the chart (falls back to all data).
  const regrSource  = chartData.length >= 2 ? chartData : sorted;
  const regrT0Ms    = new Date(regrSource[0].date + 'T12:00:00').getTime();
  const slopePerDay = linregSlope(regrSource, regrT0Ms);

  // TDEE-based slope (lbs/day) — weight only. TEF is derived from avgCal (not tdee.tef)
  // so days with no food logged yet don't collapse the projection to a flat line.
  let tdeeSlopePerDay: number | null = null;
  const showTdee = cfg.projection === 'trend+tdee' && TDEE_PROJECTION_KEYS.includes(goal.catalogKey);
  if (showTdee && tdee) {
    const recentFood = foodLogHistory.slice(-30).filter(d => d.calories > 0);
    if (recentFood.length > 0) {
      const avgCal    = recentFood.reduce((s, d) => s + d.calories, 0) / recentFood.length;
      const tdeeAtAvg = tdee.bmr + tdee.neat + tdee.exercise + avgCal * 0.1 + (tdee.stepsKcal ?? 0);
      tdeeSlopePerDay = (avgCal - tdeeAtAvg) / 3500;
    }
  }

  function etaDays(slopePerDay: number): number | null {
    if (Math.abs(slopePerDay) < 0.0005) return null;
    const d = (target - current) / slopePerDay;
    return d > 0 ? Math.round(d) : null;
  }

  const trendEta = cfg.projection !== 'none' ? etaDays(slopePerDay) : null;
  const tdeeEta  = tdeeSlopePerDay != null ? etaDays(tdeeSlopePerDay) : null;
  const status   = goalStatusFor({ current, target, dir, etaDays: trendEta, deadline: goal.deadline });

  const t0Ms  = new Date(dataForChart[0].date + 'T12:00:00').getTime();
  const showProjection = cfg.projection !== 'none';
  const endMs = showProjection ? todayMs + PROJECTION_DAYS * 86400000 : Math.max(todayMs, new Date(dataForChart[dataForChart.length - 1].date + 'T12:00:00').getTime());
  const W = CHART_W, H = CHART_H;
  const X = (ms: number) => ((ms - t0Ms) / (endMs - t0Ms)) * W;
  const todayX = X(todayMs);

  const trendPts = showProjection ? Array.from({ length: PROJECTION_DAYS + 1 }, (_, i) => ({
    x: X(todayMs + i * 86400000),
    y: current + slopePerDay * i,
  })) : [];
  const tdeePts = showProjection && tdeeSlopePerDay != null ? Array.from({ length: PROJECTION_DAYS + 1 }, (_, i) => ({
    x: X(todayMs + i * 86400000),
    y: current + tdeeSlopePerDay! * i,
  })) : null;

  const allY = [
    ...dataForChart.map(m => m.val),
    ...trendPts.map(p => p.y),
    ...(tdeePts ?? []).map(p => p.y),
    target,
  ].filter(v => Number.isFinite(v));
  const minV = Math.min(...allY) * 0.994;
  const maxV = Math.max(...allY) * 1.006;
  const Y = (v: number) => H - ((v - minV) / (maxV - minV || 1)) * (H - 20) - 10;

  const histPath = dataForChart.map((m, i) =>
    `${i ? 'L' : 'M'}${X(new Date(m.date + 'T12:00:00').getTime()).toFixed(1)},${Y(m.val).toFixed(1)}`
  ).join('');
  const aPath = `${histPath} L${todayX.toFixed(1)},${H} L${X(t0Ms).toFixed(1)},${H} Z`;
  const trendPath = trendPts.length ? trendPts.map((p, i) => `${i ? 'L' : 'M'}${p.x.toFixed(1)},${Y(p.y).toFixed(1)}`).join('') : null;
  const tdeePath  = tdeePts ? tdeePts.map((p, i) => `${i ? 'L' : 'M'}${p.x.toFixed(1)},${Y(p.y).toFixed(1)}`).join('') : null;
  const targetY   = Y(target);

  const stats: GoalCardStat[] = [
    { label: 'Current', value: fmtGoalValue(current, unit) },
    ...(cfg.showTarget ? [{ label: 'Target', value: fmtGoalValue(target, unit), color: MUTED } as GoalCardStat] : []),
    ...(trendEta != null ? [{ label: 'ETA · trend', value: fmtETA(trendEta), color: TREND_COLOR, labelColor: TREND_COLOR, kind: 'date' } as GoalCardStat] : []),
    ...(tdeeEta != null ? [{ label: 'ETA · TDEE pace', value: fmtETA(tdeeEta), color: TDEE_COLOR, labelColor: TDEE_COLOR, kind: 'date' } as GoalCardStat] : []),
  ];

  const gradId = `trend-${goal.id}`;

  return (
    <GoalCardShell
      goal={goal} span={cfg.span} showTarget={cfg.showTarget} showDeadline={cfg.showDeadline}
      showStatus={cfg.showStatus} status={status} stats={stats} showLegend={cfg.showLegend}
      legend={(
        <>
          <span style={{ color: ACCENT }}>── actual</span>
          {trendPath && <span style={{ color: TREND_COLOR }}>╌╌ trend proj</span>}
          {tdeePath && <span style={{ color: TDEE_COLOR }}>╌╌ TDEE proj</span>}
          <span>╌╌ target {fmtGoalValue(target, unit)}</span>
          <span style={{ marginLeft: 'auto' }}>{dataForChart.length} entries · {cfg.window} window{showProjection ? ` · ${PROJECTION_DAYS}d proj` : ''}</span>
        </>
      )}
    >
      <div style={{ position: 'relative' }}>
        <svg
          ref={svgRef}
          viewBox={`0 0 ${W} ${H}`}
          style={{ width: '100%', height: H, display: 'block', cursor: 'crosshair' }}
          preserveAspectRatio="none"
          onMouseMove={e => {
            if (!svgRef.current) return;
            const rect = svgRef.current.getBoundingClientRect();
            const xRatio = (e.clientX - rect.left) / rect.width;
            const hoverMs = t0Ms + xRatio * (endMs - t0Ms);
            let closest = 0, minDist = Infinity;
            dataForChart.forEach((m, i) => {
              const dist = Math.abs(new Date(m.date + 'T12:00:00').getTime() - hoverMs);
              if (dist < minDist) { minDist = dist; closest = i; }
            });
            setHoverIdx(closest);
          }}
          onMouseLeave={() => setHoverIdx(null)}
        >
          <defs>
            <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={ACCENT} stopOpacity="0.14" />
              <stop offset="100%" stopColor={ACCENT} stopOpacity="0" />
            </linearGradient>
          </defs>
          {[0.25, 0.5, 0.75].map((g, i) => (
            <line key={i} x1="0" x2={W} y1={H * g} y2={H * g} stroke={LINE_SOFT} strokeWidth="1" />
          ))}
          <line x1="0" x2={W} y1={targetY} y2={targetY} stroke={MUTED} strokeWidth="1" strokeDasharray="3 3" opacity="0.5" />
          <path d={aPath} fill={`url(#${gradId})`} />
          <path d={histPath} fill="none" stroke={ACCENT} strokeWidth="1.8" />
          <line x1={todayX.toFixed(1)} x2={todayX.toFixed(1)} y1="0" y2={H} stroke={LINE} strokeWidth="1" strokeDasharray="2 2" opacity="0.5" />
          {tdeePath && (
            <path d={tdeePath} fill="none" stroke={TDEE_COLOR} strokeWidth="1.4" strokeDasharray="4 3" opacity="0.85" />
          )}
          {trendPath && (
            <path d={trendPath} fill="none" stroke={TREND_COLOR} strokeWidth="1.4" strokeDasharray="4 3" opacity="0.9" />
          )}
          <circle cx={todayX.toFixed(1)} cy={Y(current).toFixed(1)} r="3" fill={ACCENT} />
          {hoverIdx !== null && (() => {
            const m = dataForChart[hoverIdx];
            const hx = X(new Date(m.date + 'T12:00:00').getTime());
            const hy = Y(m.val);
            return (
              <>
                <line x1={hx.toFixed(1)} x2={hx.toFixed(1)} y1="0" y2={H} stroke="rgba(255,255,255,0.15)" strokeWidth="1" />
                <circle cx={hx.toFixed(1)} cy={hy.toFixed(1)} r="4" fill={ACCENT} stroke={CARD} strokeWidth="2" />
              </>
            );
          })()}
        </svg>
        {hoverIdx !== null && (() => {
          const m = dataForChart[hoverIdx];
          const hx = X(new Date(m.date + 'T12:00:00').getTime());
          const hy = Y(m.val);
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
              <div className="font-mono" style={{ fontSize: T.small, color: MUTED2 }}>{m.date}</div>
              <div className="font-display" style={{ fontSize: T.body, fontWeight: 600, color: TEXT }}>
                {fmt1(m.val)}<span style={{ fontSize: T.label, color: MUTED, marginLeft: 3 }}>{unit}</span>
              </div>
            </div>
          );
        })()}
      </div>
    </GoalCardShell>
  );
}
