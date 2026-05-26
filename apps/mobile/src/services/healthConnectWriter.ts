import { writeRecords, deleteRecords } from 'react-native-health-connect';
import { hasHealthConnectPermission } from './healthConnectPermissions';
import type { LogEntry, MealSlot, WaterEntry, NutritionSnapshot } from '../../../packages/api-client/src/nutrition';
import type { WorkoutDetail } from '../../../packages/api-client/src/endpoints/workouts';

const KCAL_TO_JOULES = 4184;
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
    const mealTypeMap: Record<MealSlot, string> = {
      breakfast: 'BREAKFAST',
      lunch: 'LUNCH',
      dinner: 'DINNER',
      snack: 'SNACK',
    };

    const logDate = new Date(logEntry.logDate);
    const nutrition = logEntry.nutrition;

    await writeRecords([
      {
        recordType: 'NutritionRecord',
        clientRecordId,
        startTime: logDate.toISOString(),
        endTime: logDate.toISOString(),
        mealType: mealTypeMap[logEntry.meal],
        energy: {
          inKilocalories: nutrition.calories,
          inJoules: nutrition.calories * KCAL_TO_JOULES,
        },
        protein: { inGrams: nutrition.protein },
        totalCarbohydrate: { inGrams: nutrition.carbs },
        totalFat: { inGrams: nutrition.fat },
        dietaryFiber: nutrition.fiber ? { inGrams: nutrition.fiber } : undefined,
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
    await deleteRecords({
      recordIds: [clientRecordId],
      clientRecordIds: [clientRecordId],
    });
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

    await writeRecords([
      {
        recordType: 'HydrationRecord',
        clientRecordId,
        startTime: logDate.toISOString(),
        endTime: logDate.toISOString(),
        volume: { inLiters: waterEntry.amountOz * OZ_TO_LITERS },
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
    await deleteRecords({
      recordIds: [clientRecordId],
      clientRecordIds: [clientRecordId],
    });
  } catch (err) {
    console.warn('[HealthConnect] Failed to delete hydration record:', err);
  }
}

// ─── Exercise ────────────────────────────────────────────────────────────────

// Map Pulse exercise type + category to Health Connect ExerciseType enum
function mapToHealthConnectExerciseType(exerciseType: string, category?: string): number {
  const normalizedType = exerciseType?.toLowerCase() ?? '';
  const normalizedCategory = category?.toLowerCase() ?? '';

  // Cardio-specific mappings based on category
  if (normalizedType === 'cardio' || normalizedCategory === 'cardio') {
    if (normalizedCategory.includes('run')) return 1; // RUNNING
    if (normalizedCategory.includes('walk')) return 2; // WALKING
    if (normalizedCategory.includes('cycl')) return 3; // CYCLING
    if (normalizedCategory.includes('swim')) return 4; // SWIMMING
    if (normalizedCategory.includes('hiit') || normalizedCategory.includes('high intensity')) return 8; // HIIT
    if (normalizedCategory.includes('ellip')) return 13; // ELLIPTICAL
    if (normalizedCategory.includes('row')) return 14; // ROWING
    if (normalizedCategory.includes('jump')) return 33; // JUMP_ROPE
    return 59; // OTHER_WORKOUT for unmapped cardio
  }

  // Weight/strength training
  if (normalizedType === 'weight' || normalizedType === 'resistance' || normalizedCategory.includes('weight') || normalizedCategory.includes('strength')) {
    return 5; // WEIGHT_LIFTING
  }

  // Bodyweight/calisthenics
  if (normalizedType === 'bodyweight') {
    if (normalizedCategory.includes('yoga')) return 6; // YOGA
    if (normalizedCategory.includes('pilates')) return 7; // PILATES
    if (normalizedCategory.includes('core')) return 18; // CORE_TRAINING
    if (normalizedCategory.includes('stretch')) return 32; // STRETCHING
    return 5; // Default to weight lifting for general bodyweight
  }

  // Duration-based (often cardio)
  if (normalizedType === 'duration') {
    if (normalizedCategory.includes('yoga')) return 6; // YOGA
    if (normalizedCategory.includes('pilates')) return 7; // PILATES
    if (normalizedCategory.includes('dance')) return 10; // DANCING
    return 59; // OTHER_WORKOUT for unmapped duration
  }

  // Fallback
  return 59; // OTHER_WORKOUT
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
      // Empty workout, nothing to write
      return;
    }

    const workoutDate = new Date(workout.workoutDate);
    const startTime = workout.startedAt ? new Date(workout.startedAt) : workoutDate;
    const durationSeconds = workout.durationMinutes ? workout.durationMinutes * 60 : 0;
    const endTime = new Date(startTime.getTime() + durationSeconds * 1000);

    // For now, write a single exercise record using the first exercise
    // In a more detailed implementation, you could write one record per exercise
    const firstExercise = workout.exercises[0];
    const exerciseType = mapToHealthConnectExerciseType(firstExercise.exercise.exerciseType, firstExercise.exercise.category);

    await writeRecords([
      {
        recordType: 'ExerciseSessionRecord',
        clientRecordId,
        startTime: startTime.toISOString(),
        endTime: endTime.toISOString(),
        exerciseType,
        title: workout.name ?? `Workout on ${workout.workoutDate}`,
      },
    ]);

    // If calories were burned, write a separate TotalCaloriesBurnedRecord
    if (workout.caloriesBurned && workout.caloriesBurned > 0) {
      await writeRecords([
        {
          recordType: 'TotalCaloriesBurnedRecord',
          clientRecordId: `${clientRecordId}_calories`,
          startTime: startTime.toISOString(),
          endTime: endTime.toISOString(),
          energy: {
            inKilocalories: workout.caloriesBurned,
            inJoules: workout.caloriesBurned * KCAL_TO_JOULES,
          },
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
    // Delete both the exercise session and calories records (if it exists)
    await deleteRecords({
      recordIds: [clientRecordId],
      clientRecordIds: [clientRecordId, `${clientRecordId}_calories`],
    });
  } catch (err) {
    console.warn('[HealthConnect] Failed to delete exercise record:', err);
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
    const measurementDate = new Date(measuredAt);

    // Convert to kg if needed (Health Connect uses kg)
    const valueInKg = unit.toLowerCase() === 'lbs' || unit.toLowerCase() === 'lb'
      ? value * LBS_TO_KG
      : value;

    await writeRecords([
      {
        recordType: 'WeightRecord',
        clientRecordId,
        startTime: measurementDate.toISOString(),
        endTime: measurementDate.toISOString(),
        weight: { inKilogram: valueInKg },
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
    await deleteRecords({
      recordIds: [clientRecordId],
      clientRecordIds: [clientRecordId],
    });
  } catch (err) {
    console.warn('[HealthConnect] Failed to delete weight record:', err);
  }
}
