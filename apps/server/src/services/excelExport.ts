import ExcelJS from 'exceljs';
import { pool } from '../config/database';
import type { RowDataPacket } from 'mysql2';
import { calcTDEE, type ActivityLevel } from './tdee';
import { DEFAULT_FEATURES, type EnabledFeatures } from '@pulse/api-client';

const DEFAULTS: { calorieGoal: number; waterGoalOz: number; weightKg: number } = {
  calorieGoal: 2000,
  waterGoalOz: 64,
  weightKg: 75,
};

export async function buildExport(
  userId: number,
  start: string,
  end: string,
  features: EnabledFeatures = DEFAULT_FEATURES,
): Promise<ExcelJS.Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Pulse';
  workbook.created = new Date();

  // ── Sheet 1: Daily Diary ─────────────────────────────────────
  if (features.nutrition) {
  const diary = workbook.addWorksheet('Daily Diary');
  diary.columns = [
    { header: 'Date',        key: 'date',      width: 12 },
    { header: 'Meal',        key: 'meal',      width: 12 },
    { header: 'Food',        key: 'food',      width: 35 },
    { header: 'Brand',       key: 'brand',     width: 20 },
    { header: 'Qty',         key: 'qty',       width: 6  },
    { header: 'Serving',     key: 'serving',   width: 14 },
    { header: 'Calories',    key: 'calories',  width: 10 },
    { header: 'Carbs (g)',   key: 'carbs',     width: 10 },
    { header: 'Protein (g)', key: 'protein',   width: 11 },
    { header: 'Fat (g)',     key: 'fat',       width: 9  },
    { header: 'Fiber (g)',   key: 'fiber',     width: 9  },
    { header: 'Sodium (mg)', key: 'sodium',    width: 11 },
  ];
  styleHeader(diary);

  const [entries] = await pool.query<RowDataPacket[]>(
    `SELECT fl.log_date, fl.meal, f.name AS food_name, f.brand,
            fl.quantity, ss.label AS serving_label,
            fl.calories, fl.carbs_g, fl.protein_g, fl.fat_g, fl.fiber_g, fl.sodium_mg
     FROM food_log fl
     JOIN foods f ON f.id = fl.food_id
     JOIN serving_sizes ss ON ss.id = fl.serving_size_id
     WHERE fl.user_id = ? AND fl.log_date BETWEEN ? AND ?
     ORDER BY fl.log_date ASC, fl.meal ASC, fl.logged_at ASC`,
    [userId, start, end]
  );

  entries.forEach((r) => {
    diary.addRow({
      date:     fmtDate(r.log_date),
      meal:     capitalize(r.meal),
      food:     r.food_name,
      brand:    r.brand ?? '',
      qty:      Number(r.quantity),
      serving:  r.serving_label,
      calories: round(r.calories),
      carbs:    round(r.carbs_g),
      protein:  round(r.protein_g),
      fat:      round(r.fat_g),
      fiber:    r.fiber_g != null ? round(r.fiber_g) : '',
      sodium:   r.sodium_mg != null ? round(r.sodium_mg) : '',
    });
  });

  // ── Sheet 2: Daily Summary ───────────────────────────────────
  const summary = workbook.addWorksheet('Daily Summary');
  summary.columns = [
    { header: 'Date',       key: 'date',    width: 12 },
    { header: 'Calories',   key: 'calories',width: 10 },
    { header: 'Goal',       key: 'goal',    width: 8  },
    { header: '% of Goal',  key: 'pct',     width: 10 },
    { header: 'Carbs (g)',  key: 'carbs',   width: 10 },
    { header: 'Protein (g)',key: 'protein', width: 11 },
    { header: 'Fat (g)',    key: 'fat',     width: 9  },
  ];
  styleHeader(summary);

  const [goalRows] = await pool.query<RowDataPacket[]>(
    `SELECT calories FROM user_goals WHERE user_id = ? AND effective_from <= ? ORDER BY effective_from DESC LIMIT 1`,
    [userId, end]
  );
  const calGoal = goalRows.length ? Number(goalRows[0].calories) : DEFAULTS.calorieGoal;

  const [dailyRows] = await pool.query<RowDataPacket[]>(
    `SELECT log_date,
            ROUND(SUM(calories), 1) AS calories,
            ROUND(SUM(carbs_g),  1) AS carbs,
            ROUND(SUM(protein_g),1) AS protein,
            ROUND(SUM(fat_g),    1) AS fat
     FROM food_log
     WHERE user_id = ? AND log_date BETWEEN ? AND ?
     GROUP BY log_date
     ORDER BY log_date ASC`,
    [userId, start, end]
  );

  dailyRows.forEach((r) => {
    const cal = Number(r.calories);
    const pct = calGoal ? Math.round((cal / calGoal) * 100) : 0;
    const row = summary.addRow({
      date:     fmtDate(r.log_date),
      calories: cal,
      goal:     calGoal,
      pct:      `${pct}%`,
      carbs:    round(r.carbs),
      protein:  round(r.protein),
      fat:      round(r.fat),
    });
    const pctCell = row.getCell('pct');
    if (pct >= 90 && pct <= 110) pctCell.font = { color: { argb: 'FF10B981' } };
    else if (pct > 110)          pctCell.font = { color: { argb: 'FFEF4444' } };
    else                         pctCell.font = { color: { argb: 'FFF59E0B' } };
  });

  // ── Sheet 3: Weekly Summary ──────────────────────────────────
  const weekly = workbook.addWorksheet('Weekly Summary');
  weekly.columns = [
    { header: 'Week of',     key: 'weekOf',  width: 12 },
    { header: 'Week end',    key: 'weekEnd', width: 12 },
    { header: 'Avg Calories',key: 'avgCal',  width: 13 },
    { header: 'Avg Carbs',   key: 'avgCarbs',width: 11 },
    { header: 'Avg Protein', key: 'avgProt', width: 12 },
    { header: 'Avg Fat',     key: 'avgFat',  width: 10 },
    { header: 'Days Logged', key: 'days',    width: 12 },
  ];
  styleHeader(weekly);

  const [weeklyRows] = await pool.query<RowDataPacket[]>(
    `SELECT MIN(log_date) AS week_start, MAX(log_date) AS week_end,
            ROUND(AVG(dc), 0) AS avg_cal,
            ROUND(AVG(dcarb), 1) AS avg_carbs,
            ROUND(AVG(dprot), 1) AS avg_prot,
            ROUND(AVG(dfat),  1) AS avg_fat,
            COUNT(*) AS days_logged
     FROM (
       SELECT log_date,
              YEARWEEK(log_date, 1) AS yw,
              SUM(calories)  AS dc,
              SUM(carbs_g)   AS dcarb,
              SUM(protein_g) AS dprot,
              SUM(fat_g)     AS dfat
       FROM food_log
       WHERE user_id = ? AND log_date BETWEEN ? AND ?
       GROUP BY log_date
     ) daily
     GROUP BY yw
     ORDER BY yw ASC`,
    [userId, start, end]
  );

  weeklyRows.forEach((r) => {
    weekly.addRow({
      weekOf:   fmtDate(r.week_start),
      weekEnd:  fmtDate(r.week_end),
      avgCal:   Number(r.avg_cal),
      avgCarbs: round(r.avg_carbs),
      avgProt:  round(r.avg_prot),
      avgFat:   round(r.avg_fat),
      days:     Number(r.days_logged),
    });
  });

  // ── Sheet 4: TDEE Breakdown ──────────────────────────────────
  const tdeeSheet = workbook.addWorksheet('TDEE Breakdown');
  tdeeSheet.columns = [
    { header: 'Date',             key: 'date',      width: 12 },
    { header: 'Weight (lbs)',     key: 'weight',    width: 13 },
    { header: 'BMR',              key: 'bmr',       width: 8  },
    { header: 'NEAT',             key: 'neat',      width: 8  },
    { header: 'TEF',              key: 'tef',       width: 8  },
    { header: 'Exercise (kcal)', key: 'exercise',  width: 15 },
    { header: 'TDEE (Total Burned)', key: 'tdee',  width: 18 },
    { header: 'Calories In',     key: 'calsIn',    width: 12 },
    { header: 'Net',             key: 'net',       width: 10 },
  ];
  styleHeader(tdeeSheet);

  // Fetch user profile for TDEE calculation
  const [profileRows] = await pool.query<RowDataPacket[]>(
    `SELECT height_cm, sex, dob, activity_level FROM users WHERE id = ?`,
    [userId]
  );

  if (profileRows.length && profileRows[0].height_cm && profileRows[0].sex && profileRows[0].dob && profileRows[0].activity_level) {
    const profile = profileRows[0];

    // Fetch all weight measurements up to end date (carry forward)
    const [weightRows] = await pool.query<RowDataPacket[]>(
      `SELECT measured_at, value, unit FROM body_measurements
       WHERE user_id = ? AND metric = 'weight' AND measured_at <= ?
       ORDER BY measured_at ASC`,
      [userId, end]
    );

    // Fetch daily food calories in range
    const [foodCalRows] = await pool.query<RowDataPacket[]>(
      `SELECT log_date, ROUND(SUM(calories), 1) AS calories
       FROM food_log WHERE user_id = ? AND log_date BETWEEN ? AND ?
       GROUP BY log_date`,
      [userId, start, end]
    );
    const foodCalMap = new Map<string, number>(
      foodCalRows.map((r) => [fmtDate(r.log_date), Number(r.calories)])
    );

    // Fetch daily exercise calories in range
    const [exCalRows] = await pool.query<RowDataPacket[]>(
      `SELECT workout_date, COALESCE(SUM(calories_burned), 0) AS exercise_kcal
       FROM workout_logs WHERE user_id = ? AND completed = 1 AND workout_date BETWEEN ? AND ?
       GROUP BY workout_date`,
      [userId, start, end]
    );
    const exCalMap = new Map<string, number>(
      exCalRows.map((r) => [fmtDate(r.workout_date), Number(r.exercise_kcal)])
    );

    // Build weight carry-forward map
    let lastWeightKg = DEFAULTS.weightKg;
    const weightByDate = new Map<string, number>();
    for (const w of weightRows) {
      const kg = w.unit === 'kg' ? Number(w.value) : Number(w.value) / 2.20462;
      weightByDate.set(fmtDate(w.measured_at), kg);
    }

    // Iterate each date in range
    const cur = new Date(start + 'T12:00:00');
    const endDate = new Date(end + 'T12:00:00');
    while (cur <= endDate) {
      const iso = cur.toISOString().slice(0, 10);
      if (weightByDate.has(iso)) lastWeightKg = weightByDate.get(iso)!;
      const calsIn = foodCalMap.get(iso) ?? 0;
      const exerciseKcal = exCalMap.get(iso) ?? 0;

      const tdee = calcTDEE({
        weightKg: lastWeightKg,
        heightCm: Number(profile.height_cm),
        dob: fmtDate(profile.dob),
        sex: profile.sex as 'male' | 'female',
        activityLevel: profile.activity_level as ActivityLevel,
        caloriesIn: calsIn,
        exerciseKcal,
      });

      const weightLbs = Math.round(lastWeightKg * 2.20462 * 10) / 10;
      const row = tdeeSheet.addRow({
        date:     iso,
        weight:   weightLbs,
        bmr:      tdee.bmr,
        neat:     tdee.neat,
        tef:      tdee.tef,
        exercise: exerciseKcal || '',
        tdee:     tdee.total,
        calsIn:   calsIn || '',
        net:      calsIn ? calsIn - tdee.total : '',
      });

      // Color net cell
      if (calsIn) {
        const net = calsIn - tdee.total;
        const netCell = row.getCell('net');
        netCell.font = { color: { argb: net > 200 ? 'FFEF4444' : net < -200 ? 'FF3B82F6' : 'FF10B981' } };
      }

      cur.setDate(cur.getDate() + 1);
    }
  }
  } // features.nutrition (Daily Diary, Daily Summary, Weekly Summary, TDEE Breakdown)

  // ── Sheet 5: Workout Log ─────────────────────────────────────
  if (features.exercise) {
  const workoutSheet = workbook.addWorksheet('Workout Log');
  workoutSheet.columns = [
    { header: 'Date',            key: 'date',      width: 12 },
    { header: 'Workout',         key: 'workout',   width: 20 },
    { header: 'Routine',         key: 'routine',   width: 20 },
    { header: 'Duration (min)',  key: 'duration',  width: 14 },
    { header: 'Calories Burned', key: 'calsBurned',width: 15 },
    { header: 'Exercise',        key: 'exercise',  width: 28 },
    { header: 'Category',        key: 'category',  width: 14 },
    { header: 'Set #',           key: 'setNum',    width: 7  },
    { header: 'Reps',            key: 'reps',      width: 7  },
    { header: 'Weight (lbs)',    key: 'weightLbs', width: 12 },
    { header: 'Duration (mm:ss)',key: 'duration2', width: 15 },
    { header: 'Distance (m)',    key: 'distance',  width: 12 },
    { header: 'Notes',           key: 'notes',     width: 30 },
  ];
  styleHeader(workoutSheet);

  const [workoutRows] = await pool.query<RowDataPacket[]>(
    `SELECT wl.workout_date, wl.name AS workout_name, wr.name AS routine_name,
            wl.duration_minutes, wl.calories_burned,
            e.name AS exercise_name, e.category,
            es.set_number, es.reps, es.weight_kg, es.duration_seconds, es.distance_meters,
            we.notes AS exercise_notes
     FROM workout_logs wl
     LEFT JOIN workout_routines wr ON wr.id = wl.routine_id
     LEFT JOIN workout_exercises we ON we.workout_log_id = wl.id
     LEFT JOIN exercises e ON e.id = we.exercise_id
     LEFT JOIN exercise_sets es ON es.workout_exercise_id = we.id AND es.completed = 1
     WHERE wl.user_id = ? AND wl.completed = 1 AND wl.workout_date BETWEEN ? AND ?
     ORDER BY wl.workout_date ASC, wl.id ASC, we.sort_order ASC, es.set_number ASC`,
    [userId, start, end]
  );

  workoutRows.forEach((r) => {
    const weightLbs = r.weight_kg != null
      ? Math.round(Number(r.weight_kg) * 2.20462 * 10) / 10
      : '';
    const durationFmt = r.duration_seconds != null
      ? `${Math.floor(r.duration_seconds / 60)}:${String(r.duration_seconds % 60).padStart(2, '0')}`
      : '';
    workoutSheet.addRow({
      date:      fmtDate(r.workout_date),
      workout:   r.workout_name ?? '',
      routine:   r.routine_name ?? '',
      duration:  r.duration_minutes ?? '',
      calsBurned:r.calories_burned ?? '',
      exercise:  r.exercise_name ?? '',
      category:  r.category ?? '',
      setNum:    r.set_number ?? '',
      reps:      r.reps ?? '',
      weightLbs,
      duration2: durationFmt,
      distance:  r.distance_meters ?? '',
      notes:     r.exercise_notes ?? '',
    });
  });
  } // features.exercise

  // ── Sheet 6: Body Measurements ───────────────────────────────
  if (features.body) {
  const measSheet = workbook.addWorksheet('Body Measurements');
  measSheet.columns = [
    { header: 'Date',    key: 'date',   width: 12 },
    { header: 'Metric',  key: 'metric', width: 14 },
    { header: 'Value',   key: 'value',  width: 10 },
    { header: 'Unit',    key: 'unit',   width: 8  },
    { header: 'Notes',   key: 'notes',  width: 30 },
  ];
  styleHeader(measSheet);

  const [measRows] = await pool.query<RowDataPacket[]>(
    `SELECT measured_at, metric, value, unit, notes
     FROM body_measurements
     WHERE user_id = ? AND measured_at BETWEEN ? AND ?
     ORDER BY measured_at ASC, metric ASC`,
    [userId, start, end]
  );

  measRows.forEach((r) => {
    measSheet.addRow({
      date:   fmtDate(r.measured_at),
      metric: r.metric,
      value:  Number(r.value),
      unit:   r.unit,
      notes:  r.notes ?? '',
    });
  });
  } // features.body

  // ── Sheet 7: Water Log ───────────────────────────────────────
  if (features.water) {
  const waterSheet = workbook.addWorksheet('Water Log');
  waterSheet.columns = [
    { header: 'Date',       key: 'date',  width: 12 },
    { header: 'Water (oz)', key: 'oz',    width: 12 },
    { header: 'Goal (oz)',  key: 'goal',  width: 12 },
  ];
  styleHeader(waterSheet);

  const [waterGoalRows] = await pool.query<RowDataPacket[]>(
    `SELECT water_goal_oz FROM user_goals WHERE user_id = ? AND effective_from <= ? ORDER BY effective_from DESC LIMIT 1`,
    [userId, end]
  );
  const waterGoal = waterGoalRows.length ? Number(waterGoalRows[0].water_goal_oz) : DEFAULTS.waterGoalOz;

  const [waterRows] = await pool.query<RowDataPacket[]>(
    `SELECT log_date, ROUND(SUM(amount_oz), 1) AS total_oz
     FROM water_log WHERE user_id = ? AND log_date BETWEEN ? AND ?
     GROUP BY log_date ORDER BY log_date ASC`,
    [userId, start, end]
  );

  waterRows.forEach((r) => {
    waterSheet.addRow({
      date: fmtDate(r.log_date),
      oz:   Number(r.total_oz),
      goal: waterGoal,
    });
  });
  } // features.water

  // ── Sheet 8: Steps Log ──────────────────────────────────────
  if (features.activity) {
  const stepsSheet = workbook.addWorksheet('Steps Log');
  stepsSheet.columns = [
    { header: 'Date',   key: 'date',   width: 12 },
    { header: 'Steps',  key: 'steps',  width: 10 },
    { header: 'Source', key: 'source', width: 14 },
  ];
  styleHeader(stepsSheet);

  const [stepsRows] = await pool.query<RowDataPacket[]>(
    `SELECT log_date, steps, source
     FROM steps_log
     WHERE user_id = ? AND log_date BETWEEN ? AND ?
     ORDER BY log_date ASC`,
    [userId, start, end]
  );

  stepsRows.forEach((r) => {
    stepsSheet.addRow({
      date:   fmtDate(r.log_date),
      steps:  Number(r.steps),
      source: r.source ?? '',
    });
  });
  } // features.activity

  return workbook.xlsx.writeBuffer();
}

// ── Helpers ──────────────────────────────────────────────────

function styleHeader(sheet: ExcelJS.Worksheet) {
  const headerRow = sheet.getRow(1);
  headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F172A' } };
  headerRow.alignment = { vertical: 'middle' };
  headerRow.height = 18;
}

function fmtDate(d: Date | string): string {
  if (d instanceof Date) return d.toISOString().slice(0, 10);
  return String(d).slice(0, 10);
}

function round(v: unknown): number {
  return Math.round(Number(v) * 10) / 10;
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
