import { Router } from 'express';
import { pool } from '../config/database';
import { requireAuth } from '../middleware/auth';
import type { RowDataPacket, ResultSetHeader } from 'mysql2/promise';
import { localDateStr } from '../utils/routes';

const router = Router();
router.use(requireAuth);

// GET /api/steps?date=YYYY-MM-DD  (defaults to today)
router.get('/', async (req, res) => {
  const date = String(req.query.date ?? localDateStr());
  try {
    const [rows] = await pool.query<RowDataPacket[]>(
      'SELECT steps, source, log_date FROM steps_log WHERE user_id = ? AND log_date = ?',
      [req.userId, date]
    );
    if (rows.length === 0) {
      res.json({ date, steps: null });
    } else {
      res.json({ date, steps: rows[0].steps, source: rows[0].source });
    }
  } catch (err) {
    console.error('[steps] error:', err);
    res.status(500).json({ error: 'Failed to fetch steps' });
  }
});

// GET /api/steps/history?days=30
router.get('/history', async (req, res) => {
  const days = Math.min(Number(req.query.days ?? 30), 365);
  try {
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT log_date AS date, steps, source
       FROM steps_log
       WHERE user_id = ? AND log_date >= DATE_SUB(CURDATE(), INTERVAL ? DAY)
       ORDER BY log_date ASC`,
      [req.userId, days]
    );
    res.json(rows.map((r) => ({ date: String(r.date).slice(0, 10), steps: r.steps, source: r.source })));
  } catch (err) {
    console.error('[steps] error:', err);
    res.status(500).json({ error: 'Failed to fetch steps history' });
  }
});

// POST /api/steps  { date?, steps, source? }
router.post('/', async (req, res) => {
  const { steps, source = 'manual' } = req.body;
  const date = req.body.date ?? localDateStr();

  const count = Number(steps);
  if (!Number.isInteger(count) || count < 0 || count > 200000) {
    res.status(400).json({ error: 'steps must be an integer between 0 and 200000' }); return;
  }

  try {
    await pool.execute(
      `INSERT INTO steps_log (user_id, log_date, steps, source)
       VALUES (?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE steps = VALUES(steps), source = VALUES(source), logged_at = CURRENT_TIMESTAMP`,
      [req.userId, date, count, source]
    );
    console.log(`[steps] synced ${count.toLocaleString()} steps on ${date} (${source})`);
    res.status(201).json({ date, steps: count, source });
  } catch (err) {
    console.error('[steps] error:', err);
    res.status(500).json({ error: 'Failed to log steps' });
  }
});

export default router;
