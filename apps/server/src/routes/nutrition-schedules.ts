import { Router } from 'express';
import { pool } from '../config/database';
import type { RowDataPacket, ResultSetHeader } from 'mysql2/promise';

const router = Router();

const DOW_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const ORDINALS  = ['', '1st', '2nd', '3rd', '4th', '5th'];

function ordinalStr(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

function dateStr(d: Date | string): string {
  if (d instanceof Date) return d.toISOString().slice(0, 10);
  return String(d).slice(0, 10);
}

function utcDate(s: string): Date {
  return new Date(s + 'T00:00:00.000Z');
}

function getDow(d: Date): number {
  const js = d.getUTCDay();
  return js === 0 ? 6 : js - 1;
}

function parseConfig(raw: any): any {
  return typeof raw === 'string' ? JSON.parse(raw) : raw;
}

function describeRecurrence(type: string, cfg: any): string {
  switch (type) {
    case 'once':            return 'One time';
    case 'daily':           return 'Every day';
    case 'every_other_day': return 'Every other day';
    case 'days_of_week':
      return [...(cfg.days as number[])].sort((a, b) => a - b).map((d) => DOW_NAMES[d]).join(' · ');
    case 'every_x_days':    return `Every ${cfg.interval} days`;
    case 'day_of_month':
      if (cfg.type === 'nth_weekday') return `${ORDINALS[cfg.n]} ${DOW_NAMES[cfg.weekday]}`;
      if (cfg.type === 'specific_dates') return (cfg.dates as number[]).map(ordinalStr).join(' & ');
      return '';
    case 'custom_cycle':
      return 'Custom cycle';
    default: return '';
  }
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
    case 'custom_cycle':
      if (!Array.isArray(cfg.days) || cfg.days.length === 0) return false;
      const dow = getDow(date);
      if (!cfg.days.includes(dow)) return false;
      return diff >= 0;
    default: return false;
  }
}

function fmt(r: RowDataPacket) {
  const cfg = parseConfig(r.recurrence_config);
  return {
    id:                   r.id,
    dayTypeId:            r.day_type_id ?? null,
    calories:             r.calories ?? null,
    proteinG:             r.protein_g != null ? Number(r.protein_g) : null,
    carbsG:               r.carbs_g   != null ? Number(r.carbs_g)   : null,
    fatG:                 r.fat_g     != null ? Number(r.fat_g)     : null,
    waterGoalOz:          r.water_goal_oz != null ? Number(r.water_goal_oz) : null,
    recurrenceType:       r.recurrence_type,
    recurrenceConfig:     cfg,
    recurrenceDescription: describeRecurrence(r.recurrence_type, cfg),
    startDate:            dateStr(r.start_date),
    endDate:              r.end_date ? dateStr(r.end_date) : null,
  };
}

