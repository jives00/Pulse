import { Router } from 'express';
import { pool } from '../config/database';
import { requireAuth } from '../middleware/auth';
import type { RowDataPacket, ResultSetHeader } from 'mysql2';
import type { MealSlot, NutritionSnapshot } from '../types';

const router = Router();
router.use(requireAuth);

const MEALS: MealSlot[] = ['breakfast', 'lunch', 'dinner', 'snack'];

// ── Helpers ──────────────────────────────────────────────────

function calcNutrition(row: RowDataPacket, qty: number): NutritionSnapshot {
  const factor = (Number(row.grams) * qty) / 100;
  return {
    calories: Math.round(Number(row.calories_per100) * factor * 10) / 10,
    carbs:    Math.round(Number(row.carbs_per100)    * factor * 10) / 10,
    protein:  Math.round(Number(row.protein_per100)  * factor * 10) / 10,
    fat:      Math.round(Number(row.fat_per100)       * factor * 10) / 10,
    fiber:    row.fiber_per100    != null ? Math.round(Number(row.fiber_per100)    * factor * 10) / 10 : undefined,
    sodium:   row.sodium_per100   != null ? Math.round(Number(row.sodium_per100)   * factor * 10) / 10 : undefined,
  };
}

function sumNutrition(entries: NutritionSnapshot[]): NutritionSnapshot {
  return entries.reduce(
    (acc, e) => ({
      calories: acc.calories + e.calories,
      carbs:    acc.carbs    + e.carbs,
      protein:  acc.protein  + e.protein,
      fat:      acc.fat      + e.fat,
      fiber:    (acc.fiber ?? 0) + (e.fiber ?? 0),
      sodium:   (acc.sodium ?? 0) + (e.sodium ?? 0),
    }),
    { calories: 0, carbs: 0, protein: 0, fat: 0, fiber: 0, sodium: 0 }
  );
}

function rowToEntry(row: RowDataPacket) {
  return {
    id: row.id,
    logDate: row.log_date instanceof Date
      ? row.log_date.toISOString().slice(0, 10)
      : String(row.log_date),
    meal: row.meal as MealSlot,
    food: {
      id: row.food_id,
      name: row.food_name,
      brand: row.brand ?? undefined,
      source: row.source,
      isCustom: Boolean(row.is_custom),
      nutrition: {
        calories: Number(row.calories_per100),
        carbs:    Number(row.carbs_per100),
        protein:  Number(row.protein_per100),
        fat:      Number(row.fat_per100),
        fiber:    row.fiber_per100  != null ? Number(row.fiber_per100)  : undefined,
        sodium:   row.sodium_per100 != null ? Number(row.sodium_per100) : undefined,
      },
      servingSizes: [],
    },
    servingSize: {
      id: row.serving_size_id,
      label: row.serving_label,
      grams: Number(row.serving_grams),
      isDefault: false,
    },
    quantity: Number(row.quantity),
    nutrition: {
      calories: Number(row.calories),
      carbs:    Number(row.carbs_g),
      protein:  Number(row.protein_g),
      fat:      Number(row.fat_g),
      fiber:    row.fiber_g  != null ? Number(row.fiber_g)  : undefined,
      sodium:   row.sodium_mg != null ? Number(row.sodium_mg) : undefined,
    },
    notes: row.notes ?? undefined,
    dramRecipeId: row.dram_recipe_id ?? undefined,
  };
}

// ── GET /log?date=YYYY-MM-DD ──────────────────────────────────

router.get('/', async (req, res) => {
  const date = String(req.query.date ?? new Date().toISOString().slice(0, 10));

  try {
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT fl.*,
              f.name AS food_name, f.brand, f.source, f.is_custom,
              f.calories_per100, f.carbs_per100, f.protein_per100, f.fat_per100,
              f.fiber_per100, f.sodium_per100,
              ss.label AS serving_label, ss.grams AS serving_grams
       FROM food_log fl
       JOIN foods f ON f.id = fl.food_id
       JOIN serving_sizes ss ON ss.id = fl.serving_size_id
       WHERE fl.log_date = ?
       ORDER BY fl.logged_at ASC`,
      [date]
    );

    const [goalRows] = await pool.query<RowDataPacket[]>(
      `SELECT * FROM user_goals WHERE effective_from <= ? ORDER BY effective_from DESC LIMIT 1`,
      [date]
    );

    const [waterRows] = await pool.query<RowDataPacket[]>(
      `SELECT COALESCE(SUM(amount_ml), 0) AS total FROM water_log WHERE log_date = ?`,
      [date]
    );

    const goals = goalRows[0] ?? { calories: 2000, carbs_g: 250, protein_g: 150, fat_g: 65, water_goal_ml: 2000 };

    const meals: Record<MealSlot, ReturnType<typeof rowToEntry>[]> = {
      breakfast: [], lunch: [], dinner: [], snack: [],
    };
    for (const row of rows) {
      meals[row.meal as MealSlot].push(rowToEntry(row));
    }

    const allEntries = rows.map(rowToEntry);
    const totals = sumNutrition(allEntries.map((e) => e.nutrition));

    res.json({
      date,
      meals,
      totals,
      waterTotalMl: Number(waterRows[0]?.total ?? 0),
      goals: {
        id: goals.id,
        calories: goals.calories,
        carbsG: goals.carbs_g,
        proteinG: goals.protein_g,
        fatG: goals.fat_g,
        fiberG: goals.fiber_g ?? undefined,
        sodiumMg: goals.sodium_mg ?? undefined,
        waterGoalMl: goals.water_goal_ml,
        effectiveFrom: goals.effective_from instanceof Date
          ? goals.effective_from.toISOString().slice(0, 10)
          : String(goals.effective_from),
      },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch log' });
  }
});

// ── POST /log ─────────────────────────────────────────────────

router.post('/', async (req, res) => {
  const { logDate, meal, foodId, servingSizeId, quantity, notes, dramRecipeId } = req.body;

  try {
    const [foods] = await pool.query<RowDataPacket[]>(
      `SELECT f.*, ss.grams FROM foods f
       JOIN serving_sizes ss ON ss.id = ?
       WHERE f.id = ?`,
      [servingSizeId, foodId]
    );
    if (!foods.length) { res.status(404).json({ error: 'Food or serving not found' }); return; }

    const nutrition = calcNutrition(foods[0], Number(quantity));

    const [result] = await pool.execute<ResultSetHeader>(
      `INSERT INTO food_log
         (log_date, meal, food_id, serving_size_id, quantity,
          calories, carbs_g, protein_g, fat_g, fiber_g, sodium_mg, notes, dram_recipe_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [logDate, meal, foodId, servingSizeId, quantity,
       nutrition.calories, nutrition.carbs, nutrition.protein, nutrition.fat,
       nutrition.fiber ?? null, nutrition.sodium ?? null,
       notes ?? null, dramRecipeId ?? null]
    );

    const [entry] = await pool.query<RowDataPacket[]>(
      `SELECT fl.*, f.name AS food_name, f.brand, f.source, f.is_custom,
              f.calories_per100, f.carbs_per100, f.protein_per100, f.fat_per100,
              f.fiber_per100, f.sodium_per100,
              ss.label AS serving_label, ss.grams AS serving_grams
       FROM food_log fl
       JOIN foods f ON f.id = fl.food_id
       JOIN serving_sizes ss ON ss.id = fl.serving_size_id
       WHERE fl.id = ?`,
      [result.insertId]
    );

    res.status(201).json(rowToEntry(entry[0]));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to add log entry' });
  }
});

