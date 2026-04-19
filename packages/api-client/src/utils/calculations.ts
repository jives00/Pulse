import type { WorkoutSummary } from '../endpoints/workouts';
import type { BodyMeasurement, MeasurementGoal } from '../endpoints/workouts';
import type { FoodLogHistoryDay } from '../endpoints/log';
import { KG_TO_LBS } from './conversions';
import { localDateStr, getWeekStart, shortDate } from './dates';

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
