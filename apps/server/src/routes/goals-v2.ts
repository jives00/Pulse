import { Router } from 'express';
import { pool } from '../config/database';
import type { RowDataPacket, ResultSetHeader } from 'mysql2/promise';

const router = Router();

// ─── Formatters ───────────────────────────────────────────────────────────────

function fmtGoal(r: RowDataPacket) {
  return {
    id:                 r.id,
    catalogKey:         r.catalog_key,
    name:               r.name,
    category:           r.category,
    cardType:           r.card_type,
    sourceType:         r.source_type   ?? null,
    sourceId:           r.source_id     ?? null,
    sourceName:         r.source_name   ?? null,
    startValue:         r.start_value   != null ? Number(r.start_value) : null,
    targetValue:        Number(r.target_value),
    unit:               r.unit,
    startedAt:          r.started_at instanceof Date ? r.started_at.toISOString().slice(0, 10) : String(r.started_at).slice(0, 10),
    deadline:           r.deadline ? (r.deadline instanceof Date ? r.deadline.toISOString().slice(0, 10) : String(r.deadline).slice(0, 10)) : null,
    showOnDashboard:    Boolean(r.show_on_dashboard),
    sortOrder:          r.sort_order,
    status:             r.status,
    closedAt:           r.closed_at ?? null,
    actualValueAtClose: r.actual_value_at_close != null ? Number(r.actual_value_at_close) : null,
    notes:              r.notes ?? null,
  };
}

function fmtMilestone(r: RowDataPacket) {
  return {
    id:                 r.id,
    goalId:             r.goal_id,
    targetValue:        Number(r.target_value),
    targetDate:         r.target_date instanceof Date ? r.target_date.toISOString().slice(0, 10) : String(r.target_date).slice(0, 10),
    label:              r.label ?? null,
    status:             r.status,
    closedAt:           r.closed_at ?? null,
    actualValueAtClose: r.actual_value_at_close != null ? Number(r.actual_value_at_close) : null,
    notes:              r.notes ?? null,
  };
}

function fmtProgress(r: RowDataPacket) {
  return {
    id:       r.id,
    goalId:   r.goal_id,
    value:    Number(r.value),
    loggedAt: r.logged_at instanceof Date ? r.logged_at.toISOString() : String(r.logged_at),
    source:   r.source,
    notes:    r.notes ?? null,
  };
}

// ─── Goals ────────────────────────────────────────────────────────────────────

