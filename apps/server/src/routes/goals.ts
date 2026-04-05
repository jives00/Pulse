import { Router } from 'express';
import { pool } from '../config/database';
import { requireAuth } from '../middleware/auth';
import type { RowDataPacket } from 'mysql2';

const router = Router();
router.use(requireAuth);

const localDateStr = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Chicago' });

function toGoals(row: RowDataPacket) {
  return {
    id: row.id,
    calories: row.calories,
    carbsG: row.carbs_g,
    proteinG: row.protein_g,
    fatG: row.fat_g,
    fiberG: row.fiber_g ?? undefined,
    sodiumMg: row.sodium_mg ?? undefined,
    waterGoalOz: row.water_goal_oz,
    effectiveFrom: row.effective_from instanceof Date
      ? row.effective_from.toISOString().slice(0, 10)
      : String(row.effective_from),
  };
}

router.get('/', async (req, res) => {
  try {
    const today = localDateStr();
    const [rows] = await pool.query<RowDataPacket[]>(
      'SELECT * FROM user_goals WHERE user_id = ? AND effective_from <= ? ORDER BY effective_from DESC LIMIT 1',
      [req.userId, today]
    );
    if (!rows.length) { res.status(404).json({ error: 'No goals set' }); return; }
    res.json(toGoals(rows[0]));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch goals' });
  }
});

router.get('/history', async (req, res) => {
  try {
    const [rows] = await pool.query<RowDataPacket[]>(
      'SELECT * FROM user_goals WHERE user_id = ? ORDER BY effective_from DESC',
      [req.userId]
    );
    res.json(rows.map(toGoals));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch goals history' });
  }
});

