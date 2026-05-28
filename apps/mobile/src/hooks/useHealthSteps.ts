import { useCallback, useEffect, useState } from 'react';
import { aggregateRecord } from 'react-native-health-connect';
import { syncGrantedPermissions, requestHealthConnectPermissions } from '../services/healthConnectPermissions';

export interface HealthStepsDebug {
  COUNT_TOTAL: number | null;
  dataOrigins: string[];
  startTime: string;
  endTime: string;
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

  const readTodaySteps = useCallback(async (): Promise<number | null> => {
    const perms = await syncGrantedPermissions();
    setPermissionGranted(perms.read.steps);
    if (!perms.read.steps) return null;

    try {
      const now = new Date();
      const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());

      const result = await aggregateRecord({
        recordType: 'Steps',
        timeRangeFilter: {
          operator: 'between',
          startTime: startOfDay.toISOString(),
          endTime: now.toISOString(),
        },
      });

      return result.COUNT_TOTAL ?? 0;
    } catch (err) {
      console.warn('[HealthSteps] Failed to read steps:', err);
      return null;
    }
  }, []);

  const readTodayStepsDebug = useCallback(async (): Promise<HealthStepsDebug | null> => {
    const perms = await syncGrantedPermissions();
    if (!perms.read.steps) return null;

    try {
      const now = new Date();
      const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());

      const result = await aggregateRecord({
        recordType: 'Steps',
        timeRangeFilter: {
          operator: 'between',
          startTime: startOfDay.toISOString(),
          endTime: now.toISOString(),
        },
      });

      return {
        COUNT_TOTAL: result.COUNT_TOTAL ?? null,
        dataOrigins: result.dataOrigins ?? [],
        startTime: startOfDay.toISOString(),
        endTime: now.toISOString(),
      };
    } catch (err) {
      return null;
    }
  }, []);

  return { readTodaySteps, readTodayStepsDebug, permissionGranted, requestPermission };
}
