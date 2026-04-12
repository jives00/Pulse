import { Router } from 'express';
import { pool } from '../config/database';
import { requireAuth } from '../middleware/auth';
import type { RowDataPacket, ResultSetHeader } from 'mysql2';

const router = Router();
router.use(requireAuth);

const localDateStr = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Chicago' });

router.get('/', async (req, res) => {
  const date = String(req.query.date ?? localDateStr());

  try {
    const [entries] = await pool.query<RowDataPacket[]>(
      'SELECT * FROM water_log WHERE user_id = ? AND log_date = ? ORDER BY logged_at ASC',
      [req.userId, date]
    );
    const [goalRows] = await pool.query<RowDataPacket[]>(
      'SELECT water_goal_oz FROM user_goals WHERE user_id = ? AND effective_from <= ? ORDER BY effective_from DESC, id DESC LIMIT 1',
      [req.userId, date]
    );

    const totalOz = entries.reduce((sum, e) => sum + Number(e.amount_oz), 0);
    const goalOz = goalRows[0]?.water_goal_oz ?? 64;

    res.json({
      date,
      totalOz,
      goalOz,
      entries: entries.map((e) => ({
        id: e.id,
        logDate: date,
        amountOz: Number(e.amount_oz),
        loggedAt: e.logged_at,
      })),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch water log' });
  }
});

router.post('/', async (req, res) => {
  const { date, amountOz } = req.body as { date: string; amountOz: number };

  try {
    const [result] = await pool.execute<ResultSetHeader>(
      'INSERT INTO water_log (user_id, log_date, amount_oz) VALUES (?, ?, ?)',
      [req.userId, date, amountOz]
    );
    res.status(201).json({ id: result.insertId, logDate: date, amountOz, loggedAt: new Date().toISOString() });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to add water entry' });
  }
});

// GET /api/water/history?start=YYYY-MM-DD&end=YYYY-MM-DD
router.get('/history', async (req, res) => {
  const { start, end } = req.query as { start: string; end: string };
  try {
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT log_date AS date, ROUND(SUM(amount_oz), 1) AS totalOz
       FROM water_log
       WHERE user_id = ? AND log_date BETWEEN ? AND ?
       GROUP BY log_date
       ORDER BY log_date ASC`,
      [req.userId, start, end]
    );
    const [goalRows] = await pool.query<RowDataPacket[]>(
      'SELECT water_goal_oz FROM user_goals WHERE user_id = ? ORDER BY effective_from DESC, id DESC LIMIT 1',
      [req.userId]
    );
    const goalOz = goalRows[0]?.water_goal_oz ?? 64;
    res.json({
      goalOz,
      days: rows.map((r) => ({
        date: r.date instanceof Date ? r.date.toISOString().slice(0, 10) : String(r.date),
        totalOz: Number(r.totalOz),
      })),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch water history' });
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
