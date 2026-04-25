import type { WorkoutSummary } from '../endpoints/workouts';
import type { BodyMeasurement, MeasurementGoal } from '../endpoints/workouts';
import type { FoodLogHistoryDay } from '../endpoints/log';
import { KG_TO_LBS } from './conversions';
import { localDateStr, getWeekStart, shortDate } from './dates';

export const WEEK_STREAK_MILESTONES = [4, 8, 12, 26, 52];

export const SATURATION_DAYS = 28;

export type RoutineType = 'strength' | 'cardio_distance' | 'cardio_duration' | 'steps' | 'bodyweight';

/** Returns the default tracked fields for a given exercise type. Single source of truth. */
export function defaultTrackedFields(exerciseType: string): string[] {
  switch (exerciseType) {
    case 'cardio':    return ['duration', 'distance'];
    case 'duration':  return ['duration'];
    case 'bodyweight': return ['reps'];
    default:          return ['reps', 'weight'];
  }
}

/** Returns the default tracked fields for a given routine type. */
export function defaultTrackedFieldsForRoutineType(routineType: RoutineType): string[] {
  switch (routineType) {
    case 'steps':           return ['duration', 'steps'];
    case 'cardio_distance': return ['duration', 'distance'];
    case 'cardio_duration': return ['duration'];
    case 'bodyweight':      return ['reps'];
    default:                return ['reps', 'weight'];
  }
}

export type WeekBucket = {
  weekStart: string;
  label: string;
  workouts: number;
  minutes: number;
  calories: number;
  volumeLbs: number;
  totalSteps: number;
  totalDistanceMeters: number;
  totalDurationSeconds: number;
};

/** Builds a 13-week rolling window of workout data, bucketed by Monday week start. */
export function buildWeeklyData(workouts: WorkoutSummary[]): WeekBucket[] {
  const now = new Date();
  const weeks: WeekBucket[] = [];
  for (let i = 12; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i * 7);
    const ws = getWeekStart(localDateStr(d));
    weeks.push({
      weekStart: ws,
      label: shortDate(ws),
      workouts: 0,
      minutes: 0,
      calories: 0,
      volumeLbs: 0,
      totalSteps: 0,
      totalDistanceMeters: 0,
      totalDurationSeconds: 0,
    });
  }
  for (const w of workouts) {
    const ws = getWeekStart(w.workoutDate);
    const week = weeks.find((wk) => wk.weekStart === ws);
    if (week) {
      week.workouts++;
      week.minutes += w.durationMinutes ?? 0;
      week.calories += w.caloriesBurned ?? 0;
      week.volumeLbs += (w.totalVolumeKg ?? 0) * KG_TO_LBS;
      week.totalSteps += w.totalSteps ?? 0;
      week.totalDistanceMeters += w.totalDistanceMeters ?? 0;
      week.totalDurationSeconds += w.totalDurationSeconds ?? 0;
    }
  }
  return weeks;
}

/**
 * Compares this week's volume/steps to last week.
 * Returns null when there is no data for the comparison week.
 */
export function computeWeekDelta(weeklyData: WeekBucket[]): {
  volumePct: number | null;
  stepsPct: number | null;
} {
  if (weeklyData.length < 2) return { volumePct: null, stepsPct: null };
  const thisWeek = weeklyData[weeklyData.length - 1];
  const lastWeek = weeklyData[weeklyData.length - 2];
  const volumePct =
    lastWeek.volumeLbs > 0
      ? Math.round(((thisWeek.volumeLbs - lastWeek.volumeLbs) / lastWeek.volumeLbs) * 100)
      : null;
  const stepsPct =
    lastWeek.totalSteps > 0
      ? Math.round(((thisWeek.totalSteps - lastWeek.totalSteps) / lastWeek.totalSteps) * 100)
      : null;
  return { volumePct, stepsPct };
}

/**
 * Counts consecutive calendar weeks (Mon–Sun) with ≥1 completed workout,
 * going backwards from the current week.  The current week counts even if
 * it is not yet over (i.e. a workout logged any day this week keeps the
 * streak alive).
 */
export function computeWeekStreak(workouts: WorkoutSummary[]): number {
  if (workouts.length === 0) return 0;
  const weeksWithWorkout = new Set(workouts.map((w) => getWeekStart(w.workoutDate)));
  const currentWeek = getWeekStart(localDateStr());
  let streak = 0;
  let cursor = new Date(currentWeek + 'T12:00:00');
  while (weeksWithWorkout.has(localDateStr(cursor))) {
    streak++;
    cursor.setDate(cursor.getDate() - 7);
  }
  return streak;
}

/**
 * Returns true if the last `minSessions` entries in `progressSeries` show no
 * improvement (same or lower value) and the sessions span at least `minWeekSpan`
 * calendar weeks.  Used for plateau detection on weight exercises.
 */
