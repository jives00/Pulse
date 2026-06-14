import { Router } from 'express';
import { pool } from '../config/database';
import type { RowDataPacket, ResultSetHeader } from 'mysql2/promise';
import { parseId } from '../utils/routes';
import { getDow, DOW_NAMES, dateStr, utcDate, describeRecurrence } from '../utils/recurrence';

const router = Router();

// Get the specific item in a custom_cycle for a given date
// Returns { type: 'exercise' | 'routine' | 'rest', id: number | null }
function getCycleItemForDate(cfg: any, date: Date, startDate: Date): { type: string; id: number | null } {
  const items = cfg.items || [];
  if (items.length === 0) return { type: 'rest', id: null };

  const cycleDays = Array.isArray(cfg.days) && cfg.days.length > 0 ? cfg.days : null;
  const dow = getDow(date);

  // Check if this date is a workout day
  if (cycleDays && !cycleDays.includes(dow)) {
    return { type: 'rest', id: null };
  }

  // Count workout days from start_date to date
  let dayCount = 0;
  const cur = new Date(startDate);
  while (cur < date) {
    const curDow = getDow(cur);
    const isWorkoutDay = cycleDays ? cycleDays.includes(curDow) : !(cfg.alwaysRestWeekends && (curDow === 5 || curDow === 6));
    if (isWorkoutDay) dayCount++;
    cur.setUTCDate(cur.getUTCDate() + 1);
  }

  // Determine position in cycle
  if (cycleDays) {
    // With specific days, just cycle through items (no rest days inserted)
    const posInCycle = dayCount % items.length;
    const item = items[posInCycle];
    return item ? { type: item.type, id: item.id } : { type: 'rest', id: null };
  } else {
    // Without specific days, insert rest day every restFrequency items
    const cycleLengthWithRest = items.length + 1;
    const posInCycle = dayCount % cycleLengthWithRest;
    if (posInCycle >= items.length) {
      return { type: 'rest', id: null };
    }
    const item = items[posInCycle];
    return item ? { type: item.type, id: item.id } : { type: 'rest', id: null };
  }
}

function matchesRecurrence(recurrenceType: string, cfg: any, date: Date, startDate: Date): boolean {
  const diff = Math.round((date.getTime() - startDate.getTime()) / 86400000);
  switch (recurrenceType) {
    case 'daily':           return true;
    case 'every_other_day': return diff >= 0 && diff % 2 === 0;
    case 'days_of_week':    return Array.isArray(cfg.days) && cfg.days.includes(getDow(date));
    case 'every_x_days':    return diff >= 0 && cfg.interval > 0 && diff % cfg.interval === 0;
    case 'day_of_month':
      if (cfg.type === 'specific_dates')
        return Array.isArray(cfg.dates) && cfg.dates.includes(date.getUTCDate());
      if (cfg.type === 'nth_weekday') {
        if (getDow(date) !== cfg.weekday) return false;
        const dom = date.getUTCDate();
        return dom >= (cfg.n - 1) * 7 + 1 && dom <= cfg.n * 7;
      }
      return false;
    case 'custom_cycle': {
      if (diff < 0) return false;

      // Support both old 'exercises' and new 'items' format
      const items = cfg.items || (cfg.exercises ? cfg.exercises.map((id: number) => ({ type: 'exercise', id })) : []);
      if (!Array.isArray(items) || items.length === 0) return false;

      const cycleDays = Array.isArray(cfg.days) && cfg.days.length > 0 ? cfg.days : null;
      const alwaysRestWeekends = cfg.alwaysRestWeekends === true;

      const dow = getDow(date);

      // If specific workout days are defined
      if (cycleDays) {
        if (!cycleDays.includes(dow)) return false; // Not a workout day

        // Count workout days from start_date to date to determine cycle position
        let dayCount = 0;
        const cur = new Date(startDate);
        while (cur < date) {
          const curDow = getDow(cur);
          if (cycleDays.includes(curDow)) dayCount++;
          cur.setUTCDate(cur.getUTCDate() + 1);
        }

        // When specific days are defined, just cycle through items without inserting rest days
        // The rest days are already handled by cycleDays (non-included days are rest)
        const itemCount = items.length;
        const posInCycle = dayCount % itemCount;
        return posInCycle < itemCount; // Always true for workout days
      }

      // If no specific days, use the rest frequency logic
      if (alwaysRestWeekends && (dow === 5 || dow === 6)) return false;

      // Count all non-weekend days from start_date to date
      let dayCount = 0;
      const cur = new Date(startDate);
      while (cur < date) {
        const curDow = getDow(cur);
        if (!(alwaysRestWeekends && (curDow === 5 || curDow === 6))) {
          dayCount++;
        }
        cur.setUTCDate(cur.getUTCDate() + 1);
      }

      // When no specific days: cycle pattern is [item0, ..., itemN-1, rest]
      const itemCount = items.length;
      const cycleLengthWithRest = itemCount + 1;
      const posInCycle = dayCount % cycleLengthWithRest;
      const isRestDayPosition = posInCycle >= itemCount;
      return !isRestDayPosition;
    }
    default: return false;
  }
}

