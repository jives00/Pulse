import { Router } from 'express';
import { pool } from '../config/database';
import { requireAuth } from '../middleware/auth';
import type { RowDataPacket, ResultSetHeader } from 'mysql2';

const router = Router();
router.use(requireAuth);

router.get('/', async (req, res) => {
  const date = String(req.query.date ?? new Date().toISOString().slice(0, 10));

  try {
    const [entries] = await pool.query<RowDataPacket[]>(
      'SELECT * FROM water_log WHERE user_id = ? AND log_date = ? ORDER BY logged_at ASC',
      [req.userId, date]
    );
    const [goalRows] = await pool.query<RowDataPacket[]>(
      'SELECT water_goal_ml FROM user_goals WHERE user_id = ? AND effective_from <= ? ORDER BY effective_from DESC LIMIT 1',
      [req.userId, date]
    );

    const totalMl = entries.reduce((sum, e) => sum + Number(e.amount_ml), 0);
    const goalMl = goalRows[0]?.water_goal_ml ?? 2000;

    res.json({
      date,
      totalMl,
      goalMl,
      entries: entries.map((e) => ({
        id: e.id,
        logDate: date,
        amountMl: Number(e.amount_ml),
        loggedAt: e.logged_at,
      })),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch water log' });
  }
});

router.post('/', async (req, res) => {
  const { date, amountMl } = req.body as { date: string; amountMl: number };

  try {
    const [result] = await pool.execute<ResultSetHeader>(
      'INSERT INTO water_log (user_id, log_date, amount_ml) VALUES (?, ?, ?)',
      [req.userId, date, amountMl]
    );
    res.status(201).json({ id: result.insertId, logDate: date, amountMl, loggedAt: new Date().toISOString() });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to add water entry' });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    await pool.execute('DELETE FROM water_log WHERE id = ? AND user_id = ?', [req.params.id, req.userId]);
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to delete water entry' });
  }
});

export default router;
