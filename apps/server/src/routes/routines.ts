import { Router } from 'express';
import { pool } from '../config/database';
import type { RowDataPacket, ResultSetHeader } from 'mysql2/promise';
import { getWorkoutDetail } from './workouts';
import { getPresignedUploadUrl, getPresignedGetUrl, clearPresignedUrlCache } from '../services/s3';

const router = Router();

const localDateStr = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Chicago' });

function parseId(param: string): number | null {
  const n = Number(param);
  return Number.isInteger(n) && n > 0 ? n : null;
}

// Get day-of-week: 0=Mon ... 6=Sun (different from JS Date.getDay() where 0=Sun)
function getDow(d: Date): number {
  const js = d.getUTCDay();
  return js === 0 ? 6 : js - 1;
}

// Find the next date that matches a recurrence pattern
function getNextOccurrenceDate(recurrenceType: string, config: any, startDate: Date): Date | null {
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  const start = new Date(startDate);
  start.setUTCHours(0, 0, 0, 0);

  // Start checking from today
  let current = new Date(today);

  // Search up to 365 days ahead
  for (let i = 0; i < 365; i++) {
    const diff = Math.round((current.getTime() - start.getTime()) / 86400000);
    let matches = false;

    switch (recurrenceType) {
      case 'daily':
        matches = diff >= 0;
        break;
      case 'every_other_day':
        matches = diff >= 0 && diff % 2 === 0;
        break;
      case 'days_of_week':
        matches = Array.isArray(config.days) && config.days.includes(getDow(current));
        break;
      case 'every_x_days':
        matches = diff >= 0 && config.interval > 0 && diff % config.interval === 0;
        break;
      case 'day_of_month':
        if (config.type === 'specific_dates') {
          matches = Array.isArray(config.dates) && config.dates.includes(current.getUTCDate());
        } else if (config.type === 'nth_weekday') {
          const dow = getDow(current);
          if (dow === config.weekday) {
            const dom = current.getUTCDate();
            matches = dom >= (config.n - 1) * 7 + 1 && dom <= config.n * 7;
          }
        }
        break;
      case 'custom_cycle': {
        if (diff < 0) {
          matches = false;
          break;
        }
        const items = config.items || [];
        if (items.length === 0) {
          matches = false;
          break;
        }
        const cycleDays = Array.isArray(config.days) && config.days.length > 0 ? config.days : null;
        const dow = getDow(current);

        // If specific workout days are defined, check if today is a workout day
        if (cycleDays) {
          if (!cycleDays.includes(dow)) {
            matches = false;
            break;
          }
        } else {
          // If no specific days, check if it's not a rest weekend
          const alwaysRestWeekends = config.alwaysRestWeekends === true;
          if (alwaysRestWeekends && (dow === 5 || dow === 6)) {
            matches = false;
            break;
          }
        }

        // If we got here, it's a potential workout day
        matches = true;
        break;
      }
    }

    if (matches) {
      return current;
    }

    current.setUTCDate(current.getUTCDate() + 1);
  }

  return null;
}