export function computePlateau(
  progressSeries: Array<{ date: string; value: number }>,
  minSessions = 3,
  minWeekSpan = 2,
): boolean {
  if (progressSeries.length < minSessions) return false;
  const last = progressSeries.slice(-minSessions);
  const maxValue = last.reduce((m, p) => Math.max(m, p.value), 0);
  const hasImproved = last.some((p, i) => i > 0 && p.value > last[i - 1].value);
  if (hasImproved) return false;
  // Check that the last value equals the max (no improvement vs best in window)
  if (last[last.length - 1].value < maxValue) return false;
  const firstWeek = getWeekStart(last[0].date);
  const lastWeek = getWeekStart(last[last.length - 1].date);
  const firstMs = new Date(firstWeek + 'T12:00:00').getTime();
  const lastMs = new Date(lastWeek + 'T12:00:00').getTime();
  const weekSpan = Math.round((lastMs - firstMs) / (7 * 24 * 3600 * 1000));
  return weekSpan >= minWeekSpan;
}

export type PaceStatus = 'green' | 'yellow' | 'red' | 'done';

/**
 * Computes progress toward a body measurement goal and projects a completion date.
 * `dir`: 'down' means lower is better (weight/waist), 'up' means higher is better (bicep).
 */
export function computeGoalPace(
  measurements: BodyMeasurement[],
  key: string,
  goal: MeasurementGoal,
  dir: 'up' | 'down'
): { status: PaceStatus; pct: number; projectedDate: string | null } {
  const sorted = measurements
    .filter((m) => m.metric === key)
    .sort((a, b) => a.measuredAt.localeCompare(b.measuredAt) || a.id - b.id);
  if (sorted.length === 0) return { status: 'red', pct: 0, projectedDate: null };

  const oldest = sorted[0];
  const latest = sorted[sorted.length - 1];
  const toDisplay = (m: BodyMeasurement) =>
    key === 'weight' && m.unit === 'kg' ? m.value * KG_TO_LBS : m.value;

  const oldestVal = toDisplay(oldest);
  const latestVal = toDisplay(latest);
  const target = goal.targetValue;
  const totalChange = dir === 'down' ? oldestVal - target : target - oldestVal;
  const actualChange = dir === 'down' ? oldestVal - latestVal : latestVal - oldestVal;
  if (totalChange <= 0) return { status: 'done', pct: 1, projectedDate: null };
  const pct = Math.min(Math.max(actualChange / totalChange, 0), 1);
  if (pct >= 1) return { status: 'done', pct: 1, projectedDate: null };
  if (!goal.targetDate || sorted.length < 2) return { status: 'yellow', pct, projectedDate: null };

  const firstMs = new Date(oldest.measuredAt + 'T12:00:00').getTime();
  const targetMs = new Date(goal.targetDate + 'T12:00:00').getTime();
  const nowMs = Date.now();
  const elapsedMs = nowMs - firstMs;
  if (elapsedMs <= 0) return { status: 'yellow', pct, projectedDate: null };

  const actualRate = actualChange / elapsedMs;
  const neededRate = totalChange / Math.max(targetMs - firstMs, 1);
  const ratio = neededRate > 0 ? actualRate / neededRate : 0;
  const status: PaceStatus = ratio >= 1 ? 'green' : ratio >= 0.8 ? 'yellow' : 'red';
  const remaining = totalChange - actualChange;
  const projMs = actualRate > 0 ? nowMs + remaining / actualRate : null;
  const projectedDate = projMs
    ? new Date(projMs).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    : null;
  return { status, pct, projectedDate };
}

/**
 * Computes creatine saturation level from the food log history.
 * Returns null if no creatine entries are found.
 */
export function computeCreatineSaturation(foodLogHistory: FoodLogHistoryDay[]) {
  const creatineDays = foodLogHistory
    .filter((day) => day.entries.some((e) => e.foodName.toLowerCase().includes('creatine')))
    .map((day) => day.date)
    .sort();
  if (creatineDays.length === 0) return null;

  const firstDate = creatineDays[0];
  const firstMs = new Date(firstDate + 'T00:00:00').getTime();
  const todayStr = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Chicago' });
  const todayMs = new Date(todayStr + 'T00:00:00').getTime();
  const daysSinceStart = Math.max(1, Math.round((todayMs - firstMs) / (24 * 3600 * 1000)) + 1);
  const loggedDays = creatineDays.length;
  const compliancePct = Math.min(loggedDays / daysSinceStart, 1);
  const timePct = Math.min(daysSinceStart / SATURATION_DAYS, 1);
  const satPct = timePct * compliancePct;
  const daysToFull =
    satPct >= 1
      ? 0
      : compliancePct > 0
      ? Math.max(0, Math.ceil((SATURATION_DAYS - daysSinceStart / compliancePct) / compliancePct))
      : SATURATION_DAYS - daysSinceStart;
  const phase =
    daysSinceStart <= 7
      ? 'Initial Uptake'
      : satPct >= 1
      ? 'Full Saturation'
      : daysSinceStart <= 21
      ? 'The Build'
      : 'Peak Performance';
  return { satPct, daysSinceStart, loggedDays, firstDate, daysToFull, phase, compliancePct };
}

