import { insertRecords, deleteRecordsByUuids } from 'react-native-health-connect';
import { hasHealthConnectPermission } from './healthConnectPermissions';
import type { LogEntry, MealSlot, WaterEntry } from '../../../../packages/api-client/src/nutrition';
import type { WorkoutDetail } from '../../../../packages/api-client/src/endpoints/workouts';

const OZ_TO_LITERS = 0.0295735;

// ─── Nutrition ──────────────────────────────────────────────────────────────

export async function writeNutritionRecord(
  logEntry: LogEntry,
  clientRecordId: string
): Promise<void> {
  if (!hasHealthConnectPermission('nutrition')) {
    return;
  }

  try {
    const mealTypeMap: Record<MealSlot, number> = {
      breakfast: 1,
      lunch: 2,
      dinner: 3,
      snack: 4,
    };

    const logDate = new Date(logEntry.logDate);
    const nutrition = logEntry.nutrition;

    await insertRecords([
      {
        recordType: 'Nutrition',
        metadata: { clientRecordId },
        startTime: logDate.toISOString(),
        endTime: logDate.toISOString(),
        mealType: mealTypeMap[logEntry.meal],
        energy: { value: nutrition.calories, unit: 'kilocalories' },
        protein: { value: nutrition.protein, unit: 'grams' },
        totalCarbohydrate: { value: nutrition.carbs, unit: 'grams' },
        totalFat: { value: nutrition.fat, unit: 'grams' },
        ...(nutrition.fiber ? { dietaryFiber: { value: nutrition.fiber, unit: 'grams' } } : {}),
      },
    ]);
  } catch (err) {
    console.warn('[HealthConnect] Failed to write nutrition record:', err);
  }
}

export async function deleteNutritionRecord(clientRecordId: string): Promise<void> {
  if (!hasHealthConnectPermission('nutrition')) {
    return;
  }

  try {
    await deleteRecordsByUuids('Nutrition', [], [clientRecordId]);
  } catch (err) {
    console.warn('[HealthConnect] Failed to delete nutrition record:', err);
  }
}

// ─── Hydration ──────────────────────────────────────────────────────────────

export async function writeHydrationRecord(
  waterEntry: WaterEntry,
  clientRecordId: string
): Promise<void> {
  if (!hasHealthConnectPermission('hydration')) {
    return;
  }

  try {
    const logDate = new Date(waterEntry.logDate);

    await insertRecords([
      {
        recordType: 'Hydration',
        metadata: { clientRecordId },
        startTime: logDate.toISOString(),
        endTime: logDate.toISOString(),
        volume: { value: waterEntry.amountOz * OZ_TO_LITERS, unit: 'liters' },
      },
    ]);
  } catch (err) {
    console.warn('[HealthConnect] Failed to write hydration record:', err);
  }
}

export async function deleteHydrationRecord(clientRecordId: string): Promise<void> {
  if (!hasHealthConnectPermission('hydration')) {
    return;
  }

  try {
    await deleteRecordsByUuids('Hydration', [], [clientRecordId]);
  } catch (err) {
    console.warn('[HealthConnect] Failed to delete hydration record:', err);
  }
}

// ─── Exercise ────────────────────────────────────────────────────────────────

function mapToHealthConnectExerciseType(exerciseType: string, category?: string): number {
  const normalizedType = exerciseType?.toLowerCase() ?? '';
  const normalizedCategory = category?.toLowerCase() ?? '';

  if (normalizedType === 'cardio' || normalizedCategory === 'cardio') {
    if (normalizedCategory.includes('run')) return 56;
    if (normalizedCategory.includes('walk')) return 79;
    if (normalizedCategory.includes('cycl')) return 8;
    if (normalizedCategory.includes('swim')) return 74;
    if (normalizedCategory.includes('hiit') || normalizedCategory.includes('high intensity')) return 36;
    if (normalizedCategory.includes('ellip')) return 25;
    if (normalizedCategory.includes('row')) return 53;
    if (normalizedCategory.includes('jump')) return 41;
    return 0;
  }

  if (normalizedType === 'weight' || normalizedType === 'resistance' || normalizedCategory.includes('weight') || normalizedCategory.includes('strength')) {
    return 81;
  }

  if (normalizedType === 'bodyweight') {
    if (normalizedCategory.includes('yoga')) return 83;
    if (normalizedCategory.includes('pilates')) return 48;
    if (normalizedCategory.includes('core')) return 13;
    if (normalizedCategory.includes('stretch')) return 71;
    return 81;
  }

  if (normalizedType === 'duration') {
    if (normalizedCategory.includes('yoga')) return 83;
    if (normalizedCategory.includes('pilates')) return 48;
    if (normalizedCategory.includes('dance')) return 16;
    return 0;
  }

  return 0;
}

