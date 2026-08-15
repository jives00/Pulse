// Shared logic behind the "progress since a date" widget.
//
// Web and mobile both render it, so the join between a goal and its baseline reading,
// the wording of the change, and the judgement of whether that change is progress all
// live here — the same reason goalCardLogic exists. Pure: no React, no colors.

import type { Goal, GoalSincePoint } from './endpoints/goals-v2';
import { resolveGoalCard } from './goalCardConfig';
import { fmtGoalValue, goalDirection, resolveUnit, titleFor } from './goalCardLogic';

export interface GoalSinceRow {
  goalId:       number;
  title:        string;
  unit:         string;
  sinceDate:    string | null;
  sinceValue:   number | null;
  currentDate:  string | null;
  currentValue: number | null;
  /** currentValue - sinceValue; null when either end is missing. */
  delta:        number | null;
  /** Which way this goal counts as improving. */
  direction:    'up' | 'down';
  /** True when the change moved toward the target. Null when there is no change to judge. */
  improved:     boolean | null;
  /** "Lost 10.0 lbs" / "Up 1,200 steps" / "No change". Empty when there is nothing to compare. */
  changeLabel:  string;
  sinceLabel:   string;
  currentLabel: string;
}

/**
 * Metrics people describe as gained or lost rather than up or down. A waist that
 * shrank two inches wasn't "lost" — it went down — so only the mass metrics get the
 * gain/loss wording.
 */
const MASS_METRICS = new Set(['body_weight', 'body_muscle_mass']);

/**
 * Join active goals with their baseline readings.
 *
 * `goalIds` is the user's explicit selection, or null to follow every active goal.
 * Goals with no reading at either end are dropped whether or not they were picked: a
 * row of two em-dashes says nothing the absent row doesn't.
 */
export function buildGoalSinceRows(
  goals: Goal[], points: GoalSincePoint[], goalIds: number[] | null = null,
): GoalSinceRow[] {
  const byId = new Map(points.map(p => [p.goalId, p]));
  const selected = goalIds ? new Set(goalIds) : null;

  return goals.flatMap((goal) => {
    if (selected && !selected.has(goal.id)) return [];
    const p = byId.get(goal.id);
    if (!p || p.sinceValue == null || p.currentValue == null) return [];

    const unit  = resolveUnit(goal);
    const dir   = goalDirection(goal, resolveGoalCard(goal.catalogKey, goal.cardConfig));
    const delta = p.delta ?? p.currentValue - p.sinceValue;

    return [{
      goalId:       goal.id,
      title:        titleFor(goal),
      unit,
      sinceDate:    p.sinceDate,
      sinceValue:   p.sinceValue,
      currentDate:  p.currentDate,
      currentValue: p.currentValue,
      delta,
      direction:    dir,
      improved:     delta === 0 ? null : (delta > 0) === (dir === 'up'),
      changeLabel:  changeLabelFor(goal.catalogKey, delta, unit),
      sinceLabel:   fmtGoalValue(p.sinceValue, unit),
      currentLabel: fmtGoalValue(p.currentValue, unit),
    }];
  });
}

export function changeLabelFor(catalogKey: string, delta: number, unit: string): string {
  if (delta === 0) return 'No change';
  const magnitude = fmtGoalValue(Math.abs(delta), unit);
  if (MASS_METRICS.has(catalogKey)) return `${delta < 0 ? 'Lost' : 'Gained'} ${magnitude}`;
  return `${delta < 0 ? 'Down' : 'Up'} ${magnitude}`;
}

/** "Jan 1, 2026" — the widget labels both ends of the comparison with a real date. */
export function fmtSinceDate(date: string | null): string {
  if (!date) return '—';
  return new Date(date.slice(0, 10) + 'T12:00:00')
    .toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

// ─── Baseline readings ────────────────────────────────────────────────────────
// Server-side (goals-v2 GET /since) but pure, so it lives here with the rest of the
// widget's logic and can be tested without a database.

/** Days of history to pull ahead of the anchor date so a preceding reading is in reach. */
export const SINCE_LOOKBACK_DAYS = 60;

/** Trailing window the averaged metrics use — matches the goal card's current value. */
export const SINCE_AVERAGE_WINDOW_DAYS = 30;

/**
 * Metrics whose "value on a date" is a trailing average rather than a single reading.
 * These goals are defined as daily averages, so pinning the baseline to whatever
 * happened to be logged on one date would compare a single noisy day against a
 * 30-day mean and call the difference progress.
 */
export const SINCE_AVERAGED_KEYS = new Set([
  'nutrition_calories_daily_avg',
  'nutrition_protein_daily_avg',
  'nutrition_carbs_daily_avg',
  'nutrition_fat_daily_avg',
  'activity_steps_daily_avg',
]);

export interface DatedReading { value: number; loggedAt: string }

export function shiftDate(date: string, days: number): string {
  const d = new Date(date.slice(0, 10) + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/**
 * Nearest reading on or before `date`, falling back to the earliest one after it so a
 * goal that only started being tracked mid-window still reports something.
 * `points` must be oldest-first.
 */
export function pointAt(points: DatedReading[], date: string): { date: string; value: number } | null {
  let best: DatedReading | null = null;
  for (const p of points) {
    if (p.loggedAt.slice(0, 10) <= date) best = p;
    else break;
  }
  const chosen = best ?? points[0];
  return chosen ? { date: chosen.loggedAt.slice(0, 10), value: chosen.value } : null;
}

/** Mean of the readings in the 30 days ending on `date`. `points` must be oldest-first. */
export function averageAt(points: DatedReading[], date: string): { date: string; value: number } | null {
  const from = shiftDate(date, -(SINCE_AVERAGE_WINDOW_DAYS - 1));
  const win = points.filter((p) => {
    const d = p.loggedAt.slice(0, 10);
    return d >= from && d <= date;
  });
  if (!win.length) return null;
  const mean = win.reduce((s, p) => s + p.value, 0) / win.length;
  return { date, value: Math.round(mean * 10) / 10 };
}

/** The reading a goal should report for `date`, measured the way that goal is defined. */
export function readingAt(
  points: DatedReading[], date: string, catalogKey: string,
): { date: string; value: number } | null {
  return SINCE_AVERAGED_KEYS.has(catalogKey) ? averageAt(points, date) : pointAt(points, date);
}
