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
    default: return false;
  }
}

function fmt(r: RowDataPacket) {
  const cfg = parseConfig(r.recurrence_config);
  const result: any = {
    id:                   r.id,
    mealSlot:             r.meal_slot ?? null,
    label:                r.label,
    recurrenceType:       r.recurrence_type,
    recurrenceConfig:     cfg,
    recurrenceDescription: describeRecurrence(r.recurrence_type, cfg),
    startDate:            dateStr(r.start_date),
    endDate:              r.end_date ? dateStr(r.end_date) : null,
  };

  if (r.food_id) {
    result.foodId = r.food_id;
    result.servingSizeId = r.serving_size_id;
    result.quantity = r.quantity;
  }
  if (r.recipe_id) {
    result.recipeId = r.recipe_id;
    result.recipeServings = r.recipe_servings;
  }

  return result;
}

function fmtEvent(r: RowDataPacket) {
  const result: any = {
    date:       r.date,
    scheduleId: r.id,
    mealSlot:   r.meal_slot ?? null,
    label:      r.label,
  };

  if (r.calories != null)  result.calories  = r.calories;
  if (r.protein_g != null) result.proteinG  = r.protein_g;
  if (r.carbs_g != null)   result.carbsG    = r.carbs_g;
  if (r.fat_g != null)     result.fatG      = r.fat_g;

  return result;
}

// GET /api/meal-schedules
router.get('/', async (req, res) => {
  try {
    const [rows] = await pool.query<RowDataPacket[]>(
      'SELECT * FROM meal_schedules WHERE user_id=? ORDER BY start_date ASC, id ASC',
      [req.userId]
    );
    res.json((rows as RowDataPacket[]).map(fmt));
  } catch (err) { console.error('[meal-schedules] error:', err); res.status(500).json({ error: 'Server error' }); }
});

// GET /api/meal-schedules/upcoming?days=30
router.get('/upcoming', async (req, res) => {
  const days = Math.min(Math.max(Number(req.query.days) || 30, 1), 90);
  const d = new Date();
  const todayStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const toDate   = new Date(todayStr + 'T00:00:00.000Z');
  toDate.setUTCDate(toDate.getUTCDate() + days - 1);
  const toStr = toDate.toISOString().slice(0, 10);

  try {
    const [schedRows] = await pool.query<RowDataPacket[]>(
      `SELECT * FROM meal_schedules WHERE user_id=?
       AND start_date <= ? AND (end_date IS NULL OR end_date >= ?)
       ORDER BY id ASC`,
      [req.userId, toStr, todayStr]
    );

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
          const eventData: any = {
            date:       cur.toISOString().slice(0, 10),
            id:         sched.id,
            mealSlot:   sched.meal_slot ?? null,
            label:      sched.label,
            calories:   sched.calories,
            protein_g:  sched.protein_g,
            carbs_g:    sched.carbs_g,
            fat_g:      sched.fat_g,
          };
          results.push(fmtEvent(eventData));
        }
        cur.setUTCDate(cur.getUTCDate() + 1);
      }
    }

    results.sort((a: any, b: any) => a.date.localeCompare(b.date));
    res.json(results);
  } catch (err) { console.error('[meal-schedules] error:', err); res.status(500).json({ error: 'Server error' }); }
});

