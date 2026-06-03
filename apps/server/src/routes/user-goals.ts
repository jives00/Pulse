import { Router } from 'express';
import { pool } from '../config/database';
import type { RowDataPacket, ResultSetHeader } from 'mysql2/promise';

const router = Router();

const CATEGORY_BY_METRIC: Record<string, string> = {
  exercise_max_weight:       'exercise',
  exercise_max_reps:         'exercise',
  exercise_session_volume:   'exercise',
  exercise_weekly_volume:    'exercise',
  exercise_session_reps:     'exercise',
  exercise_weekly_reps:      'exercise',
  exercise_session_steps:    'exercise',
  exercise_weekly_steps:     'exercise',
  exercise_session_distance: 'exercise',
  exercise_weekly_distance:  'exercise',
  exercise_session_duration: 'exercise',
  exercise_weekly_duration:  'exercise',
  exercise_weekly_sessions:  'exercise',
  daily_steps_avg:           'exercise',
  weekly_steps_total:        'exercise',
  body_measurement:          'body',
  nutrition_daily_avg:       'nutrition',
};

function fmt(r: RowDataPacket) {
  return {
    id:          r.id,
    name:        r.name,
    category:    r.category,
    metricType:  r.metric_type,
    sourceType:  r.source_type,
    sourceId:    r.source_id   ?? null,
    sourceKey:   r.source_key  ?? null,
    sourceName:  r.source_name ?? null,
    targetValue: Number(r.target_value),
    unit:        r.unit,
    targetDate:      r.target_date ? (r.target_date instanceof Date ? r.target_date.toISOString().slice(0, 10) : String(r.target_date).slice(0, 10)) : null,
    sortOrder:       r.sort_order,
    showOnDashboard: Boolean(r.show_on_dashboard),
  };
}

// GET /api/user-goals
router.get('/', async (req, res) => {
  try {
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT ug.*,
         CASE ug.source_type
           WHEN 'exercise' THEN ex.name
           WHEN 'routine'  THEN ro.name
           ELSE NULL
         END AS source_name
       FROM custom_goals ug
       LEFT JOIN exercises ex ON ug.source_type = 'exercise' AND ex.id = ug.source_id
       LEFT JOIN workout_routines  ro ON ug.source_type = 'routine'  AND ro.id = ug.source_id
       WHERE ug.user_id = ?
       ORDER BY ug.category, ug.sort_order, ug.id`,
      [req.userId]
    );
    res.json((rows as RowDataPacket[]).map(fmt));
  } catch (err) { console.error('[user-goals] error:', err); res.status(500).json({ error: 'Server error' }); }
});

// POST /api/user-goals
router.post('/', async (req, res) => {
  const { name, metricType, sourceType, sourceId, sourceKey, targetValue, unit, targetDate, showOnDashboard } = req.body;
  if (!name || !metricType || !sourceType || targetValue == null || !unit) {
    res.status(400).json({ error: 'name, metricType, sourceType, targetValue, unit required' }); return;
  }
  const category = CATEGORY_BY_METRIC[metricType];
  if (!category) { res.status(400).json({ error: 'Unknown metricType' }); return; }

  try {
    const [result] = await pool.query<ResultSetHeader>(
      `INSERT INTO custom_goals (user_id, name, category, metric_type, source_type, source_id, source_key, target_value, unit, target_date, show_on_dashboard)
       VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
      [req.userId, name, category, metricType, sourceType, sourceId ?? null, sourceKey ?? null, targetValue, unit, targetDate ?? null, showOnDashboard ? 1 : 0]
    );
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT ug.*,
         CASE ug.source_type WHEN 'exercise' THEN ex.name WHEN 'routine' THEN ro.name ELSE NULL END AS source_name
       FROM custom_goals ug
       LEFT JOIN exercises ex ON ug.source_type = 'exercise' AND ex.id = ug.source_id
       LEFT JOIN workout_routines  ro ON ug.source_type = 'routine'  AND ro.id = ug.source_id
       WHERE ug.id = ?`,
      [result.insertId]
    );
    res.status(201).json(fmt((rows as RowDataPacket[])[0]));
  } catch (err) { console.error('[user-goals] error:', err); res.status(500).json({ error: 'Server error' }); }
});

// PUT /api/user-goals/:id
router.put('/:id', async (req, res) => {
  const id = Number(req.params.id);
  const { name, metricType, sourceType, sourceId, sourceKey, targetValue, unit, targetDate, sortOrder, showOnDashboard } = req.body;
  const updates: string[] = [];
  const values: unknown[] = [];

  if (name        !== undefined) { updates.push('name=?');         values.push(name); }
  if (metricType  !== undefined) {
    updates.push('metric_type=?'); values.push(metricType);
    const category = CATEGORY_BY_METRIC[metricType];
    if (category) { updates.push('category=?'); values.push(category); }
  }
  if (sourceType  !== undefined) { updates.push('source_type=?');  values.push(sourceType); }
  if (sourceId    !== undefined) { updates.push('source_id=?');    values.push(sourceId ?? null); }
  if (sourceKey   !== undefined) { updates.push('source_key=?');   values.push(sourceKey ?? null); }
  if (targetValue !== undefined) { updates.push('target_value=?'); values.push(targetValue); }
  if (unit        !== undefined) { updates.push('unit=?');         values.push(unit); }
  if (targetDate      !== undefined) { updates.push('target_date=?');      values.push(targetDate ?? null); }
  if (sortOrder       !== undefined) { updates.push('sort_order=?');       values.push(sortOrder); }
  if (showOnDashboard !== undefined) { updates.push('show_on_dashboard=?'); values.push(showOnDashboard ? 1 : 0); }

  if (!updates.length) { res.status(400).json({ error: 'Nothing to update' }); return; }

  try {
    values.push(id, req.userId);
    await pool.query(`UPDATE custom_goals SET ${updates.join(', ')} WHERE id=? AND user_id=?`, values);
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT ug.*,
         CASE ug.source_type WHEN 'exercise' THEN ex.name WHEN 'routine' THEN ro.name ELSE NULL END AS source_name
       FROM custom_goals ug
       LEFT JOIN exercises ex ON ug.source_type = 'exercise' AND ex.id = ug.source_id
       LEFT JOIN workout_routines  ro ON ug.source_type = 'routine'  AND ro.id = ug.source_id
       WHERE ug.id = ? AND ug.user_id = ?`,
      [id, req.userId]
    );
    if (!(rows as RowDataPacket[]).length) { res.status(404).json({ error: 'Not found' }); return; }
    res.json(fmt((rows as RowDataPacket[])[0]));
  } catch (err) { console.error('[user-goals] error:', err); res.status(500).json({ error: 'Server error' }); }
});

// DELETE /api/user-goals/:id
router.delete('/:id', async (req, res) => {
  const id = Number(req.params.id);
  try {
    const [result] = await pool.query<ResultSetHeader>(
      'DELETE FROM custom_goals WHERE id=? AND user_id=?', [id, req.userId]
    );
    if ((result as ResultSetHeader).affectedRows === 0) { res.status(404).json({ error: 'Not found' }); return; }
    res.json({ success: true });
  } catch (err) { console.error('[user-goals] error:', err); res.status(500).json({ error: 'Server error' }); }
});

export default router;