// Shared CASE WHEN expression for computing currentValue from the authoritative source.
// Used in both GET / (list) and PATCH /:id (post-update re-fetch) so they stay in sync.
const CURRENT_VALUE_SQL = `CASE g.catalog_key
           WHEN 'body_weight'      THEN (SELECT bm.value FROM body_measurements bm WHERE bm.user_id = g.user_id AND bm.metric = 'weight'      ORDER BY bm.measured_at DESC LIMIT 1)
           WHEN 'body_waist'       THEN (SELECT bm.value FROM body_measurements bm WHERE bm.user_id = g.user_id AND bm.metric = 'waist'       ORDER BY bm.measured_at DESC LIMIT 1)
           WHEN 'body_bicep'       THEN (SELECT bm.value FROM body_measurements bm WHERE bm.user_id = g.user_id AND bm.metric = 'bicep'       ORDER BY bm.measured_at DESC LIMIT 1)
           WHEN 'body_chest'       THEN (SELECT bm.value FROM body_measurements bm WHERE bm.user_id = g.user_id AND bm.metric = 'chest'       ORDER BY bm.measured_at DESC LIMIT 1)
           WHEN 'body_hips'        THEN (SELECT bm.value FROM body_measurements bm WHERE bm.user_id = g.user_id AND bm.metric = 'hips'        ORDER BY bm.measured_at DESC LIMIT 1)
           WHEN 'body_fat_pct'     THEN (SELECT bm.value FROM body_measurements bm WHERE bm.user_id = g.user_id AND bm.metric = 'body_fat'    ORDER BY bm.measured_at DESC LIMIT 1)
           WHEN 'body_muscle_mass' THEN (SELECT bm.value FROM body_measurements bm WHERE bm.user_id = g.user_id AND bm.metric = 'muscle_mass' ORDER BY bm.measured_at DESC LIMIT 1)
           WHEN 'body_water_pct'   THEN (SELECT bm.value FROM body_measurements bm WHERE bm.user_id = g.user_id AND bm.metric = 'water_pct'   ORDER BY bm.measured_at DESC LIMIT 1)
           WHEN 'nutrition_calories_daily_avg' THEN (SELECT AVG(d.cal)  FROM (SELECT SUM(calories)   AS cal  FROM food_log WHERE user_id = g.user_id AND log_date >= DATE_SUB(CURDATE(), INTERVAL 30 DAY) GROUP BY log_date) d)
           WHEN 'nutrition_protein_daily_avg'  THEN (SELECT AVG(d.pro)  FROM (SELECT SUM(protein_g)  AS pro  FROM food_log WHERE user_id = g.user_id AND log_date >= DATE_SUB(CURDATE(), INTERVAL 30 DAY) GROUP BY log_date) d)
           WHEN 'nutrition_carbs_daily_avg'    THEN (SELECT AVG(d.carb) FROM (SELECT SUM(carbs_g)    AS carb FROM food_log WHERE user_id = g.user_id AND log_date >= DATE_SUB(CURDATE(), INTERVAL 30 DAY) GROUP BY log_date) d)
           WHEN 'nutrition_fat_daily_avg'      THEN (SELECT AVG(d.fat)  FROM (SELECT SUM(fat_g)      AS fat  FROM food_log WHERE user_id = g.user_id AND log_date >= DATE_SUB(CURDATE(), INTERVAL 30 DAY) GROUP BY log_date) d)
           WHEN 'activity_steps_daily_avg'     THEN (SELECT AVG(sl.steps) FROM steps_log sl WHERE sl.user_id = g.user_id AND sl.log_date >= DATE_SUB(CURDATE(), INTERVAL 30 DAY))
           WHEN 'exercise_workouts_per_week'   THEN (SELECT COUNT(*) FROM workout_logs wl WHERE wl.user_id = g.user_id AND wl.workout_date >= DATE_SUB(CURDATE(), INTERVAL WEEKDAY(CURDATE()) DAY) AND wl.completed = 1)
           WHEN 'exercise_minutes_per_week'    THEN (SELECT SUM(wl.duration_minutes) / 4.0 FROM workout_logs wl WHERE wl.user_id = g.user_id AND wl.workout_date >= DATE_SUB(CURDATE(), INTERVAL 28 DAY) AND wl.completed = 1)
           WHEN 'exercise_volume_per_week'     THEN (SELECT SUM(es.reps * es.weight_kg * 2.20462) / 4.0 FROM exercise_sets es JOIN workout_exercises we ON we.id = es.workout_exercise_id JOIN workout_logs wl ON wl.id = we.workout_log_id WHERE wl.user_id = g.user_id AND wl.workout_date >= DATE_SUB(CURDATE(), INTERVAL 28 DAY) AND wl.completed = 1)
           WHEN 'exercise_routine_sessions'    THEN (SELECT COUNT(*) FROM workout_logs wl WHERE wl.user_id = g.user_id AND wl.routine_id = g.source_id AND wl.workout_date >= DATE_SUB(CURDATE(), INTERVAL WEEKDAY(CURDATE()) DAY) AND wl.completed = 1)
           WHEN 'exercise_max_weight'          THEN (SELECT MAX(es.weight_kg * 2.20462) FROM exercise_sets es JOIN workout_exercises we ON we.id = es.workout_exercise_id JOIN workout_logs wl ON wl.id = we.workout_log_id WHERE wl.user_id = g.user_id AND we.exercise_id = g.source_id)
           WHEN 'exercise_weekly_volume_lift'  THEN (SELECT SUM(es.reps * es.weight_kg * 2.20462) / 4.0 FROM exercise_sets es JOIN workout_exercises we ON we.id = es.workout_exercise_id JOIN workout_logs wl ON wl.id = we.workout_log_id WHERE wl.user_id = g.user_id AND we.exercise_id = g.source_id AND wl.workout_date >= DATE_SUB(CURDATE(), INTERVAL 28 DAY))
           ELSE (SELECT p.value FROM goal_progress p WHERE p.goal_id = g.id ORDER BY p.logged_at DESC LIMIT 1)
         END`;