router.post('/', async (req, res) => {
  const { calories, carbsG, proteinG, fatG, fiberG, sodiumMg, waterGoalOz } = req.body;
  const today = localDateStr();

  try {
    await pool.execute(
      `INSERT INTO user_goals (user_id, calories, carbs_g, protein_g, fat_g, fiber_g, sodium_mg, water_goal_oz, effective_from)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [req.userId, calories, carbsG, proteinG, fatG, fiberG ?? null, sodiumMg ?? null, waterGoalOz ?? 64, today]
    );
    const [rows] = await pool.query<RowDataPacket[]>(
      'SELECT * FROM user_goals WHERE user_id = ? AND effective_from <= ? ORDER BY effective_from DESC LIMIT 1',
      [req.userId, today]
    );
    res.status(201).json(toGoals(rows[0]));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to save goals' });
  }
});

// GET /api/goals/summary?date=YYYY-MM-DD
// Returns today's nutrition actuals vs goals + this week's workout actuals vs exercise goals
router.get('/summary', async (req, res) => {
  const date = (req.query.date as string) || localDateStr();

  // Week bounds (Monday–Sunday)
  const d = new Date(date + 'T00:00:00Z');
  const dow = d.getUTCDay(); // 0=Sun
  const daysSinceMon = (dow + 6) % 7;
  const weekStart = new Date(d);
  weekStart.setUTCDate(d.getUTCDate() - daysSinceMon);
  const weekEnd = new Date(weekStart);
  weekEnd.setUTCDate(weekStart.getUTCDate() + 6);
  const weekStartStr = weekStart.toISOString().slice(0, 10);
  const weekEndStr = weekEnd.toISOString().slice(0, 10);

  try {
    // Nutrition goals
    const [goalRows] = await pool.query<RowDataPacket[]>(
      'SELECT * FROM user_goals WHERE user_id = ? AND effective_from <= ? ORDER BY effective_from DESC LIMIT 1',
      [req.userId, date]
    );
    const goals = goalRows[0] ?? null;

    // Today's nutrition actuals
    const [nutritionRows] = await pool.query<RowDataPacket[]>(
      `SELECT ROUND(SUM(calories),1) AS calories, ROUND(SUM(carbs_g),1) AS carbsG,
              ROUND(SUM(protein_g),1) AS proteinG, ROUND(SUM(fat_g),1) AS fatG
       FROM food_log WHERE user_id = ? AND log_date = ?`,
      [req.userId, date]
    );
    const nutrition = nutritionRows[0];

    // Exercise goals
    const [exGoalRows] = await pool.query<RowDataPacket[]>(
      'SELECT * FROM exercise_goals WHERE user_id = ? AND effective_from <= ? ORDER BY effective_from DESC, id DESC LIMIT 1',
      [req.userId, date]
    );
    const exGoals = exGoalRows[0] ?? null;

    // This week's workout actuals
    const [workoutRows] = await pool.query<RowDataPacket[]>(
      `SELECT COUNT(*) AS workoutCount, COALESCE(SUM(duration_minutes), 0) AS totalMinutes
       FROM workout_logs WHERE user_id = ? AND workout_date BETWEEN ? AND ?`,
      [req.userId, weekStartStr, weekEndStr]
    );
    const workouts = workoutRows[0];

    res.json({
      date,
      weekStart: weekStartStr,
      weekEnd: weekEndStr,
      nutrition: {
        goals: goals ? {
          calories: goals.calories,
          carbsG: goals.carbs_g,
          proteinG: goals.protein_g,
          fatG: goals.fat_g,
        } : null,
        actual: {
          calories: Number(nutrition.calories) || 0,
          carbsG: Number(nutrition.carbsG) || 0,
          proteinG: Number(nutrition.proteinG) || 0,
          fatG: Number(nutrition.fatG) || 0,
        },
      },
      workouts: {
        goals: exGoals ? {
          workoutsPerWeek: exGoals.workouts_per_week ?? null,
          minutesPerWeek: exGoals.minutes_per_week ?? null,
          volumeLbsPerWeek: exGoals.volume_lbs_per_week ?? null,
        } : null,
        actual: {
          workoutCount: Number(workouts.workoutCount) || 0,
          totalMinutes: Number(workouts.totalMinutes) || 0,
        },
      },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch summary' });
  }
});

// GET /api/goals/exercise
router.get('/exercise', async (req, res) => {
  try {
    const today = localDateStr();
    const [rows] = await pool.query<RowDataPacket[]>(
      'SELECT * FROM exercise_goals WHERE user_id = ? AND effective_from <= ? ORDER BY effective_from DESC, id DESC LIMIT 1',
      [req.userId, today]
    );
    if (!rows.length) { res.status(404).json({ error: 'No exercise goals set' }); return; }
    res.json({
      id: rows[0].id,
      workoutsPerWeek: rows[0].workouts_per_week ?? null,
      minutesPerWeek: rows[0].minutes_per_week ?? null,
      volumeLbsPerWeek: rows[0].volume_lbs_per_week ?? null,
      effectiveFrom: rows[0].effective_from instanceof Date
        ? rows[0].effective_from.toISOString().slice(0, 10)
        : String(rows[0].effective_from),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch exercise goals' });
  }
});

// POST /api/goals/exercise
router.post('/exercise', async (req, res) => {
  const { workoutsPerWeek, minutesPerWeek, volumeLbsPerWeek } = req.body;
  const today = localDateStr();
  try {
    await pool.execute(
      `INSERT INTO exercise_goals (user_id, workouts_per_week, minutes_per_week, volume_lbs_per_week, effective_from)
       VALUES (?, ?, ?, ?, ?)`,
      [req.userId, workoutsPerWeek ?? null, minutesPerWeek ?? null, volumeLbsPerWeek ?? null, today]
    );
    res.status(201).json({
      workoutsPerWeek: workoutsPerWeek ?? null,
      minutesPerWeek: minutesPerWeek ?? null,
      volumeLbsPerWeek: volumeLbsPerWeek ?? null,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to save exercise goals' });
  }
});

export default router;