// For custom_cycle schedules, find the next occurrence of a specific routine in the cycle
function getNextOccurrenceInCustomCycle(routineId: number, config: any, startDate: Date): Date | null {
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  const start = new Date(startDate);
  start.setUTCHours(0, 0, 0, 0);

  const items = config.items || [];
  if (!items.length) return null;

  const cycleDays = Array.isArray(config.days) && config.days.length > 0 ? config.days : null;
  let current = new Date(today);

  // Search up to 365 days
  for (let i = 0; i < 365; i++) {
    const diff = Math.round((current.getTime() - start.getTime()) / 86400000);
    const dow = getDow(current);

    if (diff < 0) {
      current.setUTCDate(current.getUTCDate() + 1);
      continue;
    }

    // Check if this is a workout day
    let isWorkoutDay = true;
    if (cycleDays) {
      isWorkoutDay = cycleDays.includes(dow);
    } else {
      const alwaysRestWeekends = config.alwaysRestWeekends === true;
      if (alwaysRestWeekends && (dow === 5 || dow === 6)) {
        isWorkoutDay = false;
      }
    }

    if (isWorkoutDay) {
      // Count workout days from start to current
      let dayCount = 0;
      const cursor = new Date(start);
      while (cursor < current) {
        const curDow = getDow(cursor);
        const curIsWorkoutDay = cycleDays ? cycleDays.includes(curDow) : !(config.alwaysRestWeekends && (curDow === 5 || curDow === 6));
        if (curIsWorkoutDay) dayCount++;
        cursor.setUTCDate(cursor.getUTCDate() + 1);
      }

      // Find which item in the cycle this day corresponds to
      const posInCycle = dayCount % items.length;
      const item = items[posInCycle];
      if (item && item.type === 'routine' && item.id === routineId) {
        return current;
      }
    }

    current.setUTCDate(current.getUTCDate() + 1);
  }

  return null;
}

async function ownsRoutine(routineId: number, userId: number): Promise<boolean> {
  const [rows] = await pool.query<RowDataPacket[]>(
    'SELECT id FROM workout_routines WHERE id = ? AND user_id = ?', [routineId, userId]
  );
  return rows.length > 0;
}

