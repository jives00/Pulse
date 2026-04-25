import type { WorkoutSummary } from '../../../packages/api-client/src/endpoints/workouts';

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
    const totalSteps = w.totalSteps ?? w.exercises.reduce((s, e) => s + ((e as any).totalSteps ?? 0), 0);
    const totalSec = w.totalDurationSeconds ?? w.exercises.reduce((s, e) => s + (e.totalDurationSeconds ?? 0), 0);
    const dur = totalSec > 0
      ? `${Math.floor(totalSec / 60)}:${String(totalSec % 60).padStart(2, '0')}`
      : w.durationMinutes ? formatDuration(w.durationMinutes) : null;
    const pace = totalSteps > 0 && totalSec > 0 ? `${Math.round(totalSteps / (totalSec / 60))} stairs/min` : null;
    const detail = [totalSteps ? `${totalSteps.toLocaleString()} steps` : null, dur].filter(Boolean).join(' in ');
    return `${name} completed${detail ? ` — ${detail}` : ''}${pace ? ` · ${pace}` : ''}`;
  }

  if (rt === 'cardio_distance') {
    const distMiles = (w.totalDistanceMeters ?? 0) / 1609.34;
    const miles = distMiles.toFixed(2);
    const dur = w.durationMinutes ? formatDuration(w.durationMinutes) : null;
    const pace = distMiles > 0 && w.durationMinutes ? `${(distMiles / w.durationMinutes).toFixed(2)} mi/min` : null;
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
