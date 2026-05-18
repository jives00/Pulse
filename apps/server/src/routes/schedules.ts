import { Router } from 'express';
import { pool } from '../config/database';
import type { RowDataPacket, ResultSetHeader } from 'mysql2/promise';

const router = Router();

function parseId(param: string): number | null {
  const n = Number(param);
  return Number.isInteger(n) && n > 0 ? n : null;
}

function dateStr(d: Date | string): string {
  if (d instanceof Date) return d.toISOString().slice(0, 10);
  return String(d);
}

function utcDate(s: string): Date {
  return new Date(s + 'T00:00:00.000Z');
}

// Our day-of-week: 0=Mon ... 6=Sun (different from JS Date.getUTCDay() where 0=Sun)
function getDow(d: Date): number {
  const js = d.getUTCDay();
  return js === 0 ? 6 : js - 1;
}

const DOW_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const ORDINALS  = ['', '1st', '2nd', '3rd', '4th', '5th'];

function ordinalStr(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

function describeRecurrence(type: string, cfg: any): string {
  switch (type) {
    case 'daily':           return 'Every day';
    case 'every_other_day': return 'Every other day';
    case 'days_of_week':
      return [...(cfg.days as number[])].sort((a, b) => a - b).map((d) => DOW_NAMES[d]).join(' · ');
    case 'every_x_days':
      return `Every ${cfg.interval} days`;
    case 'day_of_month':
      if (cfg.type === 'nth_weekday')
        return `${ORDINALS[cfg.n]} ${DOW_NAMES[cfg.weekday]}`;
      if (cfg.type === 'specific_dates')
        return (cfg.dates as number[]).map(ordinalStr).join(' & ');
      return '';
    default: return '';
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
    `SELECT ws.*, wr.name AS routine_name
     FROM workout_schedules ws
     LEFT JOIN workout_routines wr ON wr.id = ws.routine_id
     WHERE ws.id = ? AND ws.user_id = ?`,
    [id, userId]
  );
  return rows[0] ?? null;
}

// ─── GET /api/schedules ────────────────────────────────────────────────────────
router.get('/', async (req, res) => {
  try {
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT ws.*, wr.name AS routine_name
       FROM workout_schedules ws
       LEFT JOIN workout_routines wr ON wr.id = ws.routine_id
       WHERE ws.user_id = ?
       ORDER BY ws.start_date ASC, ws.id ASC`,
      [req.userId]
    );
    res.json((rows as RowDataPacket[]).map(formatSchedule));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ─── GET /api/schedules/upcoming?days=14 ──────────────────────────────────────
router.get('/upcoming', async (req, res) => {
  const days = Math.min(Math.max(Number(req.query.days) || 14, 1), 90);

  const todayStr = new Date().toISOString().slice(0, 10);
  const toDate   = new Date(todayStr + 'T00:00:00.000Z');
  toDate.setUTCDate(toDate.getUTCDate() + days - 1);
  const toStr = toDate.toISOString().slice(0, 10);

  try {
    const [schedRows] = await pool.query<RowDataPacket[]>(
      `SELECT ws.*, wr.name AS routine_name
       FROM workout_schedules ws
       LEFT JOIN workout_routines wr ON wr.id = ws.routine_id
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

        if (matchesRecurrence(sched.recurrence_type, cfg, cur, startDate)) {
          const d      = cur.toISOString().slice(0, 10);
          const oKey   = `${sched.id}:${d}`;
          const cKey   = `${sched.routine_id}:${d}`;
          const over   = overrideMap.get(oKey);

          let status: string;
          if (over) {
            status = over;
          } else if (!sched.is_rest_day && sched.routine_id && completedSet.has(cKey)) {
            status = 'completed';
          } else {
            status = 'scheduled';
          }

          results.push({
            date:        d,
            dayLabel:    DOW_NAMES[getDow(cur)],
            scheduleId:  sched.id,
            routineId:   sched.routine_id ?? null,
            routineName: sched.routine_name ?? null,
            isRestDay:   Boolean(sched.is_rest_day),
            status,
          });
        }

        cur.setUTCDate(cur.getUTCDate() + 1);
      }
    }

    results.sort((a: any, b: any) => a.date.localeCompare(b.date) || a.scheduleId - b.scheduleId);
    res.json(results);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ─── POST /api/schedules ──────────────────────────────────────────────────────
router.post('/', async (req, res) => {
  const { routineId, label, isRestDay, recurrenceType, recurrenceConfig, startDate, endDate } = req.body;

  if (!recurrenceType || !startDate) {
    res.status(400).json({ error: 'recurrenceType and startDate required' }); return;
  }
  const validTypes = ['daily', 'every_other_day', 'days_of_week', 'every_x_days', 'day_of_month'];
  if (!validTypes.includes(recurrenceType)) {
    res.status(400).json({ error: 'Invalid recurrenceType' }); return;
  }

  try {
    const [result] = await pool.query<ResultSetHeader>(
      `INSERT INTO workout_schedules
         (user_id, routine_id, label, is_rest_day, recurrence_type, recurrence_config, start_date, end_date)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        req.userId,
        routineId ?? null,
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
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ─── PUT /api/schedules/:id ───────────────────────────────────────────────────
router.put('/:id', async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) { res.status(400).json({ error: 'Invalid id' }); return; }

  const row = await getScheduleRow(id, req.userId);
  if (!row) { res.status(404).json({ error: 'Not found' }); return; }

  const { routineId, label, isRestDay, recurrenceType, recurrenceConfig, startDate, endDate } = req.body;
  const updates: string[] = [];
  const values: unknown[]  = [];

  if (routineId    !== undefined) { updates.push('routine_id=?');        values.push(routineId ?? null); }
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
    console.error(err);
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
    console.error(err);
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
    console.error(err);
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
    console.error(err);
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
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

export default router;
