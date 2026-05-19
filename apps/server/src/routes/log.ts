import { Router } from 'express';
import { pool } from '../config/database';
import { requireAuth } from '../middleware/auth';
import type { RowDataPacket, ResultSetHeader, PoolConnection } from 'mysql2/promise';
import { upsertRecipeNutritionLog } from './recipes';
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

// ── GET /log/frequent — top foods logged by this user ─────────

router.get('/frequent', async (req, res) => {
  try {
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT f.id, f.name, f.brand,
              COUNT(DISTINCT fl.id) AS log_count,
              ss.id AS serving_size_id, ss.label AS serving_label, ss.grams AS serving_grams,
              ROUND(f.calories_per100 * ss.grams / 100) AS calories_per_serving,
              ROUND(f.protein_per100 * ss.grams / 100, 1) AS protein_per_serving,
              ROUND(f.carbs_per100 * ss.grams / 100, 1) AS carbs_per_serving,
              ROUND(f.fat_per100 * ss.grams / 100, 1) AS fat_per_serving
       FROM food_log fl
       JOIN foods f ON f.id = fl.food_id
       LEFT JOIN serving_sizes ss ON ss.food_id = f.id AND ss.is_default = 1
       WHERE fl.user_id = ?
         AND fl.log_date >= DATE_SUB(CURDATE(), INTERVAL 90 DAY)
         AND (f.source IS NULL OR f.source != 'quick_log')
       GROUP BY f.id, ss.id
       ORDER BY log_count DESC
       LIMIT 10`,
      [req.userId]
    );

    res.json(rows.map((r) => ({
      foodId: r.id,
      name: r.name,
      brand: r.brand ?? null,
      logCount: Number(r.log_count),
      servingSizeId: r.serving_size_id ?? 0,
      servingLabel: r.serving_label ?? '1 serving',
      servingGrams: Number(r.serving_grams ?? 100),
      caloriesPerServing: Number(r.calories_per_serving ?? 0),
      proteinPerServing: Number(r.protein_per_serving ?? 0),
      carbsPerServing: Number(r.carbs_per_serving ?? 0),
      fatPerServing: Number(r.fat_per_serving ?? 0),
    })));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch frequent foods' });
  }
});

// ── GET /log?date=YYYY-MM-DD ──────────────────────────────────

router.get('/', async (req, res) => {
  const date = String(req.query.date ?? new Date().toLocaleDateString('en-CA', { timeZone: 'America/Chicago' }));

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
       WHERE fl.user_id = ? AND fl.log_date = ?
       ORDER BY fl.logged_at ASC`,
      [req.userId, date]
    );

    const [goalRows] = await pool.query<RowDataPacket[]>(
      `SELECT * FROM user_goals WHERE user_id = ? AND effective_from <= ? ORDER BY effective_from DESC, id DESC LIMIT 1`,
      [req.userId, date]
    );

    const [waterRows] = await pool.query<RowDataPacket[]>(
      `SELECT COALESCE(SUM(amount_oz), 0) AS total FROM water_log WHERE user_id = ? AND log_date = ?`,
      [req.userId, date]
    );

    const goals = goalRows[0] ?? { calories: 2000, carbs_g: 250, protein_g: 150, fat_g: 65, water_goal_oz: 64 };

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
      waterTotalOz: Number(waterRows[0]?.total ?? 0),
      goals: {
        id: goals.id,
        calories: goals.calories,
        carbsG: goals.carbs_g,
        proteinG: goals.protein_g,
        fatG: goals.fat_g,
        fiberG: goals.fiber_g ?? undefined,
        sodiumMg: goals.sodium_mg ?? undefined,
        waterGoalOz: goals.water_goal_oz,
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

// ── POST /log/recipe-modified — log a one-time modified recipe entry ──────
// Creates a custom food with the AI-modified macros and logs it, without
// touching the stored recipe. The name is suffixed "(modified)".

router.post('/recipe-modified', async (req, res) => {
  const { recipeId, meal, logDate, name, calories, carbs_g, protein_g, fat_g, fiber_g, sodium_mg } = req.body;

  if (!MEALS.includes(meal)) {
    res.status(400).json({ error: 'Invalid meal slot' }); return;
  }
  if (typeof name !== 'string' || !name.trim()) {
    res.status(400).json({ error: 'name is required' }); return;
  }
  if (calories == null || isNaN(Number(calories))) {
    res.status(400).json({ error: 'calories is required' }); return;
  }

  const conn = await pool.getConnection();
  try {
    const [recipes] = await conn.query<RowDataPacket[]>(
      'SELECT id FROM recipes WHERE id = ? AND user_id = ?', [recipeId, req.userId]
    );
    if (!recipes.length) { res.status(404).json({ error: 'Recipe not found' }); return; }

    const date = logDate ?? new Date().toISOString().slice(0, 10);
    const cal = Number(calories);
    const carbs = Number(carbs_g) || 0;
    const protein = Number(protein_g) || 0;
    const fat = Number(fat_g) || 0;
    const fiber = fiber_g != null ? Number(fiber_g) : null;
    const sodium = sodium_mg != null ? Number(sodium_mg) : null;

    await conn.beginTransaction();

    // Custom food: store per-serving values as per-100 (1 serving = 100 virtual units)
    const [foodResult] = await conn.execute<ResultSetHeader>(
      `INSERT INTO foods (name, is_custom, calories_per100, carbs_per100, protein_per100,
        fat_per100, fiber_per100, sodium_per100)
       VALUES (?, 1, ?, ?, ?, ?, ?, ?)`,
      [name.trim(), cal, carbs, protein, fat, fiber, sodium]
    );
    const foodId = foodResult.insertId;

    const [ssResult] = await conn.execute<ResultSetHeader>(
      'INSERT INTO serving_sizes (food_id, label, grams, is_default) VALUES (?, ?, 100, 1)',
      [foodId, '1 serving']
    );
    const servingSizeId = ssResult.insertId;

    await conn.execute(
      `INSERT INTO food_log (user_id, log_date, meal, food_id, serving_size_id, quantity,
        calories, carbs_g, protein_g, fat_g, fiber_g, sodium_mg, notes, dram_recipe_id)
       VALUES (?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?, ?, NULL, ?)`,
      [req.userId, date, meal, foodId, servingSizeId, cal, carbs, protein, fat, fiber, sodium, recipeId]
    );

    await conn.commit();
    res.status(201).json({ success: true });
  } catch (err) {
    await conn.rollback();
    console.error(err);
    res.status(500).json({ error: 'Failed to log modified recipe' });
  } finally {
    conn.release();
  }
});

// ── POST /log/inline — log a one-time entry without saving to custom foods ──

router.post('/inline', async (req, res) => {
  const { name, meal, logDate, calories, carbs_g, protein_g, fat_g, fiber_g, sodium_mg } = req.body;

  if (!MEALS.includes(meal)) {
    res.status(400).json({ error: 'Invalid meal slot' }); return;
  }
  if (typeof name !== 'string' || !name.trim()) {
    res.status(400).json({ error: 'name is required' }); return;
  }
  if (calories == null || isNaN(Number(calories))) {
    res.status(400).json({ error: 'calories is required' }); return;
  }

  const conn = await pool.getConnection();
  try {
    const date = logDate ?? new Date().toISOString().slice(0, 10);
    const cal = Number(calories);
    const carbs = Number(carbs_g) || 0;
    const protein = Number(protein_g) || 0;
    const fat = Number(fat_g) || 0;
    const fiber = fiber_g != null ? Number(fiber_g) : null;
    const sodium = sodium_mg != null ? Number(sodium_mg) : null;

    await conn.beginTransaction();

    const [foodResult] = await conn.execute<ResultSetHeader>(
      `INSERT INTO foods (name, source, is_custom, calories_per100, carbs_per100, protein_per100,
        fat_per100, fiber_per100, sodium_per100)
       VALUES (?, 'quick_log', 1, ?, ?, ?, ?, ?, ?)`,
      [name.trim(), cal, carbs, protein, fat, fiber, sodium]
    );
    const foodId = foodResult.insertId;

    const [ssResult] = await conn.execute<ResultSetHeader>(
      'INSERT INTO serving_sizes (food_id, label, grams, is_default) VALUES (?, ?, 100, 1)',
      [foodId, '1 serving']
    );
    const servingSizeId = ssResult.insertId;

    await conn.execute(
      `INSERT INTO food_log (user_id, log_date, meal, food_id, serving_size_id, quantity,
        calories, carbs_g, protein_g, fat_g, fiber_g, sodium_mg)
       VALUES (?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?, ?)`,
      [req.userId, date, meal, foodId, servingSizeId, cal, carbs, protein, fat, fiber, sodium]
    );

    await conn.commit();
    res.status(201).json({ success: true });
  } catch (err) {
    await conn.rollback();
    console.error(err);
    res.status(500).json({ error: 'Failed to log inline entry' });
  } finally {
    conn.release();
  }
});

// ── POST /log/recipe — log a recipe as a nutrition entry ──────

router.post('/recipe', async (req, res) => {
  const { recipeId, meal, servings, logDate } = req.body;

  if (!MEALS.includes(meal)) {
    res.status(400).json({ error: 'Invalid meal slot' }); return;
  }
  const qty = Number(servings);
  if (!qty || qty <= 0) {
    res.status(400).json({ error: 'servings must be positive' }); return;
  }

  const conn = await pool.getConnection();
  try {
    const [recipes] = await conn.query<RowDataPacket[]>(
      'SELECT * FROM recipes WHERE id = ? AND user_id = ?',
      [recipeId, req.userId]
    );
    if (!recipes.length) { res.status(404).json({ error: 'Recipe not found' }); return; }
    const recipe = recipes[0];
    if (recipe.calories == null) {
      res.status(400).json({ error: 'Recipe has no nutrition data' }); return;
    }

    await conn.beginTransaction();
    await upsertRecipeNutritionLog(conn, recipe, req.userId!, meal, qty, logDate ?? null);
    await conn.query('INSERT INTO recipe_log (recipe_id, user_id) VALUES (?, ?)', [recipeId, req.userId]);
    await conn.commit();

    res.status(201).json({ success: true });
  } catch (err) {
    await conn.rollback();
    console.error(err);
    res.status(500).json({ error: 'Failed to log recipe' });
  } finally {
    conn.release();
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
         (user_id, log_date, meal, food_id, serving_size_id, quantity,
          calories, carbs_g, protein_g, fat_g, fiber_g, sodium_mg, notes, dram_recipe_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [req.userId, logDate, meal, foodId, servingSizeId, quantity,
       nutrition.calories, nutrition.carbs, nutrition.protein, nutrition.fat,
       nutrition.fiber ?? null, nutrition.sodium ?? null,
       notes ?? null, dramRecipeId ?? null]
    );

    if (dramRecipeId) {
      await pool.execute(
        'INSERT INTO recipe_log (recipe_id, user_id) VALUES (?, ?)',
        [dramRecipeId, req.userId]
      );
    }

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
  const { quantity, servingSizeId, notes, meal, logDate } = req.body;

  try {
    const [existing] = await pool.query<RowDataPacket[]>(
      `SELECT fl.*, f.calories_per100, f.carbs_per100, f.protein_per100, f.fat_per100,
              f.fiber_per100, f.sodium_per100, ss.grams
       FROM food_log fl
       JOIN foods f ON f.id = fl.food_id
       JOIN serving_sizes ss ON ss.id = fl.serving_size_id
       WHERE fl.id = ? AND fl.user_id = ?`,
      [req.params.id, req.userId]
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
    const newMeal = meal != null ? meal : row.meal;
    const newLogDate = logDate != null ? logDate : (row.log_date instanceof Date ? row.log_date.toISOString().slice(0, 10) : String(row.log_date));

    await pool.execute(
      `UPDATE food_log SET
         quantity=?, serving_size_id=?, meal=?, log_date=?,
         calories=?, carbs_g=?, protein_g=?, fat_g=?, fiber_g=?, sodium_mg=?,
         notes=?
       WHERE id=?`,
      [newQty, servingSizeId ?? row.serving_size_id, newMeal, newLogDate,
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

// ── GET /log/history ─────────────────────────────────────────

router.get('/history', async (req, res) => {
  const { limit = '90', start, end } = req.query as { limit?: string; start?: string; end?: string };
  try {
    let rows: RowDataPacket[];
    if (start || end) {
      const dateParams: unknown[] = [req.userId];
      let dateClause = '';
      if (start && end) { dateClause = 'AND fl.log_date BETWEEN ? AND ?'; dateParams.push(start, end); }
      else if (start) { dateClause = 'AND fl.log_date >= ?'; dateParams.push(start); }
      else if (end) { dateClause = 'AND fl.log_date <= ?'; dateParams.push(end); }

      [rows] = await pool.query<RowDataPacket[]>(
        `SELECT fl.id, fl.log_date, fl.meal, fl.calories, fl.carbs_g, fl.protein_g, fl.fat_g,
                fl.quantity, f.name AS food_name, f.brand,
                ss.label AS serving_label, fl.serving_size_id
         FROM food_log fl
         JOIN foods f ON f.id = fl.food_id
         JOIN serving_sizes ss ON ss.id = fl.serving_size_id
         WHERE fl.user_id = ? ${dateClause}
         ORDER BY fl.log_date DESC, fl.logged_at DESC`,
        dateParams
      );
    } else {
      [rows] = await pool.query<RowDataPacket[]>(
        `SELECT fl.id, fl.log_date, fl.meal, fl.calories, fl.carbs_g, fl.protein_g, fl.fat_g,
                fl.quantity, f.name AS food_name, f.brand,
                ss.label AS serving_label, fl.serving_size_id
         FROM food_log fl
         JOIN foods f ON f.id = fl.food_id
         JOIN serving_sizes ss ON ss.id = fl.serving_size_id
         JOIN (
           SELECT DISTINCT log_date FROM food_log
           WHERE user_id = ? ORDER BY log_date DESC LIMIT ?
         ) recent ON recent.log_date = fl.log_date
         WHERE fl.user_id = ?
         ORDER BY fl.log_date DESC, fl.logged_at DESC`,
        [req.userId, Number(limit), req.userId]
      );
    }

    const byDate: Map<string, { date: string; calories: number; protein: number; entries: object[] }> = new Map();
    for (const row of rows) {
      const date = row.log_date instanceof Date
        ? row.log_date.toISOString().slice(0, 10)
        : String(row.log_date);
      if (!byDate.has(date)) byDate.set(date, { date, calories: 0, protein: 0, entries: [] });
      const day = byDate.get(date)!;
      day.calories += Number(row.calories);
      day.protein += Number(row.protein_g);
      day.entries.push({
        id: row.id,
        meal: row.meal,
        foodName: row.food_name,
        brand: row.brand ?? null,
        servingLabel: row.serving_label,
        quantity: Number(row.quantity),
        calories: Number(row.calories),
        proteinG: Number(row.protein_g),
        carbsG: Number(row.carbs_g),
        fatG: Number(row.fat_g),
      });
    }

    res.json(Array.from(byDate.values()).map((d) => ({
      ...d,
      calories: Math.round(d.calories),
      protein: Math.round(d.protein * 10) / 10,
    })));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch food log history' });
  }
});

// ── DELETE /log/:id ───────────────────────────────────────────

router.delete('/:id', async (req, res) => {
  try {
    await pool.execute('DELETE FROM food_log WHERE id = ? AND user_id = ?', [req.params.id, req.userId]);
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
    let query = 'SELECT * FROM food_log WHERE user_id = ? AND log_date = ?';
    const params: unknown[] = [req.userId, fromDate];
    if (meal) { query += ' AND meal = ?'; params.push(meal); }

    const [rows] = await pool.query<RowDataPacket[]>(query, params);
    if (!rows.length) { res.json({ copied: 0 }); return; }

    for (const row of rows) {
      await pool.execute(
        `INSERT INTO food_log
           (user_id, log_date, meal, food_id, serving_size_id, quantity,
            calories, carbs_g, protein_g, fat_g, fiber_g, sodium_mg, notes)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [req.userId, toDate, row.meal, row.food_id, row.serving_size_id, row.quantity,
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
