import { useCallback, useEffect, useState } from 'react';
import { readRecords } from 'react-native-health-connect';
import { hasHealthConnectPermission } from '../services/healthConnectPermissions';

export function useHealthSteps() {
  const [initialized, setInitialized] = useState(false);

  useEffect(() => {
    setInitialized(true);
  }, []);

  const readTodaySteps = useCallback(async (): Promise<number | null> => {
    if (!initialized) return null;

    try {
      if (!hasHealthConnectPermission('steps')) {
        return null;
      }

      const now = new Date();
      const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());

      const { records } = await readRecords('Steps', {
        timeRangeFilter: {
          operator: 'between',
          startTime: startOfDay.toISOString(),
          endTime: now.toISOString(),
        },
      });

      const total = records.reduce((sum, record) => sum + (record.count || 0), 0);
      return total;
    } catch (err) {
      console.warn('[HealthSteps] Failed to read steps:', err);
      return null;
    }
  }, [initialized]);

  return { readTodaySteps, initialized, permissionGranted: hasHealthConnectPermission('steps') };
}
