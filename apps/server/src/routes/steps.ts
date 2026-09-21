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
    // log_date is a DATE column, so mysql2 hands back a Date object — String()ing it
    // yields "Fri Aug 14 2026 …" and slice(0,10) then produced "Fri Aug 14", which no
    // client could match against a YYYY-MM-DD key. Same guard the water/history routes use.
    res.json(rows.map((r) => ({
      date:   r.date instanceof Date ? r.date.toISOString().slice(0, 10) : String(r.date).slice(0, 10),
      steps:  r.steps,
      source: r.source,
    })));
  } catch (err) {
    console.error('[steps] error:', err);
    res.status(500).json({ error: 'Failed to fetch steps history' });
  }
});

// POST /api/steps  { date?, steps, source? }
// Single-day write for manual entry. Unconditional overwrite by design — a number the
// user typed in should beat whatever a sync left behind. Automated syncs use /bulk.
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

// POST /api/steps/bulk  { days: [{ date, steps, overwrite? }], source? }
//
// Backfill entrypoint for Health Connect. The client sends a trailing window of
// device-local days, so gaps left by days the app was never opened get filled in
// retroactively. Days are merged with GREATEST rather than overwritten: a sync that
// happens at 8am has only a partial count for the current day, and before this route
// existed that partial silently replaced a complete total. Only the day the client is
// currently living in (`overwrite`) is allowed to move a stored count downward, since
// that one legitimately grows all day.
router.post('/bulk', async (req, res) => {
  const { days, source = 'health_connect' } = req.body;

  if (!Array.isArray(days) || days.length === 0) {
    res.status(400).json({ error: 'days must be a non-empty array' }); return;
  }
  if (days.length > 400) {
    res.status(400).json({ error: 'days may contain at most 400 entries' }); return;
  }

  const rows: { date: string; steps: number; overwrite: boolean }[] = [];
  for (const day of days) {
    const date = String(day?.date ?? '');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      res.status(400).json({ error: `invalid date: ${date}` }); return;
    }
    const count = Number(day?.steps);
    if (!Number.isInteger(count) || count < 0 || count > 200000) {
      res.status(400).json({ error: `steps for ${date} must be an integer between 0 and 200000` }); return;
    }
    rows.push({ date, steps: count, overwrite: Boolean(day?.overwrite) });
  }

  const overwrite = rows.filter((r) => r.overwrite);
  const merge     = rows.filter((r) => !r.overwrite);

  try {
    let written = 0;

    if (overwrite.length > 0) {
      const values = overwrite.map(() => '(?, ?, ?, ?)').join(', ');
      const params = overwrite.flatMap((r) => [req.userId, r.date, r.steps, source]);
      const [result] = await pool.query<ResultSetHeader>(
        `INSERT INTO steps_log (user_id, log_date, steps, source)
         VALUES ${values}
         ON DUPLICATE KEY UPDATE steps = VALUES(steps), source = VALUES(source), logged_at = CURRENT_TIMESTAMP`,
        params
      );
      written += result.affectedRows;
    }

    if (merge.length > 0) {
      const values = merge.map(() => '(?, ?, ?, ?)').join(', ');
      const params = merge.flatMap((r) => [req.userId, r.date, r.steps, source]);
      // Assignment order matters: MySQL evaluates ON DUPLICATE KEY UPDATE left to right,
      // so source/logged_at must compare against the old `steps` before it is reassigned.
      const [result] = await pool.query<ResultSetHeader>(
        `INSERT INTO steps_log (user_id, log_date, steps, source)
         VALUES ${values}
         ON DUPLICATE KEY UPDATE
           source    = IF(VALUES(steps) > steps, VALUES(source), source),
           logged_at = IF(VALUES(steps) > steps, CURRENT_TIMESTAMP, logged_at),
           steps     = GREATEST(steps, VALUES(steps))`,
        params
      );
      written += result.affectedRows;
    }

    console.log(`[steps] bulk sync: ${rows.length} day(s) offered, ${written} row(s) written (${source})`);
    res.status(201).json({ written });
  } catch (err) {
    console.error('[steps] error:', err);
    res.status(500).json({ error: 'Failed to log steps' });
  }
});

export default router;