// ── PUT /log/:id ──────────────────────────────────────────────

router.put('/:id', async (req, res) => {
  const { quantity, servingSizeId, notes } = req.body;

  try {
    const [existing] = await pool.query<RowDataPacket[]>(
      `SELECT fl.*, f.calories_per100, f.carbs_per100, f.protein_per100, f.fat_per100,
              f.fiber_per100, f.sodium_per100, ss.grams
       FROM food_log fl
       JOIN foods f ON f.id = fl.food_id
       JOIN serving_sizes ss ON ss.id = fl.serving_size_id
       WHERE fl.id = ?`,
      [req.params.id]
    );
    if (!existing.length) { res.status(404).json({ error: 'Not found' }); return; }

    const row = existing[0];
    const newQty = quantity != null ? Number(quantity) : Number(row.quantity);
    let servingGrams = Number(row.grams);

    if (servingSizeId != null && servingSizeId !== row.serving_size_id) {
      const [ss] = await pool.query<RowDataPacket[]>(
        'SELECT grams FROM serving_sizes WHERE id = ?', [servingSizeId]
      );
      if (!ss.length) { res.status(404).json({ error: 'Serving size not found' }); return; }
      servingGrams = Number(ss[0].grams);
    }

    const nutrition = calcNutrition({ ...row, grams: servingGrams }, newQty);

    await pool.execute(
      `UPDATE food_log SET
         quantity=?, serving_size_id=?,
         calories=?, carbs_g=?, protein_g=?, fat_g=?, fiber_g=?, sodium_mg=?,
         notes=?
       WHERE id=?`,
      [newQty, servingSizeId ?? row.serving_size_id,
       nutrition.calories, nutrition.carbs, nutrition.protein, nutrition.fat,
       nutrition.fiber ?? null, nutrition.sodium ?? null,
       notes ?? row.notes ?? null, req.params.id]
    );

    const [updated] = await pool.query<RowDataPacket[]>(
      `SELECT fl.*, f.name AS food_name, f.brand, f.source, f.is_custom,
              f.calories_per100, f.carbs_per100, f.protein_per100, f.fat_per100,
              f.fiber_per100, f.sodium_per100,
              ss.label AS serving_label, ss.grams AS serving_grams
       FROM food_log fl
       JOIN foods f ON f.id = fl.food_id
       JOIN serving_sizes ss ON ss.id = fl.serving_size_id
       WHERE fl.id = ?`,
      [req.params.id]
    );

    res.json(rowToEntry(updated[0]));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update log entry' });
  }
});

// ── DELETE /log/:id ───────────────────────────────────────────

router.delete('/:id', async (req, res) => {
  try {
    await pool.execute('DELETE FROM food_log WHERE id = ?', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to delete log entry' });
  }
});

// ── POST /log/copy ────────────────────────────────────────────

router.post('/copy', async (req, res) => {
  const { fromDate, toDate, meal } = req.body as { fromDate: string; toDate: string; meal?: MealSlot };

  try {
    let query = 'SELECT * FROM food_log WHERE log_date = ?';
    const params: unknown[] = [fromDate];
    if (meal) { query += ' AND meal = ?'; params.push(meal); }

    const [rows] = await pool.query<RowDataPacket[]>(query, params);
    if (!rows.length) { res.json({ copied: 0 }); return; }

    for (const row of rows) {
      await pool.execute(
        `INSERT INTO food_log
           (log_date, meal, food_id, serving_size_id, quantity,
            calories, carbs_g, protein_g, fat_g, fiber_g, sodium_mg, notes)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [toDate, row.meal, row.food_id, row.serving_size_id, row.quantity,
         row.calories, row.carbs_g, row.protein_g, row.fat_g,
         row.fiber_g, row.sodium_mg, row.notes]
      );
    }

    res.json({ copied: rows.length });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to copy log' });
  }
});

export default router;