// GET /api/goals-v2?status=active|achieved|missed|abandoned
// Returns all goals with currentValue pulled from the authoritative source table per catalog_key.
// Body goals → body_measurements; nutrition → food_log avg; steps → steps_log avg;
// exercise → workout_logs; everything else → goal_progress (manual log).
router.get('/', async (req, res) => {
  const status = (req.query.status as string) || 'active';
  try {
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT g.*, ${CURRENT_VALUE_SQL} AS current_value
       FROM goals g
       WHERE g.user_id = ? AND g.status = ?
       ORDER BY g.category, g.sort_order, g.id`,
      [req.userId, status]
    );
    res.json((rows as RowDataPacket[]).map(r => ({
      ...fmtGoal(r),
      currentValue: r.current_value != null ? Math.round(Number(r.current_value) * 10) / 10 : null,
    })));
  } catch (err) { console.error('[goals-v2] GET /', err); res.status(500).json({ error: 'Server error' }); }
});

// GET /api/goals-v2/nudges
// Goals where deadline has passed OR show_on_dashboard=true (frontend handles target-crossed nudge)
// Must be registered BEFORE /:id to avoid "nudges" being treated as an id
router.get('/nudges', async (req, res) => {
  try {
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT * FROM goals
       WHERE user_id = ? AND status = 'active' AND deadline IS NOT NULL AND deadline <= CURDATE()
       ORDER BY deadline ASC`,
      [req.userId]
    );
    res.json((rows as RowDataPacket[]).map(fmtGoal));
  } catch (err) { console.error('[goals-v2] GET /nudges', err); res.status(500).json({ error: 'Server error' }); }
});

// GET /api/goals-v2/:id — single goal with milestones and recent progress
router.get('/:id', async (req, res) => {
  const id = Number(req.params.id);
  try {
    const [[goals], [milestones], [progress]] = await Promise.all([
      pool.query<RowDataPacket[]>('SELECT * FROM goals WHERE id = ? AND user_id = ?', [id, req.userId]),
      pool.query<RowDataPacket[]>('SELECT * FROM goal_milestones WHERE goal_id = ? ORDER BY target_date ASC', [id]),
      pool.query<RowDataPacket[]>('SELECT * FROM goal_progress WHERE goal_id = ? ORDER BY logged_at DESC LIMIT 50', [id]),
    ]);
    if (!(goals as RowDataPacket[]).length) { res.status(404).json({ error: 'Not found' }); return; }
    res.json({
      ...fmtGoal((goals as RowDataPacket[])[0]),
      milestones: (milestones as RowDataPacket[]).map(fmtMilestone),
      progress:   (progress  as RowDataPacket[]).map(fmtProgress),
    });
  } catch (err) { console.error('[goals-v2] GET /:id', err); res.status(500).json({ error: 'Server error' }); }
});

