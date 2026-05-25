import { useCallback, useEffect, useState } from 'react';
import {
  initialize,
  requestPermission,
  readRecords,
} from 'react-native-health-connect';

export function useHealthSteps() {
  const [initialized, setInitialized] = useState(false);
  const [permissionGranted, setPermissionGranted] = useState(false);

  useEffect(() => {
    const init = async () => {
      try {
        await initialize();
        setInitialized(true);
      } catch (err) {
        console.warn('[HealthSteps] Failed to initialize Health Connect:', err);
      }
    };
    init();
  }, []);

  const readTodaySteps = useCallback(async (): Promise<number | null> => {
    if (!initialized) return null;

    try {
      if (!permissionGranted) {
        const granted = await requestPermission([{ accessType: 'read', recordType: 'Steps' }]);
        const hasSteps = granted.some((p) => p.accessType === 'read' && p.recordType === 'Steps');
        if (!hasSteps) {
          setPermissionGranted(false);
          return null;
        }
        setPermissionGranted(true);
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
  }, [initialized, permissionGranted]);

  return { readTodaySteps, initialized, permissionGranted };
}
