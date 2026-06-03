import { Router } from 'express';
import { pool } from '../config/database';
import { requireAuth } from '../middleware/auth';
import { searchFoods, lookupBarcode } from '../services/foodSearch';
import { estimateMacros } from '../services/macroEstimation';
import type { RowDataPacket, ResultSetHeader } from 'mysql2';

const router = Router();
router.use(requireAuth);

// ── Helpers ──────────────────────────────────────────────────

function toFood(row: RowDataPacket, servings: RowDataPacket[]) {
  return {
    id: row.id,
    barcode: row.barcode ?? undefined,
    name: row.name,
    brand: row.brand ?? undefined,
    source: row.source,
    isCustom: Boolean(row.is_custom),
    nutrition: {
      calories: Number(row.calories_per100),
      carbs: Number(row.carbs_per100),
      protein: Number(row.protein_per100),
      fat: Number(row.fat_per100),
      fiber: row.fiber_per100 != null ? Number(row.fiber_per100) : undefined,
      sodium: row.sodium_per100 != null ? Number(row.sodium_per100) : undefined,
    },
    servingSizes: servings.map((s) => ({
      id: s.id,
      label: s.label,
      grams: Number(s.grams),
      isDefault: Boolean(s.is_default),
    })),
  };
}

async function getFoodWithServings(id: number) {
  const [foods] = await pool.query<RowDataPacket[]>('SELECT * FROM foods WHERE id = ?', [id]);
  if (!foods.length) return null;
  const [servings] = await pool.query<RowDataPacket[]>(
    'SELECT * FROM serving_sizes WHERE food_id = ? ORDER BY is_default DESC, id ASC',
    [id]
  );
  return toFood(foods[0], servings);
}

// ── Routes ────────────────────────────────────────────────────

router.get('/search', async (req, res) => {
  try {
    const q = String(req.query.q ?? '').trim();
    const limit = Math.min(Number(req.query.limit ?? 20), 50);
    if (!q) { res.json([]); return; }
    const results = await searchFoods(q, limit);
    res.json(results);
  } catch (err) {
    console.error('[foods] error:', err);
    res.status(500).json({ error: 'Search failed' });
  }
});

router.get('/barcode/:barcode', async (req, res) => {
  try {
    const food = await lookupBarcode(req.params.barcode);
    if (!food) { res.status(404).json({ error: 'Food not found' }); return; }
    res.json(food);
  } catch (err) {
    console.error('[foods] error:', err);
    res.status(500).json({ error: 'Barcode lookup failed' });
  }
});

router.post('/estimate-macros', async (req, res) => {
  try {
    const result = await estimateMacros(req.body);
    res.json(result);
  } catch (err) {
    console.error('[foods] error:', err);
    res.status(500).json({ error: 'Estimation failed' });
  }
});

router.get('/custom', async (req, res) => {
  try {
    const [rows] = await pool.query<RowDataPacket[]>(
      "SELECT * FROM foods WHERE is_custom = 1 AND (source IS NULL OR source != 'quick_log') ORDER BY created_at DESC LIMIT 200"
    );
    const foods = await Promise.all(
      rows.map(async (row) => {
        const [servings] = await pool.query<RowDataPacket[]>(
          'SELECT * FROM serving_sizes WHERE food_id = ? ORDER BY is_default DESC, id ASC',
          [row.id]
        );
        return toFood(row, servings as RowDataPacket[]);
      })
    );
    res.json(foods);
  } catch (err) {
    console.error('[foods] error:', err);
    res.status(500).json({ error: 'Failed to fetch custom foods' });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const food = await getFoodWithServings(Number(req.params.id));
    if (!food) { res.status(404).json({ error: 'Not found' }); return; }
    res.json(food);
  } catch (err) {
    console.error('[foods] error:', err);
    res.status(500).json({ error: 'Failed to fetch food' });
  }
});

router.post('/', async (req, res) => {
  const { barcode, name, brand, nutrition, servingSizes } = req.body;
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [result] = await conn.execute<ResultSetHeader>(
      `INSERT INTO foods (barcode, name, brand, source, calories_per100, carbs_per100,
        protein_per100, fat_per100, fiber_per100, sodium_per100, is_custom)
       VALUES (?, ?, ?, 'custom', ?, ?, ?, ?, ?, ?, 1)`,
      [barcode ?? null, name, brand ?? null,
       nutrition.calories, nutrition.carbs, nutrition.protein, nutrition.fat,
       nutrition.fiber ?? null, nutrition.sodium ?? null]
    );
    const foodId = result.insertId;

    for (const s of servingSizes ?? []) {
      await conn.execute(
        'INSERT INTO serving_sizes (food_id, label, grams, is_default) VALUES (?, ?, ?, ?)',
        [foodId, s.label, s.grams, s.isDefault ? 1 : 0]
      );
    }

    await conn.commit();
    const food = await getFoodWithServings(foodId);
    res.status(201).json(food);
  } catch (err) {
    await conn.rollback();
    console.error('[foods] error:', err);
    res.status(500).json({ error: 'Failed to create food' });
  } finally {
    conn.release();
  }
});

router.put('/:id', async (req, res) => {
  try {
    const [rows] = await pool.query<RowDataPacket[]>(
      'SELECT is_custom FROM foods WHERE id = ?', [req.params.id]
    );
    if (!rows.length) { res.status(404).json({ error: 'Not found' }); return; }
    if (!rows[0].is_custom) { res.status(403).json({ error: 'Cannot edit non-custom food' }); return; }

    const { name, brand, nutrition, barcode } = req.body;
    await pool.execute(
      `UPDATE foods SET name=?, brand=?, barcode=?,
        calories_per100=?, carbs_per100=?, protein_per100=?, fat_per100=?,
        fiber_per100=?, sodium_per100=? WHERE id=?`,
      [name, brand ?? null, barcode ?? null,
       nutrition.calories, nutrition.carbs, nutrition.protein, nutrition.fat,
       nutrition.fiber ?? null, nutrition.sodium ?? null, req.params.id]
    );
    const food = await getFoodWithServings(Number(req.params.id));
    res.json(food);
  } catch (err) {
    console.error('[foods] error:', err);
    res.status(500).json({ error: 'Failed to update food' });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const [inLog] = await pool.query<RowDataPacket[]>(
      'SELECT id FROM food_log WHERE food_id = ? LIMIT 1', [req.params.id]
    );
    if (inLog.length) {
      res.status(409).json({ error: 'Food is used in log entries and cannot be deleted' });
      return;
    }
    await pool.execute('DELETE FROM foods WHERE id = ? AND is_custom = 1', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    console.error('[foods] error:', err);
    res.status(500).json({ error: 'Failed to delete food' });
  }
});

export default router;
