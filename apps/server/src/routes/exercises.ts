import { Router } from 'express';
import pool from '../db';
import type { RowDataPacket, ResultSetHeader } from 'mysql2/promise';

const router = Router();

function parseId(param: string): number | null {
  const n = Number(param);
  return Number.isInteger(n) && n > 0 ? n : null;
}

// GET /api/exercises?search=&category=
router.get('/', async (req, res) => {
  const { search, category } = req.query as { search?: string; category?: string };

  const conditions: string[] = [];
  const params: any[] = [];

  if (search) {
    conditions.push('name LIKE ?');
    params.push(`%${search}%`);
  }
  if (category) {
    conditions.push('category = ?');
    params.push(category);
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  try {
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT * FROM exercises ${where} ORDER BY category ASC, name ASC`,
      params
    );
    res.json(rows.map((r) => ({
      id: r.id,
      name: r.name,
      category: r.category,
      exerciseType: r.exercise_type,
      musclesPrimary: r.muscles_primary ?? [],
      musclesSecondary: r.muscles_secondary ?? [],
      isCustom: Boolean(r.is_custom),
      instructions: r.instructions ?? null,
      mediaUrl: r.media_url ?? null,
      coverImageUrl: r.cover_image_url ?? null,
      muscleImageUrl: r.muscle_image_url ?? null,
      notes: r.notes ?? null,
      trackWeight: r.track_weight !== 0,
    })));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/exercises/categories — distinct category list
router.get('/categories', async (_req, res) => {
  try {
    const [rows] = await pool.query<RowDataPacket[]>(
      'SELECT DISTINCT category FROM exercises WHERE is_custom = 0 ORDER BY category ASC'
    );
    res.json(rows.map((r) => r.category));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/exercises — create custom exercise
router.post('/', async (req, res) => {
  const { name, category, exerciseType } = req.body as {
    name: string;
    category: string;
    exerciseType: string;
  };
  if (!name?.trim() || !category?.trim() || !exerciseType) {
    res.status(400).json({ error: 'name, category, and exerciseType required' });
    return;
  }
  try {
    const [result] = await pool.query<ResultSetHeader>(
      `INSERT INTO exercises (name, category, exercise_type, muscles_primary, muscles_secondary, is_custom)
       VALUES (?, ?, ?, '[]', '[]', 1)`,
      [name.trim(), category.trim(), exerciseType]
    );
    res.status(201).json({
      id: result.insertId,
      name: name.trim(),
      category: category.trim(),
      exerciseType,
      musclesPrimary: [],
      musclesSecondary: [],
      isCustom: true,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/exercises/:id — single exercise detail
router.get('/:id', async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) { res.status(400).json({ error: 'Invalid id' }); return; }

  try {
    const [rows] = await pool.query<RowDataPacket[]>(
      'SELECT * FROM exercises WHERE id = ?', [id]
    );
    if (!rows[0]) { res.status(404).json({ error: 'Not found' }); return; }
    const r = rows[0];
    res.json({
      id: r.id,
      name: r.name,
      category: r.category,
      exerciseType: r.exercise_type,
      musclesPrimary: r.muscles_primary ?? [],
      musclesSecondary: r.muscles_secondary ?? [],
      isCustom: Boolean(r.is_custom),
      instructions: r.instructions ?? null,
      mediaUrl: r.media_url ?? null,
      coverImageUrl: r.cover_image_url ?? null,
      muscleImageUrl: r.muscle_image_url ?? null,
      notes: r.notes ?? null,
      trackWeight: r.track_weight !== 0,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/exercises/:id/stats?metric=heaviest_weight
router.get('/:id/stats', async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) { res.status(400).json({ error: 'Invalid id' }); return; }

  const metric = (req.query.metric as string) || 'heaviest_weight';
  const userId = req.userId;

  try {
    // Personal bests — run in parallel
    const [heaviestRows, ormRows, setVolRows, sessVolRows, setRecordRows] = await Promise.all([
      // Heaviest single set
      pool.query<RowDataPacket[]>(
        `SELECT es.weight_kg, es.reps
         FROM exercise_sets es
         JOIN workout_exercises we ON we.id = es.workout_exercise_id
         JOIN workout_logs wl ON wl.id = we.workout_log_id
         WHERE wl.user_id = ? AND we.exercise_id = ? AND es.weight_kg IS NOT NULL AND es.weight_kg > 0 AND es.completed = 1
         ORDER BY es.weight_kg DESC LIMIT 1`,
        [userId, id]
      ),
      // Estimated 1RM (Epley)
      pool.query<RowDataPacket[]>(
        `SELECT MAX(es.weight_kg * (1 + es.reps / 30.0)) AS orm
         FROM exercise_sets es
         JOIN workout_exercises we ON we.id = es.workout_exercise_id
         JOIN workout_logs wl ON wl.id = we.workout_log_id
         WHERE wl.user_id = ? AND we.exercise_id = ?
           AND es.weight_kg IS NOT NULL AND es.reps IS NOT NULL AND es.reps > 0 AND es.completed = 1`,
        [userId, id]
      ),
      // Best set volume (reps × weight, single set)
      pool.query<RowDataPacket[]>(
        `SELECT MAX(es.reps * es.weight_kg) AS best_set_vol
         FROM exercise_sets es
         JOIN workout_exercises we ON we.id = es.workout_exercise_id
         JOIN workout_logs wl ON wl.id = we.workout_log_id
         WHERE wl.user_id = ? AND we.exercise_id = ?
           AND es.reps IS NOT NULL AND es.weight_kg IS NOT NULL AND es.completed = 1`,
        [userId, id]
      ),
      // Best session volume (sum per session, then max)
      pool.query<RowDataPacket[]>(
        `SELECT MAX(session_vol) AS best_session_vol FROM (
           SELECT SUM(es.reps * es.weight_kg) AS session_vol
           FROM workout_logs wl
           JOIN workout_exercises we ON we.workout_log_id = wl.id
           JOIN exercise_sets es ON es.workout_exercise_id = we.id
           WHERE wl.user_id = ? AND we.exercise_id = ?
             AND es.reps IS NOT NULL AND es.weight_kg IS NOT NULL AND es.completed = 1
           GROUP BY wl.id
         ) t`,
        [userId, id]
      ),
      // Set records: best weight per rep count
      pool.query<RowDataPacket[]>(
        `SELECT es.reps, MAX(es.weight_kg) AS best_weight_kg
         FROM exercise_sets es
         JOIN workout_exercises we ON we.id = es.workout_exercise_id
         JOIN workout_logs wl ON wl.id = we.workout_log_id
         WHERE wl.user_id = ? AND we.exercise_id = ?
           AND es.reps IS NOT NULL AND es.weight_kg IS NOT NULL AND es.weight_kg > 0 AND es.completed = 1
         GROUP BY es.reps
         ORDER BY es.reps ASC`,
        [userId, id]
      ),
    ]);

    // Progress series — aggregate varies by metric
    let seriesSelect: string;
    let seriesWhere = 'es.weight_kg IS NOT NULL';
    switch (metric) {
      case 'one_rep_max':
        seriesSelect = 'MAX(es.weight_kg * (1 + es.reps / 30.0)) AS value';
        seriesWhere = 'es.weight_kg IS NOT NULL AND es.reps IS NOT NULL AND es.reps > 0';
        break;
      case 'best_set_volume':
        seriesSelect = 'MAX(es.reps * es.weight_kg) AS value';
        seriesWhere = 'es.reps IS NOT NULL AND es.weight_kg IS NOT NULL';
        break;
      case 'session_volume':
        seriesSelect = 'SUM(es.reps * es.weight_kg) AS value';
        seriesWhere = 'es.reps IS NOT NULL AND es.weight_kg IS NOT NULL';
        break;
      case 'total_reps':
        seriesSelect = 'SUM(es.reps) AS value';
        seriesWhere = 'es.reps IS NOT NULL';
        break;
      default: // heaviest_weight
        seriesSelect = 'MAX(es.weight_kg) AS value';
        seriesWhere = 'es.weight_kg IS NOT NULL AND es.weight_kg > 0';
    }

    const [seriesRows] = await pool.query<RowDataPacket[]>(
      `SELECT wl.workout_date, ${seriesSelect}
       FROM workout_logs wl
       JOIN workout_exercises we ON we.workout_log_id = wl.id
       JOIN exercise_sets es ON es.workout_exercise_id = we.id
       WHERE wl.user_id = ? AND we.exercise_id = ? AND es.completed = 1 AND ${seriesWhere}
       GROUP BY wl.id, wl.workout_date
       ORDER BY wl.workout_date ASC`,
      [userId, id]
    );

    const heaviest = heaviestRows[0]?.[0] ?? null;
    const orm = ormRows[0]?.[0] ?? null;
    const setVol = setVolRows[0]?.[0] ?? null;
    const sessVol = sessVolRows[0]?.[0] ?? null;
    const setRecords = setRecordRows[0] as RowDataPacket[];

    res.json({
      exerciseId: id,
      personalBests: {
        heaviestWeightKg: heaviest?.weight_kg != null ? Number(heaviest.weight_kg) : null,
        heaviestWeightReps: heaviest?.reps ?? null,
        estimatedOneRepMaxKg: orm?.orm != null ? Number(orm.orm) : null,
        bestSetVolumeKg: setVol?.best_set_vol != null ? Number(setVol.best_set_vol) : null,
        bestSessionVolumeKg: sessVol?.best_session_vol != null ? Number(sessVol.best_session_vol) : null,
      },
      setRecords: setRecords.map((r) => ({
        reps: r.reps,
        weightKg: Number(r.best_weight_kg),
      })),
      progressSeries: (seriesRows as RowDataPacket[]).map((r) => ({
        date: r.workout_date instanceof Date
          ? r.workout_date.toISOString().slice(0, 10)
          : String(r.workout_date),
        value: Number(r.value),
      })),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/exercises/:id/history?limit=20&offset=0
router.get('/:id/history', async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) { res.status(400).json({ error: 'Invalid id' }); return; }

  const limit = Math.min(Number(req.query.limit) || 20, 100);
  const offset = Number(req.query.offset) || 0;
  const userId = req.userId;

  try {
    const [sessionRows] = await pool.query<RowDataPacket[]>(
      `SELECT wl.id AS workout_id, wl.workout_date, wl.name AS workout_name, we.id AS we_id
       FROM workout_logs wl
       JOIN workout_exercises we ON we.workout_log_id = wl.id
       WHERE wl.user_id = ? AND we.exercise_id = ?
       ORDER BY wl.workout_date DESC, wl.id DESC
       LIMIT ? OFFSET ?`,
      [userId, id, limit, offset]
    );

    if (!sessionRows.length) { res.json([]); return; }

    const weIds = sessionRows.map((r) => r.we_id);
    const [setRows] = await pool.query<RowDataPacket[]>(
      `SELECT * FROM exercise_sets WHERE workout_exercise_id IN (?) ORDER BY workout_exercise_id, set_number ASC`,
      [weIds]
    );

    const setsByWeId: Record<number, RowDataPacket[]> = {};
    for (const s of setRows) {
      if (!setsByWeId[s.workout_exercise_id]) setsByWeId[s.workout_exercise_id] = [];
      setsByWeId[s.workout_exercise_id].push(s);
    }

    res.json(sessionRows.map((r) => ({
      workoutId: r.workout_id,
      workoutDate: r.workout_date instanceof Date
        ? r.workout_date.toISOString().slice(0, 10)
        : String(r.workout_date),
      workoutName: r.workout_name ?? null,
      sets: (setsByWeId[r.we_id] ?? []).map((s) => ({
        setNumber: s.set_number,
        reps: s.reps ?? null,
        weightKg: s.weight_kg != null ? Number(s.weight_kg) : null,
        durationSeconds: s.duration_seconds ?? null,
        distanceMeters: s.distance_meters != null ? Number(s.distance_meters) : null,
        completed: Boolean(s.completed),
      })),
    })));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// PUT /api/exercises/:id — update any exercise
router.put('/:id', async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) { res.status(400).json({ error: 'Invalid id' }); return; }
  const { name, category, exerciseType, musclesPrimary, musclesSecondary, instructions, mediaUrl, coverImageUrl, muscleImageUrl, notes, trackWeight } =
    req.body as {
      name?: string; category?: string; exerciseType?: string;
      musclesPrimary?: string[]; musclesSecondary?: string[];
      instructions?: string | null; mediaUrl?: string | null;
      coverImageUrl?: string | null; muscleImageUrl?: string | null; notes?: string | null;
      trackWeight?: boolean;
    };
  try {
    const updates: string[] = [];
    const values: unknown[] = [];
    if (name?.trim() !== undefined && name.trim()) { updates.push('name = ?'); values.push(name.trim()); }
    if (category?.trim()) { updates.push('category = ?'); values.push(category.trim()); }
    if (exerciseType) { updates.push('exercise_type = ?'); values.push(exerciseType); }
    if (musclesPrimary !== undefined) { updates.push('muscles_primary = ?'); values.push(JSON.stringify(musclesPrimary)); }
    if (musclesSecondary !== undefined) { updates.push('muscles_secondary = ?'); values.push(JSON.stringify(musclesSecondary)); }
    if (instructions !== undefined) { updates.push('instructions = ?'); values.push(instructions || null); }
    if (mediaUrl !== undefined) { updates.push('media_url = ?'); values.push(mediaUrl?.trim() || null); }
    if (coverImageUrl !== undefined) { updates.push('cover_image_url = ?'); values.push(coverImageUrl?.trim() || null); }
    if (muscleImageUrl !== undefined) { updates.push('muscle_image_url = ?'); values.push(muscleImageUrl?.trim() || null); }
    if (notes !== undefined) { updates.push('notes = ?'); values.push(notes || null); }
    if (trackWeight !== undefined) { updates.push('track_weight = ?'); values.push(trackWeight ? 1 : 0); }
    if (updates.length === 0) { res.status(400).json({ error: 'At least one field required' }); return; }
    values.push(id);
    const [result] = await pool.query<ResultSetHeader>(
      `UPDATE exercises SET ${updates.join(', ')} WHERE id = ?`,
      values
    );
    if (result.affectedRows === 0) {
      res.status(404).json({ error: 'Exercise not found' }); return;
    }
    const [rows] = await pool.query<RowDataPacket[]>('SELECT * FROM exercises WHERE id = ?', [id]);
    const r = rows[0];
    res.json({
      id: r.id, name: r.name, category: r.category, exerciseType: r.exercise_type,
      musclesPrimary: r.muscles_primary ?? [], musclesSecondary: r.muscles_secondary ?? [],
      isCustom: Boolean(r.is_custom), instructions: r.instructions ?? null, mediaUrl: r.media_url ?? null,
      coverImageUrl: r.cover_image_url ?? null, notes: r.notes ?? null,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// DELETE /api/exercises/:id — delete custom exercise (only custom ones)
router.delete('/:id', async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) { res.status(400).json({ error: 'Invalid id' }); return; }
  try {
    const [result] = await pool.query<ResultSetHeader>(
      'DELETE FROM exercises WHERE id = ? AND is_custom = 1',
      [id]
    );
    if (result.affectedRows === 0) {
      res.status(404).json({ error: 'Custom exercise not found' });
      return;
    }
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

export default router;
