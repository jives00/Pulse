import { Router } from 'express';
import pool from '../db';
import type { RowDataPacket, ResultSetHeader } from 'mysql2/promise';
import { getWorkoutDetail } from './workouts';
import { getPresignedUploadUrl, getPresignedGetUrl, clearPresignedUrlCache } from '../services/s3';

const router = Router();

function parseId(param: string): number | null {
  const n = Number(param);
  return Number.isInteger(n) && n > 0 ? n : null;
}

async function ownsRoutine(routineId: number, userId: number): Promise<boolean> {
  const [rows] = await pool.query<RowDataPacket[]>(
    'SELECT id FROM workout_routines WHERE id = ? AND user_id = ?', [routineId, userId]
  );
  return rows.length > 0;
}

async function getLastPerformedSets(exerciseId: number, userId: number): Promise<RowDataPacket[]> {
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT es.*
     FROM exercise_sets es
     JOIN workout_exercises we ON we.id = es.workout_exercise_id
     JOIN workout_logs wl ON wl.id = we.workout_log_id
     WHERE wl.user_id = ? AND we.exercise_id = ?
       AND wl.id = (
         SELECT wl2.id FROM workout_logs wl2
         JOIN workout_exercises we2 ON we2.workout_log_id = wl2.id
         WHERE wl2.user_id = ? AND we2.exercise_id = ?
         ORDER BY wl2.workout_date DESC, wl2.id DESC
         LIMIT 1
       )
     ORDER BY es.set_number ASC`,
    [userId, exerciseId, userId, exerciseId]
  );
  return rows;
}

async function getRoutineDetail(routineId: number, userId: number) {
  const [rRows] = await pool.query<RowDataPacket[]>(
    'SELECT * FROM workout_routines WHERE id = ?', [routineId]
  );
  if (!rRows[0]) return null;
  const r = rRows[0];

  const [exRows] = await pool.query<RowDataPacket[]>(
    `SELECT re.id AS re_id, re.sort_order, re.notes AS re_notes,
            e.id AS ex_id, e.name, e.category, e.exercise_type,
            e.muscles_primary, e.muscles_secondary, e.is_custom
     FROM routine_exercises re
     JOIN exercises e ON e.id = re.exercise_id
     WHERE re.routine_id = ?
     ORDER BY re.sort_order ASC, re.id ASC`,
    [routineId]
  );

  const exercises = await Promise.all(exRows.map(async (ex) => {
    const [templateSets] = await pool.query<RowDataPacket[]>(
      'SELECT * FROM routine_exercise_sets WHERE routine_exercise_id = ? ORDER BY set_number ASC',
      [ex.re_id]
    );
    const lastPerformedSets = await getLastPerformedSets(ex.ex_id, userId);

    return {
      id: ex.re_id,
      sortOrder: ex.sort_order,
      notes: ex.re_notes ?? null,
      exercise: {
        id: ex.ex_id,
        name: ex.name,
        category: ex.category,
        exerciseType: ex.exercise_type,
        musclesPrimary: ex.muscles_primary ?? [],
        musclesSecondary: ex.muscles_secondary ?? [],
        isCustom: Boolean(ex.is_custom),
      },
      templateSets: templateSets.map((s) => ({
        id: s.id,
        setNumber: s.set_number,
        reps: s.reps ?? null,
        weightKg: s.weight_kg != null ? Number(s.weight_kg) : null,
        durationSeconds: s.duration_seconds ?? null,
        distanceMeters: s.distance_meters != null ? Number(s.distance_meters) : null,
      })),
      lastPerformedSets: lastPerformedSets.length > 0
        ? lastPerformedSets.map((s) => ({
            setNumber: s.set_number,
            reps: s.reps ?? null,
            weightKg: s.weight_kg != null ? Number(s.weight_kg) : null,
            durationSeconds: s.duration_seconds ?? null,
            distanceMeters: s.distance_meters != null ? Number(s.distance_meters) : null,
          }))
        : null,
    };
  }));

  return {
    id: r.id,
    name: r.name,
    notes: r.notes ?? null,
    coverImageUrl: r.cover_image_key ? await getPresignedGetUrl(r.cover_image_key) : null,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    exercises,
  };
}

// GET /api/routines
router.get('/', async (req, res) => {
  try {
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT wr.*, COUNT(DISTINCT re.id) AS exercise_count
       FROM workout_routines wr
       LEFT JOIN routine_exercises re ON re.routine_id = wr.id
       WHERE wr.user_id = ?
       GROUP BY wr.id
       ORDER BY wr.name ASC`,
      [req.userId]
    );

    if (!rows.length) { res.json([]); return; }

    const ids = rows.map((r) => r.id);
    const [lastUsedRows] = await pool.query<RowDataPacket[]>(
      `SELECT
         wl.routine_id,
         wl.workout_date AS last_used,
         SUM(es.reps * es.weight_kg) AS volume_kg
       FROM workout_logs wl
       JOIN workout_exercises we ON we.workout_log_id = wl.id
       JOIN exercise_sets es ON es.workout_exercise_id = we.id
       WHERE wl.user_id = ? AND wl.routine_id IN (?)
         AND wl.id IN (
           SELECT MAX(id) FROM workout_logs
           WHERE user_id = ? AND routine_id IN (?)
           GROUP BY routine_id
         )
       GROUP BY wl.routine_id, wl.workout_date`,
      [req.userId, ids, req.userId, ids]
    );
    const lastUsedMap: Record<number, string> = {};
    const lastVolumeMap: Record<number, number | null> = {};
    for (const lu of lastUsedRows) {
      lastUsedMap[lu.routine_id] = lu.last_used instanceof Date
        ? lu.last_used.toISOString().slice(0, 10)
        : String(lu.last_used);
      lastVolumeMap[lu.routine_id] = lu.volume_kg != null
        ? Math.round(Number(lu.volume_kg) * 2.20462)
        : null;
    }

    const list = await Promise.all(rows.map(async (r) => ({
      id: r.id,
      name: r.name,
      notes: r.notes ?? null,
      exerciseCount: Number(r.exercise_count),
      lastUsedDate: lastUsedMap[r.id] ?? null,
      lastVolumeLbs: lastVolumeMap[r.id] ?? null,
      coverImageUrl: r.cover_image_key ? await getPresignedGetUrl(r.cover_image_key) : null,
      createdAt: r.created_at,
    })));
    res.json(list);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/routines
