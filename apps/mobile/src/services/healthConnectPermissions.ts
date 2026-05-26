import { initialize, requestPermission } from 'react-native-health-connect';

export interface HealthConnectPermissions {
  read: {
    steps: boolean;
  };
  write: {
    nutrition: boolean;
    hydration: boolean;
    exercise: boolean;
    weight: boolean;
  };
}

let initialized = false;
let cachedPermissions: HealthConnectPermissions | null = null;

export async function initializeHealthConnect(): Promise<HealthConnectPermissions> {
  try {
    if (!initialized) {
      await initialize();
      initialized = true;
    }
    return cachedPermissions || { read: { steps: false }, write: { nutrition: false, hydration: false, exercise: false, weight: false } };
  } catch (err) {
    console.warn('[HealthConnect] Failed to initialize:', err);
    return { read: { steps: false }, write: { nutrition: false, hydration: false, exercise: false, weight: false } };
  }
}

export async function requestHealthConnectPermissions(): Promise<HealthConnectPermissions> {
  if (!initialized) {
    await initializeHealthConnect();
  }

  try {
    const granted = await requestPermission([
      { accessType: 'read', recordType: 'Steps' },
      { accessType: 'write', recordType: 'Nutrition' },
      { accessType: 'write', recordType: 'Hydration' },
      { accessType: 'write', recordType: 'ExerciseSession' },
      { accessType: 'write', recordType: 'Weight' },
    ]);

    const permissions: HealthConnectPermissions = {
      read: {
        steps: granted.some((p) => p.accessType === 'read' && p.recordType === 'Steps'),
      },
      write: {
        nutrition: granted.some((p) => p.accessType === 'write' && p.recordType === 'Nutrition'),
        hydration: granted.some((p) => p.accessType === 'write' && p.recordType === 'Hydration'),
        exercise: granted.some((p) => p.accessType === 'write' && p.recordType === 'ExerciseSession'),
        weight: granted.some((p) => p.accessType === 'write' && p.recordType === 'Weight'),
      },
    };

    cachedPermissions = permissions;
    return permissions;
  } catch (err) {
    console.warn('[HealthConnect] Failed to request permissions:', err);
    return cachedPermissions || { read: { steps: false }, write: { nutrition: false, hydration: false, exercise: false, weight: false } };
  }
}

export function getHealthConnectPermissions(): HealthConnectPermissions | null {
  return cachedPermissions;
}

export function hasHealthConnectPermission(type: 'steps' | 'nutrition' | 'hydration' | 'exercise' | 'weight'): boolean {
  if (!cachedPermissions) return false;
  if (type === 'steps') return cachedPermissions.read.steps;
  return cachedPermissions.write[type as keyof HealthConnectPermissions['write']] ?? false;
}
