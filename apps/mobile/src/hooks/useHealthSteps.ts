import { useCallback, useEffect, useState } from 'react';
import { readRecords } from 'react-native-health-connect';
import { syncGrantedPermissions, requestHealthConnectPermissions } from '../services/healthConnectPermissions';

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

      const { records } = await readRecords('Steps', {
        timeRangeFilter: {
          operator: 'between',
          startTime: startOfDay.toISOString(),
          endTime: now.toISOString(),
        },
      });

      return records.reduce((sum, record) => sum + (record.count || 0), 0);
    } catch (err) {
      console.warn('[HealthSteps] Failed to read steps:', err);
      return null;
    }
  }, []);

  return { readTodaySteps, permissionGranted, requestPermission };
}
