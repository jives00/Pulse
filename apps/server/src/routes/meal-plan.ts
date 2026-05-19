import { Router } from 'express';
import { pool } from '../config/database';
import { requireAuth } from '../middleware/auth';
import type { RowDataPacket, ResultSetHeader } from 'mysql2/promise';
import type { MealSlot } from '../types';

const router = Router();
router.use(requireAuth);

const MEALS: MealSlot[] = ['breakfast', 'lunch', 'dinner', 'snack'];

// ── Helpers ──────────────────────────────────────────────────────────────────

function rowToEntry(row: RowDataPacket) {
  return {
    id: row.id,
    type: row.recipe_id ? 'recipe' : 'food',
    name: row.recipe_id ? (row.recipe_name ?? 'Recipe') : (row.food_name ?? 'Food'),
    foodId: row.food_id ?? undefined,
    servingSizeId: row.serving_size_id ?? undefined,
    servingLabel: row.serving_label ?? undefined,
    quantity: row.quantity != null ? Number(row.quantity) : undefined,
    recipeId: row.recipe_id ?? undefined,
    recipeServings: row.recipe_servings != null ? Number(row.recipe_servings) : undefined,
    calories: Math.round(Number(row.calories) * 10) / 10,
    proteinG: Math.round(Number(row.protein_g) * 10) / 10,
    carbsG: Math.round(Number(row.carbs_g) * 10) / 10,
    fatG: Math.round(Number(row.fat_g) * 10) / 10,
    sortOrder: row.sort_order ?? 0,
  };
}

function sumMacros(entries: ReturnType<typeof rowToEntry>[]) {
  return entries.reduce(
    (acc, e) => ({
      calories: acc.calories + e.calories,
      proteinG: acc.proteinG + e.proteinG,
      carbsG: acc.carbsG + e.carbsG,
      fatG: acc.fatG + e.fatG,
    }),
    { calories: 0, proteinG: 0, carbsG: 0, fatG: 0 }
  );
}

function getWeekStart(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  const dow = d.getDay(); // 0=Sun
  const offset = dow === 0 ? -6 : 1 - dow;
  d.setDate(d.getDate() + offset);
  return d.toISOString().slice(0, 10);
}

// ── GET /api/meal-plan?week=YYYY-MM-DD ────────────────────────────────────────
// Returns 7 days of planned entries starting from the Monday of the given week.

