import { Router } from 'express';
import { pool } from '../config/database';
import { requireAuth } from '../middleware/auth';
import type { RowDataPacket } from 'mysql2';
import { calcTDEE, type ActivityLevel } from '../services/tdee';

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
    weeklyCalories:    row.weekly_calories     ?? null,
    weeklyProteinG:    row.weekly_protein_g    != null ? Number(row.weekly_protein_g)    : null,
    weeklyCarbsG:      row.weekly_carbs_g      != null ? Number(row.weekly_carbs_g)      : null,
    weeklyFatG:        row.weekly_fat_g        != null ? Number(row.weekly_fat_g)        : null,
    weeklyWaterGoalOz: row.weekly_water_goal_oz != null ? Number(row.weekly_water_goal_oz) : null,
    effectiveFrom: row.effective_from instanceof Date
      ? row.effective_from.toISOString().slice(0, 10)
      : String(row.effective_from),
  };
}

router.get('/', async (req, res) => {
  try {
    const today = localDateStr();
    const [rows] = await pool.query<RowDataPacket[]>(
      'SELECT * FROM user_goals WHERE user_id = ? AND effective_from <= ? ORDER BY effective_from DESC, id DESC LIMIT 1',
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
  const { calories, carbsG, proteinG, fatG, fiberG, sodiumMg, waterGoalOz,
          weeklyCalories, weeklyProteinG, weeklyCarbsG, weeklyFatG, weeklyWaterGoalOz } = req.body;
  const today = localDateStr();

  try {
    await pool.execute(
      `INSERT INTO user_goals
         (user_id, calories, carbs_g, protein_g, fat_g, fiber_g, sodium_mg, water_goal_oz,
          weekly_calories, weekly_protein_g, weekly_carbs_g, weekly_fat_g, weekly_water_goal_oz, effective_from)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [req.userId, calories, carbsG, proteinG, fatG, fiberG ?? null, sodiumMg ?? null, waterGoalOz ?? 64,
       weeklyCalories ?? null, weeklyProteinG ?? null, weeklyCarbsG ?? null, weeklyFatG ?? null, weeklyWaterGoalOz ?? null,
       today]
    );
    const [rows] = await pool.query<RowDataPacket[]>(
      'SELECT * FROM user_goals WHERE user_id = ? AND effective_from <= ? ORDER BY effective_from DESC, id DESC LIMIT 1',
      [req.userId, today]
    );
    res.status(201).json(toGoals(rows[0]));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to save goals' });
  }
});

// PATCH /api/goals/weekly — update only weekly nutrition targets on the current row
router.patch('/weekly', async (req, res) => {
  const { weeklyCalories, weeklyProteinG, weeklyCarbsG, weeklyFatG, weeklyWaterGoalOz } = req.body;
  const today = localDateStr();
  try {
    await pool.execute(
      `UPDATE user_goals
       SET weekly_calories=?, weekly_protein_g=?, weekly_carbs_g=?, weekly_fat_g=?, weekly_water_goal_oz=?
       WHERE user_id=? AND effective_from <= ?
       ORDER BY effective_from DESC, id DESC
       LIMIT 1`,
      [weeklyCalories ?? null, weeklyProteinG ?? null, weeklyCarbsG ?? null, weeklyFatG ?? null, weeklyWaterGoalOz ?? null,
       req.userId, today]
    );
    const [rows] = await pool.query<RowDataPacket[]>(
      'SELECT * FROM user_goals WHERE user_id = ? AND effective_from <= ? ORDER BY effective_from DESC, id DESC LIMIT 1',
      [req.userId, today]
    );
    res.json(rows.length ? toGoals(rows[0]) : {});
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to save weekly goals' });
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
      'SELECT * FROM user_goals WHERE user_id = ? AND effective_from <= ? ORDER BY effective_from DESC, id DESC LIMIT 1',
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
          waterGoalOz: goals.water_goal_oz,
          weeklyCalories:    goals.weekly_calories    ?? null,
          weeklyProteinG:    goals.weekly_protein_g   != null ? Number(goals.weekly_protein_g)   : null,
          weeklyCarbsG:      goals.weekly_carbs_g     != null ? Number(goals.weekly_carbs_g)     : null,
          weeklyFatG:        goals.weekly_fat_g       != null ? Number(goals.weekly_fat_g)       : null,
          weeklyWaterGoalOz: goals.weekly_water_goal_oz != null ? Number(goals.weekly_water_goal_oz) : null,
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

// GET /api/goals/tdee?date=YYYY-MM-DD
// Returns TDEE breakdown for the given day (defaults to today)
router.get('/tdee', async (req, res) => {
  const date = (req.query.date as string) || localDateStr();
  try {
    // User profile
    const [userRows] = await pool.query<RowDataPacket[]>(
      'SELECT height_cm, sex, dob, activity_level FROM users WHERE id = ?',
      [req.userId]
    );
    const u = userRows[0];
    if (!u?.height_cm || !u?.sex || !u?.dob) {
      res.json({ available: false, reason: 'profile_incomplete' }); return;
    }

    // Latest body weight
    const [wtRows] = await pool.query<RowDataPacket[]>(
      `SELECT value, unit FROM body_measurements
       WHERE user_id = ? AND metric = 'weight'
       ORDER BY measured_at DESC, id DESC LIMIT 1`,
      [req.userId]
    );
    if (!wtRows[0]) {
      res.json({ available: false, reason: 'no_weight' }); return;
    }
    const wt = wtRows[0];
    const weightKg = (wt.unit === 'lb' || wt.unit === 'lbs') ? Number(wt.value) / 2.20462 : Number(wt.value);

    // Today's food calories
    const [foodRows] = await pool.query<RowDataPacket[]>(
      'SELECT COALESCE(SUM(calories), 0) AS totalCal FROM food_log WHERE user_id = ? AND log_date = ?',
      [req.userId, date]
    );
    const caloriesIn = Number(foodRows[0]?.totalCal) || 0;

    // Today's exercise calories
    const [workoutRows] = await pool.query<RowDataPacket[]>(
      `SELECT COALESCE(SUM(calories_burned), 0) AS totalBurned
       FROM workout_logs WHERE user_id = ? AND workout_date = ? AND completed = 1`,
      [req.userId, date]
    );
    const exerciseKcal = Number(workoutRows[0]?.totalBurned) || 0;

    // Today's steps
    const [stepsRows] = await pool.query<RowDataPacket[]>(
      'SELECT steps FROM steps_log WHERE user_id = ? AND log_date = ?',
      [req.userId, date]
    );
    const stepsKcal = stepsRows[0]?.steps ? Math.round(Number(stepsRows[0].steps) * 0.05) : 0;

    const breakdown = calcTDEE({
      weightKg,
      heightCm: Number(u.height_cm),
      dob: u.dob instanceof Date ? u.dob.toISOString().slice(0, 10) : String(u.dob).slice(0, 10),
      sex: u.sex as 'male' | 'female',
      activityLevel: u.activity_level as ActivityLevel,
      caloriesIn,
      exerciseKcal,
      stepsKcal,
    });

    res.json({ available: true, ...breakdown, caloriesIn });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to compute TDEE' });
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