router.post('/', async (req, res) => {
  const { name, notes } = req.body as { name: string; notes?: string };
  if (!name?.trim()) { res.status(400).json({ error: 'name required' }); return; }

  try {
    const [result] = await pool.query<ResultSetHeader>(
      'INSERT INTO workout_routines (user_id, name, notes) VALUES (?, ?, ?)',
      [req.userId, name.trim(), notes ?? null]
    );
    const detail = await getRoutineDetail(result.insertId, req.userId);
    res.status(201).json(detail);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/routines/:id
router.get('/:id', async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) { res.status(400).json({ error: 'Invalid id' }); return; }
  if (!await ownsRoutine(id, req.userId)) { res.status(404).json({ error: 'Not found' }); return; }

  try {
    const detail = await getRoutineDetail(id, req.userId);
    if (!detail) { res.status(404).json({ error: 'Not found' }); return; }
    res.json(detail);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// PUT /api/routines/:id
router.put('/:id', async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) { res.status(400).json({ error: 'Invalid id' }); return; }
  if (!await ownsRoutine(id, req.userId)) { res.status(404).json({ error: 'Not found' }); return; }

  const { name, notes, coverImageKey } = req.body;
  try {
    const updates: string[] = [];
    const values: unknown[] = [];
    if (name !== undefined) { updates.push('name=?'); values.push(name); }
    if (notes !== undefined) { updates.push('notes=?'); values.push(notes ?? null); }
    if (coverImageKey !== undefined) {
      updates.push('cover_image_key=?');
      values.push(coverImageKey?.trim() || null);
      if (coverImageKey) clearPresignedUrlCache(coverImageKey);
    }
    if (!updates.length) { res.status(400).json({ error: 'Nothing to update' }); return; }
    values.push(id, req.userId);
    await pool.query(
      `UPDATE workout_routines SET ${updates.join(', ')} WHERE id = ? AND user_id = ?`,
      values
    );
    const detail = await getRoutineDetail(id, req.userId);
    res.json(detail);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// DELETE /api/routines/:id
router.delete('/:id', async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) { res.status(400).json({ error: 'Invalid id' }); return; }
  if (!await ownsRoutine(id, req.userId)) { res.status(404).json({ error: 'Not found' }); return; }

  try {
    await pool.query('DELETE FROM workout_routines WHERE id = ? AND user_id = ?', [id, req.userId]);
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/routines/:id/exercises
router.post('/:id/exercises', async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) { res.status(400).json({ error: 'Invalid id' }); return; }
  if (!await ownsRoutine(id, req.userId)) { res.status(404).json({ error: 'Not found' }); return; }

  const { exerciseId } = req.body as { exerciseId: number };
  if (!exerciseId) { res.status(400).json({ error: 'exerciseId required' }); return; }

  try {
    const [countRows] = await pool.query<RowDataPacket[]>(
      'SELECT COUNT(*) AS cnt FROM routine_exercises WHERE routine_id = ?', [id]
    );
    const sortOrder = Number((countRows[0] as any).cnt);

    const [result] = await pool.query<ResultSetHeader>(
      'INSERT INTO routine_exercises (routine_id, exercise_id, sort_order) VALUES (?, ?, ?)',
      [id, exerciseId, sortOrder]
    );

    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT re.id AS re_id, re.sort_order, re.notes AS re_notes,
              e.id AS ex_id, e.name, e.category, e.exercise_type,
              e.muscles_primary, e.muscles_secondary, e.is_custom
       FROM routine_exercises re
       JOIN exercises e ON e.id = re.exercise_id
       WHERE re.id = ?`,
      [result.insertId]
    );
    const ex = rows[0];
    const lastPerformedSets = await getLastPerformedSets(ex.ex_id, req.userId);

    res.status(201).json({
      id: ex.re_id,
      sortOrder: ex.sort_order,
      notes: null,
      exercise: {
        id: ex.ex_id, name: ex.name, category: ex.category,
        exerciseType: ex.exercise_type,
        musclesPrimary: ex.muscles_primary ?? [],
        musclesSecondary: ex.muscles_secondary ?? [],
        isCustom: Boolean(ex.is_custom),
      },
      templateSets: [],
      lastPerformedSets: lastPerformedSets.length > 0
        ? lastPerformedSets.map((s) => ({
            setNumber: s.set_number,
            reps: s.reps ?? null,
            weightKg: s.weight_kg != null ? Number(s.weight_kg) : null,
            durationSeconds: s.duration_seconds ?? null,
            distanceMeters: s.distance_meters != null ? Number(s.distance_meters) : null,
          }))
        : null,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// DELETE /api/routines/:id/exercises/:reId
router.delete('/:id/exercises/:reId', async (req, res) => {
  const id = parseId(req.params.id);
  const reId = parseId(req.params.reId);
  if (!id || !reId) { res.status(400).json({ error: 'Invalid id' }); return; }
  if (!await ownsRoutine(id, req.userId)) { res.status(404).json({ error: 'Not found' }); return; }

  try {
    await pool.query(
      'DELETE FROM routine_exercises WHERE id = ? AND routine_id = ?', [reId, id]
    );
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/routines/:id/exercises/:reId/sets
router.post('/:id/exercises/:reId/sets', async (req, res) => {
  const id = parseId(req.params.id);
  const reId = parseId(req.params.reId);
  if (!id || !reId) { res.status(400).json({ error: 'Invalid id' }); return; }
  if (!await ownsRoutine(id, req.userId)) { res.status(404).json({ error: 'Not found' }); return; }

  const { reps, weightKg, durationSeconds, distanceMeters } = req.body;

  try {
    const [countRows] = await pool.query<RowDataPacket[]>(
      'SELECT COUNT(*) AS cnt FROM routine_exercise_sets WHERE routine_exercise_id = ?', [reId]
    );
    const setNumber = Number((countRows[0] as any).cnt) + 1;

    const [result] = await pool.query<ResultSetHeader>(
      `INSERT INTO routine_exercise_sets (routine_exercise_id, set_number, reps, weight_kg, duration_seconds, distance_meters)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [reId, setNumber, reps ?? null, weightKg ?? null, durationSeconds ?? null, distanceMeters ?? null]
    );
    res.status(201).json({
      id: result.insertId,
      setNumber,
      reps: reps ?? null,
      weightKg: weightKg != null ? Number(weightKg) : null,
      durationSeconds: durationSeconds ?? null,
      distanceMeters: distanceMeters != null ? Number(distanceMeters) : null,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// PUT /api/routines/:id/exercises/:reId/sets/:sId
router.put('/:id/exercises/:reId/sets/:sId', async (req, res) => {
  const id = parseId(req.params.id);
  const reId = parseId(req.params.reId);
  const sId = parseId(req.params.sId);
  if (!id || !reId || !sId) { res.status(400).json({ error: 'Invalid id' }); return; }
  if (!await ownsRoutine(id, req.userId)) { res.status(404).json({ error: 'Not found' }); return; }

  const { reps, weightKg, durationSeconds, distanceMeters } = req.body;

  try {
    await pool.query(
      `UPDATE routine_exercise_sets SET reps=?, weight_kg=?, duration_seconds=?, distance_meters=?
       WHERE id = ? AND routine_exercise_id = ?`,
      [reps ?? null, weightKg ?? null, durationSeconds ?? null, distanceMeters ?? null, sId, reId]
    );
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// DELETE /api/routines/:id/exercises/:reId/sets/:sId
router.delete('/:id/exercises/:reId/sets/:sId', async (req, res) => {
  const id = parseId(req.params.id);
  const reId = parseId(req.params.reId);
  const sId = parseId(req.params.sId);
  if (!id || !reId || !sId) { res.status(400).json({ error: 'Invalid id' }); return; }
  if (!await ownsRoutine(id, req.userId)) { res.status(404).json({ error: 'Not found' }); return; }

  try {
    await pool.query(
      'DELETE FROM routine_exercise_sets WHERE id = ? AND routine_exercise_id = ?', [sId, reId]
    );
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/routines/:id/photo — get pre-signed S3 upload URL
router.post('/:id/photo', async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) { res.status(400).json({ error: 'Invalid id' }); return; }
  if (!await ownsRoutine(id, req.userId)) { res.status(404).json({ error: 'Not found' }); return; }
  try {
    const { contentType } = req.body;
    const key = `routines/${id}/${Date.now()}`;
    const uploadUrl = await getPresignedUploadUrl(key, contentType);
    res.json({ uploadUrl, key });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/routines/:id/start — create a workout_log from this routine
router.post('/:id/start', async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) { res.status(400).json({ error: 'Invalid id' }); return; }
  if (!await ownsRoutine(id, req.userId)) { res.status(404).json({ error: 'Not found' }); return; }

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    // Fetch routine + exercises
    const [rRows] = await conn.query<RowDataPacket[]>(
      'SELECT * FROM workout_routines WHERE id = ?', [id]
    );
    const routine = rRows[0];
    if (!routine) {
      await conn.rollback();
      res.status(404).json({ error: 'Not found' });
      return;
    }

    const [reRows] = await conn.query<RowDataPacket[]>(
      `SELECT re.id AS re_id, re.exercise_id, re.sort_order
       FROM routine_exercises re
       WHERE re.routine_id = ?
       ORDER BY re.sort_order ASC, re.id ASC`,
      [id]
    );

    // Create workout log
    const today = new Date().toISOString().slice(0, 10);
    const [wResult] = await conn.query<ResultSetHeader>(
      `INSERT INTO workout_logs (user_id, workout_date, name, started_at, routine_id)
       VALUES (?, ?, ?, NOW(), ?)`,
      [req.userId, today, routine.name, id]
    );
    const workoutId = wResult.insertId;

    // For each routine exercise, add to workout and pre-fill sets
    for (const re of reRows) {
      const [weResult] = await conn.query<ResultSetHeader>(
        'INSERT INTO workout_exercises (workout_log_id, exercise_id, sort_order) VALUES (?, ?, ?)',
        [workoutId, re.exercise_id, re.sort_order]
      );
      const weId = weResult.insertId;

      // Try last performed sets first
      const lastSets = await getLastPerformedSets(re.exercise_id, req.userId);

      if (lastSets.length > 0) {
        for (const s of lastSets) {
          await conn.query(
            `INSERT INTO exercise_sets (workout_exercise_id, set_number, reps, weight_kg, duration_seconds, distance_meters, completed)
             VALUES (?, ?, ?, ?, ?, ?, 0)`,
            [weId, s.set_number, s.reps ?? null, s.weight_kg ?? null, s.duration_seconds ?? null, s.distance_meters ?? null]
          );
        }
      } else {
        // Fall back to template sets
        const [templateSets] = await conn.query<RowDataPacket[]>(
          'SELECT * FROM routine_exercise_sets WHERE routine_exercise_id = ? ORDER BY set_number ASC',
          [re.re_id]
        );
        for (const s of templateSets) {
          await conn.query(
            `INSERT INTO exercise_sets (workout_exercise_id, set_number, reps, weight_kg, duration_seconds, distance_meters, completed)
             VALUES (?, ?, ?, ?, ?, ?, 0)`,
            [weId, s.set_number, s.reps ?? null, s.weight_kg ?? null, s.duration_seconds ?? null, s.distance_meters ?? null]
          );
        }
      }
    }

    await conn.commit();
    conn.release();

    const detail = await getWorkoutDetail(workoutId);
    res.status(201).json(detail);
  } catch (err) {
    await conn.rollback();
    conn.release();
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

export default router;