/**
 * Returns all achievement highlights that apply to a workout, in display order.
 * Replaces the old single-return pattern so every matching badge is shown.
 */
export function computeHighlights(w: WorkoutSummary, allWorkouts: WorkoutSummary[]): string[] {
  const results: string[] = [];
  const prior = allWorkouts.filter((p) => p.workoutDate < w.workoutDate);
  const rt = w.routineType ?? 'strength';
  const volKg = w.totalVolumeKg ?? 0;

  // 1. New all-time session volume record (cross-routine, strength/bodyweight only)
  if (volKg > 0 && prior.length > 0) {
    const prevBest = prior.reduce((best, p) => Math.max(best, p.totalVolumeKg ?? 0), 0);
    if (prevBest > 0 && volKg > prevBest) results.push('New session volume record');
  }

  // 2. Best pace (steps → stairs/min higher is better; cardio_distance → speed higher is better)
  if (rt === 'steps' && w.totalSteps && w.totalDurationSeconds && w.totalDurationSeconds > 0) {
    const pace = w.totalSteps / (w.totalDurationSeconds / 60);
    const priorTyped = prior.filter(
      (p) => p.routineType === 'steps' && p.totalSteps && p.totalDurationSeconds && p.totalDurationSeconds > 0,
    );
    if (priorTyped.length > 0) {
      const prevBest = priorTyped.reduce((b, p) => Math.max(b, p.totalSteps! / (p.totalDurationSeconds! / 60)), 0);
      if (pace > prevBest) results.push(`Best pace: ${Math.round(pace)} stairs/min`);
    }
  } else if (rt === 'cardio_distance' && w.totalDistanceMeters && w.totalDurationSeconds && w.totalDurationSeconds > 0) {
    const speed = w.totalDistanceMeters / w.totalDurationSeconds;
    const priorTyped = prior.filter(
      (p) => p.routineType === 'cardio_distance' && p.totalDistanceMeters && p.totalDurationSeconds && p.totalDurationSeconds > 0,
    );
    if (priorTyped.length > 0) {
      const prevBest = priorTyped.reduce((b, p) => Math.max(b, p.totalDistanceMeters! / p.totalDurationSeconds!), 0);
      if (speed > prevBest) results.push('Best pace');
    }
  }

  // 3. PR on any exercise weight
  for (const ex of w.exercises) {
    if (!ex.maxWeightKg) continue;
    const prevMax = prior
      .flatMap((p) => p.exercises)
      .filter((e) => e.name === ex.name && e.maxWeightKg != null)
      .reduce((max, e) => Math.max(max, e.maxWeightKg!), 0);
    if (prevMax > 0 && ex.maxWeightKg > prevMax) {
      results.push(`PR: ${ex.name} ${Math.round(ex.maxWeightKg * KG_TO_LBS)} lbs`);
    }
  }

  // 4. Best metric for this routine (branched by type — fixes non-strength bug)
  if (w.routineId && prior.length > 0) {
    const sameRoutine = prior.filter((p) => p.routineId === w.routineId);
    if (sameRoutine.length > 0) {
      if (rt === 'steps' && w.totalSteps) {
        const prevBest = sameRoutine.reduce((b, p) => Math.max(b, p.totalSteps ?? 0), 0);
        if (prevBest > 0 && w.totalSteps > prevBest) results.push('Best steps for this routine');
      } else if (rt === 'cardio_distance' && w.totalDistanceMeters) {
        const prevBest = sameRoutine.reduce((b, p) => Math.max(b, p.totalDistanceMeters ?? 0), 0);
        if (prevBest > 0 && w.totalDistanceMeters > prevBest) results.push('Best distance for this routine');
      } else if (rt === 'cardio_duration' && w.totalDurationSeconds) {
        const prevBest = sameRoutine.reduce((b, p) => Math.max(b, p.totalDurationSeconds ?? 0), 0);
        if (prevBest > 0 && w.totalDurationSeconds > prevBest) results.push('Longest session for this routine');
      } else if ((rt === 'strength' || rt === 'bodyweight') && volKg > 0) {
        const prevBest = sameRoutine.reduce((b, p) => Math.max(b, p.totalVolumeKg ?? 0), 0);
        if (prevBest > 0 && volKg > prevBest) results.push('Best volume for this routine');
      }
    }
  }

  // 5. High calorie burn (≥400 kcal)
  if (w.caloriesBurned && w.caloriesBurned >= 400) results.push(`${w.caloriesBurned} kcal burned`);

  // 6. First time doing an exercise
  const allPriorNames = new Set(prior.flatMap((p) => p.exercises.map((e) => e.name)));
  for (const ex of w.exercises) {
    if (!allPriorNames.has(ex.name)) {
      results.push(`First time: ${ex.name}`);
      break;
    }
  }

  return results;
}
