// Ordering for the routine grids (web Routines tab / page, mobile Workouts tab).
//
// Three tiers, in order:
//   1. Routines with an upcoming scheduled occurrence — soonest date first.
//   2. Routines without a schedule — least recently used first, so a routine
//      that has been neglected surfaces above one done yesterday.
//   3. Routines never used at all.
// Archived routines always sink below every active one, whatever their tier.

export interface SortableRoutine {
  archived?: boolean;
  nextOccurrenceDate?: string | null;
  lastUsedDate?: string | null;
  name?: string;
}

export function compareRoutines(a: SortableRoutine, b: SortableRoutine): number {
  if (Boolean(a.archived) !== Boolean(b.archived)) return a.archived ? 1 : -1;

  const aNext = a.nextOccurrenceDate ?? null;
  const bNext = b.nextOccurrenceDate ?? null;
  if (aNext && !bNext) return -1;
  if (!aNext && bNext) return 1;
  if (aNext && bNext) return aNext.localeCompare(bNext) || (a.name ?? '').localeCompare(b.name ?? '');

  const aUsed = a.lastUsedDate ?? null;
  const bUsed = b.lastUsedDate ?? null;
  if (aUsed && !bUsed) return -1;
  if (!aUsed && bUsed) return 1;
  if (aUsed && bUsed && aUsed !== bUsed) return aUsed.localeCompare(bUsed);

  return (a.name ?? '').localeCompare(b.name ?? '');
}

export function sortRoutines<T extends SortableRoutine>(routines: T[]): T[] {
  return [...routines].sort(compareRoutines);
}
