import { getSdkStatus, getGrantedPermissions, initialize, requestPermission, openHealthConnectSettings, SdkAvailabilityStatus, Permission } from 'react-native-health-connect';

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
let sdkAvailable = false;
let cachedPermissions: HealthConnectPermissions | null = null;

const EMPTY_PERMISSIONS: HealthConnectPermissions = {
  read: { steps: false },
  write: { nutrition: false, hydration: false, exercise: false, weight: false },
};

export async function initializeHealthConnect(): Promise<HealthConnectPermissions> {
  try {
    if (!initialized) {
      const status = await getSdkStatus();
      sdkAvailable = status === SdkAvailabilityStatus.SDK_AVAILABLE;
      if (sdkAvailable) {
        await initialize();
      }
      initialized = true;
    }
    return cachedPermissions || EMPTY_PERMISSIONS;
  } catch (err) {
    console.warn('[HealthConnect] Failed to initialize:', err);
    initialized = true;
    return EMPTY_PERMISSIONS;
  }
}

// Silently checks already-granted permissions — no dialog, safe to call at startup.
export async function syncGrantedPermissions(): Promise<HealthConnectPermissions> {
  if (!initialized) {
    await initializeHealthConnect();
  }

  if (!sdkAvailable) {
    return cachedPermissions || EMPTY_PERMISSIONS;
  }

  try {
    const granted = await getGrantedPermissions();
    const permissions: HealthConnectPermissions = {
      read: {
        steps: granted.some((p) => 'accessType' in p && p.accessType === 'read' && p.recordType === 'Steps'),
      },
      write: {
        nutrition: granted.some((p) => 'accessType' in p && p.accessType === 'write' && p.recordType === 'Nutrition'),
        hydration: granted.some((p) => 'accessType' in p && p.accessType === 'write' && p.recordType === 'Hydration'),
        exercise: granted.some((p) => 'accessType' in p && p.accessType === 'write' && p.recordType === 'ExerciseSession'),
        weight: granted.some((p) => 'accessType' in p && p.accessType === 'write' && p.recordType === 'Weight'),
      },
    };
    cachedPermissions = permissions;
    return permissions;
  } catch (err) {
    console.warn('[HealthConnect] Failed to sync granted permissions:', err);
    return cachedPermissions || EMPTY_PERMISSIONS;
  }
}

const HEALTH_PERMISSIONS: Permission[] = [
  { accessType: 'read',  recordType: 'Steps' },
  { accessType: 'write', recordType: 'Nutrition' },
  { accessType: 'write', recordType: 'Hydration' },
  { accessType: 'write', recordType: 'ExerciseSession' },
  { accessType: 'write', recordType: 'Weight' },
];

// Requests permissions via the Health Connect dialog. Falls back to opening
// Health Connect settings if requestPermission throws (e.g. older Samsung devices).
export async function requestHealthConnectPermissions(): Promise<HealthConnectPermissions> {
  if (!initialized) {
    await initializeHealthConnect();
  }

  if (!sdkAvailable) {
    return cachedPermissions || EMPTY_PERMISSIONS;
  }

  try {
    await requestPermission(HEALTH_PERMISSIONS);
  } catch (err) {
    console.warn('[HealthConnect] requestPermission failed, opening settings instead:', err);
    try {
      await openHealthConnectSettings();
    } catch (e2) {
      console.warn('[HealthConnect] Failed to open Health Connect settings:', e2);
    }
  }

  return syncGrantedPermissions();
}

export function getHealthConnectPermissions(): HealthConnectPermissions | null {
  return cachedPermissions;
}

export function hasHealthConnectPermission(type: 'steps' | 'nutrition' | 'hydration' | 'exercise' | 'weight'): boolean {
  if (!cachedPermissions) return false;
  if (type === 'steps') return cachedPermissions.read.steps;
  return cachedPermissions.write[type as keyof HealthConnectPermissions['write']] ?? false;
}
