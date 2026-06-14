import { Router } from 'express';
import { pool } from '../config/database';
import type { RowDataPacket, ResultSetHeader } from 'mysql2/promise';
import { getPresignedUploadUrl, getPresignedGetUrl, uploadBuffer, clearPresignedUrlCache } from '../services/s3';

import { parseId } from '../utils/routes';
import { isSafePhotoUrl, resolveMediaUrl } from '../utils/media';

const router = Router();

function isYouTubeUrl(url: string): boolean {
  try {
    const { hostname } = new URL(url);
    return ['www.youtube.com', 'youtube.com', 'youtu.be', 'm.youtube.com'].includes(hostname);
  } catch { return false; }
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
      `SELECT * FROM exercises ${where} ORDER BY name ASC`,
      params
    );
    const mapped = await Promise.all(rows.map(async (r) => ({
      id: r.id,
      name: r.name,
      category: r.category,
      exerciseType: r.exercise_type,
      musclesPrimary: r.muscles_primary ?? [],
      musclesSecondary: r.muscles_secondary ?? [],
      isCustom: Boolean(r.is_custom),
      instructions: r.instructions ?? null,
      mediaUrl: await resolveMediaUrl(r.media_url),
      coverImageUrl: await resolveMediaUrl(r.cover_image_url),
      muscleImageUrl: await resolveMediaUrl(r.muscle_image_url),
      mediaKey: r.media_url ?? null,
      coverImageKey: r.cover_image_url ?? null,
      muscleImageKey: r.muscle_image_url ?? null,
      notes: r.notes ?? null,
      trackedFields: (r.tracked_fields as string | null)?.split(',').filter(Boolean) ?? ['reps', 'weight'],
    })));
    res.json(mapped);
  } catch (err) {
    console.error('[exercises] error:', err);
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
    console.error('[exercises] error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

function defaultTrackedFields(exerciseType: string): string {
  switch (exerciseType) {
    case 'cardio':     return 'duration,distance';
    case 'duration':   return 'duration';
    case 'bodyweight': return 'reps';
    default:           return 'reps,weight';
  }
}

// POST /api/exercises — create custom exercise
router.post('/', async (req, res) => {
  const { name, category, exerciseType, trackedFields } = req.body as {
    name: string;
    category: string;
    exerciseType: string;
    trackedFields?: string[];
  };
  if (!name?.trim() || !category?.trim() || !exerciseType) {
    res.status(400).json({ error: 'name, category, and exerciseType required' });
    return;
  }
  const fields = trackedFields?.length
    ? trackedFields.join(',')
    : defaultTrackedFields(exerciseType);
  try {
    const [result] = await pool.query<ResultSetHeader>(
      `INSERT INTO exercises (name, category, exercise_type, muscles_primary, muscles_secondary, is_custom, tracked_fields)
       VALUES (?, ?, ?, '[]', '[]', 1, ?)`,
      [name.trim(), category.trim(), exerciseType, fields]
    );
    res.status(201).json({
      id: result.insertId,
      name: name.trim(),
      category: category.trim(),
      exerciseType,
      musclesPrimary: [],
      musclesSecondary: [],
      isCustom: true,
      trackedFields: fields.split(','),
    });
  } catch (err) {
    console.error('[exercises] error:', err);
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
      mediaUrl: await resolveMediaUrl(r.media_url),
      coverImageUrl: await resolveMediaUrl(r.cover_image_url),
      muscleImageUrl: await resolveMediaUrl(r.muscle_image_url),
      mediaKey: r.media_url ?? null,
      coverImageKey: r.cover_image_url ?? null,
      muscleImageKey: r.muscle_image_url ?? null,
      notes: r.notes ?? null,
      trackedFields: (r.tracked_fields as string | null)?.split(',').filter(Boolean) ?? ['reps', 'weight'],
    });
  } catch (err) {
    console.error('[exercises] error:', err);
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
      // Heaviest single set — include workout name and date
      pool.query<RowDataPacket[]>(
        `SELECT es.weight_kg, es.reps, wl.name AS workout_name, wl.workout_date
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
      // Best set volume — actual row so we get reps, weight, and date
      pool.query<RowDataPacket[]>(
        `SELECT es.reps * es.weight_kg AS best_set_vol, es.reps, es.weight_kg, wl.workout_date
         FROM exercise_sets es
         JOIN workout_exercises we ON we.id = es.workout_exercise_id
         JOIN workout_logs wl ON wl.id = we.workout_log_id
         WHERE wl.user_id = ? AND we.exercise_id = ?
           AND es.reps IS NOT NULL AND es.weight_kg IS NOT NULL AND es.completed = 1
         ORDER BY es.reps * es.weight_kg DESC LIMIT 1`,
        [userId, id]
      ),
      // Best session volume — include workout name and date
      pool.query<RowDataPacket[]>(
        `SELECT session_vol, workout_name, workout_date FROM (
           SELECT SUM(es.reps * es.weight_kg) AS session_vol, wl.name AS workout_name, wl.workout_date
           FROM workout_logs wl
           JOIN workout_exercises we ON we.workout_log_id = wl.id
           JOIN exercise_sets es ON es.workout_exercise_id = we.id
           WHERE wl.user_id = ? AND we.exercise_id = ?
             AND es.reps IS NOT NULL AND es.weight_kg IS NOT NULL AND es.completed = 1
           GROUP BY wl.id, wl.name, wl.workout_date
         ) t
         ORDER BY session_vol DESC LIMIT 1`,
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

    const heaviestDate = heaviest?.workout_date instanceof Date
      ? heaviest.workout_date.toISOString().slice(0, 10)
      : heaviest?.workout_date ? String(heaviest.workout_date) : null;
    const setVolDate = setVol?.workout_date instanceof Date
      ? setVol.workout_date.toISOString().slice(0, 10)
      : setVol?.workout_date ? String(setVol.workout_date) : null;
    const sessVolDate = sessVol?.workout_date instanceof Date
      ? sessVol.workout_date.toISOString().slice(0, 10)
      : sessVol?.workout_date ? String(sessVol.workout_date) : null;

    res.json({
      exerciseId: id,
      personalBests: {
        heaviestWeightKg: heaviest?.weight_kg != null ? Number(heaviest.weight_kg) : null,
        heaviestWeightWorkoutName: heaviest?.workout_name ?? null,
        heaviestWeightDate: heaviestDate,
        estimatedOneRepMaxKg: orm?.orm != null ? Number(orm.orm) : null,
        bestSetVolumeKg: setVol?.best_set_vol != null ? Number(setVol.best_set_vol) : null,
        bestSetVolumeReps: setVol?.reps ?? null,
        bestSetVolumeWeightKg: setVol?.weight_kg != null ? Number(setVol.weight_kg) : null,
        bestSetVolumeDate: setVolDate,
        bestSessionVolumeKg: sessVol?.best_session_vol != null ? Number(sessVol.best_session_vol) : null,
        bestSessionVolumeWorkoutName: sessVol?.workout_name ?? null,
        bestSessionVolumeDate: sessVolDate,
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
    console.error('[exercises] error:', err);
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
        steps: s.steps ?? null,
        completed: Boolean(s.completed),
      })),
    })));
  } catch (err) {
    console.error('[exercises] error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/exercises/:id/cover-image-from-url — fetch image from URL and upload to S3
router.post('/:id/cover-image-from-url', async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) { res.status(400).json({ error: 'Invalid id' }); return; }
  const { url } = req.body as { url?: string };
  if (!url) { res.status(400).json({ error: 'url is required' }); return; }
  if (!isSafePhotoUrl(url)) { res.status(400).json({ error: 'Invalid or disallowed URL' }); return; }
  try {
    const response = await fetch(url);
    if (!response.ok) { res.status(400).json({ error: 'Could not fetch image from URL' }); return; }
    const contentType = response.headers.get('content-type') || 'image/jpeg';
    if (!contentType.startsWith('image/')) { res.status(400).json({ error: 'URL does not point to an image' }); return; }
    const buffer = Buffer.from(await response.arrayBuffer());
    const key = `exercises/${id}/cover/${Date.now()}`;
    await uploadBuffer(key, buffer, contentType);
    clearPresignedUrlCache(key);
    res.json({ key });
  } catch (err) {
    console.error('[exercises] error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/exercises/:id/cover-image — get presigned upload URL (file picker)
router.post('/:id/cover-image', async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) { res.status(400).json({ error: 'Invalid id' }); return; }
  const { contentType = 'image/jpeg' } = req.body as { contentType?: string };
  try {
    const key = `exercises/${id}/cover/${Date.now()}`;
    const uploadUrl = await getPresignedUploadUrl(key, contentType);
    res.json({ uploadUrl, key });
  } catch (err) {
    console.error('[exercises] error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/exercises/:id/media-from-url — fetch media from URL and upload to S3 (YouTube pass-through)
router.post('/:id/media-from-url', async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) { res.status(400).json({ error: 'Invalid id' }); return; }
  const { url } = req.body as { url?: string };
  if (!url) { res.status(400).json({ error: 'url is required' }); return; }
  if (isYouTubeUrl(url)) {
    // YouTube URLs cannot be re-hosted — store the raw URL directly
    res.json({ key: url, isYouTube: true }); return;
  }
  if (!isSafePhotoUrl(url)) { res.status(400).json({ error: 'Invalid or disallowed URL' }); return; }
  try {
    const response = await fetch(url);
    if (!response.ok) { res.status(400).json({ error: 'Could not fetch media from URL' }); return; }
    const contentType = response.headers.get('content-type') || 'image/jpeg';
    const buffer = Buffer.from(await response.arrayBuffer());
    const key = `exercises/${id}/media/${Date.now()}`;
    await uploadBuffer(key, buffer, contentType);
    clearPresignedUrlCache(key);
    res.json({ key });
  } catch (err) {
    console.error('[exercises] error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/exercises/:id/media — get presigned upload URL (file picker)
router.post('/:id/media', async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) { res.status(400).json({ error: 'Invalid id' }); return; }
  const { contentType = 'image/jpeg' } = req.body as { contentType?: string };
  try {
    const key = `exercises/${id}/media/${Date.now()}`;
    const uploadUrl = await getPresignedUploadUrl(key, contentType);
    res.json({ uploadUrl, key });
  } catch (err) {
    console.error('[exercises] error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/exercises/:id/muscle-image-from-url — fetch image from URL and upload to S3
router.post('/:id/muscle-image-from-url', async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) { res.status(400).json({ error: 'Invalid id' }); return; }
  const { url } = req.body as { url?: string };
  if (!url) { res.status(400).json({ error: 'url is required' }); return; }
  if (!isSafePhotoUrl(url)) { res.status(400).json({ error: 'Invalid or disallowed URL' }); return; }
  try {
    const response = await fetch(url);
    if (!response.ok) { res.status(400).json({ error: 'Could not fetch image from URL' }); return; }
    const contentType = response.headers.get('content-type') || 'image/jpeg';
    if (!contentType.startsWith('image/')) { res.status(400).json({ error: 'URL does not point to an image' }); return; }
    const buffer = Buffer.from(await response.arrayBuffer());
    const key = `exercises/${id}/muscle/${Date.now()}`;
    await uploadBuffer(key, buffer, contentType);
    clearPresignedUrlCache(key);
    res.json({ key });
  } catch (err) {
    console.error('[exercises] error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/exercises/:id/muscle-image — get presigned upload URL (file picker)
router.post('/:id/muscle-image', async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) { res.status(400).json({ error: 'Invalid id' }); return; }
  const { contentType = 'image/jpeg' } = req.body as { contentType?: string };
  try {
    const key = `exercises/${id}/muscle/${Date.now()}`;
    const uploadUrl = await getPresignedUploadUrl(key, contentType);
    res.json({ uploadUrl, key });
  } catch (err) {
    console.error('[exercises] error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// PUT /api/exercises/:id — update any exercise
router.put('/:id', async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) { res.status(400).json({ error: 'Invalid id' }); return; }
  const { name, category, exerciseType, musclesPrimary, musclesSecondary, instructions, mediaUrl, coverImageUrl, muscleImageUrl, notes, trackedFields } =
    req.body as {
      name?: string; category?: string; exerciseType?: string;
      musclesPrimary?: string[]; musclesSecondary?: string[];
      instructions?: string | null; mediaUrl?: string | null;
      coverImageUrl?: string | null; muscleImageUrl?: string | null; notes?: string | null;
      trackedFields?: string[];
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
    if (trackedFields !== undefined) { updates.push('tracked_fields = ?'); values.push(trackedFields.join(',')); }
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
      isCustom: Boolean(r.is_custom), instructions: r.instructions ?? null,
      mediaUrl: await resolveMediaUrl(r.media_url),
      coverImageUrl: await resolveMediaUrl(r.cover_image_url),
      muscleImageUrl: await resolveMediaUrl(r.muscle_image_url),
      mediaKey: r.media_url ?? null,
      coverImageKey: r.cover_image_url ?? null,
      muscleImageKey: r.muscle_image_url ?? null,
      notes: r.notes ?? null,
      trackedFields: (r.tracked_fields as string | null)?.split(',').filter(Boolean) ?? ['reps', 'weight'],
    });
  } catch (err) {
    console.error('[exercises] error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// DELETE /api/exercises/:id — delete any exercise
router.delete('/:id', async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) { res.status(400).json({ error: 'Invalid id' }); return; }
  try {
    const [result] = await pool.query<ResultSetHeader>(
      'DELETE FROM exercises WHERE id = ?',
      [id]
    );
    if (result.affectedRows === 0) {
      res.status(404).json({ error: 'Exercise not found' });
      return;
    }
    res.json({ success: true });
  } catch (err) {
    console.error('[exercises] error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

export default router;
