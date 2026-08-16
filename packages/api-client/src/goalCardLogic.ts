// Platform-agnostic logic behind the dashboard goal cards.
//
// Web and mobile both render goal cards, and they used to compute direction, status,
// units, and weight projections independently — which is how the same goal ended up
// showing two different projected dates depending on the device. Everything here is
// pure (no React, no colors, no DOM) so both platforms share ONE implementation and
// can only differ in presentation.

import { CATALOG_BY_KEY, type GoalCategory, type GoalCatalogKey } from './goalCatalog';
import { TDEE_PROJECTION_KEYS, type GoalCardConfig } from './goalCardConfig';

export type GoalCardStatus = 'achieved' | 'ahead' | 'on_track' | 'behind' | 'no_data';

/** The shape both platforms' goal objects satisfy — avoids importing the Goal endpoint type. */
export interface GoalCardSubject {
  name:         string;
  catalogKey:   GoalCatalogKey;
  category:     GoalCategory | string;
  unit:         string;
  targetValue:  number;
  startValue:   number | null;
  currentValue: number | null;
  deadline:     string | null;
}

/** Units that read as whole numbers on the dashboard; everything else gets 2 decimals. */
const INTEGER_UNITS = new Set(['kcal', 'g', 'steps', 'workouts', 'min', 'sessions']);

/**
 * Measurement precision: up to 2 decimals, with trailing zeros dropped so a scale
 * reading of 2.5 stays "2.5" rather than becoming "2.50".
 */
export const fmt2 = (n: number) => String(Number(n.toFixed(2)));

/** Title always comes from the goal's own name, falling back to the catalog label. */
export function titleFor(goal: Pick<GoalCardSubject, 'name' | 'catalogKey'>): string {
  return goal.name?.trim() || CATALOG_BY_KEY[goal.catalogKey]?.label || 'Goal';
}

/** One source of truth for a goal's unit: its own, else the catalog default. */
export function resolveUnit(goal: Pick<GoalCardSubject, 'unit' | 'catalogKey'>): string {
  return goal.unit || CATALOG_BY_KEY[goal.catalogKey]?.defaultUnit || '';
}

export function fmtGoalValue(value: number, unit: string): string {
  const n = INTEGER_UNITS.has(unit) ? Math.round(value).toLocaleString() : fmt2(value);
  return unit ? `${n} ${unit}` : n;
}

export function normDateStr(isoStr: string): string {
  return isoStr.slice(0, 10);
}

