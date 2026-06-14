import type { Pool, RowDataPacket } from 'mysql2/promise';
import { parseConfig, matchesRecurrence } from '../utils/recurrence';

export interface NutritionOverride {
  calories:    number | null;
  proteinG:    number | null;
  carbsG:      number | null;
  fatG:        number | null;
  waterGoalOz: number | null;
}

/**
 * Returns the first matching nutrition schedule entry for a given user + date,
 * or null if no schedule applies. Only fields that are non-null in the schedule
 * are meant to override the default goals.
 */
export async function getNutritionOverrideForDate(
  pool: Pool,
  userId: number,
  date: string,
): Promise<NutritionOverride | null> {
  const target = new Date(date + 'T00:00:00.000Z');

  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT * FROM nutrition_schedules
     WHERE user_id = ?
       AND start_date <= ?
       AND (end_date IS NULL OR end_date >= ?)
     ORDER BY id ASC`,
    [userId, date, date],
  );

  for (const row of rows as RowDataPacket[]) {
    const startDate = new Date(
      (row.start_date instanceof Date ? row.start_date.toISOString() : String(row.start_date)).slice(0, 10) + 'T00:00:00.000Z',
    );
    const cfg = parseConfig(row.recurrence_config);
    if (matchesRecurrence(row.recurrence_type, cfg, target, startDate)) {
      return {
        calories:    row.calories    != null ? Number(row.calories)    : null,
        proteinG:    row.protein_g   != null ? Number(row.protein_g)   : null,
        carbsG:      row.carbs_g     != null ? Number(row.carbs_g)     : null,
        fatG:        row.fat_g       != null ? Number(row.fat_g)       : null,
        waterGoalOz: row.water_goal_oz != null ? Number(row.water_goal_oz) : null,
      };
    }
  }

  return null;
}