// POST /api/meal-schedules
router.post('/', async (req, res) => {
  const { mealSlot, label, foodId, servingSizeId, quantity, recipeId, recipeServings, calories: calFromReq, proteinG: protFromReq, carbsG: carbsFromReq, fatG: fatFromReq, recurrenceType, recurrenceConfig, startDate, endDate } = req.body;
  if (!label || !recurrenceType || !startDate) {
    res.status(400).json({ error: 'label, recurrenceType, startDate required' }); return;
  }

  let calories: number | null = calFromReq || null;
  let proteinG: number | null = protFromReq || null;
  let carbsG: number | null = carbsFromReq || null;
  let fatG: number | null = fatFromReq || null;

  try {
    // Only compute macros if not manually provided
    if (!calories) {
      // Compute macros if food selected
      if (foodId && servingSizeId && quantity) {
        const [foodRows] = await pool.query<RowDataPacket[]>(
          `SELECT f.calories_per100, f.protein_per100, f.carbs_per100, f.fat_per100,
                  ss.grams FROM foods f
           JOIN serving_sizes ss ON f.id = ss.food_id
           WHERE f.id = ? AND ss.id = ?`,
          [foodId, servingSizeId]
        );
        if (foodRows.length > 0) {
          const food = foodRows[0];
          const factor = (food.grams * quantity) / 100;
          calories = Math.round(food.calories_per100 * factor * 100) / 100;
          proteinG = Math.round(food.protein_per100 * factor * 100) / 100;
          carbsG = Math.round(food.carbs_per100 * factor * 100) / 100;
          fatG = Math.round(food.fat_per100 * factor * 100) / 100;
        }
      }

      // Compute macros if recipe selected
      if (recipeId && recipeServings) {
        const [recipeRows] = await pool.query<RowDataPacket[]>(
          'SELECT calories, protein_g, carbs_g, fat_g, servings FROM recipes WHERE id = ?',
          [recipeId]
        );
        if (recipeRows.length > 0) {
          const recipe = recipeRows[0];
          const totalServings = recipe.servings || 1;
          const factor = recipeServings / totalServings;
          calories = Math.round(recipe.calories * factor * 100) / 100;
          proteinG = Math.round(recipe.protein_g * factor * 100) / 100;
          carbsG = Math.round(recipe.carbs_g * factor * 100) / 100;
          fatG = Math.round(recipe.fat_g * factor * 100) / 100;
        }
      }
    }

    const [result] = await pool.query<ResultSetHeader>(
      `INSERT INTO meal_schedules (user_id, meal_slot, label, food_id, serving_size_id, quantity, recipe_id, recipe_servings, calories, protein_g, carbs_g, fat_g, recurrence_type, recurrence_config, start_date, end_date)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [req.userId, mealSlot ?? null, label, foodId ?? null, servingSizeId ?? null, quantity ?? null, recipeId ?? null, recipeServings ?? null, calories, proteinG, carbsG, fatG, recurrenceType, JSON.stringify(recurrenceConfig ?? {}), startDate, endDate ?? null]
    );
    const [rows] = await pool.query<RowDataPacket[]>('SELECT * FROM meal_schedules WHERE id=?', [result.insertId]);
    res.status(201).json(fmt((rows as RowDataPacket[])[0]));
  } catch (err) { console.error('[meal-schedules] error:', err); res.status(500).json({ error: 'Server error' }); }
});

// PUT /api/meal-schedules/:id
router.put('/:id', async (req, res) => {
  const id = Number(req.params.id);
  const { mealSlot, label, foodId, servingSizeId, quantity, recipeId, recipeServings, recurrenceType, recurrenceConfig, startDate, endDate } = req.body;
  const updates: string[] = [];
  const values: unknown[] = [];

  if (mealSlot       !== undefined) { updates.push('meal_slot=?');         values.push(mealSlot ?? null); }
  if (label          !== undefined) { updates.push('label=?');             values.push(label); }
  if (recurrenceType !== undefined) { updates.push('recurrence_type=?');   values.push(recurrenceType); }
  if (recurrenceConfig !== undefined) { updates.push('recurrence_config=?'); values.push(JSON.stringify(recurrenceConfig)); }
  if (startDate      !== undefined) { updates.push('start_date=?');        values.push(startDate); }
  if (endDate        !== undefined) { updates.push('end_date=?');          values.push(endDate ?? null); }
  if (foodId         !== undefined) { updates.push('food_id=?');           values.push(foodId ?? null); }
  if (servingSizeId  !== undefined) { updates.push('serving_size_id=?');   values.push(servingSizeId ?? null); }
  if (quantity       !== undefined) { updates.push('quantity=?');          values.push(quantity ?? null); }
  if (recipeId       !== undefined) { updates.push('recipe_id=?');         values.push(recipeId ?? null); }
  if (recipeServings !== undefined) { updates.push('recipe_servings=?');   values.push(recipeServings ?? null); }

  if (!updates.length) { res.status(400).json({ error: 'Nothing to update' }); return; }

  try {
    // Recompute macros if food/recipe data is being updated
    if (foodId !== undefined || servingSizeId !== undefined || quantity !== undefined || recipeId !== undefined || recipeServings !== undefined) {
      let calories: number | null = null;
      let proteinG: number | null = null;
      let carbsG: number | null = null;
      let fatG: number | null = null;

      const foodIdToUse = foodId !== undefined ? foodId : null;
      const servingSizeIdToUse = servingSizeId !== undefined ? servingSizeId : null;
      const quantityToUse = quantity !== undefined ? quantity : null;
      const recipeIdToUse = recipeId !== undefined ? recipeId : null;
      const recipeServingsToUse = recipeServings !== undefined ? recipeServings : null;

      if (foodIdToUse && servingSizeIdToUse && quantityToUse) {
        const [foodRows] = await pool.query<RowDataPacket[]>(
          `SELECT f.nutrition_calories, f.nutrition_protein, f.nutrition_carbs, f.nutrition_fat,
                  ss.grams FROM foods f
           JOIN food_serving_sizes ss ON f.id = ss.food_id
           WHERE f.id = ? AND ss.id = ?`,
          [foodIdToUse, servingSizeIdToUse]
        );
        if (foodRows.length > 0) {
          const food = foodRows[0];
          const factor = (food.grams * quantityToUse) / 100;
          calories = Math.round(food.nutrition_calories * factor * 100) / 100;
          proteinG = Math.round(food.nutrition_protein * factor * 100) / 100;
          carbsG = Math.round(food.nutrition_carbs * factor * 100) / 100;
          fatG = Math.round(food.nutrition_fat * factor * 100) / 100;
        }
      }

      if (recipeIdToUse && recipeServingsToUse) {
        const [recipeRows] = await pool.query<RowDataPacket[]>(
          'SELECT calories, protein_g, carbs_g, fat_g, servings FROM recipes WHERE id = ?',
          [recipeIdToUse]
        );
        if (recipeRows.length > 0) {
          const recipe = recipeRows[0];
          const totalServings = recipe.servings || 1;
          const factor = recipeServingsToUse / totalServings;
          calories = Math.round(recipe.calories * factor * 100) / 100;
          proteinG = Math.round(recipe.protein_g * factor * 100) / 100;
          carbsG = Math.round(recipe.carbs_g * factor * 100) / 100;
          fatG = Math.round(recipe.fat_g * factor * 100) / 100;
        }
      }

      updates.push('calories=?', 'protein_g=?', 'carbs_g=?', 'fat_g=?');
      values.push(calories, proteinG, carbsG, fatG);
    }

    values.push(id, req.userId);
    await pool.query(`UPDATE meal_schedules SET ${updates.join(', ')} WHERE id=? AND user_id=?`, values);
    const [rows] = await pool.query<RowDataPacket[]>('SELECT * FROM meal_schedules WHERE id=? AND user_id=?', [id, req.userId]);
    if (!(rows as RowDataPacket[]).length) { res.status(404).json({ error: 'Not found' }); return; }
    res.json(fmt((rows as RowDataPacket[])[0]));
  } catch (err) { console.error('[meal-schedules] error:', err); res.status(500).json({ error: 'Server error' }); }
});

// DELETE /api/meal-schedules/:id
router.delete('/:id', async (req, res) => {
  const id = Number(req.params.id);
  try {
    const [result] = await pool.query<ResultSetHeader>(
      'DELETE FROM meal_schedules WHERE id=? AND user_id=?', [id, req.userId]
    );
    if ((result as ResultSetHeader).affectedRows === 0) { res.status(404).json({ error: 'Not found' }); return; }
    res.json({ success: true });
  } catch (err) { console.error('[meal-schedules] error:', err); res.status(500).json({ error: 'Server error' }); }
});

export default router;