function parseConfig(raw: any): any {
  return typeof raw === 'string' ? JSON.parse(raw) : raw;
}

function formatSchedule(r: RowDataPacket) {
  const cfg = parseConfig(r.recurrence_config);
  return {
    id:                   r.id,
    routineId:            r.routine_id ?? null,
    routineName:          r.routine_name ?? null,
    exerciseId:           r.exercise_id ?? null,
    exerciseName:         r.exercise_name ?? null,
    label:                r.label ?? null,
    isRestDay:            Boolean(r.is_rest_day),
    recurrenceType:       r.recurrence_type,
    recurrenceConfig:     cfg,
    recurrenceDescription: describeRecurrence(r.recurrence_type, cfg),
    startDate:            dateStr(r.start_date),
    endDate:              r.end_date ? dateStr(r.end_date) : null,
  };
}

async function getScheduleRow(id: number, userId: number): Promise<RowDataPacket | null> {
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT ws.*, wr.name AS routine_name, e.name AS exercise_name
     FROM workout_schedules ws
     LEFT JOIN workout_routines wr ON wr.id = ws.routine_id
     LEFT JOIN exercises e ON e.id = ws.exercise_id
     WHERE ws.id = ? AND ws.user_id = ?`,
    [id, userId]
  );
  return rows[0] ?? null;
}

// ─── GET /api/schedules ────────────────────────────────────────────────────────
router.get('/', async (req, res) => {
  try {
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT ws.*, wr.name AS routine_name, e.name AS exercise_name
       FROM workout_schedules ws
       LEFT JOIN workout_routines wr ON wr.id = ws.routine_id
       LEFT JOIN exercises e ON e.id = ws.exercise_id
       WHERE ws.user_id = ?
       ORDER BY ws.start_date ASC, ws.id ASC`,
      [req.userId]
    );
    res.json((rows as RowDataPacket[]).map(formatSchedule));
  } catch (err) {
    console.error('[schedules] error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ─── GET /api/schedules/upcoming?days=14 ──────────────────────────────────────
router.get('/upcoming', async (req, res) => {
  const days = Math.min(Math.max(Number(req.query.days) || 14, 1), 90);

  const d = new Date();
  const todayStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const toDate   = new Date(todayStr + 'T00:00:00.000Z');
  toDate.setUTCDate(toDate.getUTCDate() + days - 1);
  const toStr = toDate.toISOString().slice(0, 10);

  try {
    const [schedRows] = await pool.query<RowDataPacket[]>(
      `SELECT ws.*, wr.name AS routine_name, e.name AS exercise_name
       FROM workout_schedules ws
       LEFT JOIN workout_routines wr ON wr.id = ws.routine_id
       LEFT JOIN exercises e ON e.id = ws.exercise_id
       WHERE ws.user_id = ?
         AND ws.start_date <= ?
         AND (ws.end_date IS NULL OR ws.end_date >= ?)
       ORDER BY ws.id ASC`,
      [req.userId, toStr, todayStr]
    );

    if (!schedRows.length) { res.json([]); return; }

    const schedIds = (schedRows as RowDataPacket[]).map((s) => s.id);

    // Overrides in range
    const [overrideRows] = await pool.query<RowDataPacket[]>(
      `SELECT schedule_id, scheduled_date, status, workout_log_id
       FROM workout_schedule_log
       WHERE schedule_id IN (?) AND scheduled_date BETWEEN ? AND ?`,
      [schedIds, todayStr, toStr]
    );

    // overrideKey → status
    const overrideMap: Map<string, string> = new Map();
    for (const o of overrideRows as RowDataPacket[]) {
      const key = `${o.schedule_id}:${dateStr(o.scheduled_date)}`;
      overrideMap.set(key, o.status);
    }

    // Completed workouts in range (inferred completion without an explicit override)
    const [completedRows] = await pool.query<RowDataPacket[]>(
      `SELECT workout_date, routine_id FROM workout_logs
       WHERE user_id = ? AND completed = 1 AND workout_date BETWEEN ? AND ?`,
      [req.userId, todayStr, toStr]
    );
    const completedSet = new Set<string>();
    for (const c of completedRows as RowDataPacket[]) {
      if (c.routine_id) completedSet.add(`${c.routine_id}:${dateStr(c.workout_date)}`);
    }

    // Fetch all routines and exercises for name lookup in custom_cycle
    const [routineRows] = await pool.query<RowDataPacket[]>(
      `SELECT id, name FROM workout_routines WHERE user_id = ?`,
      [req.userId]
    );
    const routineMap = new Map<number, string>();
    for (const r of routineRows as RowDataPacket[]) {
      routineMap.set(r.id, r.name);
    }

    const [exerciseRows] = await pool.query<RowDataPacket[]>(
      `SELECT id, name FROM exercises`
    );
    const exerciseMap = new Map<number, string>();
    for (const e of exerciseRows as RowDataPacket[]) {
      exerciseMap.set(e.id, e.name);
    }

    const results: object[] = [];

    for (const sched of schedRows as RowDataPacket[]) {
      const startDate = utcDate(dateStr(sched.start_date));
      const endDate   = sched.end_date ? utcDate(dateStr(sched.end_date)) : null;
      const cfg       = parseConfig(sched.recurrence_config);

      let cur = new Date(todayStr + 'T00:00:00.000Z');
      if (startDate > cur) cur = new Date(startDate);
      const to = toDate;

      while (cur <= to) {
        if (endDate && cur > endDate) break;

        const d = cur.toISOString().slice(0, 10);
        const isCustomCycleWithDays = sched.recurrence_type === 'custom_cycle' && Array.isArray(cfg.days) && cfg.days.length > 0;
        const matches = matchesRecurrence(sched.recurrence_type, cfg, cur, startDate);
        const shouldInclude = matches || isCustomCycleWithDays; // Include all dates for custom_cycle with specific days

        if (shouldInclude) {
          const oKey   = `${sched.id}:${d}`;
          const over   = overrideMap.get(oKey);

          let routineId: number | null = sched.routine_id ?? null;
          let routineName: string | null = sched.routine_name ?? null;
          let exerciseId: number | null = sched.exercise_id ?? null;
          let exerciseName: string | null = sched.exercise_name ?? null;
          let isRestDay = Boolean(sched.is_rest_day);

          // For custom_cycle, determine which item to show for this date
          if (sched.recurrence_type === 'custom_cycle') {
            const item = getCycleItemForDate(cfg, cur, startDate);
            if (item.type === 'rest') {
              isRestDay = true;
              routineId = null;
              routineName = null;
              exerciseId = null;
              exerciseName = null;
            } else if (item.type === 'routine') {
              exerciseId = null;
              exerciseName = null;
              routineId = item.id ?? null;
              routineName = item.id ? (routineMap.get(item.id) || null) : null;
            } else if (item.type === 'exercise') {
              routineId = null;
              routineName = null;
              exerciseId = item.id ?? null;
              exerciseName = item.id ? (exerciseMap.get(item.id) || null) : null;
            }
          }

          const cKey   = `${routineId}:${d}`;
          let status: string;
          if (over) {
            status = over;
          } else if (!isRestDay && routineId && completedSet.has(cKey)) {
            status = 'completed';
          } else {
            status = 'scheduled';
          }

          results.push({
            date:         d,
            dayLabel:     DOW_NAMES[getDow(cur)],
            scheduleId:   sched.id,
            routineId,
            routineName,
            exerciseId,
            exerciseName,
            isRestDay,
            status,
          });
        }

        cur.setUTCDate(cur.getUTCDate() + 1);
      }
    }

    results.sort((a: any, b: any) => a.date.localeCompare(b.date) || a.scheduleId - b.scheduleId);
    res.json(results);
  } catch (err) {
    console.error('[schedules] error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ─── POST /api/schedules ──────────────────────────────────────────────────────
router.post('/', async (req, res) => {
  const { routineId, exerciseId, label, isRestDay, recurrenceType, recurrenceConfig, startDate, endDate } = req.body;

  if (!recurrenceType || !startDate) {
    res.status(400).json({ error: 'recurrenceType and startDate required' }); return;
  }
  const validTypes = ['daily', 'every_other_day', 'days_of_week', 'every_x_days', 'day_of_month', 'custom_cycle'];
  if (!validTypes.includes(recurrenceType)) {
    res.status(400).json({ error: 'Invalid recurrenceType' }); return;
  }

  try {
    const [result] = await pool.query<ResultSetHeader>(
      `INSERT INTO workout_schedules
         (user_id, routine_id, exercise_id, label, is_rest_day, recurrence_type, recurrence_config, start_date, end_date)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        req.userId,
        routineId ?? null,
        exerciseId ?? null,
        label ?? null,
        isRestDay ? 1 : 0,
        recurrenceType,
        JSON.stringify(recurrenceConfig ?? {}),
        startDate,
        endDate ?? null,
      ]
    );
    const row = await getScheduleRow(result.insertId, req.userId);
    if (!row) { res.status(500).json({ error: 'Server error' }); return; }
    res.status(201).json(formatSchedule(row));
  } catch (err) {
    console.error('[schedules] error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ─── PUT /api/schedules/:id ───────────────────────────────────────────────────
router.put('/:id', async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) { res.status(400).json({ error: 'Invalid id' }); return; }

  const row = await getScheduleRow(id, req.userId);
  if (!row) { res.status(404).json({ error: 'Not found' }); return; }

  const { routineId, exerciseId, label, isRestDay, recurrenceType, recurrenceConfig, startDate, endDate } = req.body;
  const updates: string[] = [];
  const values: unknown[]  = [];

  if (routineId    !== undefined) { updates.push('routine_id=?');        values.push(routineId ?? null); }
  if (exerciseId   !== undefined) { updates.push('exercise_id=?');       values.push(exerciseId ?? null); }
  if (label        !== undefined) { updates.push('label=?');             values.push(label ?? null); }
  if (isRestDay    !== undefined) { updates.push('is_rest_day=?');       values.push(isRestDay ? 1 : 0); }
  if (recurrenceType !== undefined) { updates.push('recurrence_type=?'); values.push(recurrenceType); }
  if (recurrenceConfig !== undefined) { updates.push('recurrence_config=?'); values.push(JSON.stringify(recurrenceConfig)); }
  if (startDate    !== undefined) { updates.push('start_date=?');        values.push(startDate); }
  if (endDate      !== undefined) { updates.push('end_date=?');          values.push(endDate ?? null); }

  if (!updates.length) { res.status(400).json({ error: 'Nothing to update' }); return; }

  try {
    values.push(id, req.userId);
    await pool.query(`UPDATE workout_schedules SET ${updates.join(', ')} WHERE id = ? AND user_id = ?`, values);
    const updated = await getScheduleRow(id, req.userId);
    res.json(formatSchedule(updated!));
  } catch (err) {
    console.error('[schedules] error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ─── DELETE /api/schedules/:id ────────────────────────────────────────────────
router.delete('/:id', async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) { res.status(400).json({ error: 'Invalid id' }); return; }

  try {
    const [result] = await pool.query<ResultSetHeader>(
      'DELETE FROM workout_schedules WHERE id = ? AND user_id = ?', [id, req.userId]
    );
    if (result.affectedRows === 0) { res.status(404).json({ error: 'Not found' }); return; }
    res.json({ success: true });
  } catch (err) {
    console.error('[schedules] error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ─── POST /api/schedules/:id/override ────────────────────────────────────────
router.post('/:id/override', async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) { res.status(400).json({ error: 'Invalid id' }); return; }

  const row = await getScheduleRow(id, req.userId);
  if (!row) { res.status(404).json({ error: 'Not found' }); return; }

  const { date, status, workoutLogId } = req.body as { date: string; status: string; workoutLogId?: number };
  const validStatuses = ['completed', 'skipped', 'rest'];
  if (!date || !validStatuses.includes(status)) {
    res.status(400).json({ error: 'date and valid status required' }); return;
  }

  try {
    await pool.query(
      `INSERT INTO workout_schedule_log (schedule_id, scheduled_date, status, workout_log_id)
       VALUES (?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE status = VALUES(status), workout_log_id = VALUES(workout_log_id)`,
      [id, date, status, workoutLogId ?? null]
    );
    res.json({ success: true });
  } catch (err) {
    console.error('[schedules] error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ─── GET /api/schedules/program-templates ────────────────────────────────────
router.get('/program-templates', async (req, res) => {
  try {
    const [templates] = await pool.query<RowDataPacket[]>(
      'SELECT * FROM program_templates ORDER BY id ASC'
    );
    const [days] = await pool.query<RowDataPacket[]>(
      'SELECT * FROM program_template_days ORDER BY template_id ASC, day_offset ASC'
    );

    const daysByTemplate: Record<number, RowDataPacket[]> = {};
    for (const d of days as RowDataPacket[]) {
      if (!daysByTemplate[d.template_id]) daysByTemplate[d.template_id] = [];
      daysByTemplate[d.template_id].push(d);
    }

    res.json((templates as RowDataPacket[]).map((t) => ({
      id:          t.id,
      name:        t.name,
      description: t.description ?? null,
      weeks:       t.weeks,
      days:        (daysByTemplate[t.id] ?? []).map((d) => ({
        dayOffset:  d.day_offset,
        slotLabel:  d.slot_label ?? null,
        isRestDay:  Boolean(d.is_rest_day),
      })),
    })));
  } catch (err) {
    console.error('[schedules] error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ─── POST /api/schedules/program-templates/:id/import ────────────────────────
// Body: { startDate: string, slotMap: Record<slotLabel, routineId | null> }
router.post('/program-templates/:id/import', async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) { res.status(400).json({ error: 'Invalid id' }); return; }

  const { startDate, slotMap } = req.body as { startDate: string; slotMap: Record<string, number | null> };
  if (!startDate || !slotMap) {
    res.status(400).json({ error: 'startDate and slotMap required' }); return;
  }

  try {
    const [dayRows] = await pool.query<RowDataPacket[]>(
      'SELECT * FROM program_template_days WHERE template_id = ? ORDER BY day_offset ASC',
      [id]
    );
    if (!(dayRows as RowDataPacket[]).length) {
      res.status(404).json({ error: 'Template not found' }); return;
    }

    // Group day_offsets by slot_label
    const slotDays: Record<string, number[]> = {};
    for (const d of dayRows as RowDataPacket[]) {
      if (!d.is_rest_day && d.slot_label) {
        if (!slotDays[d.slot_label]) slotDays[d.slot_label] = [];
        slotDays[d.slot_label].push(d.day_offset);
      }
    }

    const created: object[] = [];
    for (const [label, offsets] of Object.entries(slotDays)) {
      const routineId = slotMap[label] ?? null;
      // offsets are already 0=Mon...6=Sun — directly usable as days_of_week config
      const [result] = await pool.query<ResultSetHeader>(
        `INSERT INTO workout_schedules
           (user_id, routine_id, label, is_rest_day, recurrence_type, recurrence_config, start_date)
         VALUES (?, ?, ?, 0, 'days_of_week', ?, ?)`,
        [
          req.userId,
          routineId,
          label,
          JSON.stringify({ days: offsets.sort((a, b) => a - b) }),
          startDate,
        ]
      );
      const row = await getScheduleRow(result.insertId, req.userId);
      if (row) created.push(formatSchedule(row));
    }

    res.status(201).json(created);
  } catch (err) {
    console.error('[schedules] error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

export default router;
