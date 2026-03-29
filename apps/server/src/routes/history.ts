import { Router } from 'express';
import { pool } from '../config/database';
import { requireAuth } from '../middleware/auth';
import type { RowDataPacket } from 'mysql2';

const router = Router();
router.use(requireAuth);

router.get('/daily', async (req, res) => {
  const { start, end } = req.query as { start: string; end: string };
  try {
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT log_date AS date,
              ROUND(SUM(calories), 1) AS calories,
              ROUND(SUM(carbs_g),  1) AS carbsG,
              ROUND(SUM(protein_g),1) AS proteinG,
              ROUND(SUM(fat_g),    1) AS fatG,
              COUNT(*) AS entryCount
       FROM food_log
       WHERE user_id = ? AND log_date BETWEEN ? AND ?
       GROUP BY log_date
       ORDER BY log_date ASC`,
      [req.userId, start, end]
    );
    res.json(rows.map((r) => ({
      date: r.date instanceof Date ? r.date.toISOString().slice(0, 10) : String(r.date),
      calories: Number(r.calories),
      carbsG: Number(r.carbsG),
      proteinG: Number(r.proteinG),
      fatG: Number(r.fatG),
      entryCount: Number(r.entryCount),
    })));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch history' });
  }
});

router.get('/weekly', async (req, res) => {
  const { year } = req.query as { year: string };
  try {
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT YEAR(log_date) AS year, WEEK(log_date, 1) AS week,
              MIN(log_date) AS startDate, MAX(log_date) AS endDate,
              ROUND(AVG(daily_cal), 0) AS avgCalories,
              ROUND(AVG(daily_carb), 1) AS avgCarbsG,
              ROUND(AVG(daily_prot), 1) AS avgProteinG,
              ROUND(AVG(daily_fat),  1) AS avgFatG,
              COUNT(*) AS daysLogged
       FROM (
         SELECT log_date,
                SUM(calories)  AS daily_cal,
                SUM(carbs_g)   AS daily_carb,
                SUM(protein_g) AS daily_prot,
                SUM(fat_g)     AS daily_fat
         FROM food_log
         WHERE user_id = ? AND YEAR(log_date) = ?
         GROUP BY log_date
       ) daily
       GROUP BY year, week
       ORDER BY year ASC, week ASC`,
      [req.userId, year]
    );
    res.json(rows.map((r) => ({
      year: r.year, week: r.week,
      startDate: r.startDate instanceof Date ? r.startDate.toISOString().slice(0, 10) : String(r.startDate),
      endDate:   r.endDate   instanceof Date ? r.endDate.toISOString().slice(0, 10)   : String(r.endDate),
      avgCalories: Number(r.avgCalories),
      avgCarbsG:   Number(r.avgCarbsG),
      avgProteinG: Number(r.avgProteinG),
      avgFatG:     Number(r.avgFatG),
      daysLogged:  Number(r.daysLogged),
    })));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch weekly history' });
  }
});

export default router;