export async function writeExerciseRecord(
  workout: WorkoutDetail,
  clientRecordId: string
): Promise<void> {
  if (!hasHealthConnectPermission('exercise')) {
    return;
  }

  try {
    if (!workout.exercises || workout.exercises.length === 0) {
      return;
    }

    const workoutDate = new Date(workout.workoutDate);
    const startTime = workout.startedAt ? new Date(workout.startedAt) : workoutDate;
    const durationSeconds = workout.durationMinutes ? workout.durationMinutes * 60 : 0;
    const endTime = new Date(startTime.getTime() + durationSeconds * 1000);

    const firstExercise = workout.exercises[0];
    const exerciseType = mapToHealthConnectExerciseType(firstExercise.exercise.exerciseType, firstExercise.exercise.category);

    await insertRecords([
      {
        recordType: 'ExerciseSession',
        metadata: { clientRecordId },
        startTime: startTime.toISOString(),
        endTime: endTime.toISOString(),
        exerciseType,
        title: workout.name ?? `Workout on ${workout.workoutDate}`,
      },
    ]);

    if (workout.caloriesBurned && workout.caloriesBurned > 0) {
      await insertRecords([
        {
          recordType: 'TotalCaloriesBurned',
          metadata: { clientRecordId: `${clientRecordId}_calories` },
          startTime: startTime.toISOString(),
          endTime: endTime.toISOString(),
          energy: { value: workout.caloriesBurned, unit: 'kilocalories' },
        },
      ]);
    }
  } catch (err) {
    console.warn('[HealthConnect] Failed to write exercise record:', err);
  }
}

export async function deleteExerciseRecord(clientRecordId: string): Promise<void> {
  if (!hasHealthConnectPermission('exercise')) {
    return;
  }

  try {
    await deleteRecordsByUuids('ExerciseSession', [], [clientRecordId]);
  } catch (err) {
    console.warn('[HealthConnect] Failed to delete exercise record:', err);
  }

  try {
    await deleteRecordsByUuids('TotalCaloriesBurned', [], [`${clientRecordId}_calories`]);
  } catch {
    // calories record may not exist
  }
}

// ─── Weight ──────────────────────────────────────────────────────────────────

const LBS_TO_KG = 0.453592;

export async function writeWeightRecord(
  value: number,
  unit: string,
  measuredAt: string,
  clientRecordId: string
): Promise<void> {
  if (!hasHealthConnectPermission('weight')) {
    return;
  }

  try {
    const valueInKg = unit.toLowerCase() === 'lbs' || unit.toLowerCase() === 'lb'
      ? value * LBS_TO_KG
      : value;

    await insertRecords([
      {
        recordType: 'Weight',
        metadata: { clientRecordId },
        time: new Date(measuredAt).toISOString(),
        weight: { value: valueInKg, unit: 'kilograms' },
      },
    ]);
  } catch (err) {
    console.warn('[HealthConnect] Failed to write weight record:', err);
  }
}

export async function deleteWeightRecord(clientRecordId: string): Promise<void> {
  if (!hasHealthConnectPermission('weight')) {
    return;
  }

  try {
    await deleteRecordsByUuids('Weight', [], [clientRecordId]);
  } catch (err) {
    console.warn('[HealthConnect] Failed to delete weight record:', err);
  }
}
