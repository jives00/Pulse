import { Router, Request, Response } from 'express';
import { pool } from '../config/database';
import { requireAuth } from '../middleware/auth';
import type { RowDataPacket } from 'mysql2/promise';

const router = Router();
router.use(requireAuth);

// GET /api/recovery
router.get('/', async (req: Request, res: Response) => {
  try {
    const userId = req.userId;

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayStr = today.toISOString().slice(0, 10);

    const cutoff28 = new Date(today);
    cutoff28.setDate(cutoff28.getDate() - 28);
    const cutoff28Str = cutoff28.toISOString().slice(0, 10);

    // Fetch last 28 days of workouts
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT DATE(workout_date) as day, COALESCE(SUM(duration_minutes), 0) as minutes
       FROM workout_logs
       WHERE user_id = ? AND DATE(workout_date) >= ? AND DATE(workout_date) <= ?
       GROUP BY DATE(workout_date)
       ORDER BY day DESC`,
      [userId, cutoff28Str, todayStr]
    );

    if (rows.length === 0) {
      return res.json({
        level: 'high',
        score: 80,
        hint: 'No recent workouts — fully rested and ready to go.',
      });
    }

    // Map day → minutes
    const byDay = new Map<string, number>();
    for (const r of rows) {
      byDay.set(r.day.toISOString().slice(0, 10), Number(r.minutes));
    }

    // Chronic load: avg daily minutes over 28 days
    const totalMinutes28 = [...byDay.values()].reduce((s, v) => s + v, 0);
    const chronicDaily = totalMinutes28 / 28;

    // Acute load: sum of last 3 full days (excluding today)
    let acuteMinutes = 0;
    for (let i = 1; i <= 3; i++) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      acuteMinutes += byDay.get(d.toISOString().slice(0, 10)) ?? 0;
    }

    // Days since last workout
    let daysSince = 0;
    for (let i = 0; i <= 14; i++) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      if (byDay.has(d.toISOString().slice(0, 10))) {
        daysSince = i;
        break;
      }
      if (i === 14) daysSince = 14;
    }

    // Load ratio: acute vs expected (chronic × 3 days)
    const expected = chronicDaily * 3;
    const loadRatio = expected > 0 ? acuteMinutes / expected : (acuteMinutes > 0 ? 2 : 0);

    // Score calculation
    let score = 65;

    // Load factor
    if (loadRatio < 0.3)       score += 20;
    else if (loadRatio < 0.7)  score += 12;
    else if (loadRatio < 1.1)  score += 4;
    else if (loadRatio < 1.6)  score -= 10;
    else if (loadRatio < 2.2)  score -= 20;
    else                        score -= 30;

    // Rest factor
    if (daysSince === 0)       score += 0;
    else if (daysSince === 1)  score += 8;
    else if (daysSince === 2)  score += 15;
    else if (daysSince === 3)  score += 18;
    else                        score += 10; // too long, slight detraining deduction already baked in

    score = Math.min(100, Math.max(0, Math.round(score)));

    const level: 'high' | 'medium' | 'low' = score >= 70 ? 'high' : score >= 45 ? 'medium' : 'low';

    // Hint
    let hint: string;
    if (daysSince === 0) {
      hint = loadRatio > 1.5
        ? 'Heavy session today — prioritize sleep and protein tonight.'
        : 'Worked out today. Rest up and fuel well.';
    } else if (daysSince === 1) {
      hint = loadRatio > 1.4
        ? 'High recent load — consider a lighter session or rest day.'
        : 'One day of rest — looking good for another session.';
    } else if (daysSince <= 3) {
      hint = level === 'high'
        ? "Well rested with manageable load — good time to train."
        : 'Moderate fatigue from recent sessions. Listen to your body.';
    } else {
      hint = 'Extended rest — body is recovered, momentum may need a nudge.';
    }

    res.json({ level, score, hint });
  } catch (err) {
    console.error('[recovery] Error:', err);
    res.status(500).json({ error: 'Could not compute recovery' });
  }
});

export default router;
