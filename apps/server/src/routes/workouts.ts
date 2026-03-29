import { Router } from 'express';
import pool from '../db';
import type { RowDataPacket, ResultSetHeader } from 'mysql2/promise';

const router = Router();

function parseId(param: string): number | null {
  const n = Number(param);
  return Number.isInteger(n) && n > 0 ? n : null;
}

async function ownsWorkout(workoutId: number, userId: number): Promise<boolean> {
  const [rows] = await pool.query<RowDataPacket[]>(
    'SELECT id FROM workout_logs WHERE id = ? AND user_id = ?', [workoutId, userId]
  );
  return rows.length > 0;
}

async function getWorkoutDetail(workoutId: number) {
  const [wRows] = await pool.query<RowDataPacket[]>(
    'SELECT * FROM workout_logs WHERE id = ?', [workoutId]
  );
  if (!wRows[0]) return null;
  const w = wRows[0];

  const [exRows] = await pool.query<RowDataPacket[]>(
    `SELECT we.id AS we_id, we.sort_order, we.notes AS we_notes,
            e.id AS ex_id, e.name, e.category, e.exercise_type, e.muscles_primary, e.muscles_secondary, e.is_custom
     FROM workout_exercises we
     JOIN exercises e ON e.id = we.exercise_id
     WHERE we.workout_log_id = ?
     ORDER BY we.sort_order ASC, we.id ASC`,
    [workoutId]
  );

  const exercises = await Promise.all(exRows.map(async (ex) => {
    const [setRows] = await pool.query<RowDataPacket[]>(
      `SELECT * FROM exercise_sets WHERE workout_exercise_id = ? ORDER BY set_number ASC`,
      [ex.we_id]
    );
    return {
      id: ex.we_id,
      sortOrder: ex.sort_order,
      notes: ex.we_notes ?? null,
      exercise: {
        id: ex.ex_id,
        name: ex.name,
        category: ex.category,
        exerciseType: ex.exercise_type,
        musclesPrimary: ex.muscles_primary ?? [],
        musclesSecondary: ex.muscles_secondary ?? [],
        isCustom: Boolean(ex.is_custom),
      },
      sets: setRows.map((s) => ({
        id: s.id,
        setNumber: s.set_number,
        reps: s.reps ?? null,
        weightKg: s.weight_kg != null ? Number(s.weight_kg) : null,
        durationSeconds: s.duration_seconds ?? null,
        distanceMeters: s.distance_meters != null ? Number(s.distance_meters) : null,
        completed: Boolean(s.completed),
      })),
    };
  }));

  return {
    id: w.id,
    workoutDate: w.workout_date instanceof Date
      ? w.workout_date.toISOString().slice(0, 10)
      : String(w.workout_date),
    name: w.name ?? null,
    notes: w.notes ?? null,
    durationMinutes: w.duration_minutes ?? null,
    caloriesBurned: w.calories_burned ?? null,
    createdAt: w.created_at,
    exercises,
  };
}

