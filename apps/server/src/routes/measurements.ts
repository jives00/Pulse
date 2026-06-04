import { Router } from 'express';
import { pool } from '../config/database';
import { syncWeightGurus } from '../services/weightGurusSync';
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

// POST /api/measurements/sync — trigger WeightGurus sync on demand
router.post('/sync', async (req, res) => {
  try {
    const { inserted } = await syncWeightGurus(7);
    res.json({ success: true, inserted });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Sync failed';
    console.error('[measurements/sync] error:', err);
    res.status(500).json({ error: msg });
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
