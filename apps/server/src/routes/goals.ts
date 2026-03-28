import { Router } from 'express';
import { pool } from '../config/database';
import { requireAuth } from '../middleware/auth';
import type { RowDataPacket } from 'mysql2';

const router = Router();
router.use(requireAuth);

function toGoals(row: RowDataPacket) {
  return {
    id: row.id,
    calories: row.calories,
    carbsG: row.carbs_g,
    proteinG: row.protein_g,
    fatG: row.fat_g,
    fiberG: row.fiber_g ?? undefined,
    sodiumMg: row.sodium_mg ?? undefined,
    waterGoalMl: row.water_goal_ml,
    effectiveFrom: row.effective_from instanceof Date
      ? row.effective_from.toISOString().slice(0, 10)
      : String(row.effective_from),
  };
}

router.get('/', async (_req, res) => {
  try {
    const today = new Date().toISOString().slice(0, 10);
    const [rows] = await pool.query<RowDataPacket[]>(
      'SELECT * FROM user_goals WHERE effective_from <= ? ORDER BY effective_from DESC LIMIT 1',
      [today]
    );
    if (!rows.length) { res.status(404).json({ error: 'No goals set' }); return; }
    res.json(toGoals(rows[0]));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch goals' });
  }
});

router.get('/history', async (_req, res) => {
  try {
    const [rows] = await pool.query<RowDataPacket[]>(
      'SELECT * FROM user_goals ORDER BY effective_from DESC'
    );
    res.json(rows.map(toGoals));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch goals history' });
  }
});

router.post('/', async (req, res) => {
  const { calories, carbsG, proteinG, fatG, fiberG, sodiumMg, waterGoalMl } = req.body;
  const today = new Date().toISOString().slice(0, 10);

  try {
    await pool.execute(
      `INSERT INTO user_goals (calories, carbs_g, protein_g, fat_g, fiber_g, sodium_mg, water_goal_ml, effective_from)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [calories, carbsG, proteinG, fatG, fiberG ?? null, sodiumMg ?? null, waterGoalMl ?? 2000, today]
    );
    const [rows] = await pool.query<RowDataPacket[]>(
      'SELECT * FROM user_goals WHERE effective_from <= ? ORDER BY effective_from DESC LIMIT 1',
      [today]
    );
    res.status(201).json(toGoals(rows[0]));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to save goals' });
  }
});

export default router;