// POST /api/goals-v2
router.post('/', async (req, res) => {
  const {
    catalogKey, name, category, cardType,
    sourceType, sourceId, sourceName,
    startValue, targetValue, unit,
    startedAt, deadline, showOnDashboard, sortOrder, notes,
  } = req.body;

  if (!catalogKey || !name || !category || !cardType || targetValue == null || !unit || !startedAt) {
    res.status(400).json({ error: 'catalogKey, name, category, cardType, targetValue, unit, startedAt required' });
    return;
  }

  try {
    const [result] = await pool.query<ResultSetHeader>(
      `INSERT INTO goals
         (user_id, catalog_key, name, category, card_type, source_type, source_id, source_name,
          start_value, target_value, unit, started_at, deadline, show_on_dashboard, sort_order, notes)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [
        req.userId, catalogKey, name, category, cardType,
        sourceType ?? null, sourceId ?? null, sourceName ?? null,
        startValue ?? null, targetValue, unit,
        startedAt, deadline ?? null, showOnDashboard ? 1 : 0, sortOrder ?? 0, notes ?? null,
      ]
    );
    const [rows] = await pool.query<RowDataPacket[]>('SELECT * FROM goals WHERE id = ?', [result.insertId]);
    res.status(201).json(fmtGoal((rows as RowDataPacket[])[0]));
  } catch (err) { console.error('[goals-v2] POST /', err); res.status(500).json({ error: 'Server error' }); }
});

// PATCH /api/goals-v2/:id
router.patch('/:id', async (req, res) => {
  const id = Number(req.params.id);
  const { name, targetValue, unit, deadline, showOnDashboard, sortOrder, sourceName, notes } = req.body;

  const updates: string[] = [];
  const values: unknown[] = [];

  if (name            !== undefined) { updates.push('name=?');              values.push(name); }
  if (targetValue     !== undefined) { updates.push('target_value=?');      values.push(targetValue); }
  if (unit            !== undefined) { updates.push('unit=?');              values.push(unit); }
  if (deadline        !== undefined) { updates.push('deadline=?');          values.push(deadline ?? null); }
  if (showOnDashboard !== undefined) { updates.push('show_on_dashboard=?'); values.push(showOnDashboard ? 1 : 0); }
  if (sortOrder       !== undefined) { updates.push('sort_order=?');        values.push(sortOrder); }
  if (sourceName      !== undefined) { updates.push('source_name=?');       values.push(sourceName ?? null); }
  if (notes           !== undefined) { updates.push('notes=?');             values.push(notes ?? null); }

  if (!updates.length) { res.status(400).json({ error: 'Nothing to update' }); return; }

  try {
    values.push(id, req.userId);
    await pool.query(`UPDATE goals SET ${updates.join(', ')} WHERE id=? AND user_id=?`, values);
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT g.*, ${CURRENT_VALUE_SQL} AS current_value FROM goals g WHERE g.id=? AND g.user_id=?`,
      [id, req.userId]
    );
    if (!(rows as RowDataPacket[]).length) { res.status(404).json({ error: 'Not found' }); return; }
    const r = (rows as RowDataPacket[])[0];
    res.json({ ...fmtGoal(r), currentValue: r.current_value != null ? Math.round(Number(r.current_value) * 10) / 10 : null });
  } catch (err) { console.error('[goals-v2] PATCH /:id', err); res.status(500).json({ error: 'Server error' }); }
});

// POST /api/goals-v2/:id/close
router.post('/:id/close', async (req, res) => {
  const id = Number(req.params.id);
  const { status, actualValueAtClose } = req.body;
  if (!['achieved', 'missed', 'abandoned'].includes(status)) {
    res.status(400).json({ error: 'status must be achieved, missed, or abandoned' }); return;
  }
  try {
    const [result] = await pool.query<ResultSetHeader>(
      `UPDATE goals SET status=?, closed_at=NOW(), actual_value_at_close=? WHERE id=? AND user_id=? AND status='active'`,
      [status, actualValueAtClose ?? null, id, req.userId]
    );
    if ((result as ResultSetHeader).affectedRows === 0) { res.status(404).json({ error: 'Not found or already closed' }); return; }
    const [rows] = await pool.query<RowDataPacket[]>('SELECT * FROM goals WHERE id=?', [id]);
    res.json(fmtGoal((rows as RowDataPacket[])[0]));
  } catch (err) { console.error('[goals-v2] POST /:id/close', err); res.status(500).json({ error: 'Server error' }); }
});

