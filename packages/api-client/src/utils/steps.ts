// Steps-by-day aggregation shared by the web + mobile "Steps · by day" dashboard cards.
// Pure: no React, no colors, no date-library dependency beyond the local-date helpers.
//
// Two conventions worth knowing before reading the math:
//   * steps_log only holds rows for days that were actually synced or entered, so the
//     window is rebuilt as a continuous date axis and unlogged days come back as null.
//     A null day is a gap in the chart, NOT a zero — averaging zeros in would make a
//     week with two missing days look like a bad week rather than an incomplete one.
//   * Averages therefore run over LOGGED days only. Totals still run over the whole
//     window, since a missing day genuinely contributes nothing to a total.

import { localDateStr, getWeekStart } from './dates';

/** kcal burned per step. Matches the multiplier the calorie widgets already use. */
export const STEPS_KCAL_PER_STEP = 0.05;

export interface StepsDayPoint {
  date:   string;
  steps:  number | null;
  source?: string;
}

export interface StepsWindowDay {
  date:  string;
  steps: number | null;
  /** Monday-start week this day belongs to — used to shade week boundaries. */
  weekStart: string;
  isToday: boolean;
}

export interface StepsStats {
  /** Continuous window, oldest → newest. Unlogged days have steps === null. */
  days:        StepsWindowDay[];
  /** Today's count, or null when today has not been logged/synced yet. */
  today:       number | null;
  /** Mean over logged days in the last 7 days of the window. */
  avg7:        number | null;
  /** Mean over logged days in the 7 days before that — the comparison for delta7. */
  prevAvg7:    number | null;
  /** avg7 − prevAvg7, or null when either side has no logged days. */
  delta7:      number | null;
  /** Mean over every logged day in the window. */
  avgWindow:   number | null;
  /** Best logged day in the window. */
  best:        { date: string; steps: number } | null;
  /** Sum over the whole window. */
  windowTotal: number;
  /** Sum over the current Monday-start week. */
  weekTotal:   number;
  /** How many days in the window have a logged value. */
  loggedDays:  number;
  /** Daily target from the activity_steps_daily_avg goal, when one is set. */
  goal:        number | null;
  /** Logged days in the window that met the goal. Null when there is no goal. */
  goalHitDays: number | null;
  /** Consecutive days meeting the goal, counting back from the most recent logged
   *  day. Today is skipped when it has no data yet (the day is still in progress),
   *  so an unsynced morning doesn't read as a broken streak. Null without a goal. */
  goalStreak:  number | null;
  /** Estimated kcal burned across the window. */
  windowKcal:  number;
}

export interface BuildStepsStatsOptions {
  /** Local "today" — the newest day in the window. Defaults to localDateStr(). */
  today?: string;
  /** Window length in days, inclusive of today. */
  days?:  number;
  /** Daily step target, from the activity_steps_daily_avg goal. */
  goal?:  number | null;
}

function shiftDate(dateStr: string, deltaDays: number): string {
  const d = new Date(dateStr + 'T12:00:00');
  d.setDate(d.getDate() + deltaDays);
  return localDateStr(d);
}

/** Mean of the non-null entries, or null when there are none. */
function meanLogged(vals: (number | null)[]): number | null {
  const logged = vals.filter((v): v is number => v != null);
  if (!logged.length) return null;
  return Math.round(logged.reduce((a, b) => a + b, 0) / logged.length);
}

export function buildStepsStats(
  history: StepsDayPoint[],
  { today = localDateStr(), days = 30, goal = null }: BuildStepsStatsOptions = {},
): StepsStats {
  // A 0-step row is a real logged day (the user walked nothing / wore nothing), but
  // it is useless as a data point and skews averages, so treat it as unlogged.
  const byDate = new Map<string, number>();
  for (const h of history) {
    if (h.steps != null && h.steps > 0) byDate.set(h.date.slice(0, 10), h.steps);
  }

  const window: StepsWindowDay[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const date = shiftDate(today, -i);
    window.push({
      date,
      steps: byDate.get(date) ?? null,
      weekStart: getWeekStart(date),
      isToday: date === today,
    });
  }

  const vals        = window.map((d) => d.steps);
  const loggedDays  = vals.filter((v) => v != null).length;
  const windowTotal = vals.reduce<number>((s, v) => s + (v ?? 0), 0);

  const avg7     = meanLogged(vals.slice(-7));
  const prevAvg7 = meanLogged(vals.slice(-14, -7));

  let best: { date: string; steps: number } | null = null;
  for (const d of window) {
    if (d.steps != null && (!best || d.steps > best.steps)) best = { date: d.date, steps: d.steps };
  }

  const thisWeek  = getWeekStart(today);
  const weekTotal = window.filter((d) => d.weekStart === thisWeek).reduce((s, d) => s + (d.steps ?? 0), 0);

  let goalHitDays: number | null = null;
  let goalStreak:  number | null = null;
  if (goal != null && goal > 0) {
    goalHitDays = window.filter((d) => d.steps != null && d.steps >= goal).length;
    goalStreak = 0;
    // Walk back from the newest day; an unlogged today is skipped rather than
    // treated as a miss, but any earlier gap ends the streak.
    for (let i = window.length - 1; i >= 0; i--) {
      const d = window[i];
      if (d.steps == null) {
        if (d.isToday) continue;
        break;
      }
      if (d.steps < goal) break;
      goalStreak++;
    }
  }

  return {
    days:        window,
    today:       byDate.get(today) ?? null,
    avg7,
    prevAvg7,
    delta7:      avg7 != null && prevAvg7 != null ? avg7 - prevAvg7 : null,
    avgWindow:   meanLogged(vals),
    best,
    windowTotal,
    weekTotal,
    loggedDays,
    goal:        goal != null && goal > 0 ? goal : null,
    goalHitDays,
    goalStreak,
    windowKcal:  Math.round(windowTotal * STEPS_KCAL_PER_STEP),
  };
}
