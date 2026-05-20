import { Router } from 'express';
import { pool } from '../config/database';
import type { RowDataPacket, ResultSetHeader } from 'mysql2/promise';

const router = Router();

function fmtPreset(r: RowDataPacket) {
  return {
    id:          r.id,
    name:        r.name,
    calories:    r.calories ?? null,
    proteinG:    r.protein_g != null ? Number(r.protein_g) : null,
    carbsG:      r.carbs_g   != null ? Number(r.carbs_g)   : null,
    fatG:        r.fat_g     != null ? Number(r.fat_g)     : null,
    waterGoalOz: r.water_goal_oz != null ? Number(r.water_goal_oz) : null,
  };
}

function fmtOverride(r: RowDataPacket) {
  return {
    date:        String(r.date).slice(0, 10),
    dayTypeId:   r.day_type_id ?? null,
    dayTypeName: r.day_type_name ?? null,
    calories:    r.calories ?? null,
    proteinG:    r.protein_g   != null ? Number(r.protein_g)   : null,
    carbsG:      r.carbs_g     != null ? Number(r.carbs_g)     : null,
    fatG:        r.fat_g       != null ? Number(r.fat_g)       : null,
    waterGoalOz: r.water_goal_oz != null ? Number(r.water_goal_oz) : null,
  };
}

// ─── Day Type Presets ─────────────────────────────────────────────────────────

router.get('/presets', async (req, res) => {
  try {
    const [rows] = await pool.query<RowDataPacket[]>(
      'SELECT * FROM day_type_presets WHERE user_id=? ORDER BY name ASC', [req.userId]
    );
    res.json((rows as RowDataPacket[]).map(fmtPreset));
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
});

router.post('/presets', async (req, res) => {
  const { name, calories, proteinG, carbsG, fatG, waterGoalOz } = req.body;
  if (!name) { res.status(400).json({ error: 'name required' }); return; }
  try {
    const [result] = await pool.query<ResultSetHeader>(
      'INSERT INTO day_type_presets (user_id, name, calories, protein_g, carbs_g, fat_g, water_goal_oz) VALUES (?,?,?,?,?,?,?)',
      [req.userId, name, calories ?? null, proteinG ?? null, carbsG ?? null, fatG ?? null, waterGoalOz ?? null]
    );
    const [rows] = await pool.query<RowDataPacket[]>('SELECT * FROM day_type_presets WHERE id=?', [result.insertId]);
    res.status(201).json(fmtPreset((rows as RowDataPacket[])[0]));
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
});

router.put('/presets/:id', async (req, res) => {
  const id = Number(req.params.id);
  const { name, calories, proteinG, carbsG, fatG, waterGoalOz } = req.body;
  try {
    await pool.query(
      'UPDATE day_type_presets SET name=?, calories=?, protein_g=?, carbs_g=?, fat_g=?, water_goal_oz=? WHERE id=? AND user_id=?',
      [name, calories ?? null, proteinG ?? null, carbsG ?? null, fatG ?? null, waterGoalOz ?? null, id, req.userId]
    );
    const [rows] = await pool.query<RowDataPacket[]>('SELECT * FROM day_type_presets WHERE id=? AND user_id=?', [id, req.userId]);
    if (!(rows as RowDataPacket[]).length) { res.status(404).json({ error: 'Not found' }); return; }
    res.json(fmtPreset((rows as RowDataPacket[])[0]));
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
});

router.delete('/presets/:id', async (req, res) => {
  const id = Number(req.params.id);
  try {
    await pool.query('DELETE FROM day_type_presets WHERE id=? AND user_id=?', [id, req.userId]);
    res.json({ success: true });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
});

// ─── Daily Nutrition Overrides ────────────────────────────────────────────────

router.get('/overrides', async (req, res) => {
  const { from, to } = req.query as Record<string, string>;
  if (!from || !to) { res.status(400).json({ error: 'from and to required' }); return; }
  try {
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT dno.*, dtp.name AS day_type_name
       FROM daily_nutrition_overrides dno
       LEFT JOIN day_type_presets dtp ON dtp.id = dno.day_type_id
       WHERE dno.user_id=? AND dno.date BETWEEN ? AND ?
       ORDER BY dno.date ASC`,
      [req.userId, from, to]
    );
    res.json((rows as RowDataPacket[]).map(fmtOverride));
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
});

router.put('/overrides/:date', async (req, res) => {
  const { date } = req.params;
  const { dayTypeId, calories, proteinG, carbsG, fatG, waterGoalOz } = req.body;
  try {
    await pool.query(
      `INSERT INTO daily_nutrition_overrides (user_id, date, day_type_id, calories, protein_g, carbs_g, fat_g, water_goal_oz)
       VALUES (?,?,?,?,?,?,?,?)
       ON DUPLICATE KEY UPDATE
         day_type_id=VALUES(day_type_id), calories=VALUES(calories),
         protein_g=VALUES(protein_g), carbs_g=VALUES(carbs_g),
         fat_g=VALUES(fat_g), water_goal_oz=VALUES(water_goal_oz)`,
      [req.userId, date, dayTypeId ?? null, calories ?? null, proteinG ?? null, carbsG ?? null, fatG ?? null, waterGoalOz ?? null]
    );
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT dno.*, dtp.name AS day_type_name
       FROM daily_nutrition_overrides dno
       LEFT JOIN day_type_presets dtp ON dtp.id = dno.day_type_id
       WHERE dno.user_id=? AND dno.date=?`,
      [req.userId, date]
    );
    res.json(fmtOverride((rows as RowDataPacket[])[0]));
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
});

router.delete('/overrides/:date', async (req, res) => {
  const { date } = req.params;
  try {
    await pool.query('DELETE FROM daily_nutrition_overrides WHERE user_id=? AND date=?', [req.userId, date]);
    res.json({ success: true });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
});

export default router;