// GET /api/nutrition-schedules
router.get('/', async (req, res) => {
  try {
    const [rows] = await pool.query<RowDataPacket[]>(
      'SELECT * FROM nutrition_schedules WHERE user_id=? ORDER BY start_date ASC, id ASC',
      [req.userId]
    );
    res.json((rows as RowDataPacket[]).map(fmt));
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
});

// GET /api/nutrition-schedules/upcoming?days=60
router.get('/upcoming', async (req, res) => {
  const days = Math.min(Math.max(Number(req.query.days) || 60, 1), 90);
  const d = new Date();
  const todayStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const toDate   = new Date(todayStr + 'T00:00:00.000Z');
  toDate.setUTCDate(toDate.getUTCDate() + days - 1);
  const toStr = toDate.toISOString().slice(0, 10);

  try {
    const [schedRows] = await pool.query<RowDataPacket[]>(
      `SELECT ns.*, dtp.name AS day_type_name
       FROM nutrition_schedules ns
       LEFT JOIN day_type_presets dtp ON dtp.id = ns.day_type_id
       WHERE ns.user_id=?
         AND ns.start_date <= ? AND (ns.end_date IS NULL OR ns.end_date >= ?)
       ORDER BY ns.id ASC`,
      [req.userId, toStr, todayStr]
    );

    // Fetch foods and recipes for name lookups
    const [foodRows] = await pool.query<RowDataPacket[]>('SELECT id, name FROM foods');
    const [recipeRows] = await pool.query<RowDataPacket[]>('SELECT id, name FROM recipes');
    const foodMap = new Map(foodRows.map((r: RowDataPacket) => [r.id, r.name]));
    const recipeMap = new Map(recipeRows.map((r: RowDataPacket) => [r.id, r.name]));

    const results: object[] = [];

    for (const sched of schedRows as RowDataPacket[]) {
      const startDate = utcDate(dateStr(sched.start_date));
      const endDate   = sched.end_date ? utcDate(dateStr(sched.end_date)) : null;
      const cfg       = parseConfig(sched.recurrence_config);

      let cur = new Date(todayStr + 'T00:00:00.000Z');
      if (startDate > cur) cur = new Date(startDate);

      while (cur <= toDate) {
        if (endDate && cur > endDate) break;
        if (matchesRecurrence(sched.recurrence_type, cfg, cur, startDate)) {
          let recDesc = describeRecurrence(sched.recurrence_type, cfg);

          // For custom_cycle, don't show description (just macros)
          if (sched.recurrence_type === 'custom_cycle') {
            recDesc = '';
          }

          results.push({
            date:         cur.toISOString().slice(0, 10),
            scheduleId:   sched.id,
            dayTypeId:    sched.day_type_id ?? null,
            dayTypeName:  sched.day_type_name ?? null,
            calories:     sched.calories ?? null,
            proteinG:     sched.protein_g   != null ? Number(sched.protein_g)   : null,
            carbsG:       sched.carbs_g     != null ? Number(sched.carbs_g)     : null,
            fatG:         sched.fat_g       != null ? Number(sched.fat_g)       : null,
            waterGoalOz:  sched.water_goal_oz != null ? Number(sched.water_goal_oz) : null,
            recurrenceDescription: recDesc,
          });
        }
        cur.setUTCDate(cur.getUTCDate() + 1);
      }
    }

    results.sort((a: any, b: any) => a.date.localeCompare(b.date));
    res.json(results);
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
});

// POST /api/nutrition-schedules
router.post('/', async (req, res) => {
  const { dayTypeId, calories, proteinG, carbsG, fatG, waterGoalOz, recurrenceType, recurrenceConfig, startDate, endDate } = req.body;
  if (!recurrenceType || !startDate) {
    res.status(400).json({ error: 'recurrenceType and startDate required' }); return;
  }
  try {
    const [result] = await pool.query<ResultSetHeader>(
      `INSERT INTO nutrition_schedules (user_id, day_type_id, calories, protein_g, carbs_g, fat_g, water_goal_oz, recurrence_type, recurrence_config, start_date, end_date)
       VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
      [req.userId, dayTypeId ?? null, calories ?? null, proteinG ?? null, carbsG ?? null, fatG ?? null, waterGoalOz ?? null,
       recurrenceType, JSON.stringify(recurrenceConfig ?? {}), startDate, endDate ?? null]
    );
    const [rows] = await pool.query<RowDataPacket[]>('SELECT * FROM nutrition_schedules WHERE id=?', [result.insertId]);
    res.status(201).json(fmt((rows as RowDataPacket[])[0]));
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
});

// PUT /api/nutrition-schedules/:id
router.put('/:id', async (req, res) => {
  const id = Number(req.params.id);
  const { dayTypeId, calories, proteinG, carbsG, fatG, waterGoalOz, recurrenceType, recurrenceConfig, startDate, endDate } = req.body;
  const updates: string[] = [];
  const values: unknown[] = [];

  if (dayTypeId        !== undefined) { updates.push('day_type_id=?');       values.push(dayTypeId ?? null); }
  if (calories         !== undefined) { updates.push('calories=?');          values.push(calories ?? null); }
  if (proteinG         !== undefined) { updates.push('protein_g=?');         values.push(proteinG ?? null); }
  if (carbsG           !== undefined) { updates.push('carbs_g=?');           values.push(carbsG ?? null); }
  if (fatG             !== undefined) { updates.push('fat_g=?');             values.push(fatG ?? null); }
  if (waterGoalOz      !== undefined) { updates.push('water_goal_oz=?');     values.push(waterGoalOz ?? null); }
  if (recurrenceType   !== undefined) { updates.push('recurrence_type=?');   values.push(recurrenceType); }
  if (recurrenceConfig !== undefined) { updates.push('recurrence_config=?'); values.push(JSON.stringify(recurrenceConfig)); }
  if (startDate        !== undefined) { updates.push('start_date=?');        values.push(startDate); }
  if (endDate          !== undefined) { updates.push('end_date=?');          values.push(endDate ?? null); }

  if (!updates.length) { res.status(400).json({ error: 'Nothing to update' }); return; }

  try {
    values.push(id, req.userId);
    await pool.query(`UPDATE nutrition_schedules SET ${updates.join(', ')} WHERE id=? AND user_id=?`, values);
    const [rows] = await pool.query<RowDataPacket[]>('SELECT * FROM nutrition_schedules WHERE id=? AND user_id=?', [id, req.userId]);
    if (!(rows as RowDataPacket[]).length) { res.status(404).json({ error: 'Not found' }); return; }
    res.json(fmt((rows as RowDataPacket[])[0]));
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
});

// DELETE /api/nutrition-schedules/:id
router.delete('/:id', async (req, res) => {
  const id = Number(req.params.id);
  try {
    const [result] = await pool.query<ResultSetHeader>(
      'DELETE FROM nutrition_schedules WHERE id=? AND user_id=?', [id, req.userId]
    );
    if ((result as ResultSetHeader).affectedRows === 0) { res.status(404).json({ error: 'Not found' }); return; }
    res.json({ success: true });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
});

export default router;