async function getLastPerformedSets(exerciseId: number, userId: number, routineId?: number): Promise<RowDataPacket[]> {
  const routineFilter = routineId != null ? 'AND wl.routine_id = ?' : '';
  const routineFilter2 = routineId != null ? 'AND wl2.routine_id = ?' : '';
  const params = routineId != null
    ? [userId, exerciseId, routineId, userId, exerciseId, routineId]
    : [userId, exerciseId, userId, exerciseId];
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT es.*
     FROM exercise_sets es
     JOIN workout_exercises we ON we.id = es.workout_exercise_id
     JOIN workout_logs wl ON wl.id = we.workout_log_id
     WHERE wl.user_id = ? AND we.exercise_id = ? AND wl.completed = 1 ${routineFilter}
       AND wl.id = (
         SELECT wl2.id FROM workout_logs wl2
         JOIN workout_exercises we2 ON we2.workout_log_id = wl2.id
         WHERE wl2.user_id = ? AND we2.exercise_id = ? AND wl2.completed = 1 ${routineFilter2}
         ORDER BY wl2.workout_date DESC, wl2.id DESC
         LIMIT 1
       )
     ORDER BY es.set_number ASC`,
    params
  );
  return rows;
}

function mapSet(s: RowDataPacket) {
  return {
    id: s.id,
    setNumber: s.set_number,
    reps: s.reps ?? null,
    weightKg: s.weight_kg != null ? Number(s.weight_kg) : null,
    durationSeconds: s.duration_seconds ?? null,
    distanceMeters: s.distance_meters != null ? Number(s.distance_meters) : null,
    steps: s.steps ?? null,
  };
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
            e.muscles_primary, e.muscles_secondary, e.is_custom, e.tracked_fields
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
    const lastPerformedSets = await getLastPerformedSets(ex.ex_id, userId, routineId);

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
        trackedFields: (ex.tracked_fields as string | null)?.split(',').filter(Boolean) ?? ['reps', 'weight'],
      },
      templateSets: templateSets.map(mapSet),
      lastPerformedSets: lastPerformedSets.length > 0 ? lastPerformedSets.map(mapSet) : null,
    };
  }));

  return {
    id: r.id,
    name: r.name,
    notes: r.notes ?? null,
    routineType: r.routine_type ?? 'strength',
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
         wl.calories_burned,
         SUM(CASE WHEN es.reps IS NOT NULL AND es.weight_kg IS NOT NULL THEN es.reps * es.weight_kg ELSE 0 END) AS volume_kg,
         SUM(COALESCE(es.steps, 0)) AS total_steps,
         SUM(COALESCE(es.distance_meters, 0)) AS total_distance_meters,
         SUM(COALESCE(es.duration_seconds, 0)) AS total_duration_seconds
       FROM workout_logs wl
       LEFT JOIN workout_exercises we ON we.workout_log_id = wl.id
       LEFT JOIN exercise_sets es ON es.workout_exercise_id = we.id
       WHERE wl.user_id = ? AND wl.routine_id IN (?) AND wl.completed = 1
         AND wl.workout_date = (
           SELECT MAX(wl2.workout_date) FROM workout_logs wl2
           WHERE wl2.user_id = wl.user_id AND wl2.routine_id = wl.routine_id AND wl2.completed = 1
         )
         AND wl.id = (
           SELECT MAX(wl3.id) FROM workout_logs wl3
           WHERE wl3.user_id = wl.user_id AND wl3.routine_id = wl.routine_id AND wl3.completed = 1
             AND wl3.workout_date = wl.workout_date
         )
       GROUP BY wl.routine_id, wl.workout_date, wl.calories_burned`,
      [req.userId, ids]
    );
    const lastUsedMap: Record<number, string> = {};
    const lastVolumeMap: Record<number, number | null> = {};
    const lastCaloriesMap: Record<number, number | null> = {};
    const lastStepsMap: Record<number, number | null> = {};
    const lastDistanceMap: Record<number, number | null> = {};
    const lastDurationMap: Record<number, number | null> = {};
    for (const lu of lastUsedRows) {
      lastUsedMap[lu.routine_id] = lu.last_used instanceof Date
        ? lu.last_used.toISOString().slice(0, 10)
        : String(lu.last_used);
      lastVolumeMap[lu.routine_id] = lu.volume_kg != null
        ? Math.round(Number(lu.volume_kg) * 2.20462)
        : null;
      lastCaloriesMap[lu.routine_id] = lu.calories_burned != null ? Number(lu.calories_burned) : null;
      lastStepsMap[lu.routine_id] = lu.total_steps != null ? Number(lu.total_steps) : null;
      lastDistanceMap[lu.routine_id] = lu.total_distance_meters != null ? Number(lu.total_distance_meters) : null;
      lastDurationMap[lu.routine_id] = lu.total_duration_seconds != null ? Number(lu.total_duration_seconds) : null;
    }

    // Fetch schedules for sorting by next occurrence
    const [scheduleRows] = await pool.query<RowDataPacket[]>(
      `SELECT id, routine_id, recurrence_type, recurrence_config, start_date
       FROM workout_schedules
       WHERE user_id = ?`,
      [req.userId]
    );
    const nextOccurrenceMap: Record<number, string | null> = {};

    for (const sched of scheduleRows) {
      const config = typeof sched.recurrence_config === 'string'
        ? JSON.parse(sched.recurrence_config)
        : sched.recurrence_config;
      const startDate = sched.start_date instanceof Date
        ? sched.start_date
        : new Date(String(sched.start_date) + 'T00:00:00.000Z');

      if (sched.recurrence_type === 'custom_cycle') {
        const items = config.items || [];
        for (const item of items) {
          if (item.type === 'routine' && item.id && !nextOccurrenceMap[item.id]) {
            const nextDate = getNextOccurrenceInCustomCycle(item.id, config, startDate);
            nextOccurrenceMap[item.id] = nextDate ? nextDate.toISOString().slice(0, 10) : null;
          }
        }
      } else if (sched.routine_id) {
        if (!nextOccurrenceMap[sched.routine_id]) {
          const nextDate = getNextOccurrenceDate(sched.recurrence_type, config, startDate);
          nextOccurrenceMap[sched.routine_id] = nextDate ? nextDate.toISOString().slice(0, 10) : null;
        }
      }
    }

    // Compute lastPrimaryMetric per routine based on routine_type
    function getPrimaryMetric(r: RowDataPacket): number | null {
      const rt = r.routine_type ?? 'strength';
      switch (rt) {
        case 'steps': {
          const steps = lastStepsMap[r.id];
          const dur = lastDurationMap[r.id];
          if (!steps || !dur) return null;
          return Math.round(steps / (dur / 60));  // stairs/min
        }
        case 'cardio_distance': {
          const dist = lastDistanceMap[r.id];
          const dur = lastDurationMap[r.id];
          if (!dist || !dur) return null;
          return Number(((dist / 1609.34) / (dur / 60)).toFixed(2));  // mi/min
        }
        case 'cardio_duration': return lastDurationMap[r.id] ? Math.round(lastDurationMap[r.id]! / 60) : null;
        case 'bodyweight':
        case 'strength':
        default:                return lastVolumeMap[r.id] ?? null;
      }
    }

    const list = await Promise.all(rows.map(async (r) => ({
      id: r.id,
      name: r.name,
      notes: r.notes ?? null,
      routineType: r.routine_type ?? 'strength',
      exerciseCount: Number(r.exercise_count),
      lastUsedDate: lastUsedMap[r.id] ?? null,
      nextOccurrenceDate: nextOccurrenceMap[r.id] ?? null,
      lastVolumeLbs: lastVolumeMap[r.id] ?? null,
      lastPrimaryMetric: getPrimaryMetric(r),
      lastCaloriesBurned: lastCaloriesMap[r.id] ?? null,
      coverImageUrl: r.cover_image_key ? await getPresignedGetUrl(r.cover_image_key) : null,
      createdAt: r.created_at,
    })));

    // Sort: routines with next occurrence first (by date), then routines without
    list.sort((a, b) => {
      const aHasNext = a.nextOccurrenceDate != null;
      const bHasNext = b.nextOccurrenceDate != null;
      if (aHasNext && !bHasNext) return -1;
      if (!aHasNext && bHasNext) return 1;
      if (aHasNext && bHasNext) {
        return a.nextOccurrenceDate!.localeCompare(b.nextOccurrenceDate!);
      }
      return 0;
    });

    res.json(list);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/routines/goals — all routine goals for this user
