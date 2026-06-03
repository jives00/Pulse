import { Router } from 'express';
import { pool } from '../config/database';
import type { RowDataPacket, ResultSetHeader } from 'mysql2/promise';
import { estimateCaloriesBurned } from '../services/calorieEstimation';
import { getPresignedGetUrl } from '../services/s3';

async function resolveMediaUrl(stored: string | null): Promise<string | null> {
  if (!stored) return null;
  if (stored.startsWith('http')) return stored;
  return await getPresignedGetUrl(stored);
}

const router = Router();

const localDateStr = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Chicago' });

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

export async function getWorkoutDetail(workoutId: number) {
  const [wRows] = await pool.query<RowDataPacket[]>(
    `SELECT wl.*, wr.name AS routine_name
     FROM workout_logs wl
     LEFT JOIN workout_routines wr ON wr.id = wl.routine_id
     WHERE wl.id = ?`,
    [workoutId]
  );
  if (!wRows[0]) return null;
  const w = wRows[0];

  const [exRows] = await pool.query<RowDataPacket[]>(
    `SELECT we.id AS we_id, we.sort_order, we.notes AS we_notes,
            e.id AS ex_id, e.name, e.category, e.exercise_type, e.muscles_primary, e.muscles_secondary, e.is_custom, e.tracked_fields, e.media_url, e.instructions
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
        trackedFields: (ex.tracked_fields as string | null)?.split(',').filter(Boolean) ?? ['reps', 'weight'],
        mediaUrl: await resolveMediaUrl(ex.media_url ?? null),
        instructions: ex.instructions ?? null,
      },
      sets: setRows.map((s) => ({
        id: s.id,
        setNumber: s.set_number,
        reps: s.reps ?? null,
        weightKg: s.weight_kg != null ? Number(s.weight_kg) : null,
        additionalWeightKg: s.additional_weight_kg != null ? Number(s.additional_weight_kg) : null,
        durationSeconds: s.duration_seconds ?? null,
        distanceMeters: s.distance_meters != null ? Number(s.distance_meters) : null,
        steps: s.steps ?? null,
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
    startedAt: w.started_at ? (w.started_at instanceof Date ? w.started_at.toISOString() : String(w.started_at)) : null,
    pausedAt: w.paused_at ? (w.paused_at instanceof Date ? w.paused_at.toISOString() : String(w.paused_at)) : null,
    totalPausedSeconds: w.total_paused_seconds ?? 0,
    completed: Boolean(w.completed),
    routineId: w.routine_id ?? null,
    routineName: w.routine_name ?? null,
    createdAt: w.created_at,
    exercises,
  };
}

// GET /api/workouts/personal-bests
router.get('/personal-bests', async (req, res) => {
  try {
    // Heaviest single set
    const [liftRows] = await pool.query<RowDataPacket[]>(
      `SELECT e.name AS exercise_name, es.weight_kg, es.reps, wl.workout_date
       FROM exercise_sets es
       JOIN workout_exercises we ON we.id = es.workout_exercise_id
       JOIN workout_logs wl ON wl.id = we.workout_log_id
       JOIN exercises e ON e.id = we.exercise_id
       WHERE wl.user_id = ? AND es.weight_kg IS NOT NULL AND es.weight_kg > 0 AND es.completed = 1
         AND e.exercise_type != 'bodyweight'
       ORDER BY es.weight_kg DESC
       LIMIT 1`,
      [req.userId]
    );

    // Best session volume per strength routine (top 3 by all-time best session)
    const [volByRoutineRows] = await pool.query<RowDataPacket[]>(
      `SELECT wr.id AS routine_id, wr.name AS routine_name,
              MAX(sess.volume_kg) AS best_volume_kg,
              SUBSTRING_INDEX(GROUP_CONCAT(sess.workout_date ORDER BY sess.volume_kg DESC), ',', 1) AS workout_date
       FROM workout_routines wr
       JOIN (
         SELECT wl.routine_id,
                SUM(es.reps * es.weight_kg) AS volume_kg,
                wl.workout_date
         FROM workout_logs wl
         JOIN workout_exercises we ON we.workout_log_id = wl.id
         JOIN exercise_sets es ON es.workout_exercise_id = we.id
         WHERE wl.user_id = ?
           AND es.reps IS NOT NULL AND es.weight_kg IS NOT NULL AND es.completed = 1
           AND wl.routine_id IS NOT NULL
         GROUP BY wl.id, wl.routine_id, wl.workout_date
       ) sess ON sess.routine_id = wr.id
       WHERE wr.user_id = ? AND wr.routine_type = 'strength'
       GROUP BY wr.id, wr.name
       ORDER BY best_volume_kg DESC
       LIMIT 3`,
      [req.userId, req.userId]
    );

    // Most calories burned in a single session
    const [calRows] = await pool.query<RowDataPacket[]>(
      `SELECT calories_burned, workout_date, name
       FROM workout_logs
       WHERE user_id = ? AND calories_burned IS NOT NULL AND calories_burned > 0
       ORDER BY calories_burned DESC
       LIMIT 1`,
      [req.userId]
    );

    // Best stair pace: highest stairs/min
    const [stairRows] = await pool.query<RowDataPacket[]>(
      `SELECT e.name AS exercise_name,
              es.steps / (es.duration_seconds / 60.0) AS pace_per_min,
              es.steps, es.duration_seconds, wl.workout_date
       FROM exercise_sets es
       JOIN workout_exercises we ON we.id = es.workout_exercise_id
       JOIN workout_logs wl ON wl.id = we.workout_log_id
       JOIN exercises e ON e.id = we.exercise_id
       LEFT JOIN workout_routines wr ON wr.id = wl.routine_id
       WHERE wl.user_id = ?
         AND (wr.routine_type = 'steps' OR e.name LIKE '%stair%')
         AND es.duration_seconds IS NOT NULL AND es.duration_seconds > 0
         AND es.steps IS NOT NULL AND es.steps > 0
         AND es.completed = 1
       ORDER BY pace_per_min DESC
       LIMIT 1`,
      [req.userId]
    );

    const lift = liftRows[0] ?? null;
    const calRow = calRows[0] ?? null;
    const stair = stairRows[0] ?? null;

    const toDate = (d: unknown) =>
      d instanceof Date ? d.toISOString().slice(0, 10) : String(d);

    res.json({
      heaviestLift: lift ? {
        exerciseName: lift.exercise_name,
        weightKg: Number(lift.weight_kg),
        reps: lift.reps ?? null,
        workoutDate: toDate(lift.workout_date),
      } : null,
      bestVolumeByRoutine: volByRoutineRows.map((r) => ({
        routineId: r.routine_id,
        routineName: r.routine_name,
        volumeKg: Number(r.best_volume_kg),
        workoutDate: r.workout_date ? toDate(r.workout_date) : null,
      })),
      mostCaloriesBurned: calRow ? {
        calories: Number(calRow.calories_burned),
        workoutDate: toDate(calRow.workout_date),
        workoutName: calRow.name ?? null,
      } : null,
      bestStairPace: stair ? {
        exerciseName: stair.exercise_name,
        pacePerMinute: Number(stair.pace_per_min),
        steps: Number(stair.steps),
        durationSeconds: Number(stair.duration_seconds),
        workoutDate: toDate(stair.workout_date),
      } : null,
    });
  } catch (err) {
    console.error('[workouts] error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/workouts/active
router.get('/active', async (req, res) => {
  try {
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT id FROM workout_logs WHERE user_id = ? AND completed = 0 ORDER BY created_at DESC LIMIT 1`,
      [req.userId]
    );
    if (!rows[0]) { res.json(null); return; }
    const detail = await getWorkoutDetail(rows[0].id);
    res.json(detail);
  } catch (err) {
    console.error('[workouts] error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/workouts
router.get('/', async (req, res) => {
  const hasDateRange = typeof req.query.start === 'string' || typeof req.query.end === 'string';
  const limit = Math.min(Number(req.query.limit) || (hasDateRange ? 1000 : 20), 5000);
  const offset = Number(req.query.offset) || 0;
  const routineId = req.query.routineId ? Number(req.query.routineId) : null;
  const start = typeof req.query.start === 'string' ? req.query.start : null;
  const end = typeof req.query.end === 'string' ? req.query.end : null;

  try {
    const whereParts = ['wl.user_id = ?', 'wl.completed = 1'];
    const queryParams: unknown[] = [req.userId];
    if (routineId) { whereParts.push('wl.routine_id = ?'); queryParams.push(routineId); }
    if (start && end) { whereParts.push('wl.workout_date BETWEEN ? AND ?'); queryParams.push(start, end); }
    else if (start) { whereParts.push('wl.workout_date >= ?'); queryParams.push(start); }
    else if (end) { whereParts.push('wl.workout_date <= ?'); queryParams.push(end); }
    queryParams.push(limit, offset);
    const whereClause = `WHERE ${whereParts.join(' AND ')}`;

    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT wl.*,
              COUNT(DISTINCT we.id) AS exercise_count,
              COUNT(DISTINCT es.id) AS set_count,
              COALESCE(SUM(CASE
                WHEN es.reps IS NOT NULL AND es.weight_kg IS NOT NULL THEN es.reps * es.weight_kg
                WHEN es.reps IS NOT NULL AND (wr.routine_type = 'bodyweight' OR e.exercise_type = 'bodyweight')
                  THEN es.reps * (
                    COALESCE(es.additional_weight_kg, 0) +
                    COALESCE(
                      (SELECT bm.value / 2.20462
                       FROM body_measurements bm
                       WHERE bm.user_id = wl.user_id AND bm.metric = 'weight' AND bm.unit IN ('lbs','lb')
                       ORDER BY bm.measured_at DESC, bm.id DESC LIMIT 1),
                      (SELECT bm2.value
                       FROM body_measurements bm2
                       WHERE bm2.user_id = wl.user_id AND bm2.metric = 'weight' AND bm2.unit NOT IN ('lbs','lb')
                       ORDER BY bm2.measured_at DESC, bm2.id DESC LIMIT 1),
                      0
                    )
                  )
                ELSE 0
              END), 0) AS total_volume_kg,
              COALESCE(SUM(COALESCE(es.steps, 0)), 0) AS total_steps,
              COALESCE(SUM(COALESCE(es.distance_meters, 0)), 0) AS total_distance_meters,
              COALESCE(SUM(COALESCE(es.duration_seconds, 0)), 0) AS total_duration_seconds,
              wr.name AS routine_name,
              wr.routine_type AS routine_type
       FROM workout_logs wl
       LEFT JOIN workout_exercises we ON we.workout_log_id = wl.id
       LEFT JOIN exercises e ON e.id = we.exercise_id
       LEFT JOIN exercise_sets es ON es.workout_exercise_id = we.id AND es.completed = 1
       LEFT JOIN workout_routines wr ON wr.id = wl.routine_id
       ${whereClause}
       GROUP BY wl.id, wr.name, wr.routine_type
       ORDER BY wl.workout_date DESC, wl.created_at DESC
       LIMIT ? OFFSET ?`,
      queryParams
    );

    const workouts = rows.map((r) => ({
      id: r.id,
      workoutDate: r.workout_date instanceof Date
        ? r.workout_date.toISOString().slice(0, 10)
        : String(r.workout_date),
      name: r.name ?? null,
      routineName: r.routine_name ?? null,
      routineType: r.routine_type ?? null,
      durationMinutes: r.duration_minutes ?? null,
      caloriesBurned: r.calories_burned ?? null,
      exerciseCount: Number(r.exercise_count),
      setCount: Number(r.set_count),
      totalVolumeKg: Number(r.total_volume_kg),
      totalSteps: Number(r.total_steps) || null,
      totalDistanceMeters: Number(r.total_distance_meters) || null,
      totalDurationSeconds: Number(r.total_duration_seconds) || null,
      createdAt: r.created_at,
      routineId: r.routine_id ?? null,
    }));

    if (!workouts.length) { res.json([]); return; }

    const ids = workouts.map((w) => w.id);
    const [exRows] = await pool.query<RowDataPacket[]>(
      `SELECT we.workout_log_id,
              e.name AS exercise_name,
              we.sort_order,
              COUNT(es.id) AS set_count,
              ROUND(AVG(es.reps)) AS avg_reps,
              SUM(es.reps) AS total_reps,
              MAX(es.weight_kg) AS max_weight_kg,
              SUM(es.duration_seconds) AS total_duration_seconds,
              SUM(es.distance_meters) AS total_distance_meters,
              SUM(es.steps) AS total_steps
       FROM workout_exercises we
       JOIN exercises e ON e.id = we.exercise_id
       LEFT JOIN exercise_sets es ON es.workout_exercise_id = we.id AND es.completed = 1
       WHERE we.workout_log_id IN (?)
       GROUP BY we.id
       ORDER BY we.workout_log_id, we.sort_order`,
      [ids]
    );

    const exercisesByWorkout: Record<number, {
      name: string; setCount: number; avgReps: number | null; totalReps: number | null;
      maxWeightKg: number | null; totalDurationSeconds: number | null;
      totalDistanceMeters: number | null; totalSteps: number | null;
    }[]> = {};
    for (const ex of exRows) {
      const setCount = Number(ex.set_count);
      if (setCount === 0) continue;
      const wid = ex.workout_log_id;
      if (!exercisesByWorkout[wid]) exercisesByWorkout[wid] = [];
      exercisesByWorkout[wid].push({
        name: ex.exercise_name,
        setCount,
        avgReps: ex.avg_reps != null ? Number(ex.avg_reps) : null,
        totalReps: ex.total_reps != null ? Number(ex.total_reps) : null,
        maxWeightKg: ex.max_weight_kg != null ? Number(ex.max_weight_kg) : null,
        totalDurationSeconds: ex.total_duration_seconds != null ? Number(ex.total_duration_seconds) : null,
        totalDistanceMeters: ex.total_distance_meters != null ? Number(ex.total_distance_meters) : null,
        totalSteps: ex.total_steps != null ? Number(ex.total_steps) : null,
      });
    }

    res.json(workouts.map((w) => ({ ...w, exercises: exercisesByWorkout[w.id] ?? [] })));
  } catch (err) {
    console.error('[workouts] error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/workouts
router.post('/', async (req, res) => {
  const today = localDateStr();
  const { name, workoutDate } = req.body as { name?: string; workoutDate?: string };

  try {
    const [result] = await pool.query<ResultSetHeader>(
      'INSERT INTO workout_logs (user_id, workout_date, name) VALUES (?, ?, ?)',
      [req.userId, workoutDate ?? today, name ?? null]
    );
    const detail = await getWorkoutDetail(result.insertId);
    res.status(201).json(detail);
  } catch (err) {
    console.error('[workouts] error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/workouts/:id/start-timer
router.post('/:id/start-timer', async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) { res.status(400).json({ error: 'Invalid id' }); return; }
  if (!await ownsWorkout(id, req.userId)) { res.status(404).json({ error: 'Not found' }); return; }

  try {
    await pool.query(
      'UPDATE workout_logs SET started_at = NOW() WHERE id = ? AND user_id = ? AND started_at IS NULL',
      [id, req.userId]
    );
    const [rows] = await pool.query<RowDataPacket[]>(
      'SELECT started_at, paused_at, total_paused_seconds FROM workout_logs WHERE id = ?', [id]
    );
    const row = rows[0];
    res.json({
      startedAt: row.started_at instanceof Date ? row.started_at.toISOString() : String(row.started_at),
      pausedAt: row.paused_at ? (row.paused_at instanceof Date ? row.paused_at.toISOString() : String(row.paused_at)) : null,
      totalPausedSeconds: row.total_paused_seconds ?? 0,
    });
  } catch (err) {
    console.error('[workouts] error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/workouts/:id/pause
router.post('/:id/pause', async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) { res.status(400).json({ error: 'Invalid id' }); return; }
  if (!await ownsWorkout(id, req.userId)) { res.status(404).json({ error: 'Not found' }); return; }

  try {
    await pool.query(
      'UPDATE workout_logs SET paused_at = NOW() WHERE id = ? AND user_id = ? AND paused_at IS NULL',
      [id, req.userId]
    );
    res.json({ ok: true });
  } catch (err) {
    console.error('[workouts] error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/workouts/:id/resume
router.post('/:id/resume', async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) { res.status(400).json({ error: 'Invalid id' }); return; }
  if (!await ownsWorkout(id, req.userId)) { res.status(404).json({ error: 'Not found' }); return; }

  try {
    await pool.query(
      `UPDATE workout_logs
       SET total_paused_seconds = total_paused_seconds + TIMESTAMPDIFF(SECOND, paused_at, NOW()),
           paused_at = NULL
       WHERE id = ? AND user_id = ? AND paused_at IS NOT NULL`,
      [id, req.userId]
    );
    const [rows] = await pool.query<RowDataPacket[]>(
      'SELECT total_paused_seconds FROM workout_logs WHERE id = ?', [id]
    );
    res.json({ totalPausedSeconds: rows[0]?.total_paused_seconds ?? 0 });
  } catch (err) {
    console.error('[workouts] error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/workouts/:id/estimate-calories
router.post('/:id/estimate-calories', async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) { res.status(400).json({ error: 'Invalid id' }); return; }
  if (!await ownsWorkout(id, req.userId)) { res.status(404).json({ error: 'Not found' }); return; }

  try {
    const detail = await getWorkoutDetail(id);
    if (!detail) { res.status(404).json({ error: 'Not found' }); return; }

    const [weightRows] = await pool.query<RowDataPacket[]>(
      `SELECT value, unit FROM body_measurements
       WHERE user_id = ? AND metric = 'weight'
       ORDER BY measured_at DESC, id DESC LIMIT 1`,
      [req.userId]
    );
    let bodyWeightKg = 75;
    if (weightRows[0]) {
      const { value, unit } = weightRows[0];
      bodyWeightKg = unit === 'lbs' ? Number(value) / 2.20462 : Number(value);
    }

    const caloriesBurned = await estimateCaloriesBurned({
      name: detail.name ?? 'Workout',
      durationMinutes: detail.durationMinutes ?? 30,
      bodyWeightKg,
      exercises: detail.exercises.map((ex) => ({
        name: ex.exercise.name,
        sets: ex.sets
          .filter((s) => s.completed)
          .map((s) => ({
            reps: s.reps,
            weightKg: s.weightKg,
            durationSeconds: s.durationSeconds,
            distanceMeters: s.distanceMeters,
          })),
      })),
    });

    await pool.query(
      'UPDATE workout_logs SET calories_burned = ? WHERE id = ?',
      [caloriesBurned, id]
    );

    res.json({ caloriesBurned });
  } catch (err) {
    console.error('estimate-calories error:', err);
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
    console.error('[workouts] error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// PUT /api/workouts/:id
router.put('/:id', async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) { res.status(400).json({ error: 'Invalid id' }); return; }
  if (!await ownsWorkout(id, req.userId)) { res.status(404).json({ error: 'Not found' }); return; }

  const { name, notes, durationMinutes, caloriesBurned, workoutDate, completed } = req.body;
  try {
    const setClauses = [
      'name=?', 'notes=?', 'duration_minutes=?', 'calories_burned=?',
      ...(workoutDate !== undefined ? ['workout_date=?'] : []),
      'completed=COALESCE(?, completed)',
    ].join(', ');
    const params = [
      name ?? null, notes ?? null, durationMinutes ?? null, caloriesBurned ?? null,
      ...(workoutDate !== undefined ? [workoutDate] : []),
      completed != null ? (completed ? 1 : 0) : null, id, req.userId,
    ];
    await pool.query(
      `UPDATE workout_logs SET ${setClauses} WHERE id = ? AND user_id = ?`,
      params
    );
    const detail = await getWorkoutDetail(id);
    res.json(detail);
  } catch (err) {
    console.error('[workouts] error:', err);
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
    console.error('[workouts] error:', err);
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
              e.id AS ex_id, e.name, e.category, e.exercise_type, e.muscles_primary, e.muscles_secondary, e.is_custom, e.tracked_fields
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
        trackedFields: (ex.tracked_fields as string | null)?.split(',').filter(Boolean) ?? ['reps', 'weight'],
      },
      sets: [],
    });
  } catch (err) {
    console.error('[workouts] error:', err);
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
    console.error('[workouts] error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// PUT /api/workouts/:id/exercises/:weId
router.put('/:id/exercises/:weId', async (req, res) => {
  const id = parseId(req.params.id);
  const weId = parseId(req.params.weId);
  if (!id || !weId) { res.status(400).json({ error: 'Invalid id' }); return; }
  if (!await ownsWorkout(id, req.userId)) { res.status(404).json({ error: 'Not found' }); return; }

  const { notes } = req.body as { notes?: string | null };
  try {
    await pool.query(
      'UPDATE workout_exercises SET notes = ? WHERE id = ? AND workout_log_id = ?',
      [notes ?? null, weId, id]
    );
    const [weRows] = await pool.query<RowDataPacket[]>(
      `SELECT we.exercise_id, wl.routine_id
       FROM workout_exercises we
       JOIN workout_logs wl ON wl.id = we.workout_log_id
       WHERE we.id = ? AND wl.user_id = ?`,
      [weId, req.userId]
    );
    const we = weRows[0];
    if (we?.routine_id) {
      await pool.query(
        'UPDATE routine_exercises SET notes = ? WHERE routine_id = ? AND exercise_id = ?',
        [notes ?? null, we.routine_id, we.exercise_id]
      );
    }
    res.json({ ok: true });
  } catch (err) {
    console.error('[workouts] error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/workouts/:id/exercises/:weId/sets
router.post('/:id/exercises/:weId/sets', async (req, res) => {
  const id = parseId(req.params.id);
  const weId = parseId(req.params.weId);
  if (!id || !weId) { res.status(400).json({ error: 'Invalid id' }); return; }
  if (!await ownsWorkout(id, req.userId)) { res.status(404).json({ error: 'Not found' }); return; }

  const { reps, weightKg, additionalWeightKg, durationSeconds, distanceMeters, steps } = req.body;

  try {
    const [countRows] = await pool.query<RowDataPacket[]>(
      'SELECT COUNT(*) AS cnt FROM exercise_sets WHERE workout_exercise_id = ?', [weId]
    );
    const setNumber = Number((countRows[0] as any).cnt) + 1;

    const [result] = await pool.query<ResultSetHeader>(
      `INSERT INTO exercise_sets (workout_exercise_id, set_number, reps, weight_kg, additional_weight_kg, duration_seconds, distance_meters, steps)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [weId, setNumber, reps ?? null, weightKg ?? null, additionalWeightKg ?? null, durationSeconds ?? null, distanceMeters ?? null, steps ?? null]
    );
    res.status(201).json({
      id: result.insertId,
      setNumber,
      reps: reps ?? null,
      weightKg: weightKg != null ? Number(weightKg) : null,
      additionalWeightKg: additionalWeightKg != null ? Number(additionalWeightKg) : null,
      durationSeconds: durationSeconds ?? null,
      distanceMeters: distanceMeters != null ? Number(distanceMeters) : null,
      steps: steps ?? null,
      completed: true,
    });
  } catch (err) {
    console.error('[workouts] error:', err);
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

  const { reps, weightKg, additionalWeightKg, durationSeconds, distanceMeters, steps, completed } = req.body;

  const setClauses: string[] = [];
  const values: (number | null | boolean)[] = [];
  if ('reps' in req.body)                  { setClauses.push('reps=?');                  values.push(reps ?? null); }
  if ('weightKg' in req.body)              { setClauses.push('weight_kg=?');             values.push(weightKg ?? null); }
  if ('additionalWeightKg' in req.body)    { setClauses.push('additional_weight_kg=?');  values.push(additionalWeightKg ?? null); }
  if ('durationSeconds' in req.body)       { setClauses.push('duration_seconds=?');      values.push(durationSeconds ?? null); }
  if ('distanceMeters' in req.body)        { setClauses.push('distance_meters=?');       values.push(distanceMeters ?? null); }
  if ('steps' in req.body)                 { setClauses.push('steps=?');                 values.push(steps ?? null); }
  if ('completed' in req.body)             { setClauses.push('completed=?');             values.push(completed ? 1 : 0); }

  if (setClauses.length === 0) { res.json({ success: true }); return; }

  try {
    await pool.query(
      `UPDATE exercise_sets SET ${setClauses.join(', ')} WHERE id = ? AND workout_exercise_id = ?`,
      [...values, setId, weId]
    );
    res.json({ success: true });
  } catch (err) {
    console.error('[workouts] error:', err);
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
    console.error('[workouts] error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

export default router;
