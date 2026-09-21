import { useCallback, useEffect, useState } from 'react';
import { aggregateGroupByPeriod } from 'react-native-health-connect';
import { syncGrantedPermissions, requestHealthConnectPermissions } from '../services/healthConnectPermissions';

/** How far back each sync reaches. Health Connect retains ~30 days, so this is the
 *  whole of what is recoverable, and it self-heals every gap left by a day the app
 *  was never opened. */
export const STEPS_BACKFILL_DAYS = 30;

export interface StepsBucket { date: string; steps: number; }

const pad = (n: number) => String(n).padStart(2, '0');

/** YYYY-MM-DD in whatever zone the device is currently in. */
export function deviceDateStr(d: Date = new Date()): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/**
 * Period-sliced buckets come back as bare local date-times ("2026-09-17T00:00:00").
 * If a zone-qualified instant turns up instead, fold it back to the device's local date
 * rather than slicing the string, which would silently be off by the UTC offset.
 */
function bucketDate(startTime: string): string {
  return /(?:Z|[+-]\d{2}:?\d{2})$/.test(startTime)
    ? deviceDateStr(new Date(startTime))
    : startTime.slice(0, 10);
}

export function useHealthSteps() {
  const [permissionGranted, setPermissionGranted] = useState(false);

  useEffect(() => {
    syncGrantedPermissions().then((perms) => {
      setPermissionGranted(perms.read.steps);
    });
  }, []);

  const requestPermission = useCallback(async (): Promise<boolean> => {
    const perms = await requestHealthConnectPermissions();
    setPermissionGranted(perms.read.steps);
    return perms.read.steps;
  }, []);

  /**
   * Read a trailing window of whole days, one bucket per day.
   *
   * Bucketing is Health Connect's own (period-based, DAYS), which splits on the device's
   * calendar rather than on fixed 24h offsets — so a step taken in Madrid lands on the
   * Madrid day. Aggregating a single day by hand and labelling it with a hardcoded home
   * timezone is what split trip days across the wrong dates.
   */
  const readDailySteps = useCallback(async (days = STEPS_BACKFILL_DAYS): Promise<StepsBucket[] | null> => {
    const perms = await syncGrantedPermissions();
    setPermissionGranted(perms.read.steps);
    if (!perms.read.steps) return null;

    try {
      const now = new Date();
      const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - (days - 1));

      const groups = await aggregateGroupByPeriod({
        recordType: 'Steps',
        timeRangeFilter: {
          operator: 'between',
          startTime: start.toISOString(),
          endTime: now.toISOString(),
        },
        timeRangeSlicer: { period: 'DAYS', length: 1 },
      });

      return groups.map((g) => ({
        date: bucketDate(g.startTime),
        steps: g.result.COUNT_TOTAL ?? 0,
      }));
    } catch (err) {
      console.warn('[HealthSteps] Failed to read steps:', err);
      return null;
    }
  }, []);

  return { readDailySteps, permissionGranted, requestPermission };
}
