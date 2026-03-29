import { Router } from 'express';
import { pool } from '../config/database';
import { requireAuth } from '../middleware/auth';
import type { RowDataPacket, ResultSetHeader } from 'mysql2';
import type { MealSlot } from '../types';

const router = Router();
router.use(requireAuth);

async function getTemplate(id: number, userId: number) {
  const [tmpl] = await pool.query<RowDataPacket[]>(
    'SELECT * FROM meal_templates WHERE id = ? AND user_id = ?', [id, userId]
  );
  if (!tmpl.length) return null;

  const [items] = await pool.query<RowDataPacket[]>(
    `SELECT mti.*,
            f.name AS food_name, f.brand, f.source, f.is_custom,
            f.calories_per100, f.carbs_per100, f.protein_per100, f.fat_per100,
            f.fiber_per100, f.sodium_per100,
            ss.label AS serving_label, ss.grams AS serving_grams
     FROM meal_template_items mti
     JOIN foods f ON f.id = mti.food_id
     JOIN serving_sizes ss ON ss.id = mti.serving_size_id
     WHERE mti.template_id = ?
     ORDER BY mti.sort_order ASC, mti.id ASC`,
    [id]
  );

  let calTotal = 0, carbTotal = 0, protTotal = 0, fatTotal = 0;
  const mappedItems = items.map((r) => {
    const factor = (Number(r.serving_grams) * Number(r.quantity)) / 100;
    const cal = Number(r.calories_per100) * factor;
    calTotal  += cal;
    carbTotal += Number(r.carbs_per100)   * factor;
    protTotal += Number(r.protein_per100) * factor;
    fatTotal  += Number(r.fat_per100)     * factor;

    return {
      id: r.id,
      food: {
        id: r.food_id,
        name: r.food_name,
        brand: r.brand ?? undefined,
        source: r.source,
        isCustom: Boolean(r.is_custom),
        nutrition: {
          calories: Number(r.calories_per100),
          carbs: Number(r.carbs_per100),
          protein: Number(r.protein_per100),
          fat: Number(r.fat_per100),
        },
        servingSizes: [],
      },
      servingSize: { id: r.serving_size_id, label: r.serving_label, grams: Number(r.serving_grams), isDefault: false },
      quantity: Number(r.quantity),
      sortOrder: r.sort_order,
    };
  });

  return {
    id: tmpl[0].id,
    name: tmpl[0].name,
    createdAt: tmpl[0].created_at,
    items: mappedItems,
    nutritionTotals: {
      calories: Math.round(calTotal),
      carbs:    Math.round(carbTotal * 10) / 10,
      protein:  Math.round(protTotal * 10) / 10,
      fat:      Math.round(fatTotal  * 10) / 10,
    },
  };
}

router.get('/', async (req, res) => {
  try {
    const [rows] = await pool.query<RowDataPacket[]>(
      'SELECT * FROM meal_templates WHERE user_id = ? ORDER BY name ASC',
      [req.userId]
    );
    const templates = await Promise.all(rows.map((r) => getTemplate(r.id, req.userId)));
    res.json(templates.filter(Boolean));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch templates' });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const tmpl = await getTemplate(Number(req.params.id), req.userId);
    if (!tmpl) { res.status(404).json({ error: 'Not found' }); return; }
    res.json(tmpl);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch template' });
  }
});

router.post('/', async (req, res) => {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const { name, items, fromDate, meal } = req.body as {
      name: string;
      items?: Array<{ foodId: number; servingSizeId: number; quantity: number; sortOrder?: number }>;
      fromDate?: string;
      meal?: MealSlot;
    };

    const [tmplResult] = await conn.execute<ResultSetHeader>(
      'INSERT INTO meal_templates (user_id, name) VALUES (?, ?)', [req.userId, name]
    );
    const templateId = tmplResult.insertId;

    // Create from logged meal
    if (fromDate && meal) {
      const [logRows] = await conn.query<RowDataPacket[]>(
        'SELECT * FROM food_log WHERE user_id = ? AND log_date = ? AND meal = ? ORDER BY logged_at ASC',
        [req.userId, fromDate, meal]
      );
      for (let i = 0; i < logRows.length; i++) {
        const r = logRows[i];
        await conn.execute(
          'INSERT INTO meal_template_items (template_id, food_id, serving_size_id, quantity, sort_order) VALUES (?, ?, ?, ?, ?)',
          [templateId, r.food_id, r.serving_size_id, r.quantity, i]
        );
      }
    } else if (items?.length) {
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        await conn.execute(
          'INSERT INTO meal_template_items (template_id, food_id, serving_size_id, quantity, sort_order) VALUES (?, ?, ?, ?, ?)',
          [templateId, item.foodId, item.servingSizeId, item.quantity, item.sortOrder ?? i]
        );
      }
    }

    await conn.commit();
    const tmpl = await getTemplate(templateId, req.userId);
    res.status(201).json(tmpl);
  } catch (err) {
    await conn.rollback();
    console.error(err);
    res.status(500).json({ error: 'Failed to create template' });
  } finally {
    conn.release();
  }
});

router.put('/:id', async (req, res) => {
  try {
    await pool.execute('UPDATE meal_templates SET name = ? WHERE id = ? AND user_id = ?', [req.body.name, req.params.id, req.userId]);
    const tmpl = await getTemplate(Number(req.params.id), req.userId);
    if (!tmpl) { res.status(404).json({ error: 'Not found' }); return; }
    res.json(tmpl);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to rename template' });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    await pool.execute('DELETE FROM meal_templates WHERE id = ? AND user_id = ?', [req.params.id, req.userId]);
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to delete template' });
  }
});

router.post('/:id/log', async (req, res) => {
  const { logDate, meal } = req.body as { logDate: string; meal: MealSlot };

  try {
    const [items] = await pool.query<RowDataPacket[]>(
      `SELECT mti.*, f.calories_per100, f.carbs_per100, f.protein_per100, f.fat_per100,
              f.fiber_per100, f.sodium_per100, ss.grams
       FROM meal_template_items mti
       JOIN foods f ON f.id = mti.food_id
       JOIN serving_sizes ss ON ss.id = mti.serving_size_id
       WHERE mti.template_id = ?`,
      [req.params.id]
    );

    if (!items.length) { res.json({ logged: 0 }); return; }

    for (const item of items) {
      const factor = (Number(item.grams) * Number(item.quantity)) / 100;
      const cal  = Math.round(Number(item.calories_per100) * factor * 10) / 10;
      const carb = Math.round(Number(item.carbs_per100)    * factor * 10) / 10;
      const prot = Math.round(Number(item.protein_per100)  * factor * 10) / 10;
      const fat  = Math.round(Number(item.fat_per100)      * factor * 10) / 10;

      await pool.execute(
        `INSERT INTO food_log (user_id, log_date, meal, food_id, serving_size_id, quantity,
          calories, carbs_g, protein_g, fat_g, fiber_g, sodium_mg)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [req.userId, logDate, meal, item.food_id, item.serving_size_id, item.quantity,
         cal, carb, prot, fat,
         item.fiber_per100  != null ? Math.round(Number(item.fiber_per100)  * factor * 10) / 10 : null,
         item.sodium_per100 != null ? Math.round(Number(item.sodium_per100) * factor * 10) / 10 : null]
      );
    }

    res.json({ logged: items.length });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to log template' });
  }
});

export default router;
