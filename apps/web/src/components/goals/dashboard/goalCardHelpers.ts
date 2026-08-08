// Shared helpers for the dashboard goal cards — one implementation per concept so no
// individual card renderer reinvents title/unit/direction/status/deadline/empty-state
// formatting. See GoalCardShell.tsx for the chrome that consumes these.

import { CATALOG_BY_KEY, type Goal, type GoalCardConfig } from '@pulse/api-client';
import { fmt1, OVERDUE_COLOR } from './goalCardTheme';

export type GoalStatus = 'achieved' | 'ahead' | 'on_track' | 'behind' | 'no_data';

export const STATUS_CFG: Record<GoalStatus, { color: string; label: string }> = {
  achieved: { color: '#7BB389', label: 'Achieved' },
  ahead:    { color: '#7BB389', label: 'Ahead'    },
  on_track: { color: '#D4A843', label: 'On track' },
  behind:   { color: '#C9714F', label: 'Behind'   },
  no_data:  { color: 'rgb(var(--color-muted))', label: '—' },
};

/** Units that read as whole numbers on this dashboard; everything else gets 1 decimal. */
const INTEGER_UNITS = new Set(['kcal', 'g', 'steps', 'workouts', 'min', 'sessions']);

// Fix #1: title always comes from goal.name, falling back to the catalog label.
export function titleFor(goal: Goal): string {
  return goal.name?.trim() || CATALOG_BY_KEY[goal.catalogKey]?.label || 'Goal';
}

// Fix #2: one formatter for every value+unit pairing on the dashboard, and one
// source of truth for the unit itself (goal.unit, falling back to the catalog).
export function resolveUnit(goal: Goal): string {
  return goal.unit || CATALOG_BY_KEY[goal.catalogKey]?.defaultUnit || '';
}

export function fmtGoalValue(value: number, unit: string): string {
  const n = INTEGER_UNITS.has(unit) ? Math.round(value).toLocaleString() : fmt1(value);
  return unit ? `${n} ${unit}` : n;
}

export function normDateStr(isoStr: string): string {
  return isoStr.slice(0, 10);
}

export function fmtDeadline(deadline: string | null): string {
  if (!deadline) return '—';
  return new Date(normDateStr(deadline) + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
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

// Fix #3: direction is no longer assumed downward. cfg.direction wins, then we infer
// from where the goal started relative to its target, then from where it stands now.
export function goalDirection(goal: Goal, cfg: Pick<GoalCardConfig, 'direction'>): 'up' | 'down' {
  if (cfg.direction === 'up' || cfg.direction === 'down') return cfg.direction;
  if (goal.startValue != null && goal.startValue !== goal.targetValue) {
    return goal.startValue < goal.targetValue ? 'up' : 'down';
  }
  if (goal.currentValue != null && goal.currentValue !== goal.targetValue) {
    return goal.currentValue < goal.targetValue ? 'up' : 'down';
  }
  return 'down';
}

export function isGoalAchieved(current: number | null, target: number, dir: 'up' | 'down'): boolean {
  if (current == null) return false;
  return dir === 'down' ? current <= target : current >= target;
}

// Fix #4: one status function for every chart-bodied card (trend, daily), direction-aware.
export function goalStatusFor(opts: {
  current: number | null;
  target: number;
  dir: 'up' | 'down';
  etaDays: number | null;
  deadline: string | null;
}): GoalStatus {
  if (isGoalAchieved(opts.current, opts.target, opts.dir)) return 'achieved';
  if (opts.etaDays == null || !opts.deadline) return 'no_data';
  const deadlineDays = daysUntil(opts.deadline)!;
  if (opts.etaDays <= deadlineDays - 21) return 'ahead';
  if (opts.etaDays <= deadlineDays + 14) return 'on_track';
  return 'behind';
}

/**
 * Status for the streak variant: 'behind' when the goal was missed in the majority
 * of the tracked weeks (not just "not yet achieved"), 'no_data' when there is nothing
 * to judge yet — the shell hides the chip rather than show a meaningless one.
 */
export function goalStatusForStreak(weekHits: boolean[]): GoalStatus {
  if (!weekHits.length) return 'no_data';
  const missed = weekHits.filter(h => !h).length;
  if (missed > weekHits.length / 2) return 'behind';
  return weekHits[weekHits.length - 1] ? 'achieved' : 'on_track';
}

/** Status for the progress variant: direction-aware, deadline-aware, no trend data required. */
export function goalStatusForProgress(goal: Goal, dir: 'up' | 'down', pct: number | null): GoalStatus {
  const current = goal.currentValue ?? goal.startValue;
  if (isGoalAchieved(current, goal.targetValue, dir)) return 'achieved';
  const days = daysUntil(goal.deadline);
  if (days != null && days < 0) return 'behind';
  if (pct == null) return 'no_data';
  return pct >= 50 ? 'on_track' : 'behind';
}

// Fix #13: one empty-state message per category instead of six bespoke strings.
export function emptyMessageFor(goal: Goal): string {
  switch (goal.category) {
    case 'body':      return 'No measurements yet.';
    case 'nutrition': return 'No food log data yet.';
    case 'activity':  return 'No steps data yet.';
    case 'exercise':  return 'No workout data yet.';
    default:          return 'No data yet.';
  }
}

export { OVERDUE_COLOR };