router.get('/', async (req, res) => {
  const weekParam = String(req.query.week ?? new Date().toISOString().slice(0, 10));
  const weekStart = getWeekStart(weekParam);

  // Compute end date (Sunday)
  const endDate = new Date(weekStart + 'T00:00:00');
  endDate.setDate(endDate.getDate() + 6);
  const weekEnd = endDate.toISOString().slice(0, 10);

  try {
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT mpe.*,
              f.name AS food_name,
              ss.label AS serving_label,
              r.name AS recipe_name
       FROM meal_plan_entries mpe
       LEFT JOIN foods f ON f.id = mpe.food_id
       LEFT JOIN serving_sizes ss ON ss.id = mpe.serving_size_id
       LEFT JOIN recipes r ON r.id = mpe.recipe_id
       WHERE mpe.user_id = ? AND mpe.plan_date BETWEEN ? AND ?
       ORDER BY mpe.plan_date ASC, mpe.sort_order ASC, mpe.id ASC`,
      [req.userId, weekStart, weekEnd]
    );

    const DOW_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    const days = Array.from({ length: 7 }, (_, i) => {
      const d = new Date(weekStart + 'T00:00:00');
      d.setDate(d.getDate() + i);
      const dateStr = d.toISOString().slice(0, 10);
      const dayRows = rows.filter((r) => {
        const rd = r.plan_date instanceof Date ? r.plan_date.toISOString().slice(0, 10) : String(r.plan_date);
        return rd === dateStr;
      });
      const meals: Record<MealSlot, ReturnType<typeof rowToEntry>[]> = { breakfast: [], lunch: [], dinner: [], snack: [] };
      for (const row of dayRows) meals[row.meal as MealSlot].push(rowToEntry(row));
      const allEntries = Object.values(meals).flat();
      return { date: dateStr, dayLabel: DOW_LABELS[i], meals, totals: sumMacros(allEntries) };
    });

    res.json({ weekStart, days });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch meal plan' });
  }
});

// ── POST /api/meal-plan/entries — add a planned food or recipe ────────────────

router.post('/entries', async (req, res) => {
  const { planDate, meal, foodId, servingSizeId, quantity, recipeId, recipeServings } = req.body;

  if (!planDate || typeof planDate !== 'string') {
    res.status(400).json({ error: 'planDate is required' }); return;
  }
  if (!MEALS.includes(meal)) {
    res.status(400).json({ error: 'Invalid meal slot' }); return;
  }
  if (!foodId && !recipeId) {
    res.status(400).json({ error: 'Either foodId or recipeId is required' }); return;
  }

  try {
    let calories = 0, protein = 0, carbs = 0, fat = 0;

    if (foodId && servingSizeId && quantity) {
      const [foods] = await pool.query<RowDataPacket[]>(
        `SELECT f.calories_per100, f.carbs_per100, f.protein_per100, f.fat_per100, ss.grams
         FROM foods f JOIN serving_sizes ss ON ss.id = ?
         WHERE f.id = ?`,
        [servingSizeId, foodId]
      );
      if (!foods.length) { res.status(404).json({ error: 'Food or serving not found' }); return; }
      const f = foods[0];
      const factor = (Number(f.grams) * Number(quantity)) / 100;
      calories = Math.round(Number(f.calories_per100) * factor * 10) / 10;
      protein  = Math.round(Number(f.protein_per100)  * factor * 10) / 10;
      carbs    = Math.round(Number(f.carbs_per100)    * factor * 10) / 10;
      fat      = Math.round(Number(f.fat_per100)       * factor * 10) / 10;
    } else if (recipeId && recipeServings) {
      const [recipes] = await pool.query<RowDataPacket[]>(
        'SELECT calories, protein_g, carbs_g, fat_g, servings FROM recipes WHERE id = ? AND user_id = ?',
        [recipeId, req.userId]
      );
      if (!recipes.length) { res.status(404).json({ error: 'Recipe not found' }); return; }
      const r = recipes[0];
      const totalServings = Number(r.servings) || 1;
      const factor = Number(recipeServings) / totalServings;
      calories = Math.round(Number(r.calories) * factor * 10) / 10;
      protein  = Math.round(Number(r.protein_g) * factor * 10) / 10;
      carbs    = Math.round(Number(r.carbs_g)   * factor * 10) / 10;
      fat      = Math.round(Number(r.fat_g)      * factor * 10) / 10;
    }

    const [result] = await pool.execute<ResultSetHeader>(
      `INSERT INTO meal_plan_entries
         (user_id, plan_date, meal, food_id, serving_size_id, quantity,
          recipe_id, recipe_servings, calories, protein_g, carbs_g, fat_g)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [req.userId, planDate, meal,
       foodId ?? null, servingSizeId ?? null, quantity ?? null,
       recipeId ?? null, recipeServings ?? null,
       calories, protein, carbs, fat]
    );

    const [entry] = await pool.query<RowDataPacket[]>(
      `SELECT mpe.*, f.name AS food_name, ss.label AS serving_label, r.name AS recipe_name
       FROM meal_plan_entries mpe
       LEFT JOIN foods f ON f.id = mpe.food_id
       LEFT JOIN serving_sizes ss ON ss.id = mpe.serving_size_id
       LEFT JOIN recipes r ON r.id = mpe.recipe_id
       WHERE mpe.id = ?`,
      [result.insertId]
    );

    res.status(201).json(rowToEntry(entry[0]));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to add meal plan entry' });
  }
});

// ── DELETE /api/meal-plan/entries/:id ────────────────────────────────────────

router.delete('/entries/:id', async (req, res) => {
  try {
    await pool.execute(
      'DELETE FROM meal_plan_entries WHERE id = ? AND user_id = ?',
      [req.params.id, req.userId]
    );
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to delete meal plan entry' });
  }
});

// ── GET /api/meal-plan/templates — list templates ─────────────────────────────

router.get('/templates', async (req, res) => {
  try {
    const [rows] = await pool.query<RowDataPacket[]>(
      'SELECT id, name, created_at FROM meal_plan_templates WHERE user_id = ? ORDER BY created_at DESC',
      [req.userId]
    );
    res.json(rows.map((r) => ({
      id: r.id,
      name: r.name,
      createdAt: r.created_at instanceof Date ? r.created_at.toISOString().slice(0, 10) : String(r.created_at),
    })));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch templates' });
  }
});