export function fmtDeadline(deadline: string | null): string {
  if (!deadline) return '—';
  return new Date(normDateStr(deadline) + 'T12:00:00')
    .toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export function fmtETA(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export function daysUntil(deadline: string | null): number | null {
  if (!deadline) return null;
  return Math.ceil((new Date(normDateStr(deadline) + 'T12:00:00').getTime() - Date.now()) / 86400000);
}

/**
 * Direction is never assumed downward — an upward goal (muscle mass, bicep) must be
 * able to reach "achieved". The user's explicit override wins, then we infer from
 * where the goal started relative to its target, then from what the metric itself
 * means.
 *
 * The metric default matters because the earlier steps go quiet exactly when a goal
 * has no startValue, or a startValue equal to the target. Inferring from currentValue
 * instead — the old last step — reads "below target" as "climbing toward it", which is
 * only true until you get there: an already-met waist goal (29.8 against 30.5) inferred
 * 'up' and could never report achieved. The catalog knows a waist goal is downward
 * regardless of where you stand today.
 */
export function goalDirection(
  goal: Pick<GoalCardSubject, 'catalogKey' | 'startValue' | 'targetValue'>,
  cfg: Pick<GoalCardConfig, 'direction'>,
): 'up' | 'down' {
  if (cfg.direction === 'up' || cfg.direction === 'down') return cfg.direction;
  if (goal.startValue != null && goal.startValue !== goal.targetValue) {
    return goal.startValue < goal.targetValue ? 'up' : 'down';
  }
  return CATALOG_BY_KEY[goal.catalogKey]?.defaultDirection ?? 'down';
}

export function isGoalAchieved(current: number | null, target: number, dir: 'up' | 'down'): boolean {
  if (current == null) return false;
  return dir === 'down' ? current <= target : current >= target;
}

/** Status for the chart-bodied variants (trend, daily) — direction- and deadline-aware. */
export function goalStatusFor(opts: {
  current: number | null;
  target: number;
  dir: 'up' | 'down';
  etaDays: number | null;
  deadline: string | null;
}): GoalCardStatus {
  if (isGoalAchieved(opts.current, opts.target, opts.dir)) return 'achieved';
  if (opts.etaDays == null || !opts.deadline) return 'no_data';
  const deadlineDays = daysUntil(opts.deadline)!;
  if (opts.etaDays <= deadlineDays - 21) return 'ahead';
  if (opts.etaDays <= deadlineDays + 14) return 'on_track';
  return 'behind';
}

/**
 * Status for the streak variant: 'behind' when the goal was missed in the majority of
 * the tracked weeks (not merely "not achieved yet"), 'no_data' when there is nothing to
 * judge — callers hide the chip rather than show a meaningless one.
 */
export function goalStatusForStreak(weekHits: boolean[]): GoalCardStatus {
  if (!weekHits.length) return 'no_data';
  const missed = weekHits.filter((h) => !h).length;
  if (missed > weekHits.length / 2) return 'behind';
  return weekHits[weekHits.length - 1] ? 'achieved' : 'on_track';
}

/** Status for the progress variant: direction- and deadline-aware, no trend data needed. */
export function goalStatusForProgress(
  goal: Pick<GoalCardSubject, 'currentValue' | 'startValue' | 'targetValue' | 'deadline'>,
  dir: 'up' | 'down',
  pct: number | null,
): GoalCardStatus {
  const current = goal.currentValue ?? goal.startValue;
  if (isGoalAchieved(current, goal.targetValue, dir)) return 'achieved';
  const days = daysUntil(goal.deadline);
  if (days != null && days < 0) return 'behind';
  if (pct == null) return 'no_data';
  return pct >= 50 ? 'on_track' : 'behind';
}

/** One empty-state message per category instead of a bespoke string per card. */
export function emptyMessageFor(goal: Pick<GoalCardSubject, 'category'>): string {
  switch (goal.category) {
    case 'body':      return 'No measurements yet.';
    case 'nutrition': return 'No food log data yet.';
    case 'activity':  return 'No steps data yet.';
    case 'exercise':  return 'No workout data yet.';
    default:          return 'No data yet.';
  }
}

// ─── Projections ──────────────────────────────────────────────────────────────

export interface DatedValue { date: string; val: number }

/** Least-squares slope in units/day. Returns 0 with fewer than 2 points or no spread. */
export function linregSlope(points: DatedValue[], t0Ms: number): number {
  if (points.length < 2) return 0;
  const xs = points.map((p) => (new Date(p.date + 'T12:00:00').getTime() - t0Ms) / 86400000);
  const ys = points.map((p) => p.val);
  const n  = xs.length;
  const xM = xs.reduce((a, b) => a + b, 0) / n;
  const yM = ys.reduce((a, b) => a + b, 0) / n;
  const den = xs.reduce((s, x) => s + (x - xM) ** 2, 0);
  if (den === 0) return 0;
  return xs.reduce((s, x, i) => s + (x - xM) * (ys[i] - yM), 0) / den;
}

/** Days until `current` reaches `target` at `slopePerDay`, or null if it never will. */
export function etaDaysFor(current: number, target: number, slopePerDay: number): number | null {
  if (Math.abs(slopePerDay) < 0.0005) return null;
  const d = (target - current) / slopePerDay;
  return d > 0 ? Math.round(d) : null;
}

/** The TDEE breakdown fields the weight projection needs. */
export interface TDEEProjectionInput {
  bmr: number;
  neat: number;
  exercise: number;
  stepsKcal?: number;
}

/**
 * Weight-change pace in lbs/day implied by recent intake vs expenditure.
 *
 * TEF is derived from average intake rather than `tdee.tef` so days with nothing logged
 * yet don't collapse the projection to a flat line. `stepsKcal` MUST be included — the
 * mobile implementation used to omit it, which is why the same goal projected different
 * dates on phone and web.
 */
export function tdeeSlopePerDay(
  tdee: TDEEProjectionInput | null,
  recentDailyCalories: number[],
): number | null {
  if (!tdee) return null;
  const logged = recentDailyCalories.filter((c) => c > 0);
  if (!logged.length) return null;
  const avgCal    = logged.reduce((s, c) => s + c, 0) / logged.length;
  const tdeeAtAvg = tdee.bmr + tdee.neat + tdee.exercise + avgCal * 0.1 + (tdee.stepsKcal ?? 0);
  return (avgCal - tdeeAtAvg) / 3500;
}

/** True when this goal may show the TDEE-pace projection at all. */
export function supportsTdeeProjection(catalogKey: GoalCatalogKey): boolean {
  return TDEE_PROJECTION_KEYS.includes(catalogKey);
}