// DELETE /api/goals-v2/:id
router.delete('/:id', async (req, res) => {
  const id = Number(req.params.id);
  try {
    const [result] = await pool.query<ResultSetHeader>(
      'DELETE FROM goals WHERE id=? AND user_id=?', [id, req.userId]
    );
    if ((result as ResultSetHeader).affectedRows === 0) { res.status(404).json({ error: 'Not found' }); return; }
    res.json({ success: true });
  } catch (err) { console.error('[goals-v2] DELETE /:id', err); res.status(500).json({ error: 'Server error' }); }
});

// ─── Milestones ───────────────────────────────────────────────────────────────

// GET /api/goals-v2/:id/milestones
router.get('/:id/milestones', async (req, res) => {
  const goalId = Number(req.params.id);
  try {
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT m.* FROM goal_milestones m
       INNER JOIN goals g ON g.id = m.goal_id
       WHERE m.goal_id = ? AND g.user_id = ?
       ORDER BY m.target_date ASC`,
      [goalId, req.userId]
    );
    res.json((rows as RowDataPacket[]).map(fmtMilestone));
  } catch (err) { console.error('[goals-v2] GET /:id/milestones', err); res.status(500).json({ error: 'Server error' }); }
});

// POST /api/goals-v2/:id/milestones
router.post('/:id/milestones', async (req, res) => {
  const goalId = Number(req.params.id);
  const { targetValue, targetDate, label, notes } = req.body;
  if (targetValue == null || !targetDate) {
    res.status(400).json({ error: 'targetValue and targetDate required' }); return;
  }
  try {
    const [goals] = await pool.query<RowDataPacket[]>('SELECT id FROM goals WHERE id=? AND user_id=?', [goalId, req.userId]);
    if (!(goals as RowDataPacket[]).length) { res.status(404).json({ error: 'Goal not found' }); return; }

    const [result] = await pool.query<ResultSetHeader>(
      `INSERT INTO goal_milestones (goal_id, user_id, target_value, target_date, label, notes)
       VALUES (?,?,?,?,?,?)`,
      [goalId, req.userId, targetValue, targetDate, label ?? null, notes ?? null]
    );
    const [rows] = await pool.query<RowDataPacket[]>('SELECT * FROM goal_milestones WHERE id=?', [result.insertId]);
    res.status(201).json(fmtMilestone((rows as RowDataPacket[])[0]));
  } catch (err) { console.error('[goals-v2] POST /:id/milestones', err); res.status(500).json({ error: 'Server error' }); }
});

// PATCH /api/goals-v2/:id/milestones/:mid
router.patch('/:id/milestones/:mid', async (req, res) => {
  const goalId = Number(req.params.id);
  const mid = Number(req.params.mid);
  const { targetValue, targetDate, label, status, actualValueAtClose, notes } = req.body;

  const updates: string[] = [];
  const values: unknown[] = [];

  if (targetValue         !== undefined) { updates.push('target_value=?');          values.push(targetValue); }
  if (targetDate          !== undefined) { updates.push('target_date=?');            values.push(targetDate); }
  if (label               !== undefined) { updates.push('label=?');                  values.push(label ?? null); }
  if (notes               !== undefined) { updates.push('notes=?');                  values.push(notes ?? null); }
  if (status              !== undefined) { updates.push('status=?');                 values.push(status); }
  if (actualValueAtClose  !== undefined) { updates.push('actual_value_at_close=?');  values.push(actualValueAtClose ?? null); }
  if (status && status !== 'active')     { updates.push('closed_at=NOW()'); }

  if (!updates.length) { res.status(400).json({ error: 'Nothing to update' }); return; }

  try {
    values.push(mid, goalId, req.userId);
    await pool.query(
      `UPDATE goal_milestones m
       INNER JOIN goals g ON g.id = m.goal_id
       SET ${updates.join(', ')}
       WHERE m.id=? AND m.goal_id=? AND g.user_id=?`,
      values
    );
    const [rows] = await pool.query<RowDataPacket[]>('SELECT * FROM goal_milestones WHERE id=?', [mid]);
    if (!(rows as RowDataPacket[]).length) { res.status(404).json({ error: 'Not found' }); return; }
    res.json(fmtMilestone((rows as RowDataPacket[])[0]));
  } catch (err) { console.error('[goals-v2] PATCH /:id/milestones/:mid', err); res.status(500).json({ error: 'Server error' }); }
});

// DELETE /api/goals-v2/:id/milestones/:mid
router.delete('/:id/milestones/:mid', async (req, res) => {
  const goalId = Number(req.params.id);
  const mid = Number(req.params.mid);
  try {
    const [result] = await pool.query<ResultSetHeader>(
      `DELETE m FROM goal_milestones m
       INNER JOIN goals g ON g.id = m.goal_id
       WHERE m.id=? AND m.goal_id=? AND g.user_id=?`,
      [mid, goalId, req.userId]
    );
    if ((result as ResultSetHeader).affectedRows === 0) { res.status(404).json({ error: 'Not found' }); return; }
    res.json({ success: true });
  } catch (err) { console.error('[goals-v2] DELETE /:id/milestones/:mid', err); res.status(500).json({ error: 'Server error' }); }
});

// ─── Progress ─────────────────────────────────────────────────────────────────

// GET /api/goals-v2/:id/progress
// For auto-tracked goals returns data from source tables; falls back to goal_progress for manual goals.
router.get('/:id/progress', async (req, res) => {
  const goalId = Number(req.params.id);
  const limit = Math.min(Number(req.query.limit) || 100, 500);
  try {
    const [goalRows] = await pool.query<RowDataPacket[]>(
      'SELECT catalog_key, source_id FROM goals WHERE id = ? AND user_id = ?',
      [goalId, req.userId]
    );
    if (!(goalRows as RowDataPacket[]).length) { res.status(404).json({ error: 'Not found' }); return; }

    const { catalog_key, source_id } = (goalRows as RowDataPacket[])[0];

    function toIso(d: unknown): string {
      if (d instanceof Date) return d.toISOString();
      const s = String(d);
      return s.length === 10 ? s + 'T12:00:00.000Z' : s;
    }

    function autoEntries(rows: RowDataPacket[]) {
      return rows.map((r, i) => ({
        id: -(i + 1),
        goalId,
        value: Math.round(Number(r.value) * 10) / 10,
        loggedAt: toIso(r.logged_at),
        source: 'auto' as const,
        notes: null,
      }));
    }

    const BODY_METRICS: Record<string, string> = {
      body_weight: 'weight', body_waist: 'waist', body_bicep: 'bicep',
      body_chest: 'chest', body_hips: 'hips', body_fat_pct: 'body_fat',
      body_muscle_mass: 'muscle_mass', body_water_pct: 'water_pct',
    };

    if (BODY_METRICS[catalog_key]) {
      const [rows] = await pool.query<RowDataPacket[]>(
        `SELECT id, value, measured_at AS logged_at FROM body_measurements
         WHERE user_id = ? AND metric = ? ORDER BY measured_at DESC LIMIT ?`,
        [req.userId, BODY_METRICS[catalog_key], limit]
      );
      return res.json(autoEntries(rows as RowDataPacket[]));
    }

    if (catalog_key === 'exercise_max_weight') {
      const [rows] = await pool.query<RowDataPacket[]>(
        `SELECT wl.id, ROUND(MAX(es.weight_kg * 2.20462), 1) AS value, wl.workout_date AS logged_at
         FROM exercise_sets es
         JOIN workout_exercises we ON we.id = es.workout_exercise_id
         JOIN workout_logs wl ON wl.id = we.workout_log_id
         WHERE wl.user_id = ? AND we.exercise_id = ? AND wl.completed = 1
         GROUP BY wl.id, wl.workout_date ORDER BY wl.workout_date DESC LIMIT ?`,
        [req.userId, source_id, limit]
      );
      return res.json(autoEntries(rows as RowDataPacket[]));
    }

    if (catalog_key === 'exercise_workouts_per_week') {
      const [rows] = await pool.query<RowDataPacket[]>(
        `SELECT YEARWEEK(workout_date, 1) AS id, COUNT(*) AS value, MAX(workout_date) AS logged_at
         FROM workout_logs WHERE user_id = ? AND completed = 1
         GROUP BY YEARWEEK(workout_date, 1) ORDER BY YEARWEEK(workout_date, 1) DESC LIMIT ?`,
        [req.userId, limit]
      );
      return res.json(autoEntries(rows as RowDataPacket[]));
    }

    if (catalog_key === 'exercise_minutes_per_week') {
      const [rows] = await pool.query<RowDataPacket[]>(
        `SELECT YEARWEEK(workout_date, 1) AS id, ROUND(SUM(duration_minutes)) AS value, MAX(workout_date) AS logged_at
         FROM workout_logs WHERE user_id = ? AND completed = 1
         GROUP BY YEARWEEK(workout_date, 1) ORDER BY YEARWEEK(workout_date, 1) DESC LIMIT ?`,
        [req.userId, limit]
      );
      return res.json(autoEntries(rows as RowDataPacket[]));
    }

    if (catalog_key === 'exercise_volume_per_week') {
      const [rows] = await pool.query<RowDataPacket[]>(
        `SELECT YEARWEEK(wl.workout_date, 1) AS id,
                ROUND(SUM(es.reps * es.weight_kg * 2.20462)) AS value,
                MAX(wl.workout_date) AS logged_at
         FROM exercise_sets es
         JOIN workout_exercises we ON we.id = es.workout_exercise_id
         JOIN workout_logs wl ON wl.id = we.workout_log_id
         WHERE wl.user_id = ? AND wl.completed = 1
         GROUP BY YEARWEEK(wl.workout_date, 1) ORDER BY YEARWEEK(wl.workout_date, 1) DESC LIMIT ?`,
        [req.userId, limit]
      );
      return res.json(autoEntries(rows as RowDataPacket[]));
    }

    if (catalog_key === 'exercise_weekly_volume_lift') {
      const [rows] = await pool.query<RowDataPacket[]>(
        `SELECT YEARWEEK(wl.workout_date, 1) AS id,
                ROUND(SUM(es.reps * es.weight_kg * 2.20462)) AS value,
                MAX(wl.workout_date) AS logged_at
         FROM exercise_sets es
         JOIN workout_exercises we ON we.id = es.workout_exercise_id
         JOIN workout_logs wl ON wl.id = we.workout_log_id
         WHERE wl.user_id = ? AND we.exercise_id = ?
         GROUP BY YEARWEEK(wl.workout_date, 1) ORDER BY YEARWEEK(wl.workout_date, 1) DESC LIMIT ?`,
        [req.userId, source_id, limit]
      );
      return res.json(autoEntries(rows as RowDataPacket[]));
    }

    if (catalog_key === 'exercise_routine_sessions') {
      const [rows] = await pool.query<RowDataPacket[]>(
        `SELECT YEARWEEK(workout_date, 1) AS id, COUNT(*) AS value, MAX(workout_date) AS logged_at
         FROM workout_logs WHERE user_id = ? AND routine_id = ? AND completed = 1
         GROUP BY YEARWEEK(workout_date, 1) ORDER BY YEARWEEK(workout_date, 1) DESC LIMIT ?`,
        [req.userId, source_id, limit]
      );
      return res.json(autoEntries(rows as RowDataPacket[]));
    }

    const NUTRITION_COLS: Record<string, string> = {
      nutrition_calories_daily_avg: 'calories',
      nutrition_protein_daily_avg: 'protein_g',
      nutrition_carbs_daily_avg: 'carbs_g',
      nutrition_fat_daily_avg: 'fat_g',
    };
    if (NUTRITION_COLS[catalog_key]) {
      const col = NUTRITION_COLS[catalog_key];
      const [rows] = await pool.query<RowDataPacket[]>(
        `SELECT log_date AS id, ROUND(SUM(\`${col}\`), 1) AS value, log_date AS logged_at
         FROM food_log WHERE user_id = ?
         GROUP BY log_date ORDER BY log_date DESC LIMIT ?`,
        [req.userId, limit]
      );
      return res.json(autoEntries(rows as RowDataPacket[]));
    }

    if (catalog_key === 'activity_steps_daily_avg') {
      const [rows] = await pool.query<RowDataPacket[]>(
        `SELECT id, steps AS value, log_date AS logged_at
         FROM steps_log WHERE user_id = ? ORDER BY log_date DESC LIMIT ?`,
        [req.userId, limit]
      );
      return res.json(autoEntries(rows as RowDataPacket[]));
    }

    // Manual progress goals — fall through to goal_progress table
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT p.* FROM goal_progress p
       INNER JOIN goals g ON g.id = p.goal_id
       WHERE p.goal_id = ? AND g.user_id = ?
       ORDER BY p.logged_at DESC LIMIT ?`,
      [goalId, req.userId, limit]
    );
    res.json((rows as RowDataPacket[]).map(fmtProgress));
  } catch (err) { console.error('[goals-v2] GET /:id/progress', err); res.status(500).json({ error: 'Server error' }); }
});

// POST /api/goals-v2/:id/progress
router.post('/:id/progress', async (req, res) => {
  const goalId = Number(req.params.id);
  const { value, loggedAt, notes } = req.body;
  if (value == null) { res.status(400).json({ error: 'value required' }); return; }
  try {
    const [goals] = await pool.query<RowDataPacket[]>('SELECT id FROM goals WHERE id=? AND user_id=?', [goalId, req.userId]);
    if (!(goals as RowDataPacket[]).length) { res.status(404).json({ error: 'Goal not found' }); return; }

    const [result] = await pool.query<ResultSetHeader>(
      `INSERT INTO goal_progress (goal_id, user_id, value, logged_at, source, notes)
       VALUES (?,?,?,?,?,?)`,
      [goalId, req.userId, value, loggedAt ?? new Date(), 'manual', notes ?? null]
    );
    const [rows] = await pool.query<RowDataPacket[]>('SELECT * FROM goal_progress WHERE id=?', [result.insertId]);
    res.status(201).json(fmtProgress((rows as RowDataPacket[])[0]));
  } catch (err) { console.error('[goals-v2] POST /:id/progress', err); res.status(500).json({ error: 'Server error' }); }
});

// DELETE /api/goals-v2/:id/progress/:pid
router.delete('/:id/progress/:pid', async (req, res) => {
  const goalId = Number(req.params.id);
  const pid = Number(req.params.pid);
  try {
    const [result] = await pool.query<ResultSetHeader>(
      `DELETE p FROM goal_progress p
       INNER JOIN goals g ON g.id = p.goal_id
       WHERE p.id=? AND p.goal_id=? AND g.user_id=?`,
      [pid, goalId, req.userId]
    );
    if ((result as ResultSetHeader).affectedRows === 0) { res.status(404).json({ error: 'Not found' }); return; }
    res.json({ success: true });
  } catch (err) { console.error('[goals-v2] DELETE /:id/progress/:pid', err); res.status(500).json({ error: 'Server error' }); }
});

export default router;
