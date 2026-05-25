import type { Pool, RowDataPacket } from 'mysql2/promise';

function getDow(d: Date): number {
  const js = d.getUTCDay();
  return js === 0 ? 6 : js - 1;
}

function parseConfig(raw: any): any {
  return typeof raw === 'string' ? JSON.parse(raw) : raw;
}

function matchesRecurrence(type: string, cfg: any, date: Date, startDate: Date): boolean {
  const diff = Math.round((date.getTime() - startDate.getTime()) / 86400000);
  switch (type) {
    case 'once':            return diff === 0;
    case 'daily':           return true;
    case 'every_other_day': return diff >= 0 && diff % 2 === 0;
    case 'days_of_week':    return Array.isArray(cfg.days) && cfg.days.includes(getDow(date));
    case 'every_x_days':    return diff >= 0 && cfg.interval > 0 && diff % cfg.interval === 0;
    case 'day_of_month':
      if (cfg.type === 'specific_dates') return Array.isArray(cfg.dates) && cfg.dates.includes(date.getUTCDate());
      if (cfg.type === 'nth_weekday') {
        if (getDow(date) !== cfg.weekday) return false;
        const dom = date.getUTCDate();
        return dom >= (cfg.n - 1) * 7 + 1 && dom <= cfg.n * 7;
      }
      return false;
    case 'custom_cycle': {
      if (!Array.isArray(cfg.days) || cfg.days.length === 0) return false;
      return cfg.days.includes(getDow(date)) && diff >= 0;
    }
    default: return false;
  }
}

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
