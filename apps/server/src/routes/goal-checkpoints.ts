import { Router } from 'express';
import { pool } from '../config/database';
import type { RowDataPacket, ResultSetHeader } from 'mysql2/promise';

const router = Router();

function fmt(r: RowDataPacket) {
  return {
    id:          r.id,
    metric:      r.metric,
    targetValue: Number(r.target_value),
    unit:        r.unit,
    targetDate:  String(r.target_date).slice(0, 10),
    notes:       r.notes ?? null,
  };
}

// GET /api/goal-checkpoints
router.get('/', async (req, res) => {
  try {
    const [rows] = await pool.query<RowDataPacket[]>(
      'SELECT * FROM goal_checkpoints WHERE user_id = ? ORDER BY target_date ASC, metric ASC',
      [req.userId]
    );
    res.json((rows as RowDataPacket[]).map(fmt));
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
});

// POST /api/goal-checkpoints
router.post('/', async (req, res) => {
  const { metric, targetValue, unit, targetDate, notes } = req.body;
  if (!metric || targetValue == null || !unit || !targetDate) {
    res.status(400).json({ error: 'metric, targetValue, unit, targetDate required' }); return;
  }
  try {
    const [result] = await pool.query<ResultSetHeader>(
      'INSERT INTO goal_checkpoints (user_id, metric, target_value, unit, target_date, notes) VALUES (?, ?, ?, ?, ?, ?)',
      [req.userId, metric, targetValue, unit, targetDate, notes ?? null]
    );
    const [rows] = await pool.query<RowDataPacket[]>('SELECT * FROM goal_checkpoints WHERE id = ?', [result.insertId]);
    res.status(201).json(fmt((rows as RowDataPacket[])[0]));
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
});

// PUT /api/goal-checkpoints/:id
router.put('/:id', async (req, res) => {
  const id = Number(req.params.id);
  const { metric, targetValue, unit, targetDate, notes } = req.body;
  try {
    await pool.query(
      'UPDATE goal_checkpoints SET metric=?, target_value=?, unit=?, target_date=?, notes=? WHERE id=? AND user_id=?',
      [metric, targetValue, unit, targetDate, notes ?? null, id, req.userId]
    );
    const [rows] = await pool.query<RowDataPacket[]>('SELECT * FROM goal_checkpoints WHERE id=? AND user_id=?', [id, req.userId]);
    if (!(rows as RowDataPacket[]).length) { res.status(404).json({ error: 'Not found' }); return; }
    res.json(fmt((rows as RowDataPacket[])[0]));
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
});

// DELETE /api/goal-checkpoints/:id
router.delete('/:id', async (req, res) => {
  const id = Number(req.params.id);
  try {
    const [result] = await pool.query<ResultSetHeader>(
      'DELETE FROM goal_checkpoints WHERE id=? AND user_id=?', [id, req.userId]
    );
    if ((result as ResultSetHeader).affectedRows === 0) { res.status(404).json({ error: 'Not found' }); return; }
    res.json({ success: true });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
});

export default router;
