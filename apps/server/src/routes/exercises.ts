import { Router } from 'express';
import pool from '../db';
import type { RowDataPacket, ResultSetHeader } from 'mysql2/promise';

const router = Router();

function parseId(param: string): number | null {
  const n = Number(param);
  return Number.isInteger(n) && n > 0 ? n : null;
}

// GET /api/exercises?search=&category=
router.get('/', async (req, res) => {
  const { search, category } = req.query as { search?: string; category?: string };

  const conditions: string[] = [];
  const params: any[] = [];

  if (search) {
    conditions.push('name LIKE ?');
    params.push(`%${search}%`);
  }
  if (category) {
    conditions.push('category = ?');
    params.push(category);
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  try {
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT * FROM exercises ${where} ORDER BY category ASC, name ASC`,
      params
    );
    res.json(rows.map((r) => ({
      id: r.id,
      name: r.name,
      category: r.category,
      exerciseType: r.exercise_type,
      musclesPrimary: r.muscles_primary ?? [],
      musclesSecondary: r.muscles_secondary ?? [],
      isCustom: Boolean(r.is_custom),
    })));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/exercises/categories — distinct category list
router.get('/categories', async (_req, res) => {
  try {
    const [rows] = await pool.query<RowDataPacket[]>(
      'SELECT DISTINCT category FROM exercises WHERE is_custom = 0 ORDER BY category ASC'
    );
    res.json(rows.map((r) => r.category));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/exercises — create custom exercise
router.post('/', async (req, res) => {
  const { name, category, exerciseType } = req.body as {
    name: string;
    category: string;
    exerciseType: string;
  };
  if (!name?.trim() || !category?.trim() || !exerciseType) {
    res.status(400).json({ error: 'name, category, and exerciseType required' });
    return;
  }
  try {
    const [result] = await pool.query<ResultSetHeader>(
      `INSERT INTO exercises (name, category, exercise_type, muscles_primary, muscles_secondary, is_custom)
       VALUES (?, ?, ?, '[]', '[]', 1)`,
      [name.trim(), category.trim(), exerciseType]
    );
    res.status(201).json({
      id: result.insertId,
      name: name.trim(),
      category: category.trim(),
      exerciseType,
      musclesPrimary: [],
      musclesSecondary: [],
      isCustom: true,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// DELETE /api/exercises/:id — delete custom exercise (only custom ones)
router.delete('/:id', async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) { res.status(400).json({ error: 'Invalid id' }); return; }
  try {
    const [result] = await pool.query<ResultSetHeader>(
      'DELETE FROM exercises WHERE id = ? AND is_custom = 1',
      [id]
    );
    if (result.affectedRows === 0) {
      res.status(404).json({ error: 'Custom exercise not found' });
      return;
    }
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

export default router;
