import ExcelJS from 'exceljs';
import { pool } from '../config/database';
import type { RowDataPacket } from 'mysql2';

export async function buildExport(start: string, end: string): Promise<ExcelJS.Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'FoodTracker';
  workbook.created = new Date();

  // ── Sheet 1: Daily Diary ─────────────────────────────────────
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
     WHERE fl.log_date BETWEEN ? AND ?
     ORDER BY fl.log_date ASC, fl.meal ASC, fl.logged_at ASC`,
    [start, end]
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

  // Get goal for date range (most recent goal effective on or before end date)
  const [goalRows] = await pool.query<RowDataPacket[]>(
    `SELECT calories FROM user_goals WHERE effective_from <= ? ORDER BY effective_from DESC LIMIT 1`,
    [end]
  );
  const calGoal = goalRows.length ? Number(goalRows[0].calories) : 2000;

  const [dailyRows] = await pool.query<RowDataPacket[]>(
    `SELECT log_date,
            ROUND(SUM(calories), 1) AS calories,
            ROUND(SUM(carbs_g),  1) AS carbs,
            ROUND(SUM(protein_g),1) AS protein,
            ROUND(SUM(fat_g),    1) AS fat
     FROM food_log
     WHERE log_date BETWEEN ? AND ?
     GROUP BY log_date
     ORDER BY log_date ASC`,
    [start, end]
  );

  dailyRows.forEach((r) => {
    const cal = Number(r.calories);
    const pct = calGoal ? Math.round((cal / calGoal) * 100) : 0;
    const row = summary.addRow({
      date:    fmtDate(r.log_date),
      calories: cal,
      goal:    calGoal,
      pct:     `${pct}%`,
      carbs:   round(r.carbs),
      protein: round(r.protein),
      fat:     round(r.fat),
    });
    // Color pct cell: green = 90-110%, red = >110%, yellow = <90%
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
       WHERE log_date BETWEEN ? AND ?
       GROUP BY log_date
     ) daily
     GROUP BY yw
     ORDER BY yw ASC`,
    [start, end]
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
