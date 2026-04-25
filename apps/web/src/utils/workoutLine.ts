import type { WorkoutSummary, WorkoutExerciseSummary } from '@pulse/api-client';

export function formatDuration(minutes: number | null): string {
  if (!minutes) return '';
  if (minutes < 60) return `${minutes}m`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

export function buildWorkoutLine(w: WorkoutSummary): string {
  const name = w.routineName ?? w.name ?? 'Workout';
  const rt = w.routineType ?? 'strength';

  if (rt === 'steps') {
    const totalSteps = w.totalSteps ?? w.exercises.reduce((s, e: WorkoutExerciseSummary) => s + ((e as any).totalSteps ?? 0), 0);
    const totalSec = w.totalDurationSeconds ?? w.exercises.reduce((s, e: WorkoutExerciseSummary) => s + (e.totalDurationSeconds ?? 0), 0);
    const dur = totalSec > 0
      ? `${Math.floor(totalSec / 60)}:${String(totalSec % 60).padStart(2, '0')}`
      : w.durationMinutes ? formatDuration(w.durationMinutes) : null;
    const pace = totalSteps > 0 && totalSec > 0 ? `${Math.round(totalSteps / (totalSec / 60))} stairs/min` : null;
    const detail = [totalSteps ? `${totalSteps.toLocaleString()} steps` : null, dur].filter(Boolean).join(' in ');
    return `${name} completed${detail ? ` — ${detail}` : ''}${pace ? ` · ${pace}` : ''}`;
  }

  if (rt === 'cardio_distance') {
    const raw = w.totalDistanceMeters ?? 0;
    // Values < 10 were entered by the user in miles (< 10 meters is too short for any tracked workout)
    const distMiles = raw < 10 ? raw : raw / 1609.34;
    const miles = distMiles.toFixed(2);
    const totalSec = w.totalDurationSeconds ?? w.exercises.reduce((s: number, e: WorkoutExerciseSummary) => s + (e.totalDurationSeconds ?? 0), 0);
    // durationMinutes may accidentally store seconds (timer bug) — if >480 it's implausibly large for minutes, treat as seconds
    const rawMin = w.durationMinutes;
    const safeMin = rawMin != null && rawMin > 0 ? (rawMin > 480 ? rawMin / 60 : rawMin) : null;
    const durMinNum = totalSec > 0 ? totalSec / 60 : safeMin;
    const dur = totalSec > 0
      ? `${Math.floor(totalSec / 60)}:${String(totalSec % 60).padStart(2, '0')}`
      : (safeMin ? formatDuration(Math.round(safeMin)) : null);
    const pace = distMiles > 0 && durMinNum ? `${(distMiles / durMinNum).toFixed(2)} mi/min` : null;
    const detail = [miles !== '0.00' ? `${miles} mi` : null, dur].filter(Boolean).join(' in ');
    return `${name} completed${detail ? ` — ${detail}` : ''}${pace ? ` · ${pace}` : ''}`;
  }

  if (rt === 'cardio_duration') {
    const mins = w.durationMinutes ?? Math.round((w.totalDurationSeconds ?? 0) / 60);
    return `${name} completed${mins ? ` — ${mins} min` : ''}`;
  }

  const KG_TO_LBS = 2.20462;
  const volumeLbs = Math.round(w.totalVolumeKg * KG_TO_LBS);
  return `${name} completed — total volume of ${volumeLbs.toLocaleString()} lbs`;
}