router.get('/goals', async (req, res) => {
  try {
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT rg.*
       FROM routine_goals rg
       JOIN workout_routines wr ON wr.id = rg.routine_id
       WHERE rg.user_id = ? AND rg.effective_from = (
         SELECT MAX(rg2.effective_from) FROM routine_goals rg2
         WHERE rg2.user_id = rg.user_id AND rg2.routine_id = rg.routine_id
       )`,
      [req.userId]
    );
    res.json(rows.map((r) => ({
      id: r.id,
      routineId: r.routine_id,
      targetPerWeek: Number(r.target_per_week),
      effectiveFrom: r.effective_from instanceof Date
        ? r.effective_from.toISOString().slice(0, 10)
        : String(r.effective_from),
    })));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/routines
router.post('/', async (req, res) => {
  const { name, notes, routineType } = req.body as { name: string; notes?: string; routineType?: string };
  if (!name?.trim()) { res.status(400).json({ error: 'name required' }); return; }

  try {
    const [result] = await pool.query<ResultSetHeader>(
      'INSERT INTO workout_routines (user_id, name, notes, routine_type) VALUES (?, ?, ?, ?)',
      [req.userId, name.trim(), notes ?? null, routineType ?? 'strength']
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

  const { name, notes, coverImageKey, routineType } = req.body;
  try {
    const updates: string[] = [];
    const values: unknown[] = [];
    if (name !== undefined) { updates.push('name=?'); values.push(name); }
    if (notes !== undefined) { updates.push('notes=?'); values.push(notes ?? null); }
    if (routineType !== undefined) { updates.push('routine_type=?'); values.push(routineType); }
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

// GET /api/routines/:id/goal
router.get('/:id/goal', async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) { res.status(400).json({ error: 'Invalid id' }); return; }
  if (!await ownsRoutine(id, req.userId)) { res.status(404).json({ error: 'Not found' }); return; }

  try {
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT * FROM routine_goals WHERE user_id = ? AND routine_id = ?
       ORDER BY effective_from DESC, id DESC LIMIT 1`,
      [req.userId, id]
    );
    if (!rows.length) { res.json(null); return; }
    const r = rows[0];
    res.json({
      id: r.id,
      routineId: r.routine_id,
      targetPerWeek: Number(r.target_per_week),
      effectiveFrom: r.effective_from instanceof Date
        ? r.effective_from.toISOString().slice(0, 10)
        : String(r.effective_from),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// PUT /api/routines/:id/goal
router.put('/:id/goal', async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) { res.status(400).json({ error: 'Invalid id' }); return; }
  if (!await ownsRoutine(id, req.userId)) { res.status(404).json({ error: 'Not found' }); return; }

  const { targetPerWeek } = req.body as { targetPerWeek: number };
  if (targetPerWeek == null || isNaN(Number(targetPerWeek))) {
    res.status(400).json({ error: 'targetPerWeek required' }); return;
  }

  try {
    const today = localDateStr();
    const [result] = await pool.query<ResultSetHeader>(
      `INSERT INTO routine_goals (user_id, routine_id, target_per_week, effective_from)
       VALUES (?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE target_per_week = VALUES(target_per_week)`,
      [req.userId, id, Number(targetPerWeek), today]
    );
    const insertId = result.insertId || 0;
    res.json({
      id: insertId,
      routineId: id,
      targetPerWeek: Number(targetPerWeek),
      effectiveFrom: today,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// DELETE /api/routines/:id/goal
router.delete('/:id/goal', async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) { res.status(400).json({ error: 'Invalid id' }); return; }
  if (!await ownsRoutine(id, req.userId)) { res.status(404).json({ error: 'Not found' }); return; }

  try {
    await pool.query(
      'DELETE FROM routine_goals WHERE user_id = ? AND routine_id = ?',
      [req.userId, id]
    );
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
              e.muscles_primary, e.muscles_secondary, e.is_custom, e.tracked_fields
       FROM routine_exercises re
       JOIN exercises e ON e.id = re.exercise_id
       WHERE re.id = ?`,
      [result.insertId]
    );
    const ex = rows[0];
    const lastPerformedSets = await getLastPerformedSets(ex.ex_id, req.userId, id);

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
        trackedFields: (ex.tracked_fields as string | null)?.split(',').filter(Boolean) ?? ['reps', 'weight'],
      },
      templateSets: [],
      lastPerformedSets: lastPerformedSets.length > 0 ? lastPerformedSets.map(mapSet) : null,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// PUT /api/routines/:id/exercises/reorder
router.put('/:id/exercises/reorder', async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) { res.status(400).json({ error: 'Invalid id' }); return; }
  if (!await ownsRoutine(id, req.userId)) { res.status(404).json({ error: 'Not found' }); return; }

  const { order } = req.body as { order: { id: number; sortOrder: number }[] };
  if (!Array.isArray(order) || order.length === 0) { res.status(400).json({ error: 'order array required' }); return; }

  try {
    await Promise.all(
      order.map(({ id: reId, sortOrder }) =>
        pool.query('UPDATE routine_exercises SET sort_order = ? WHERE id = ? AND routine_id = ?', [sortOrder, reId, id])
      )
    );
    res.json({ success: true });
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

  const { reps, weightKg, durationSeconds, distanceMeters, steps } = req.body;

  try {
    const [countRows] = await pool.query<RowDataPacket[]>(
      'SELECT COUNT(*) AS cnt FROM routine_exercise_sets WHERE routine_exercise_id = ?', [reId]
    );
    const setNumber = Number((countRows[0] as any).cnt) + 1;

    const [result] = await pool.query<ResultSetHeader>(
      `INSERT INTO routine_exercise_sets (routine_exercise_id, set_number, reps, weight_kg, duration_seconds, distance_meters, steps)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [reId, setNumber, reps ?? null, weightKg ?? null, durationSeconds ?? null, distanceMeters ?? null, steps ?? null]
    );
    res.status(201).json({
      id: result.insertId,
      setNumber,
      reps: reps ?? null,
      weightKg: weightKg != null ? Number(weightKg) : null,
      durationSeconds: durationSeconds ?? null,
      distanceMeters: distanceMeters != null ? Number(distanceMeters) : null,
      steps: steps ?? null,
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

  const { reps, weightKg, durationSeconds, distanceMeters, steps } = req.body;

  try {
    await pool.query(
      `UPDATE routine_exercise_sets SET reps=?, weight_kg=?, duration_seconds=?, distance_meters=?, steps=?
       WHERE id = ? AND routine_exercise_id = ?`,
      [reps ?? null, weightKg ?? null, durationSeconds ?? null, distanceMeters ?? null, steps ?? null, sId, reId]
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

// POST /api/routines/:id/start — create a workout_log from this routine (or resume in-progress one)
router.post('/:id/start', async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) { res.status(400).json({ error: 'Invalid id' }); return; }
  if (!await ownsRoutine(id, req.userId)) { res.status(404).json({ error: 'Not found' }); return; }

  // Resume an existing incomplete session for this routine if one exists
  const [activeRows] = await pool.query<RowDataPacket[]>(
    `SELECT id FROM workout_logs WHERE user_id = ? AND routine_id = ? AND completed = 0 ORDER BY created_at DESC LIMIT 1`,
    [req.userId, id]
  );
  if ((activeRows as any[]).length > 0) {
    const detail = await getWorkoutDetail((activeRows as any[])[0].id);
    res.json(detail);
    return;
  }

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

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
      `SELECT re.id AS re_id, re.exercise_id, re.sort_order, re.notes AS re_notes
       FROM routine_exercises re
       WHERE re.routine_id = ?
       ORDER BY re.sort_order ASC, re.id ASC`,
      [id]
    );

    const today = localDateStr();
    const [wResult] = await conn.query<ResultSetHeader>(
      `INSERT INTO workout_logs (user_id, workout_date, name, started_at, routine_id)
       VALUES (?, ?, ?, NOW(), ?)`,
      [req.userId, today, routine.name, id]
    );
    const workoutId = wResult.insertId;

    for (const re of reRows) {
      const [weResult] = await conn.query<ResultSetHeader>(
        'INSERT INTO workout_exercises (workout_log_id, exercise_id, sort_order, notes) VALUES (?, ?, ?, ?)',
        [workoutId, re.exercise_id, re.sort_order, re.re_notes ?? null]
      );
      const weId = weResult.insertId;

      const lastSets = await getLastPerformedSets(re.exercise_id, req.userId, id);

      if (lastSets.length > 0) {
        for (const s of lastSets) {
          await conn.query(
            `INSERT INTO exercise_sets (workout_exercise_id, set_number, reps, weight_kg, duration_seconds, distance_meters, steps, completed)
             VALUES (?, ?, ?, ?, ?, ?, ?, 0)`,
            [weId, s.set_number, s.reps ?? null, s.weight_kg ?? null, s.duration_seconds ?? null, s.distance_meters ?? null, s.steps ?? null]
          );
        }
      } else {
        const [templateSets] = await conn.query<RowDataPacket[]>(
          'SELECT * FROM routine_exercise_sets WHERE routine_exercise_id = ? ORDER BY set_number ASC',
          [re.re_id]
        );
        for (const s of templateSets) {
          await conn.query(
            `INSERT INTO exercise_sets (workout_exercise_id, set_number, reps, weight_kg, duration_seconds, distance_meters, steps, completed)
             VALUES (?, ?, ?, ?, ?, ?, ?, 0)`,
            [weId, s.set_number, s.reps ?? null, s.weight_kg ?? null, s.duration_seconds ?? null, s.distance_meters ?? null, s.steps ?? null]
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