// ── POST /api/meal-plan/templates — save a week as a named template ───────────

router.post('/templates', async (req, res) => {
  const { name, weekStart: weekParam } = req.body;
  if (typeof name !== 'string' || !name.trim()) {
    res.status(400).json({ error: 'name is required' }); return;
  }

  const weekStart = weekParam ? getWeekStart(weekParam) : getWeekStart(new Date().toISOString().slice(0, 10));
  const endDate = new Date(weekStart + 'T00:00:00');
  endDate.setDate(endDate.getDate() + 6);
  const weekEnd = endDate.toISOString().slice(0, 10);

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const [tmplResult] = await conn.execute<ResultSetHeader>(
      'INSERT INTO meal_plan_templates (user_id, name) VALUES (?, ?)',
      [req.userId, name.trim()]
    );
    const templateId = tmplResult.insertId;

    const [entries] = await conn.query<RowDataPacket[]>(
      `SELECT * FROM meal_plan_entries
       WHERE user_id = ? AND plan_date BETWEEN ? AND ?
       ORDER BY plan_date ASC, sort_order ASC`,
      [req.userId, weekStart, weekEnd]
    );

    if (entries.length) {
      for (const e of entries) {
        const planDate = e.plan_date instanceof Date ? e.plan_date.toISOString().slice(0, 10) : String(e.plan_date);
        const d = new Date(planDate + 'T00:00:00');
        const ws = new Date(weekStart + 'T00:00:00');
        const dayOfWeek = Math.round((d.getTime() - ws.getTime()) / 86400000);

        await conn.execute(
          `INSERT INTO meal_plan_template_items
             (template_id, day_of_week, meal, food_id, serving_size_id, quantity,
              recipe_id, recipe_servings, calories, protein_g, carbs_g, fat_g, sort_order)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [templateId, dayOfWeek, e.meal,
           e.food_id, e.serving_size_id, e.quantity,
           e.recipe_id, e.recipe_servings,
           e.calories, e.protein_g, e.carbs_g, e.fat_g, e.sort_order]
        );
      }
    }

    await conn.commit();
    res.status(201).json({ id: templateId, name: name.trim() });
  } catch (err) {
    await conn.rollback();
    console.error(err);
    res.status(500).json({ error: 'Failed to save template' });
  } finally {
    conn.release();
  }
});

// ── POST /api/meal-plan/templates/:id/apply — apply template to a week ────────

router.post('/templates/:id/apply', async (req, res) => {
  const { weekStart: weekParam } = req.body;
  if (!weekParam) { res.status(400).json({ error: 'weekStart is required' }); return; }
  const weekStart = getWeekStart(weekParam);

  try {
    const [templates] = await pool.query<RowDataPacket[]>(
      'SELECT id FROM meal_plan_templates WHERE id = ? AND user_id = ?',
      [req.params.id, req.userId]
    );
    if (!templates.length) { res.status(404).json({ error: 'Template not found' }); return; }

    const [items] = await pool.query<RowDataPacket[]>(
      'SELECT * FROM meal_plan_template_items WHERE template_id = ? ORDER BY day_of_week ASC, sort_order ASC',
      [req.params.id]
    );

    if (items.length) {
      for (const item of items) {
        const d = new Date(weekStart + 'T00:00:00');
        d.setDate(d.getDate() + Number(item.day_of_week));
        const planDate = d.toISOString().slice(0, 10);

        await pool.execute(
          `INSERT INTO meal_plan_entries
             (user_id, plan_date, meal, food_id, serving_size_id, quantity,
              recipe_id, recipe_servings, calories, protein_g, carbs_g, fat_g, sort_order)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [req.userId, planDate, item.meal,
           item.food_id, item.serving_size_id, item.quantity,
           item.recipe_id, item.recipe_servings,
           item.calories, item.protein_g, item.carbs_g, item.fat_g, item.sort_order]
        );
      }
    }

    res.json({ applied: items.length });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to apply template' });
  }
});

// ── DELETE /api/meal-plan/templates/:id ──────────────────────────────────────

router.delete('/templates/:id', async (req, res) => {
  try {
    await pool.execute(
      'DELETE FROM meal_plan_templates WHERE id = ? AND user_id = ?',
      [req.params.id, req.userId]
    );
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to delete template' });
  }
});

export default router;