// GET /api/workouts
router.get('/', async (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 20, 50);
  const offset = Number(req.query.offset) || 0;

  try {
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT wl.*,
              COUNT(DISTINCT we.id) AS exercise_count,
              COUNT(DISTINCT es.id) AS set_count
       FROM workout_logs wl
       LEFT JOIN workout_exercises we ON we.workout_log_id = wl.id
       LEFT JOIN exercise_sets es ON es.workout_exercise_id = we.id
       WHERE wl.user_id = ?
       GROUP BY wl.id
       ORDER BY wl.workout_date DESC, wl.created_at DESC
       LIMIT ? OFFSET ?`,
      [req.userId, limit, offset]
    );
    res.json(rows.map((r) => ({
      id: r.id,
      workoutDate: r.workout_date instanceof Date
        ? r.workout_date.toISOString().slice(0, 10)
        : String(r.workout_date),
      name: r.name ?? null,
      durationMinutes: r.duration_minutes ?? null,
      caloriesBurned: r.calories_burned ?? null,
      exerciseCount: Number(r.exercise_count),
      setCount: Number(r.set_count),
      createdAt: r.created_at,
    })));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/workouts
router.post('/', async (req, res) => {
  const today = new Date().toISOString().slice(0, 10);
  const { name, workoutDate } = req.body as { name?: string; workoutDate?: string };

  try {
    const [result] = await pool.query<ResultSetHeader>(
      'INSERT INTO workout_logs (user_id, workout_date, name) VALUES (?, ?, ?)',
      [req.userId, workoutDate ?? today, name ?? null]
    );
    const detail = await getWorkoutDetail(result.insertId);
    res.status(201).json(detail);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/workouts/:id
router.get('/:id', async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) { res.status(400).json({ error: 'Invalid id' }); return; }
  if (!await ownsWorkout(id, req.userId)) { res.status(404).json({ error: 'Not found' }); return; }

  try {
    const detail = await getWorkoutDetail(id);
    if (!detail) { res.status(404).json({ error: 'Not found' }); return; }
    res.json(detail);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// PUT /api/workouts/:id
router.put('/:id', async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) { res.status(400).json({ error: 'Invalid id' }); return; }
  if (!await ownsWorkout(id, req.userId)) { res.status(404).json({ error: 'Not found' }); return; }

  const { name, notes, durationMinutes, caloriesBurned, workoutDate } = req.body;
  try {
    await pool.query(
      `UPDATE workout_logs SET name=?, notes=?, duration_minutes=?, calories_burned=?, workout_date=?
       WHERE id = ? AND user_id = ?`,
      [name ?? null, notes ?? null, durationMinutes ?? null, caloriesBurned ?? null,
       workoutDate ?? new Date().toISOString().slice(0, 10), id, req.userId]
    );
    const detail = await getWorkoutDetail(id);
    res.json(detail);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// DELETE /api/workouts/:id
router.delete('/:id', async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) { res.status(400).json({ error: 'Invalid id' }); return; }
  if (!await ownsWorkout(id, req.userId)) { res.status(404).json({ error: 'Not found' }); return; }

  try {
    await pool.query('DELETE FROM workout_logs WHERE id = ? AND user_id = ?', [id, req.userId]);
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/workouts/:id/exercises
router.post('/:id/exercises', async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) { res.status(400).json({ error: 'Invalid id' }); return; }
  if (!await ownsWorkout(id, req.userId)) { res.status(404).json({ error: 'Not found' }); return; }

  const { exerciseId } = req.body as { exerciseId: number };
  if (!exerciseId) { res.status(400).json({ error: 'exerciseId required' }); return; }

  try {
    const [countRows] = await pool.query<RowDataPacket[]>(
      'SELECT COUNT(*) AS cnt FROM workout_exercises WHERE workout_log_id = ?', [id]
    );
    const sortOrder = Number((countRows[0] as any).cnt);

    const [result] = await pool.query<ResultSetHeader>(
      'INSERT INTO workout_exercises (workout_log_id, exercise_id, sort_order) VALUES (?, ?, ?)',
      [id, exerciseId, sortOrder]
    );

    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT we.id AS we_id, we.sort_order, we.notes AS we_notes,
              e.id AS ex_id, e.name, e.category, e.exercise_type, e.muscles_primary, e.muscles_secondary, e.is_custom
       FROM workout_exercises we
       JOIN exercises e ON e.id = we.exercise_id
       WHERE we.id = ?`,
      [result.insertId]
    );
    const ex = rows[0];
    res.status(201).json({
      id: ex.we_id,
      sortOrder: ex.sort_order,
      notes: null,
      exercise: {
        id: ex.ex_id, name: ex.name, category: ex.category,
        exerciseType: ex.exercise_type,
        musclesPrimary: ex.muscles_primary ?? [],
        musclesSecondary: ex.muscles_secondary ?? [],
        isCustom: Boolean(ex.is_custom),
      },
      sets: [],
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// DELETE /api/workouts/:id/exercises/:weId
router.delete('/:id/exercises/:weId', async (req, res) => {
  const id = parseId(req.params.id);
  const weId = parseId(req.params.weId);
  if (!id || !weId) { res.status(400).json({ error: 'Invalid id' }); return; }
  if (!await ownsWorkout(id, req.userId)) { res.status(404).json({ error: 'Not found' }); return; }

  try {
    await pool.query(
      'DELETE FROM workout_exercises WHERE id = ? AND workout_log_id = ?', [weId, id]
    );
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/workouts/:id/exercises/:weId/sets
router.post('/:id/exercises/:weId/sets', async (req, res) => {
  const id = parseId(req.params.id);
  const weId = parseId(req.params.weId);
  if (!id || !weId) { res.status(400).json({ error: 'Invalid id' }); return; }
  if (!await ownsWorkout(id, req.userId)) { res.status(404).json({ error: 'Not found' }); return; }

  const { reps, weightKg, durationSeconds, distanceMeters } = req.body;

  try {
    const [countRows] = await pool.query<RowDataPacket[]>(
      'SELECT COUNT(*) AS cnt FROM exercise_sets WHERE workout_exercise_id = ?', [weId]
    );
    const setNumber = Number((countRows[0] as any).cnt) + 1;

    const [result] = await pool.query<ResultSetHeader>(
      `INSERT INTO exercise_sets (workout_exercise_id, set_number, reps, weight_kg, duration_seconds, distance_meters)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [weId, setNumber, reps ?? null, weightKg ?? null, durationSeconds ?? null, distanceMeters ?? null]
    );
    res.status(201).json({
      id: result.insertId,
      setNumber,
      reps: reps ?? null,
      weightKg: weightKg != null ? Number(weightKg) : null,
      durationSeconds: durationSeconds ?? null,
      distanceMeters: distanceMeters != null ? Number(distanceMeters) : null,
      completed: true,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// PUT /api/workouts/:id/exercises/:weId/sets/:setId
router.put('/:id/exercises/:weId/sets/:setId', async (req, res) => {
  const id = parseId(req.params.id);
  const weId = parseId(req.params.weId);
  const setId = parseId(req.params.setId);
  if (!id || !weId || !setId) { res.status(400).json({ error: 'Invalid id' }); return; }
  if (!await ownsWorkout(id, req.userId)) { res.status(404).json({ error: 'Not found' }); return; }

  const { reps, weightKg, durationSeconds, distanceMeters, completed } = req.body;

  try {
    await pool.query(
      `UPDATE exercise_sets SET reps=?, weight_kg=?, duration_seconds=?, distance_meters=?, completed=?
       WHERE id = ? AND workout_exercise_id = ?`,
      [reps ?? null, weightKg ?? null, durationSeconds ?? null, distanceMeters ?? null,
       completed !== false ? 1 : 0, setId, weId]
    );
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// DELETE /api/workouts/:id/exercises/:weId/sets/:setId
router.delete('/:id/exercises/:weId/sets/:setId', async (req, res) => {
  const id = parseId(req.params.id);
  const weId = parseId(req.params.weId);
  const setId = parseId(req.params.setId);
  if (!id || !weId || !setId) { res.status(400).json({ error: 'Invalid id' }); return; }
  if (!await ownsWorkout(id, req.userId)) { res.status(404).json({ error: 'Not found' }); return; }

  try {
    await pool.query(
      'DELETE FROM exercise_sets WHERE id = ? AND workout_exercise_id = ?', [setId, weId]
    );
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

export default router;
