import { Router } from 'express';
import { pool } from '../config/database';
import type { RowDataPacket, ResultSetHeader } from 'mysql2/promise';

const router = Router();

const localDateStr = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Chicago' });

function parseId(param: string): number | null {
  const n = Number(param);
  return Number.isInteger(n) && n > 0 ? n : null;
}

// GET /api/measurements?start=YYYY-MM-DD&end=YYYY-MM-DD
// Returns entries newest first. When start/end omitted, returns all (backward compat).
router.get('/', async (req, res) => {
  const start = typeof req.query.start === 'string' ? req.query.start : null;
  const end = typeof req.query.end === 'string' ? req.query.end : null;
  try {
    const params: unknown[] = [req.userId];
    let dateClause = '';
    if (start && end) { dateClause = ' AND measured_at BETWEEN ? AND ?'; params.push(start, end); }
    else if (start) { dateClause = ' AND measured_at >= ?'; params.push(start); }
    else if (end) { dateClause = ' AND measured_at <= ?'; params.push(end); }

    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT id, metric, value, unit, measured_at, notes, created_at
       FROM body_measurements
       WHERE user_id = ?${dateClause}
       ORDER BY measured_at DESC, created_at DESC`,
      params
    );
    res.json(rows.map((r) => ({
      id: r.id,
      metric: r.metric,
      value: Number(r.value),
      unit: r.unit,
      measuredAt: r.measured_at instanceof Date
        ? r.measured_at.toISOString().slice(0, 10)
        : String(r.measured_at),
      notes: r.notes ?? null,
    })));
  } catch (err) {
    console.error('[measurements] error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/measurements
// Add a new measurement entry
router.post('/', async (req, res) => {
  const { metric, value, unit, measuredAt, notes } = req.body as {
    metric: string; value: number; unit: string; measuredAt?: string; notes?: string;
  };

  if (!metric || value == null || !unit) {
    res.status(400).json({ error: 'metric, value, and unit are required' });
    return;
  }

  const date = measuredAt ?? localDateStr();

  try {
    const [result] = await pool.query<ResultSetHeader>(
      `INSERT INTO body_measurements (user_id, metric, value, unit, measured_at, notes)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [req.userId, metric, value, unit, date, notes ?? null]
    );
    res.status(201).json({
      id: result.insertId,
      metric,
      value: Number(value),
      unit,
      measuredAt: date,
      notes: notes ?? null,
    });
  } catch (err) {
    console.error('[measurements] error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/measurements/goals
router.get('/goals', async (req, res) => {
  try {
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT metric, target_value, unit, target_date, show_on_dashboard
       FROM body_measurement_goals
       WHERE user_id = ?`,
      [req.userId]
    );
    const goals: Record<string, { targetValue: number; unit: string; targetDate: string | null; showOnDashboard: boolean }> = {};
    for (const r of rows) {
      goals[r.metric] = {
        targetValue: Number(r.target_value),
        unit: r.unit,
        targetDate: r.target_date
          ? (r.target_date instanceof Date ? r.target_date.toISOString().slice(0, 10) : String(r.target_date))
          : null,
        showOnDashboard: Boolean(r.show_on_dashboard),
      };
    }
    res.json(goals);
  } catch (err) {
    console.error('[measurements] error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// PUT /api/measurements/goals/:metric
// Upsert a goal for one metric
router.put('/goals/:metric', async (req, res) => {
  const { metric } = req.params;
  const { targetValue, unit, targetDate, showOnDashboard } = req.body as {
    targetValue: number; unit: string; targetDate?: string | null; showOnDashboard?: boolean;
  };

  if (targetValue == null || !unit) {
    res.status(400).json({ error: 'targetValue and unit are required' });
    return;
  }

  try {
    await pool.query(
      `INSERT INTO body_measurement_goals (user_id, metric, target_value, unit, target_date, show_on_dashboard)
       VALUES (?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE target_value = VALUES(target_value), unit = VALUES(unit), target_date = VALUES(target_date), show_on_dashboard = VALUES(show_on_dashboard)`,
      [req.userId, metric, targetValue, unit, targetDate ?? null, showOnDashboard ?? true ? 1 : 0]
    );
    res.json({ metric, targetValue: Number(targetValue), unit, targetDate: targetDate ?? null, showOnDashboard: showOnDashboard ?? true });
  } catch (err) {
    console.error('[measurements] error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// DELETE /api/measurements/goals/:metric
router.delete('/goals/:metric', async (req, res) => {
  const { metric } = req.params;
  try {
    await pool.query(
      'DELETE FROM body_measurement_goals WHERE user_id = ? AND metric = ?',
      [req.userId, metric]
    );
    res.json({ success: true });
  } catch (err) {
    console.error('[measurements] error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// PUT /api/measurements/:id
router.put('/:id', async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) { res.status(400).json({ error: 'Invalid id' }); return; }
  const { value, measuredAt, notes } = req.body as { value: number; measuredAt?: string; notes?: string };
  if (value == null) { res.status(400).json({ error: 'value is required' }); return; }
  const date = measuredAt ?? localDateStr();
  try {
    await pool.query(
      'UPDATE body_measurements SET value = ?, measured_at = ?, notes = ? WHERE id = ? AND user_id = ?',
      [value, date, notes ?? null, id, req.userId]
    );
    const [rows] = await pool.query<RowDataPacket[]>(
      'SELECT id, metric, value, unit, measured_at, notes FROM body_measurements WHERE id = ?',
      [id]
    );
    if (!rows.length) { res.status(404).json({ error: 'Not found' }); return; }
    const r = rows[0];
    res.json({
      id: r.id, metric: r.metric, value: Number(r.value), unit: r.unit,
      measuredAt: r.measured_at instanceof Date ? r.measured_at.toISOString().slice(0, 10) : String(r.measured_at),
      notes: r.notes ?? null,
    });
  } catch (err) {
    console.error('[measurements] error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// DELETE /api/measurements/:id
// Placed after /goals routes so it doesn't shadow them
router.delete('/:id', async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) { res.status(400).json({ error: 'Invalid id' }); return; }

  try {
    await pool.query(
      'DELETE FROM body_measurements WHERE id = ? AND user_id = ?',
      [id, req.userId]
    );
    res.json({ success: true });
  } catch (err) {
    console.error('[measurements] error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

export default router;
