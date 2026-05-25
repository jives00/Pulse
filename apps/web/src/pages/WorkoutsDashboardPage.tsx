import { useState, useEffect, useRef } from 'react';
import { buildWorkoutLine } from '../utils/workoutLine';
import { useNavigate } from 'react-router-dom';
import {
  workoutsApi, goalsApi, measurementsApi, routinesApi,
  waterApi, logApi,
  type WorkoutSummary, type ExerciseGoals, type GoalsSummary,
  type BodyMeasurement, type MeasurementGoal, type PersonalBests,
  type RoutineSummary,
  type WaterHistory, type FoodLogHistoryDay, type TDEEBreakdown,
  type WeekBucket,
  localDateStr, getWeekStart,
  buildWeeklyData, computeGoalPace, computeCreatineSaturation,
  computeWeekDelta, computeWeekStreak, computeHighlights, WEEK_STREAK_MILESTONES,
  type PaceStatus,
  KG_TO_LBS,
} from '@pulse/api-client';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function computeDayStreak(workouts: WorkoutSummary[]): number {
  if (workouts.length === 0) return 0;
  const days = new Set(workouts.map((w) => w.workoutDate));
  const today = localDateStr();
  let streak = 0;
  let cursor = new Date(today + 'T12:00:00');
  // Allow streak to continue if today has no workout yet (check yesterday as start)
  if (!days.has(today)) cursor.setDate(cursor.getDate() - 1);
  while (days.has(localDateStr(cursor))) {
    streak++;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}

// ─── Goals modal ─────────────────────────────────────────────────────────────

// ─── Dashboard: on-pace helpers ───────────────────────────────────────────────

const METRIC_CONFIG: Record<string, { label: string; unit: string; icon: string; color: string; defaultGoalDir: 'down' | 'up' }> = {
  weight:      { label: 'Weight',      unit: 'lbs', icon: '⚖️', color: '#60a5fa', defaultGoalDir: 'down' },
  waist:       { label: 'Waist',       unit: 'in',  icon: '📏', color: '#fb923c', defaultGoalDir: 'down' },
  bicep:       { label: 'Bicep',       unit: 'in',  icon: '💪', color: '#818cf8', defaultGoalDir: 'up'   },
  chest:       { label: 'Chest',       unit: 'in',  icon: '🫁', color: '#34d399', defaultGoalDir: 'up'   },
  hips:        { label: 'Hips',        unit: 'in',  icon: '📐', color: '#f472b6', defaultGoalDir: 'down' },
  body_fat:    { label: 'Body Fat',    unit: '%',   icon: '🔥', color: '#facc15', defaultGoalDir: 'down' },
  bmi:         { label: 'BMI',         unit: '',    icon: '📊', color: '#D4A843', defaultGoalDir: 'down' },
  muscle_mass: { label: 'Muscle Mass', unit: 'lbs', icon: '🦾', color: '#86AA80', defaultGoalDir: 'up'   },
  water_pct:   { label: 'Water Mass',  unit: '%',   icon: '💧', color: '#7C9ECB', defaultGoalDir: 'up'   },
};

const DISPLAYED_METRICS = ['weight', 'waist', 'bicep'];

// ─── Dashboard: on-pace helpers ───────────────────────────────────────────────


// ─── Today's Blurb ───────────────────────────────────────────────────────────


function TodaysBlurb({
  workouts,
  foodLogHistory,
  waterHistory,
  todayTDEE,
}: {
  workouts: WorkoutSummary[];
  foodLogHistory: FoodLogHistoryDay[];
  waterHistory: WaterHistory | null;
  todayTDEE: TDEEBreakdown | null;
}) {
  const GLASS = 8;
  const today = localDateStr();
  const todayWorkouts = workouts.filter((w) => w.workoutDate === today);
  const todayFood = foodLogHistory.find((d) => d.date === today);
  const todayWaterOz = waterHistory?.days.find((d) => d.date === today)?.totalOz ?? 0;
  const todayWaterGlasses = Math.round(todayWaterOz / GLASS * 10) / 10;

  const totalCarbs = Math.round(todayFood?.entries.reduce((s, e) => s + e.carbsG, 0) ?? 0);
  const totalFat = Math.round(todayFood?.entries.reduce((s, e) => s + e.fatG, 0) ?? 0);

  const workoutLines = todayWorkouts.map(buildWorkoutLine);

  const hasData = todayWorkouts.length > 0 || todayFood != null || todayWaterOz > 0;

  // Build 30-day TDEE table rows
  const tdeeRows: { date: string; label: string; caloriesIn: number; tef: number; exercise: number; tdee: number; net: number }[] = [];
  if (todayTDEE) {
    const baseline = todayTDEE.bmr + todayTDEE.neat;
    const exerciseByDate: Record<string, number> = {};
    for (const w of workouts) {
      if (w.caloriesBurned) exerciseByDate[w.workoutDate] = (exerciseByDate[w.workoutDate] ?? 0) + w.caloriesBurned;
    }
    const foodByDate: Record<string, number> = {};
    for (const d of foodLogHistory) foodByDate[d.date] = d.calories;

    for (let i = 29; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const date = localDateStr(d);
      const caloriesIn = foodByDate[date] ?? 0;
      const exercise = exerciseByDate[date] ?? 0;
      const tef = Math.round(caloriesIn * 0.1);
      const tdee = baseline + tef + exercise;
      const net = caloriesIn > 0 || exercise > 0 ? caloriesIn - tdee : 0;
      const label = d.toLocaleDateString('en-US', { month: 'numeric', day: 'numeric' });
      tdeeRows.push({ date, label, caloriesIn, tef, exercise, tdee, net });
    }
    tdeeRows.reverse();
  }

  return (
    <div className="max-w-xl py-6 px-2 space-y-6 text-sm text-slate-300">
      {!hasData && (
        <p className="text-dram-muted italic">No data logged today yet.</p>
      )}
      {(workoutLines.length > 0 || todayFood != null || todayWaterOz > 0) && (
        <div>
          <p className="font-semibold text-slate-200 mb-1">Today's stats:</p>
          <ul className="space-y-1 list-disc list-inside">
            {workoutLines.map((line, i) => (
              <li key={i}>{line}</li>
            ))}
            {todayFood && (
              <li>
                Calories: {todayFood.calories.toLocaleString()}, Protein: {Math.round(todayFood.protein)}g, Carbs: {totalCarbs}g, Fats: {totalFat}g
              </li>
            )}
            {todayWaterOz > 0 && (
              <li>Water: {todayWaterGlasses} glasses</li>
            )}
          </ul>
        </div>
      )}

      {todayTDEE && tdeeRows.length > 0 && (
        <div>
          <p className="font-semibold text-slate-200 mb-2">Last 30 Days — Calories In vs. TDEE</p>
          <p className="text-sm text-dram-muted mb-3">
            BMR {todayTDEE.bmr} + NEAT {todayTDEE.neat} + TEF (10% of intake) + exercise per day{todayTDEE.stepsKcal > 0 ? ` + steps (today: ${todayTDEE.stepsKcal} kcal)` : ''}
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="text-dram-muted border-b border-dram-border">
                  <th className="text-left py-1.5 pr-3 font-medium">Date</th>
                  <th className="text-right py-1.5 px-3 font-medium">Cal In</th>
                  <th className="text-right py-1.5 px-3 font-medium">TEF</th>
                  <th className="text-right py-1.5 px-3 font-medium">Exercise</th>
                  <th className="text-right py-1.5 px-3 font-medium">TDEE</th>
                  <th className="text-right py-1.5 pl-3 font-medium">Net</th>
                </tr>
              </thead>
              <tbody>
                {tdeeRows.map((row) => {
                  const hasActivity = row.caloriesIn > 0 || row.exercise > 0;
                  return (
                    <tr key={row.date} className="border-b border-dram-border/40 hover:bg-dram-card/40">
                      <td className="py-1.5 pr-3 text-dram-muted">{row.label}</td>
                      <td className="py-1.5 px-3 text-right">{hasActivity ? row.caloriesIn.toLocaleString() : '—'}</td>
                      <td className="py-1.5 px-3 text-right text-dram-muted">{hasActivity ? row.tef : '—'}</td>
                      <td className="py-1.5 px-3 text-right text-dram-muted">{row.exercise > 0 ? row.exercise : '—'}</td>
                      <td className="py-1.5 px-3 text-right">{hasActivity ? row.tdee.toLocaleString() : '—'}</td>
                      <td className={`py-1.5 pl-3 text-right font-medium ${!hasActivity ? 'text-dram-muted' : row.net < 0 ? 'text-emerald-400' : row.net > 0 ? 'text-red-400' : 'text-dram-muted'}`}>
                        {hasActivity ? (row.net > 0 ? '+' : '') + row.net.toLocaleString() : '—'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Dashboard V3 ────────────────────────────────────────────────────────────

const GOLD = '#D4A843';
const BODY_COMP_METRICS = ['weight', 'bmi', 'body_fat', 'muscle_mass'] as const;

// ── V3 primitives ─────────────────────────────────────────────────────────────

function V3GoldRule({ w = 18 }: { w?: number }) {
  return <div className="bg-gold shrink-0" style={{ width: w, height: 2 }} />;
}

function V3CardHeader({ label, meta, action }: { label: string; meta?: string; action?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between px-6 py-4 border-b border-bd">
      <div className="flex items-center gap-3">
        <V3GoldRule />
        <span className="micro font-semibold text-white tracking-wider">{label}</span>
        {meta && <span className="t-xs text-muted font-mono">· {meta}</span>}
      </div>
      {action}
    </div>
  );
}

function V3CalorieRing({ pct, actual, goal }: { pct: number; actual: number; goal: number | null }) {
  const size = 148, sw = 10;
  const r = (size - sw) / 2;
  const circ = 2 * Math.PI * r;
  const filled = pct * circ;
  const fmtNum = (n: number) => new Intl.NumberFormat('en-US').format(Math.round(n));
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="rgb(var(--color-border))" strokeWidth={sw} />
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="rgb(var(--color-accent))" strokeWidth={sw}
          strokeDasharray={`${filled} ${circ}`} strokeLinecap="round" style={{ transition: 'stroke-dasharray 0.6s ease' }} />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <div className="font-display font-semibold text-[34px] tnum leading-none">{fmtNum(actual)}</div>
        <div className="t-xs text-muted font-mono mt-1">/ {goal ? fmtNum(goal) : '—'} kcal</div>
        <div className="t-xs gold font-mono mt-1">{Math.round(pct * 100)}%</div>
      </div>
    </div>
  );
}

function V3MacroRow({ label, actual, goal, unit, color }: { label: string; actual: number; goal: number | null; unit: string; color: string }) {
  const pct = goal ? Math.min(actual / goal, 1) : 0;
  return (
    <div>
      <div className="flex items-baseline justify-between mb-1.5">
        <span className="t-sm text-muted">{label}</span>
        <span className="t-sm font-mono tnum">
          <span>{actual}</span><span className="text-muted"> / {goal ?? '—'}{unit}</span>
        </span>
      </div>
      <div className="h-[6px] bg-bg rounded-full overflow-hidden">
        <div className="h-full rounded-full" style={{ width: `${pct * 100}%`, background: color, transition: 'width 0.6s ease' }} />
      </div>
    </div>
  );
}

function V3WaterGlasses({ filled, total }: { filled: number; total: number }) {
  return (
    <div className="flex gap-1 flex-wrap">
      {Array.from({ length: total }).map((_, i) => (
        <div key={i} className={`w-2.5 h-5 rounded-sm ${i < filled ? 'bg-gold' : 'bg-bg border border-bd'}`} />
      ))}
    </div>
  );
}

function V3GlassIcon() {
  return (
    <svg width="18" height="20" viewBox="0 0 18 20" fill="none" className="text-muted shrink-0">
      <path d="M3 2 L15 2 L13.5 18 Q13 19 12 19 L6 19 Q5 19 4.5 18 Z" stroke="currentColor" strokeWidth="1.3" fill="none"/>
      <path d="M4 10 L14 10" stroke="currentColor" strokeWidth="1" opacity="0.5"/>
      <path d="M5 13 Q9 14.5 13 13 L12.5 18 Q12 19 11 19 L7 19 Q6 19 5.5 18 Z" fill="currentColor" opacity="0.25"/>
    </svg>
  );
}

function V3BottleIcon() {
  return (
    <svg width="18" height="20" viewBox="0 0 18 20" fill="none" className="text-muted shrink-0">
      <rect x="7" y="1" width="4" height="2.5" stroke="currentColor" strokeWidth="1.2" fill="none" rx="0.5"/>
      <path d="M6 3.5 L12 3.5 L13 6 Q13 7 13 8 L13 17 Q13 19 11 19 L7 19 Q5 19 5 17 L5 8 Q5 7 6 6 Z" stroke="currentColor" strokeWidth="1.3" fill="none"/>
      <path d="M6 11 Q9 12.5 12 11 L12 17 Q12 18 11 18 L7 18 Q6 18 6 17 Z" fill="currentColor" opacity="0.3"/>
    </svg>
  );
}

// ── FuelTodayCard ──────────────────────────────────────────────────────────────

function FuelTodayCard({
  foodLogHistory,
  waterHistory,
  workouts,
  caloriesGoal,
  proteinGoal,
  carbsGoal,
  fatGoal,
  todayTDEE,
  onWaterLogged,
}: {
  foodLogHistory: FoodLogHistoryDay[];
  waterHistory: WaterHistory | null;
  workouts: WorkoutSummary[];
  caloriesGoal: number | null;
  proteinGoal: number | null;
  carbsGoal: number | null;
  fatGoal: number | null;
  todayTDEE: TDEEBreakdown | null;
  measurements?: BodyMeasurement[];
  onWaterLogged?: () => void;
}) {
  const navigate = useNavigate();
  const today = localDateStr();
  const GLASS = 8;
  const todayFood = foodLogHistory.find((d) => d.date === today);
  const calories = Math.round(todayFood?.calories ?? 0);
  const protein = Math.round(todayFood?.protein ?? 0);
  const carbs = Math.round(todayFood?.entries.reduce((s, e) => s + e.carbsG, 0) ?? 0);
  const fat = Math.round(todayFood?.entries.reduce((s, e) => s + e.fatG, 0) ?? 0);
  const [waterBonus, setWaterBonus] = useState(0);
  const [savingWater, setSavingWater] = useState(false);

  const waterOzBase = waterHistory?.days.find((d) => d.date === today)?.totalOz ?? 0;
  const waterOz = waterOzBase + waterBonus;
  const waterGoalOz = waterHistory?.goalOz ?? 64;
  const waterGlasses = Math.round(waterOz / GLASS);
  const waterGoalGlasses = Math.round(waterGoalOz / GLASS);

  const burnedToday = workouts
    .filter((w) => w.workoutDate === today)
    .reduce((s, w) => s + (w.caloriesBurned ?? 0), 0);

  let tdeeToday: number | null = null;
  if (todayTDEE) {
    tdeeToday = todayTDEE.bmr + todayTDEE.neat + Math.round(calories * 0.1) + burnedToday + (todayTDEE.stepsKcal ?? 0);
  }
  const net = tdeeToday != null ? calories - tdeeToday : null;
  const calPct = caloriesGoal ? Math.min(calories / caloriesGoal, 1) : 0;

  async function logWater(oz: number) {
    if (savingWater) return;
    setSavingWater(true);
    setWaterBonus(b => b + oz);
    try {
      await waterApi.add(today, oz);
      setWaterBonus(0);
      onWaterLogged?.();
    } catch {
      setWaterBonus(b => b - oz);
    } finally {
      setSavingWater(false);
    }
  }

  const MEAL_ORDER: Array<'breakfast' | 'lunch' | 'dinner' | 'snack'> = ['breakfast', 'lunch', 'dinner', 'snack'];
  const MEAL_LABEL: Record<string, string> = { breakfast: 'Breakfast', lunch: 'Lunch', dinner: 'Dinner', snack: 'Snack' };
  const mealsBySlot: Record<string, { calories: number; protein: number }> = {};
  for (const entry of todayFood?.entries ?? []) {
    const slot = entry.meal ?? 'snack';
    if (!mealsBySlot[slot]) mealsBySlot[slot] = { calories: 0, protein: 0 };
    mealsBySlot[slot].calories += entry.calories;
    mealsBySlot[slot].protein += entry.proteinG;
  }
  const totalMeals = Object.keys(mealsBySlot).length;
  const fmtNum = (n: number) => new Intl.NumberFormat('en-US').format(Math.round(n));

  return (
    <section className="card overflow-hidden">
      <V3CardHeader
        label="Fuel Today"
        meta={`${totalMeals} meals logged${tdeeToday ? ` · TDEE ${fmtNum(tdeeToday)} kcal` : ''}`}
      />
      <div className="grid" style={{ gridTemplateColumns: '1.2fr 1fr 1.4fr' }}>

        {/* Col 1 — Calorie ring + macros */}
        <div className="p-6 border-r border-bd flex items-center gap-6">
          <V3CalorieRing pct={calPct} actual={calories} goal={caloriesGoal} />
          <div className="flex-1 space-y-3.5">
            <V3MacroRow label="Protein" actual={protein} goal={proteinGoal} unit="g" color="#D4A843" />
            <V3MacroRow label="Carbs"   actual={carbs}   goal={carbsGoal}   unit="g" color="#7C9ECB" />
            <V3MacroRow label="Fat"     actual={fat}     goal={fatGoal}     unit="g" color="#C5896E" />
          </div>
        </div>

        {/* Col 2 — Water */}
        <div className="p-6 border-r border-bd flex flex-col">
          <div>
            <div className="flex items-center justify-between mb-1">
              <span className="micro font-semibold text-white tracking-wider">Water</span>
              <span className="t-xs font-mono text-muted tnum">{Math.round(Math.min(waterOz / waterGoalOz, 1) * 100)}%</span>
            </div>
            <div className="flex items-baseline gap-1.5 mt-2 mb-3">
              <span className="font-display font-semibold text-[36px] tnum">{waterGlasses}</span>
              <span className="t-base text-muted font-mono">/ {waterGoalGlasses} glasses</span>
            </div>
            <V3WaterGlasses filled={waterGlasses} total={waterGoalGlasses} />
            <div className="flex gap-2 mt-4">
              <button
                onClick={() => logWater(8)}
                disabled={savingWater}
                className="flex-1 border border-bd hover:border-gold bg-bg/50 rounded-md px-2 py-2 flex items-center gap-2 group transition-colors disabled:opacity-50"
              >
                <V3GlassIcon />
                <div className="text-left leading-tight">
                  <div className="t-xs font-semibold">+ 1 glass</div>
                  <div className="text-[10px] text-muted">8 oz</div>
                </div>
              </button>
              <button
                onClick={() => logWater(20)}
                disabled={savingWater}
                className="flex-1 border border-bd hover:border-gold bg-bg/50 rounded-md px-2 py-2 flex items-center gap-2 group transition-colors disabled:opacity-50"
              >
                <V3BottleIcon />
                <div className="text-left leading-tight">
                  <div className="t-xs font-semibold">+ Bottle</div>
                  <div className="text-[10px] text-muted">20 oz</div>
                </div>
              </button>
            </div>
          </div>
        </div>

        {/* Col 3 — Meals timeline */}
        <div className="p-6">
          <div className="flex items-center justify-between mb-4">
            <span className="micro font-semibold text-white tracking-wider">Meals</span>
          </div>
          {totalMeals === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-center border border-dashed border-bd rounded-lg">
              <div className="t-sm text-muted mb-2">Nothing logged yet.</div>
              <button onClick={() => navigate('/nutrition/today')} className="t-xs gold font-medium">
                Add your first meal →
              </button>
            </div>
          ) : (
            <div className="space-y-2.5">
              {MEAL_ORDER.filter((slot) => mealsBySlot[slot]).map((slot) => {
                const meal = mealsBySlot[slot];
                return (
                  <div key={slot} className="flex items-baseline justify-between py-1.5 border-b border-bd/60 last:border-0">
                    <span className="t-base font-medium">{MEAL_LABEL[slot]}</span>
                    <div className="flex items-baseline gap-4 font-mono t-base">
                      <span className="tnum">{fmtNum(meal.calories)} <span className="text-muted t-sm">kcal</span></span>
                      <span className="tnum text-muted">{Math.round(meal.protein)}<span className="t-sm">g</span></span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
      {/* Net vs TDEE below the 3 columns */}
      {(net != null || burnedToday > 0) && (
        <div className="px-6 py-4 border-t border-bd flex items-center gap-8">
          <div>
            <span className="micro font-semibold text-white tracking-wider">Net vs TDEE</span>
            <div className="flex items-baseline gap-1.5 mt-1">
              <span className="font-display font-semibold text-[28px] tnum">
                {net != null ? (net > 0 ? '+' : '') + fmtNum(net) : fmtNum(calories)}
              </span>
              <span className="t-sm text-muted font-mono">kcal</span>
            </div>
          </div>
          <div className="t-sm text-muted">
            {net != null
              ? (net < 0 ? 'In deficit' : net > 0 ? 'In surplus' : 'Maintenance')
              : (burnedToday > 0 ? `${fmtNum(burnedToday)} kcal burned` : 'No TDEE data')}
          </div>
          {tdeeToday != null && (
            <div className="t-xs text-muted font-mono ml-auto">
              Intake {fmtNum(calories)} · TDEE {fmtNum(tdeeToday)} · Net {net != null ? (net > 0 ? '+' : '') + fmtNum(net) : '—'} kcal
            </div>
          )}
        </div>
      )}
    </section>
  );
}

// ── ThisWeekCard ───────────────────────────────────────────────────────────────

function ThisWeekCardV3({
  workouts,
  exGoals,
  weeklyData: _weeklyData,
  routinesList: _routinesList,
  routineGoals,
}: {
  workouts: WorkoutSummary[];
  exGoals: ExerciseGoals | null;
  weeklyData: WeekBucket[];
  routinesList: RoutineSummary[];
  routineGoals: Record<number, number>;
}) {
  const today = localDateStr();
  const weekStart = getWeekStart(today);
  const streak = computeDayStreak(workouts);
  const weekStreak = computeWeekStreak(workouts);
  const streakIsMilestone = WEEK_STREAK_MILESTONES.includes(weekStreak);

  const weekWorkouts = workouts.filter((w) => getWeekStart(w.workoutDate) === weekStart);
  const weekVolumeLbs = Math.round(weekWorkouts.reduce((s, w) => s + (w.totalVolumeKg ?? 0) * KG_TO_LBS, 0));
  const weekCount = weekWorkouts.length;

  const volumeGoal = exGoals?.volumeLbsPerWeek ?? null;
  const workoutGoal = exGoals?.workoutsPerWeek ?? null;

  const weeklyData = _weeklyData;
  const weekDelta = computeWeekDelta(weeklyData);

  const weekDayLabels = ['M', 'Tu', 'W', 'Th', 'F', 'Sa', 'Su'];
  const weekDayBars = weekDayLabels.map((label, i) => {
    const d = new Date(weekStart + 'T12:00:00');
    d.setDate(d.getDate() + i);
    const dateStr = localDateStr(d);
    const isToday = dateStr === today;
    const dayWorkouts = workouts.filter((w) => w.workoutDate === dateStr);
    const volumeLbs = Math.round(dayWorkouts.reduce((s, w) => s + (w.totalVolumeKg ?? 0) * KG_TO_LBS, 0));
    const hasStrength = dayWorkouts.some((w) => !w.routineType || w.routineType === 'strength' || w.routineType === 'bodyweight');
    const hasSteps = dayWorkouts.some((w) => w.routineType === 'steps');
    const hasCardioDistance = dayWorkouts.some((w) => w.routineType === 'cardio_distance');
    const hasCardioDuration = dayWorkouts.some((w) => w.routineType === 'cardio_duration');
    const totalSteps = dayWorkouts.reduce((s, w) => s + (w.totalSteps ?? 0), 0);
    const totalDistMi = dayWorkouts.reduce((s, w) => s + (w.totalDistanceMeters ?? 0), 0) / 1609.34;
    const totalDurMin = dayWorkouts.reduce((s, w) => s + (w.totalDurationSeconds ?? 0), 0) / 60;
    const nonStrength = !hasStrength && (hasSteps || hasCardioDistance || hasCardioDuration);
    // Normalize bar height: strength → % of weekly volume goal (or raw lbs if no goal)
    // Non-strength → contribution of each session toward routine's weekly goal (1/target per session)
    let barPct: number;
    if (dayWorkouts.length === 0) {
      barPct = 0;
    } else if (hasStrength) {
      barPct = volumeGoal ? volumeLbs / volumeGoal : volumeLbs / 10000;
    } else {
      // Sum pct contributions from each non-strength session
      barPct = dayWorkouts
        .filter((w) => w.routineType && w.routineType !== 'strength' && w.routineType !== 'bodyweight')
        .reduce((sum, w) => {
          const target = w.routineId ? routineGoals[w.routineId] : null;
          // Each session = 1/target of the weekly goal; if no goal set, treat 3/week as baseline
          return sum + 1 / (target ?? 3);
        }, 0);
    }
    return { label, dateStr, isToday, barPct, nonStrength, volumeLbs, totalSteps, totalDistMi, totalDurMin, vol: Math.round(volumeLbs), dayWorkouts };
  });

  const maxPct = Math.max(...weekDayBars.map((d) => d.barPct), 0.01);
  const fmtNum = (n: number) => new Intl.NumberFormat('en-US').format(Math.round(n));

  const weekLabel = weekStart
    ? new Date(weekStart + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    : '';

  const [hoveredDay, setHoveredDay] = useState<string | null>(null);
  const hoveredBar = weekDayBars.find((d) => d.dateStr === hoveredDay) ?? null;

  return (
    <section className="card overflow-hidden">
      <V3CardHeader label="This Week" meta={`Week of ${weekLabel} · ${streak}-day streak`} action={weekStreak > 0 ? <span className={`t-xs font-mono font-semibold px-2 py-0.5 rounded-full ${streakIsMilestone ? 'gold bg-gold/10' : 'text-muted bg-bd/40'}`}>{weekStreak}-week streak</span> : undefined} />
      <div className="grid" style={{ gridTemplateColumns: '1fr 2.2fr', alignItems: 'stretch' }}>
        <div className="border-r border-bd divide-y divide-bd">
          {/* Workouts stat */}
          <div className="p-6">
            <div className="flex items-baseline justify-between mb-2.5">
              <span className="micro text-muted">Workouts</span>
              <span className={`t-xs font-mono font-medium ${workoutGoal && weekCount >= workoutGoal ? 'gold' : 'text-muted'}`}>
                {workoutGoal ? Math.round(Math.min(weekCount / workoutGoal, 1) * 100) : 0}%
              </span>
            </div>
            <div className="flex items-baseline gap-1.5 mb-3">
              <span className="font-display font-semibold text-[38px] tnum leading-none">{weekCount}</span>
              <span className="t-sm text-muted font-mono">/ {workoutGoal ?? '—'}</span>
            </div>
            <div className="h-[5px] bg-bg rounded-full overflow-hidden">
              <div className="h-full bg-gold rounded-full" style={{ width: `${workoutGoal ? Math.min(weekCount / workoutGoal, 1) * 100 : 0}%`, transition: 'width 0.6s ease' }} />
            </div>
          </div>
          {/* Volume stat */}
          <div className="p-6">
            <div className="flex items-baseline justify-between mb-2.5">
              <span className="micro text-muted">Volume</span>
              <span className={`t-xs font-mono font-medium ${volumeGoal && weekVolumeLbs >= volumeGoal ? 'gold' : 'text-muted'}`}>
                {volumeGoal ? Math.round(Math.min(weekVolumeLbs / volumeGoal, 1) * 100) : 0}%
              </span>
            </div>
            <div className="flex items-baseline gap-1.5 mb-3">
              <span className="font-display font-semibold text-[38px] tnum leading-none">{fmtNum(weekVolumeLbs)}</span>
              <span className="t-sm text-muted font-mono">/ {volumeGoal ? fmtNum(volumeGoal) : '—'} lbs</span>
            </div>
            <div className="h-[5px] bg-bg rounded-full overflow-hidden">
              <div className="h-full bg-gold rounded-full" style={{ width: `${volumeGoal ? Math.min(weekVolumeLbs / volumeGoal, 1) * 100 : 0}%`, transition: 'width 0.6s ease' }} />
            </div>
            {(weekDelta.volumePct != null || weekDelta.stepsPct != null) && (
              <div className="flex gap-3 mt-2.5 flex-wrap">
                {weekDelta.volumePct != null && (
                  <span className="t-xs font-mono font-semibold tnum" style={{ color: weekDelta.volumePct >= 0 ? '#34d399' : '#f87171' }}>
                    {weekDelta.volumePct >= 0 ? '↑' : '↓'} {Math.abs(weekDelta.volumePct)}% vol vs last wk
                  </span>
                )}
                {weekDelta.stepsPct != null && (
                  <span className="t-xs font-mono font-semibold tnum" style={{ color: weekDelta.stepsPct >= 0 ? '#34d399' : '#f87171' }}>
                    {weekDelta.stepsPct >= 0 ? '↑' : '↓'} {Math.abs(weekDelta.stepsPct)}% steps vs last wk
                  </span>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Day bars */}
        <div className="p-6 flex flex-col gap-4" onMouseLeave={() => setHoveredDay(null)}>
          <span className="micro text-muted">Activity by day</span>
          <div className="flex items-end gap-3 h-[140px]">
            {weekDayBars.map((d, i) => {
              const h = (d.barPct / maxPct) * 100;
              const isHovered = hoveredDay === d.dateStr;
              return (
                <div
                  key={i}
                  className="flex-1 flex flex-col items-center gap-2 h-full cursor-default"
                  onMouseEnter={() => setHoveredDay(d.dateStr)}
                >
                  <div className="flex-1 flex flex-col justify-end w-full relative">
                    {d.isToday && (
                      <div className="absolute -top-5 left-0 right-0 text-center">
                        <span className="t-xs gold font-mono">today</span>
                      </div>
                    )}
                    {d.barPct > 0 ? (
                      <div
                        className="w-full rounded-t-sm transition-opacity"
                        style={{ height: `${Math.max(h, 3)}%`, minHeight: 3, backgroundColor: GOLD, opacity: isHovered ? 1 : 0.75 }}
                      />
                    ) : (
                      <div className="w-full h-[2px] rounded-full" style={{ background: 'rgb(var(--color-border))' }} />
                    )}
                  </div>
                  <div className="text-center">
                    <div className={`t-xs font-mono ${d.isToday ? 'gold font-semibold' : isHovered ? 'text-white' : 'text-muted'}`}>{d.label}</div>
                    <div className={`font-mono tnum ${d.vol || d.nonStrength ? '' : 'text-muted'}`} style={{ fontSize: 13 }}>
                      {d.nonStrength
                        ? d.totalSteps > 0 ? fmtNum(d.totalSteps)
                          : d.totalDistMi > 0 ? `${d.totalDistMi.toFixed(1)}mi`
                          : d.totalDurMin > 0 ? `${Math.round(d.totalDurMin)}m`
                          : '—'
                        : d.vol ? fmtNum(d.vol) : '—'
                      }
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
          {/* Tooltip detail below bars */}
          <div className="min-h-[48px]">
            {hoveredBar && hoveredBar.dayWorkouts.length > 0 ? (
              <div className="space-y-2">
                {hoveredBar.dayWorkouts.map((w) => (
                  <div key={w.id}>
                    <div className="t-xs text-white font-medium mb-1">{w.routineName ?? w.name ?? 'Workout'}</div>
                    <div className="space-y-0.5">
                      {w.exercises.map((ex, ei) => {
                        const rt = w.routineType;
                        let detail = '';
                        if (rt === 'steps') {
                          detail = ex.totalSteps ? `${fmtNum(ex.totalSteps)} steps` : '';
                          if (ex.totalDurationSeconds) detail += detail ? ` · ${Math.round(ex.totalDurationSeconds / 60)}m` : `${Math.round(ex.totalDurationSeconds / 60)}m`;
                        } else if (rt === 'cardio_distance') {
                          detail = ex.totalDistanceMeters ? `${(ex.totalDistanceMeters / 1609.34).toFixed(1)} mi` : '';
                          if (ex.totalDurationSeconds) detail += detail ? ` · ${Math.round(ex.totalDurationSeconds / 60)}m` : `${Math.round(ex.totalDurationSeconds / 60)}m`;
                        } else if (rt === 'cardio_duration' || rt === 'duration') {
                          detail = ex.totalDurationSeconds ? `${Math.round(ex.totalDurationSeconds / 60)}m` : '';
                        } else {
                          const sets = ex.setCount;
                          const reps = ex.avgReps != null ? `${Math.round(ex.avgReps)} reps` : '';
                          const wt = ex.maxWeightKg != null ? `${fmtNum(ex.maxWeightKg * KG_TO_LBS)} lbs` : '';
                          detail = [sets ? `${sets}×` : '', reps, wt].filter(Boolean).join(' ');
                        }
                        return (
                          <div key={ei} className="font-mono text-muted" style={{ fontSize: 13 }}>
                            {ex.name}{detail ? <span className="text-white"> — {detail}</span> : ''}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <span className="t-xs text-muted">Hover a bar to see details</span>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

// ── BodyCompositionCard ────────────────────────────────────────────────────────

function BodyCompositionCardV3({ measurements, onMeasurementLogged }: { measurements: BodyMeasurement[]; onMeasurementLogged?: () => void }) {
  const today = localDateStr();
  const thirtyDaysAgo = (() => {
    const d = new Date(today + 'T12:00:00');
    d.setDate(d.getDate() - 30);
    return localDateStr(d);
  })();
  const [logMetric, setLogMetric] = useState<string | null>(null);
  const [logValue, setLogValue] = useState('');
  const [logSaving, setLogSaving] = useState(false);

  async function saveLog() {
    if (!logMetric || !logValue) return;
    const cfg = METRIC_CONFIG[logMetric];
    if (!cfg) return;
    setLogSaving(true);
    try {
      await measurementsApi.add({ metric: logMetric, value: Number(logValue), unit: cfg.unit });
      setLogMetric(null);
      setLogValue('');
      onMeasurementLogged?.();
    } catch { /* ignore */ } finally { setLogSaving(false); }
  }

  return (
    <section className="card overflow-hidden">
      <V3CardHeader
        label="Body Composition"
        meta="latest readings"
        action={
          <div className="flex gap-1">
            {(['waist', 'bicep'] as const).map((m) => (
              <button
                key={m}
                onClick={() => { setLogMetric(m === logMetric ? null : m); setLogValue(''); }}
                title={`Log ${METRIC_CONFIG[m]?.label}`}
                className="flex items-center gap-1 border border-bd hover:border-gold px-2 py-1 rounded transition-colors text-muted hover:gold"
                style={{ color: logMetric === m ? 'rgb(var(--color-accent))' : undefined, borderColor: logMetric === m ? 'rgb(var(--color-accent))' : undefined }}
              >
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M8.5 1.5l2 2L4 10H2v-2L8.5 1.5z"/>
                </svg>
                <span className="t-xs font-mono">{METRIC_CONFIG[m]?.label}</span>
              </button>
            ))}
          </div>
        }
      />
      {/* Quick-log inline */}
      {logMetric && (
        <div className="px-6 py-3 border-b border-bd bg-bg/40 flex items-center gap-3">
          <span className="t-sm text-muted">{METRIC_CONFIG[logMetric]?.label}</span>
          <input
            autoFocus
            type="number"
            step="0.1"
            value={logValue}
            onChange={(e) => setLogValue(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') saveLog(); if (e.key === 'Escape') setLogMetric(null); }}
            placeholder={`value in ${METRIC_CONFIG[logMetric]?.unit}`}
            className="flex-1 bg-bg border border-bd rounded px-3 py-1.5 t-sm font-mono text-white outline-none focus:border-gold"
          />
          <button onClick={saveLog} disabled={logSaving || !logValue} className="bg-gold text-slate-900 font-semibold px-3 py-1.5 rounded t-xs disabled:opacity-50">
            {logSaving ? 'Saving…' : 'Save'}
          </button>
          <button onClick={() => setLogMetric(null)} className="t-xs text-muted hover:gold">Cancel</button>
        </div>
      )}
      <div className="flex justify-center divide-x divide-bd">
        {BODY_COMP_METRICS.map((key) => {
          const cfg = METRIC_CONFIG[key];
          const forMetric = measurements
            .filter((m) => m.metric === key)
            .sort((a, b) => b.measuredAt.localeCompare(a.measuredAt));
          const latest = forMetric[0];
          const monthAgo = forMetric.find((m) => m.measuredAt <= thirtyDaysAgo);

          const metricKey = key as string;
          const displayVal = latest
            ? (metricKey === 'weight' && latest.unit === 'kg'
              ? (latest.value * KG_TO_LBS).toFixed(1)
              : String(latest.value))
            : null;

          let deltaText: string | null = null;
          let deltaColor = 'rgb(var(--color-muted))';
          if (latest && monthAgo && monthAgo.id !== latest.id) {
            const latestNum = metricKey === 'weight' && latest.unit === 'kg' ? latest.value * KG_TO_LBS : latest.value;
            const prevNum = metricKey === 'weight' && monthAgo.unit === 'kg' ? monthAgo.value * KG_TO_LBS : monthAgo.value;
            const delta = latestNum - prevNum;
            const dir = cfg.defaultGoalDir === 'up' ? (delta >= 0 ? 'good' : 'bad') : (delta <= 0 ? 'good' : 'bad');
            const sign = delta > 0 ? '↑' : delta < 0 ? '↓' : '→';
            deltaText = `${sign} ${Math.abs(Math.round(delta * 10) / 10)}${cfg.unit} this month`;
            deltaColor = dir === 'good' ? '#86AA80' : prevNum > 0 && Math.abs(delta / prevNum) > 0.05 ? '#C5896E' : '#D4A843';
          }

          return (
            <div key={key} className="p-6 flex-1">
              <div className="flex items-center gap-2 mb-1">
                <div className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: cfg.color }} />
                <span className="micro text-muted">{cfg.label}</span>
              </div>
              {displayVal != null ? (
                <>
                  <div className="flex items-baseline gap-1.5 mt-2">
                    <span className="font-display font-semibold text-[36px] tnum leading-none">{displayVal}</span>
                    {cfg.unit && <span className="t-base text-muted font-mono">{cfg.unit}</span>}
                  </div>
                  {deltaText && <div className="t-sm mt-1.5" style={{ color: deltaColor }}>{deltaText}</div>}
                </>
              ) : (
                <div className="mt-2">
                  <span className="font-display font-semibold text-[36px] text-muted/30">—</span>
                  <div className="mt-1">
                    <button onClick={() => { setLogMetric(key); setLogValue(''); }} className="t-xs gold font-medium">
                      Log it →
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}

// ── CaloriesVsTDEE (SVG) ───────────────────────────────────────────────────────

function CaloriesVsTDEECard({
  foodLogHistory,
  workouts,
  todayTDEE,
  range,
}: {
  foodLogHistory: FoodLogHistoryDay[];
  workouts: WorkoutSummary[];
  todayTDEE: TDEEBreakdown | null;
  caloriesGoal?: number | null;
  range?: '30d' | '90d' | '1yr' | 'all';
}) {
  const now = new Date();
  const numDays = range === '90d' ? 90 : range === '1yr' ? 365 : range === 'all' ? 365 : 30;
  const days30 = Array.from({ length: numDays }, (_, i) => {
    const d = new Date(now); d.setDate(d.getDate() - (numDays - 1 - i)); return localDateStr(d);
  });
  const foodByDate = Object.fromEntries(foodLogHistory.map((d) => [d.date, d]));
  const exerciseByDate: Record<string, number> = {};
  for (const w of workouts) { if (w.caloriesBurned) exerciseByDate[w.workoutDate] = (exerciseByDate[w.workoutDate] ?? 0) + w.caloriesBurned; }
  const baseline = todayTDEE ? todayTDEE.bmr + todayTDEE.neat : null;

  const points = days30.map((date) => {
    const food = foodByDate[date];
    const cal = food?.calories ?? 0;
    const tdee = baseline != null ? baseline + Math.round(cal * 0.1) + (exerciseByDate[date] ?? 0) : null;
    return { date, cal, tdee };
  });

  const W = 460, H = 160;
  const padT = 8, padB = 28, padL = 4, padR = 20;
  const cW = W - padL - padR;
  const cH = H - padT - padB;

  const allVals = points.flatMap((p) => [p.cal, p.tdee ?? 0]).filter(Boolean);
  const yMax = allVals.length ? Math.max(...allVals) * 1.1 : 3000;
  const toX = (i: number) => padL + (i / (points.length - 1)) * cW;
  const toY = (v: number) => padT + cH - (v / yMax) * cH;

  const calPath = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${toX(i).toFixed(1)},${toY(p.cal).toFixed(1)}`).join(' ');
  const calFill = calPath + ` L${toX(points.length - 1).toFixed(1)},${(padT + cH).toFixed(1)} L${toX(0).toFixed(1)},${(padT + cH).toFixed(1)} Z`;

  const tdeeSegs: string[] = [];
  let seg = '';
  points.forEach((p, i) => {
    if (p.tdee != null) {
      seg += (seg === '' ? 'M' : 'L') + `${toX(i).toFixed(1)},${toY(p.tdee).toFixed(1)} `;
    } else if (seg) { tdeeSegs.push(seg.trim()); seg = ''; }
  });
  if (seg) tdeeSegs.push(seg.trim());

  const xLabelIdxs = [0, Math.floor(points.length / 3), Math.floor(2 * points.length / 3), points.length - 1];

  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  function handleMouseMove(e: React.MouseEvent<SVGSVGElement>) {
    const svg = svgRef.current;
    if (!svg || points.length < 2) return;
    const rect = svg.getBoundingClientRect();
    const xRatio = (e.clientX - rect.left) / rect.width;
    const svgX = xRatio * W;
    const idx = Math.round((svgX - padL) / cW * (points.length - 1));
    setHoverIdx(Math.max(0, Math.min(points.length - 1, idx)));
  }

  const hoverPt = hoverIdx != null ? points[hoverIdx] : null;
  const fmtNum = (n: number) => new Intl.NumberFormat('en-US').format(Math.round(n));

  return (
    <section className="card overflow-hidden">
      <V3CardHeader label="Calories vs TDEE" meta={`last ${numDays}d`} />
      <div className="px-6 pb-2 flex items-center gap-4 pt-3">
        <span className="flex items-center gap-1.5 t-xs text-muted">
          <svg width="16" height="8"><line x1="0" y1="4" x2="16" y2="4" stroke="rgb(var(--color-accent))" strokeWidth="2" strokeLinecap="round"/></svg>
          Intake
        </span>
        {baseline != null && (
          <span className="flex items-center gap-1.5 t-xs text-muted">
            <svg width="16" height="8"><line x1="0" y1="4" x2="16" y2="4" stroke="rgb(var(--color-muted))" strokeWidth="1.5" strokeDasharray="4 3"/></svg>
            TDEE
          </span>
        )}
        {hoverPt && (
          <span className="ml-auto t-xs font-mono text-muted">
            {new Date(hoverPt.date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
            {' · '}<span style={{ color: 'rgb(var(--color-accent))' }}>{fmtNum(hoverPt.cal)} kcal</span>
            {hoverPt.tdee != null && <> · TDEE {fmtNum(hoverPt.tdee)}</>}
          </span>
        )}
      </div>
      <div className="px-6 pb-6">
        <svg
          ref={svgRef}
          viewBox={`0 0 ${W} ${H}`}
          className="w-full"
          style={{ height: 180 }}
          preserveAspectRatio="none"
          onMouseMove={handleMouseMove}
          onMouseLeave={() => setHoverIdx(null)}
        >
          <defs>
            <linearGradient id="v3calGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="rgb(var(--color-accent))" stopOpacity="0.35" />
              <stop offset="100%" stopColor="rgb(var(--color-accent))" stopOpacity="0" />
            </linearGradient>
          </defs>
          <path d={calFill} fill="url(#v3calGrad)" />
          <path d={calPath} fill="none" stroke="rgb(var(--color-accent))" strokeWidth="1.8" strokeLinecap="round" />
          {tdeeSegs.map((d, i) => (
            <path key={i} d={d} fill="none" stroke="rgb(var(--color-muted))" strokeWidth="1.4" strokeDasharray="5 4" />
          ))}
          {/* Hover crosshair */}
          {hoverIdx != null && hoverPt && (
            <>
              <line x1={toX(hoverIdx)} y1={padT} x2={toX(hoverIdx)} y2={padT + cH} stroke="rgba(255,255,255,0.15)" strokeWidth="1" />
              <circle cx={toX(hoverIdx)} cy={toY(hoverPt.cal)} r="3.5" fill="rgb(var(--color-accent))" />
              {hoverPt.tdee != null && (
                <circle cx={toX(hoverIdx)} cy={toY(hoverPt.tdee)} r="3" fill="rgb(var(--color-muted))" />
              )}
            </>
          )}
          {xLabelIdxs.map((i) => i < points.length && (
            <text key={i} x={toX(i)} y={H - 4} textAnchor={i === points.length - 1 ? 'end' : i === 0 ? 'start' : 'middle'} fontSize="12" fill="rgb(var(--color-muted))">
              {new Date(points[i].date + 'T12:00:00').toLocaleDateString('en-US', { month: 'numeric', day: 'numeric' })}
            </text>
          ))}
          {hoverIdx == null && points.length > 0 && (
            <circle cx={toX(points.length - 1)} cy={toY(points[points.length - 1].cal)} r="3" fill="rgb(var(--color-accent))" />
          )}
        </svg>
      </div>
    </section>
  );
}

// ── WeightTrendCard (SVG) ──────────────────────────────────────────────────────

function WeightTrendCard({
  measurements,
  measurementGoals,
  range,
}: {
  measurements: BodyMeasurement[];
  measurementGoals: Record<string, MeasurementGoal>;
  range: '30d' | '90d' | '1yr' | 'all';
}) {
  const weightMeasurements = measurements
    .filter((m) => m.metric === 'weight')
    .sort((a, b) => a.measuredAt.localeCompare(b.measuredAt));

  const now = new Date();
  const cutoff = (() => {
    if (range === '30d') { const d = new Date(now); d.setDate(d.getDate() - 30); return localDateStr(d); }
    if (range === '90d') { const d = new Date(now); d.setDate(d.getDate() - 90); return localDateStr(d); }
    if (range === '1yr') { const d = new Date(now); d.setFullYear(d.getFullYear() - 1); return localDateStr(d); }
    return null;
  })();

  const filtered = cutoff ? weightMeasurements.filter((m) => m.measuredAt >= cutoff) : weightMeasurements;
  const data = filtered.map((m) => ({
    date: m.measuredAt,
    weight: m.unit === 'kg' ? Math.round(m.value * KG_TO_LBS * 10) / 10 : m.value,
  }));

  const weightGoalRaw = measurementGoals['weight'];
  const weightGoalLbs = weightGoalRaw
    ? (weightGoalRaw.unit === 'kg' ? weightGoalRaw.targetValue * KG_TO_LBS : weightGoalRaw.targetValue)
    : null;

  const vals = data.map((d) => d.weight);
  const allVals = [...vals, ...(weightGoalLbs != null ? [weightGoalLbs] : [])];
  const yMinW = allVals.length ? Math.min(...allVals) * 0.98 : 0;
  const yMaxW = allVals.length ? Math.max(...allVals) * 1.02 : 1;
  const current = data[data.length - 1]?.weight ?? null;
  const delta = data.length >= 2 ? Math.round((data[data.length - 1].weight - data[0].weight) * 10) / 10 : null;

  const W = 460, H = 160;
  const padT = 8, padB = 28, padL = 4, padR = 20;
  const cW = W - padL - padR, cH = H - padT - padB;
  const toX = (i: number) => padL + (i / Math.max(data.length - 1, 1)) * cW;
  const toY = (v: number) => padT + cH - ((v - yMinW) / Math.max(yMaxW - yMinW, 0.001)) * cH;

  const wPath = data.map((p, i) => `${i === 0 ? 'M' : 'L'}${toX(i).toFixed(1)},${toY(p.weight).toFixed(1)}`).join(' ');
  const wFill = data.length > 1 ? wPath + ` L${toX(data.length-1).toFixed(1)},${(padT+cH).toFixed(1)} L${toX(0).toFixed(1)},${(padT+cH).toFixed(1)} Z` : '';
  const xLabelIdxs = data.length <= 4
    ? data.map((_, i) => i)
    : [0, Math.floor(data.length / 3), Math.floor(2 * data.length / 3), data.length - 1];

  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const svgRef2 = useRef<SVGSVGElement>(null);

  function handleMouseMoveW(e: React.MouseEvent<SVGSVGElement>) {
    const svg = svgRef2.current;
    if (!svg || data.length < 2) return;
    const rect = svg.getBoundingClientRect();
    const xRatio = (e.clientX - rect.left) / rect.width;
    const idx = Math.round(xRatio * (data.length - 1));
    setHoverIdx(Math.max(0, Math.min(data.length - 1, idx)));
  }

  return (
    <section className="card overflow-hidden">
      <V3CardHeader label="Weight" meta={range} />
      {data.length < 2 ? (
        <div className="p-6 t-xs text-muted text-center py-10">Not enough weight data</div>
      ) : (
        <>
          <div className="px-6 pb-2 flex items-center gap-4 pt-3">
            <span className="flex items-center gap-1.5 t-xs text-muted">
              <svg width="16" height="8"><line x1="0" y1="4" x2="16" y2="4" stroke="rgb(var(--color-accent))" strokeWidth="2" strokeLinecap="round"/></svg>
              Weight
            </span>
            {weightGoalLbs != null && (
              <span className="flex items-center gap-1.5 t-xs text-muted">
                <svg width="16" height="8"><line x1="0" y1="4" x2="16" y2="4" stroke="rgb(var(--color-accent))" strokeOpacity="0.5" strokeWidth="1.5" strokeDasharray="4 3"/></svg>
                Goal
              </span>
            )}
            {hoverIdx != null ? (
              <span className="ml-auto t-xs font-mono text-muted">
                {new Date(data[hoverIdx].date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                {' · '}<span style={{ color: 'rgb(var(--color-accent))' }}>{data[hoverIdx].weight} lbs</span>
                {weightGoalLbs != null && <> · goal {Math.round(weightGoalLbs * 10) / 10}</>}
              </span>
            ) : (
              <span className="ml-auto t-xs font-mono text-muted flex gap-3">
                {current != null && <span>Current <span className="text-white font-semibold">{current} lbs</span></span>}
                {delta != null && <span style={{ color: delta <= 0 ? '#86AA80' : '#C5896E' }}>{delta > 0 ? '+' : ''}{delta} lbs</span>}
              </span>
            )}
          </div>
          <div className="px-6 pb-6">
            <svg
              ref={svgRef2}
              viewBox={`0 0 ${W} ${H}`}
              className="w-full"
              style={{ height: 160 }}
              preserveAspectRatio="none"
              onMouseMove={handleMouseMoveW}
              onMouseLeave={() => setHoverIdx(null)}
            >
              <defs>
                <linearGradient id="v3wGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="rgb(var(--color-accent))" stopOpacity="0.25" />
                  <stop offset="100%" stopColor="rgb(var(--color-accent))" stopOpacity="0" />
                </linearGradient>
              </defs>
              {wFill && <path d={wFill} fill="url(#v3wGrad)" />}
              {weightGoalLbs != null && (
                <line x1={0} y1={toY(weightGoalLbs)} x2={W} y2={toY(weightGoalLbs)}
                  stroke="rgb(var(--color-accent))" strokeOpacity="0.4" strokeWidth="1.2" strokeDasharray="4 3" />
              )}
              <path d={wPath} fill="none" stroke="rgb(var(--color-accent))" strokeWidth="1.8" strokeLinecap="round" />
              {hoverIdx != null && (
                <>
                  <line x1={toX(hoverIdx)} y1={padT} x2={toX(hoverIdx)} y2={padT + cH} stroke="rgba(255,255,255,0.15)" strokeWidth="1" />
                  <circle cx={toX(hoverIdx)} cy={toY(data[hoverIdx].weight)} r="3.5" fill="rgb(var(--color-accent))" />
                </>
              )}
              {hoverIdx == null && data.length > 0 && (
                <circle cx={toX(data.length-1)} cy={toY(data[data.length-1].weight)} r="3" fill="rgb(var(--color-accent))" />
              )}
              {xLabelIdxs.map((i) => i < data.length && (
                <text key={i} x={toX(i)} y={H - 4} textAnchor={i === data.length - 1 ? 'end' : i === 0 ? 'start' : 'middle'} fontSize="12" fill="rgb(var(--color-muted))">
                  {new Date(data[i].date + 'T12:00:00').toLocaleDateString('en-US', { month: 'numeric', day: 'numeric' })}
                </text>
              ))}
            </svg>
          </div>
        </>
      )}
    </section>
  );
}

// ── ProteinTrendCard (SVG) ─────────────────────────────────────────────────────

function ProteinTrendCard({
  foodLogHistory,
  proteinGoal,
  range,
}: {
  foodLogHistory: FoodLogHistoryDay[];
  proteinGoal: number | null;
  range: '30d' | '90d' | '1yr' | 'all';
}) {
  const now = new Date();
  const numDays = range === '30d' ? 30 : range === '90d' ? 90 : range === '1yr' ? 365 : 365;
  const days30 = Array.from({ length: numDays }, (_, i) => {
    const d = new Date(now); d.setDate(d.getDate() - (numDays - 1 - i)); return localDateStr(d);
  });
  const foodByDate = Object.fromEntries(foodLogHistory.map((d) => [d.date, d]));
  const data = days30.map((date) => ({ date, protein: foodByDate[date]?.protein ?? null }));

  const vals = data.map((d) => d.protein).filter((v): v is number => v != null);
  const avg = vals.length ? Math.round(vals.reduce((s, v) => s + v, 0) / vals.length) : null;
  const last = data.filter((d) => d.protein != null).at(-1)?.protein ?? null;
  const delta = vals.length >= 2 ? Math.round(vals[vals.length - 1] - vals[0]) : null;

  const W = 460, H = 160;
  const padT = 8, padB = 28, padL = 4, padR = 20;
  const cW = W - padL - padR, cH = H - padT - padB;
  const yMax = vals.length ? Math.max(...vals, proteinGoal ?? 0) * 1.15 : 200;
  const toX = (i: number) => padL + (i / (data.length - 1)) * cW;
  const toY = (v: number) => padT + cH - (v / Math.max(yMax, 1)) * cH;

  const segs: string[] = [];
  let currentSeg = '';
  data.forEach((p, i) => {
    if (p.protein != null) {
      currentSeg += (currentSeg === '' ? 'M' : 'L') + `${toX(i).toFixed(1)},${toY(p.protein).toFixed(1)} `;
    } else if (currentSeg) { segs.push(currentSeg.trim()); currentSeg = ''; }
  });
  if (currentSeg) segs.push(currentSeg.trim());

  const pxLabelIdxs = data.length <= 30
    ? [0, 7, 14, 21, data.length - 1]
    : [0, Math.floor(data.length / 4), Math.floor(data.length / 2), Math.floor(3 * data.length / 4), data.length - 1];

  const [hoverIdxP, setHoverIdxP] = useState<number | null>(null);
  const svgRefP = useRef<SVGSVGElement>(null);

  function handleMouseMoveP(e: React.MouseEvent<SVGSVGElement>) {
    const svg = svgRefP.current;
    if (!svg || data.length < 2) return;
    const rect = svg.getBoundingClientRect();
    const xRatio = (e.clientX - rect.left) / rect.width;
    const idx = Math.round(xRatio * (data.length - 1));
    setHoverIdxP(Math.max(0, Math.min(data.length - 1, idx)));
  }

  return (
    <section className="card overflow-hidden">
      <V3CardHeader label="Protein" meta={`last ${numDays}d`} />
      {vals.length < 2 ? (
        <div className="p-6 t-xs text-muted text-center py-10">Not enough protein data</div>
      ) : (
        <>
          <div className="px-6 pb-2 flex items-center gap-4 pt-3">
            <span className="flex items-center gap-1.5 t-xs text-muted">
              <svg width="16" height="8"><line x1="0" y1="4" x2="16" y2="4" stroke="#7C9ECB" strokeWidth="2" strokeLinecap="round"/></svg>
              Protein
            </span>
            {proteinGoal != null && (
              <span className="flex items-center gap-1.5 t-xs text-muted">
                <svg width="16" height="8"><line x1="0" y1="4" x2="16" y2="4" stroke="rgb(var(--color-accent))" strokeOpacity="0.6" strokeWidth="1.5" strokeDasharray="4 3"/></svg>
                Goal
              </span>
            )}
            {hoverIdxP != null && data[hoverIdxP]?.protein != null ? (
              <span className="ml-auto t-xs font-mono text-muted">
                {new Date(data[hoverIdxP].date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                {' · '}<span style={{ color: '#7C9ECB' }}>{Math.round(data[hoverIdxP].protein!)}g protein</span>
                {proteinGoal != null && <> · goal {proteinGoal}g</>}
              </span>
            ) : (
              <span className="ml-auto t-xs font-mono text-muted flex gap-3">
                {last != null && <span>Current <span style={{ color: '#7C9ECB' }} className="font-semibold">{last}g</span></span>}
                {avg != null && <span>{numDays}d avg <span className="text-muted">{avg}g</span></span>}
                {delta != null && <span style={{ color: delta >= 0 ? '#86AA80' : '#C5896E' }}>{delta >= 0 ? '+' : ''}{delta}g</span>}
              </span>
            )}
          </div>
          <div className="px-6 pb-6">
            <svg
              ref={svgRefP}
              viewBox={`0 0 ${W} ${H}`}
              className="w-full"
              style={{ height: 160 }}
              preserveAspectRatio="none"
              onMouseMove={handleMouseMoveP}
              onMouseLeave={() => setHoverIdxP(null)}
            >
              {proteinGoal != null && (
                <line x1={0} y1={toY(proteinGoal)} x2={W} y2={toY(proteinGoal)}
                  stroke="rgb(var(--color-accent))" strokeOpacity="0.5" strokeWidth="1.2" strokeDasharray="4 3" />
              )}
              {segs.map((d, i) => (
                <path key={i} d={d} fill="none" stroke="#7C9ECB" strokeWidth="1.8" strokeLinecap="round" />
              ))}
              {hoverIdxP != null && data[hoverIdxP]?.protein != null && (
                <>
                  <line x1={toX(hoverIdxP)} y1={padT} x2={toX(hoverIdxP)} y2={padT + cH} stroke="rgba(255,255,255,0.15)" strokeWidth="1" />
                  <circle cx={toX(hoverIdxP)} cy={toY(data[hoverIdxP].protein!)} r="3.5" fill="#7C9ECB" />
                </>
              )}
              {hoverIdxP == null && last != null && (
                <circle cx={toX(data.length - 1)} cy={toY(last)} r="3" fill="#7C9ECB" />
              )}
              {pxLabelIdxs.map((i) => i < data.length && (
                <text key={i} x={toX(i)} y={H - 4} textAnchor={i === data.length - 1 ? 'end' : i === 0 ? 'start' : 'middle'} fontSize="12" fill="rgb(var(--color-muted))">
                  {new Date(data[i].date + 'T12:00:00').toLocaleDateString('en-US', { month: 'numeric', day: 'numeric' })}
                </text>
              ))}
            </svg>
          </div>
        </>
      )}
    </section>
  );
}

// ── TrendingSection (owns range state shared across Weight + Protein + Calories) ─

function TrendingSection({
  foodLogHistory, workouts, measurements, measurementGoals, routinesList, todayTDEE, caloriesGoal, proteinGoal,
}: {
  foodLogHistory: FoodLogHistoryDay[];
  workouts: WorkoutSummary[];
  measurements: BodyMeasurement[];
  measurementGoals: Record<string, MeasurementGoal>;
  routinesList: RoutineSummary[];
  todayTDEE: TDEEBreakdown | null;
  caloriesGoal?: number | null;
  proteinGoal: number | null;
}) {
  const [range, setRange] = useState<'30d' | '90d' | '1yr' | 'all'>('30d');
  const ranges = ['30d', '90d', '1yr', 'all'] as const;
  return (
    <div className="pt-4">
      <div className="flex items-end justify-between mb-4">
        <div>
          <div className="flex items-center gap-3 mb-1.5">
            <V3GoldRule />
            <span className="micro text-muted font-semibold tracking-wider">Progress over time</span>
          </div>
          <h2 className="font-display font-semibold text-[22px] tracking-tight text-white">How you're trending</h2>
        </div>
        <div className="flex gap-0.5 items-center">
          {ranges.map((r) => (
            <button
              key={r}
              onClick={() => setRange(r)}
              className="px-2.5 py-1 rounded t-xs font-mono transition-colors"
              style={{
                color: range === r ? '#0f172a' : 'rgb(var(--color-muted))',
                background: range === r ? 'rgb(var(--color-accent))' : 'transparent',
                fontWeight: range === r ? 600 : 400,
              }}
            >
              {r}
            </button>
          ))}
        </div>
      </div>
      <div className="space-y-6">
        <div className="grid grid-cols-2 gap-6">
          <CaloriesVsTDEECard foodLogHistory={foodLogHistory} workouts={workouts} todayTDEE={todayTDEE} caloriesGoal={caloriesGoal} range={range} />
          <VolumeHeatmapCard workouts={workouts} routinesList={routinesList} />
        </div>
        <div className="grid grid-cols-2 gap-6">
          <WeightTrendCard measurements={measurements} measurementGoals={measurementGoals} range={range} />
          <ProteinTrendCard foodLogHistory={foodLogHistory} proteinGoal={proteinGoal} range={range} />
        </div>
        <WeeklyAveragesCard foodLogHistory={foodLogHistory} workouts={workouts} todayTDEE={todayTDEE} />
      </div>
    </div>
  );
}

// ── VolumeHeatmapCard ──────────────────────────────────────────────────────────

function w_routineType(workouts: WorkoutSummary[], rId: number): string {
  return workouts.find((w) => w.routineId === rId)?.routineType ?? 'strength';
}

function VolumeHeatmapCard({ workouts, routinesList }: { workouts: WorkoutSummary[]; routinesList: RoutineSummary[] }) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [tooltip, setTooltip] = useState<{ clientX: number; clientY: number; label: string; val: number; unit: string; week: string } | null>(null);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollLeft = scrollRef.current.scrollWidth;
  }, [workouts]);

  const NUM_WEEKS = 13;
  const today = localDateStr();
  const weekStarts: string[] = [];
  for (let i = NUM_WEEKS - 1; i >= 0; i--) {
    const d = new Date(today + 'T12:00:00');
    d.setDate(d.getDate() - i * 7);
    weekStarts.push(getWeekStart(localDateStr(d)));
  }

  const routineById = Object.fromEntries(routinesList.map((r) => [r.id, r]));
  const routineIds = [...new Set(workouts.filter((w) => w.routineId).map((w) => w.routineId!))]
    .sort((a, b) => (routineById[a]?.name ?? '').localeCompare(routineById[b]?.name ?? ''));

  function getCellValue(rId: number, ws: string): number {
    const rt = routineById[rId]?.routineType ?? w_routineType(workouts, rId);
    const ws_workouts = workouts.filter((w) => w.routineId === rId && getWeekStart(w.workoutDate) === ws);
    switch (rt) {
      case 'steps':           return Math.round(ws_workouts.reduce((s, w) => s + (w.totalSteps ?? 0), 0));
      case 'cardio_distance': return Math.round(ws_workouts.reduce((s, w) => s + (w.totalDistanceMeters ?? 0), 0) / 1609.34 * 10) / 10;
      case 'cardio_duration': return Math.round(ws_workouts.reduce((s, w) => s + (w.totalDurationSeconds ?? 0), 0) / 60);
      default:                return Math.round(ws_workouts.reduce((s, w) => s + (w.totalVolumeKg ?? 0) * KG_TO_LBS, 0));
    }
  }

  function getCellUnit(rId: number): string {
    const rt = routineById[rId]?.routineType ?? w_routineType(workouts, rId);
    switch (rt) {
      case 'steps':           return 'steps';
      case 'cardio_distance': return 'mi';
      case 'cardio_duration': return 'min';
      default:                return 'lbs';
    }
  }

  const grid: Record<string, Record<string, number>> = {};
  const workoutCountGrid: Record<string, Record<string, number>> = {};
  for (const rId of routineIds) {
    grid[rId] = {};
    workoutCountGrid[rId] = {};
    for (const ws of weekStarts) {
      grid[rId][ws] = getCellValue(rId, ws);
      workoutCountGrid[rId][ws] = workouts.filter(
        (w) => w.routineId === rId && getWeekStart(w.workoutDate) === ws
      ).length;
    }
  }

  const allVals = Object.values(grid).flatMap((row) => Object.values(row)).filter((v) => v > 0);
  const maxVol = allVals.length ? Math.max(...allVals) : 1;
  const fmtNum = (n: number) => new Intl.NumberFormat('en-US').format(Math.round(n));

  if (routineIds.length === 0) {
    return (
      <section className="card overflow-hidden">
        <V3CardHeader label="Volume Heatmap" meta="by routine × week" />
        <div className="p-6 t-xs text-muted text-center py-10">No routine workout data yet.</div>
      </section>
    );
  }

  return (
    <section className="card overflow-hidden">
      <V3CardHeader label="Volume Heatmap" meta="by routine × week" />
      <div className="px-6 pb-4">
        <div ref={scrollRef} className="overflow-x-auto">
          <table className="border-collapse w-full">
            <thead>
              <tr>
                <th className="text-left pb-2 pr-4 micro text-muted font-normal whitespace-nowrap">Routine</th>
                {weekStarts.map((ws) => {
                  const d = new Date(ws + 'T12:00:00');
                  return (
                    <th key={ws} className="text-center pb-2 px-0.5 micro text-muted font-normal" style={{ minWidth: 28 }}>
                      {d.toLocaleDateString('en-US', { month: 'numeric', day: 'numeric' })}
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {routineIds.map((rId) => (
                <tr key={rId}>
                  <td className="pr-4 py-1 t-xs text-muted whitespace-nowrap">
                    {routineById[rId]?.name ?? `Routine ${rId}`}
                  </td>
                  {weekStarts.map((ws) => {
                    const val = grid[rId][ws];
                    const wCount = workoutCountGrid[rId][ws];
                    const unit = getCellUnit(rId);
                    const opacity = val > 0 ? 0.12 + (val / maxVol) * 0.88 : (wCount > 0 ? 0.1 : 0);
                    const hasActivity = val > 0 || wCount > 0;
                    return (
                      <td key={ws} className="px-0.5 py-1 text-center">
                        <div
                          onMouseEnter={(e) => {
                            const rect = (e.target as HTMLElement).getBoundingClientRect();
                            setTooltip({
                              clientX: rect.left + rect.width / 2,
                              clientY: rect.top - 8,
                              label: routineById[rId]?.name ?? `Routine ${rId}`,
                              val: wCount > 0 && val === 0 ? -1 : val,
                              unit,
                              week: new Date(ws + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
                            });
                          }}
                          onMouseLeave={() => setTooltip(null)}
                          style={{
                            width: 22, height: 22, borderRadius: 3,
                            background: hasActivity ? `rgba(212,168,67,${opacity})` : 'rgb(var(--color-bg))',
                            border: '1px solid rgb(var(--color-border))',
                            cursor: hasActivity ? 'default' : undefined,
                          }}
                        />
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="flex items-center gap-2 t-xs text-muted mt-3">
          <span>less</span>
          {[0.12, 0.35, 0.55, 0.75, 1].map((o) => (
            <div key={o} style={{ width: 12, height: 12, borderRadius: 2, background: `rgba(212,168,67,${o})` }} />
          ))}
          <span>more</span>
        </div>
      </div>
      {/* Custom tooltip — fixed to viewport so overflow-hidden doesn't clip it */}
      {tooltip && (
        <div
          className="pointer-events-none fixed z-50 px-2.5 py-1.5 rounded-md border border-bd"
          style={{
            background: 'rgb(var(--color-card))',
            left: tooltip.clientX,
            top: tooltip.clientY,
            transform: 'translate(-50%, -100%)',
            whiteSpace: 'nowrap',
          }}
        >
          <div className="t-xs text-muted font-mono">{tooltip.label} · wk of {tooltip.week}</div>
          {tooltip.val > 0 ? (
            <div className="t-sm font-mono font-semibold gold tnum">{fmtNum(tooltip.val)} {tooltip.unit}</div>
          ) : tooltip.val === -1 ? (
            <div className="t-xs text-muted">Workout logged · no {tooltip.unit} data</div>
          ) : (
            <div className="t-xs text-muted">—</div>
          )}
        </div>
      )}
    </section>
  );
}

// ── WeeklyAveragesCard ─────────────────────────────────────────────────────────

function WeeklyAveragesCard({
  foodLogHistory,
  workouts,
  todayTDEE,
}: {
  foodLogHistory: FoodLogHistoryDay[];
  workouts: WorkoutSummary[];
  todayTDEE: TDEEBreakdown | null;
}) {
  const now = new Date();
  const weeks: { weekStart: string; label: string; calories: number; protein: number; carbs: number; fat: number; tdee: number | null; net: number | null; isCurrentWeek: boolean; days: number }[] = [];

  for (let i = 11; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i * 7);
    const ws = getWeekStart(localDateStr(d));
    const weekDate = new Date(ws + 'T12:00:00');
    weeks.push({
      weekStart: ws,
      label: weekDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      calories: 0, protein: 0, carbs: 0, fat: 0, tdee: null, net: null,
      isCurrentWeek: ws === getWeekStart(localDateStr()),
      days: 0,
    });
  }

  const exerciseByDate: Record<string, number> = {};
  for (const w of workouts) {
    if (w.caloriesBurned) exerciseByDate[w.workoutDate] = (exerciseByDate[w.workoutDate] ?? 0) + w.caloriesBurned;
  }
  const baseline = todayTDEE ? todayTDEE.bmr + todayTDEE.neat : null;

  for (const day of foodLogHistory) {
    const ws = getWeekStart(day.date);
    const week = weeks.find((wk) => wk.weekStart === ws);
    if (!week) continue;
    week.calories += day.calories;
    week.protein += day.protein;
    week.carbs += day.entries.reduce((s, e) => s + e.carbsG, 0);
    week.fat += day.entries.reduce((s, e) => s + e.fatG, 0);
    week.days++;
    if (baseline != null) {
      const dayTef = Math.round(day.calories * 0.1);
      const dayEx = exerciseByDate[day.date] ?? 0;
      week.tdee = (week.tdee ?? 0) + baseline + dayTef + dayEx;
    }
  }

  for (const week of weeks) {
    if (week.days > 0) {
      week.calories = Math.round(week.calories / week.days);
      week.protein = Math.round(week.protein / week.days);
      week.carbs = Math.round(week.carbs / week.days);
      week.fat = Math.round(week.fat / week.days);
      if (week.tdee != null) {
        week.tdee = Math.round(week.tdee / week.days);
        week.net = week.calories - week.tdee;
      }
    }
  }

  const displayWeeks = [...weeks].reverse().filter((w) => w.days > 0 || w.isCurrentWeek);
  const fmtNum = (n: number) => new Intl.NumberFormat('en-US').format(Math.round(n));

  return (
    <section className="card overflow-hidden">
      <V3CardHeader label="Weekly Averages" meta="per-day avg" />
      <div className="overflow-x-auto px-6 pb-5">
        <table className="w-full border-collapse">
          <thead>
            <tr className="border-b border-bd">
              <th className="text-left py-3 pr-4 micro text-muted font-normal whitespace-nowrap">Week of</th>
              <th className="text-right py-3 px-3 micro text-muted font-normal">Calories</th>
              <th className="text-right py-3 px-3 micro text-muted font-normal">Protein (g)</th>
              <th className="text-right py-3 px-3 micro text-muted font-normal">Carbs (g)</th>
              <th className="text-right py-3 px-3 micro text-muted font-normal">Fat (g)</th>
              {todayTDEE && <th className="text-right py-3 px-3 micro text-muted font-normal">TDEE</th>}
              {todayTDEE && <th className="text-right py-3 pl-3 micro text-muted font-normal">Net</th>}
            </tr>
          </thead>
          <tbody>
            {displayWeeks.map((week) => (
              <tr
                key={week.weekStart}
                className="border-b border-bd/40 last:border-0"
                style={{ background: week.isCurrentWeek ? 'rgba(212,168,67,0.04)' : undefined }}
              >
                <td className="py-3 pr-4 whitespace-nowrap">
                  <span className="t-sm font-medium">{week.label}</span>
                  {week.isCurrentWeek && <span className="ml-2 micro gold font-semibold">current</span>}
                </td>
                <td className="py-3 px-3 text-right font-mono tnum t-sm font-medium">{week.days > 0 ? fmtNum(week.calories) : <span className="text-muted">—</span>}</td>
                <td className="py-3 px-3 text-right font-mono tnum t-sm" style={{ color: '#D4A843' }}>{week.days > 0 ? week.protein : <span className="text-muted">—</span>}</td>
                <td className="py-3 px-3 text-right font-mono tnum t-sm" style={{ color: '#7C9ECB' }}>{week.days > 0 ? week.carbs : <span className="text-muted">—</span>}</td>
                <td className="py-3 px-3 text-right font-mono tnum t-sm" style={{ color: '#C5896E' }}>{week.days > 0 ? week.fat : <span className="text-muted">—</span>}</td>
                {todayTDEE && <td className="py-3 px-3 text-right font-mono tnum t-sm text-muted">{week.tdee != null && week.days > 0 ? fmtNum(week.tdee) : '—'}</td>}
                {todayTDEE && (
                  <td className="py-3 pl-3 text-right font-mono tnum t-sm font-semibold">
                    {week.net != null && week.days > 0 ? (
                      <span style={{ color: week.net < 0 ? '#86AA80' : week.net > 300 ? '#C5896E' : 'rgb(var(--color-muted))' }}>
                        {week.net > 0 ? '+' : ''}{fmtNum(week.net)}
                      </span>
                    ) : <span className="text-muted">—</span>}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

// ── NorthStarCard ──────────────────────────────────────────────────────────────

function V3Sparkline({ values, dates, unit }: { values: number[]; dates?: string[]; unit?: string }) {
  const w = 240, h = 30;
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  if (values.length < 2) return null;
  const min = Math.min(...values), max = Math.max(...values);
  const range = max - min || 1;
  const pts = values.map((v, i) => [(i / (values.length - 1)) * w, h - ((v - min) / range) * h] as [number, number]);
  const d = pts.map((p, i) => (i === 0 ? `M${p[0]},${p[1]}` : `L${p[0]},${p[1]}`)).join(' ');
  const fillD = d + ` L${w},${h} L0,${h} Z`;
  const gradId = `nsgrad${Math.round(min)}x${Math.round(max)}`;

  function handleMouseMove(e: React.MouseEvent<SVGSVGElement>) {
    if (!svgRef.current) return;
    const rect = svgRef.current.getBoundingClientRect();
    const xRatio = (e.clientX - rect.left) / rect.width;
    const idx = Math.round(xRatio * (values.length - 1));
    setHoverIdx(Math.max(0, Math.min(values.length - 1, idx)));
  }

  const hp = hoverIdx != null ? pts[hoverIdx] : null;
  const hDate = hoverIdx != null && dates ? new Date(dates[hoverIdx] + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : null;
  const hVal = hoverIdx != null ? values[hoverIdx].toFixed(1) : null;

  return (
    <div className="relative">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${w} ${h}`}
        className="w-full h-7"
        preserveAspectRatio="none"
        onMouseMove={handleMouseMove}
        onMouseLeave={() => setHoverIdx(null)}
        style={{ cursor: 'crosshair' }}
      >
        <defs>
          <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="rgb(var(--color-accent))" stopOpacity="0.25" />
            <stop offset="100%" stopColor="rgb(var(--color-accent))" stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={fillD} fill={`url(#${gradId})`} />
        <path d={d} fill="none" stroke="rgb(var(--color-accent))" strokeWidth="1.4" />
        {hp && hoverIdx !== values.length - 1 ? (
          <circle cx={hp[0]} cy={hp[1]} r="2.5" fill="rgb(var(--color-accent))" />
        ) : (
          <circle cx={pts[pts.length-1][0]} cy={pts[pts.length-1][1]} r="2.5" fill="rgb(var(--color-accent))" />
        )}
      </svg>
      {hp && (hDate || hVal) && (
        <div
          className="pointer-events-none absolute bottom-full mb-1 px-2 py-1 rounded border border-bd t-xs font-mono text-muted whitespace-nowrap"
          style={{
            background: 'rgb(var(--color-card))',
            left: `${(pts[hoverIdx!][0] / w) * 100}%`,
            transform: 'translateX(-50%)',
          }}
        >
          {hDate && <span>{hDate}</span>}
          {hVal && <span className="gold ml-1.5">{hVal}{unit ? ` ${unit}` : ''}</span>}
        </div>
      )}
    </div>
  );
}

function NorthStarCardV3({
  measurements,
  measurementGoals,
}: {
  measurements: BodyMeasurement[];
  measurementGoals: Record<string, MeasurementGoal>;
}) {
  const ICONS: Record<string, string> = { weight: '⚖️', waist: '📏', bicep: '💪', bmi: '📊', body_fat: '🔥', muscle_mass: '🏋️', water_pct: '💧' };
  const metricsToShow = DISPLAYED_METRICS.slice(0, 3);

  return (
    <section className="card overflow-hidden">
      <V3CardHeader label="North Star Goals" meta="Body composition · tracking to target" />
      <div className="grid grid-cols-3 divide-x divide-bd">
        {metricsToShow.map((key) => {
          const cfg = METRIC_CONFIG[key];
          const goal = measurementGoals[key];
          const sorted = measurements
            .filter((m) => m.metric === key)
            .sort((a, b) => b.measuredAt.localeCompare(a.measuredAt));
          const latest = sorted[0];
          const last10 = sorted.slice(0, 10).reverse();

          const displayVal = latest
            ? (key === 'weight' && latest.unit === 'kg'
              ? (latest.value * KG_TO_LBS).toFixed(1)
              : Number(latest.value).toFixed(1))
            : null;
          const targetVal = goal
            ? (key === 'weight' && goal.unit === 'kg'
              ? (goal.targetValue * KG_TO_LBS).toFixed(1)
              : Number(goal.targetValue).toFixed(1))
            : null;

          const { status, projectedDate, pct } = goal
            ? computeGoalPace(measurements, key, goal, cfg.defaultGoalDir)
            : { status: 'red' as PaceStatus, projectedDate: null, pct: 0 };

          const paceColor = status === 'done' ? '#86AA80' : status === 'green' ? '#86AA80' : status === 'yellow' ? GOLD : '#C5896E';
          const paceLabel = status === 'done' ? '✓ Achieved' : status === 'green' ? '↑ Ahead' : status === 'yellow' ? '→ On track' : '↓ Behind';

          const sparkValues = last10.map((m) =>
            key === 'weight' && m.unit === 'kg' ? m.value * KG_TO_LBS : m.value
          );
          const sparkDates = last10.map((m) => m.measuredAt);

          const size = 82, sw = 7;
          const r2 = (size - sw) / 2;
          const c2 = 2 * Math.PI * r2;
          const filled2 = pct * c2;

          return (
            <div key={key} className="p-6">
              <div className="flex items-start justify-between mb-4">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="t-base text-muted leading-none">{ICONS[key] ?? '●'}</span>
                    <span className="micro text-muted">{cfg.label}</span>
                  </div>
                  <div className="flex items-baseline gap-1.5 mt-2">
                    <span className="font-display font-semibold text-[36px] tnum leading-none">{displayVal ?? '—'}</span>
                    <span className="t-base text-muted font-mono">{cfg.unit}</span>
                  </div>
                  {targetVal && <div className="t-sm text-muted font-mono mt-1">target {targetVal} {cfg.unit}</div>}
                </div>
                <div className="relative shrink-0" style={{ width: size, height: size }}>
                  <svg width={size} height={size} className="-rotate-90">
                    <circle cx={size/2} cy={size/2} r={r2} fill="none" stroke="rgb(var(--color-border))" strokeWidth={sw} />
                    <circle cx={size/2} cy={size/2} r={r2} fill="none" stroke={paceColor} strokeWidth={sw}
                      strokeDasharray={`${filled2} ${c2}`} strokeLinecap="round" />
                  </svg>
                  <div className="absolute inset-0 flex items-center justify-center t-xs font-mono tnum" style={{ color: paceColor }}>
                    {Math.round(pct * 100)}%
                  </div>
                </div>
              </div>
              {sparkValues.length >= 2 && <V3Sparkline values={sparkValues} dates={sparkDates} unit={cfg.unit} />}
              <div className="flex items-center justify-between mt-3 pt-3 border-t border-bd">
                <div>
                  <div className="t-xs text-muted">Pace</div>
                  <div className="t-sm font-medium mt-0.5" style={{ color: paceColor }}>{paceLabel}</div>
                </div>
                <div className="text-right">
                  <div className="t-xs text-muted">{status === 'done' ? 'Achieved' : 'ETA'}</div>
                  <div className="t-sm font-mono tnum mt-0.5">{projectedDate ?? '—'}</div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

// ── CreatineCard ───────────────────────────────────────────────────────────────

function CreatineCardV3({ foodLogHistory }: { foodLogHistory: FoodLogHistoryDay[] }) {
  const creatine = computeCreatineSaturation(foodLogHistory);
  if (!creatine) return null;
  const { satPct, loggedDays, daysToFull, phase } = creatine;
  const size = 120, sw = 9;
  const r = (size - sw) / 2;
  const circ = 2 * Math.PI * r;
  const filled = satPct * circ;

  // Count actual creatine-logged days in the last 7 calendar days
  const today = localDateStr();
  const last7Days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(today + 'T12:00:00');
    d.setDate(d.getDate() - i);
    return localDateStr(d);
  });
  const creatineDaySet = new Set(
    foodLogHistory
      .filter((day) => day.entries.some((e) => e.foodName.toLowerCase().includes('creatine')))
      .map((day) => day.date)
  );
  const last7 = last7Days.filter((d) => creatineDaySet.has(d)).length;

  return (
    <section className="card overflow-hidden h-full flex flex-col">
      <V3CardHeader label="Creatine" meta={phase} />
      <div className="p-6 flex-1 flex flex-col">
        <div className="flex items-center gap-5">
          <div className="relative shrink-0" style={{ width: size, height: size }}>
            <svg width={size} height={size} className="-rotate-90">
              <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="rgb(var(--color-border))" strokeWidth={sw} />
              <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="#A78BFA" strokeWidth={sw}
                strokeDasharray={`${filled} ${circ}`} strokeLinecap="round" />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <div className="font-display font-semibold text-[26px] tnum">{Math.round(satPct * 100)}%</div>
              <div className="t-sm text-muted">saturated</div>
            </div>
          </div>
          <div className="flex-1">
            <div className="inline-block px-2 py-0.5 rounded-sm text-[10.5px] font-semibold uppercase tracking-wider mb-2"
              style={{ background: 'rgba(167,139,250,0.15)', color: '#C4B5FD' }}>
              {phase}
            </div>
            <div className="t-base text-muted leading-snug">Consistent 5g/day keeps intramuscular creatine topped up.</div>
          </div>
        </div>
        <div className="mt-6 space-y-3">
          <div className="flex items-baseline justify-between">
            <span className="t-base text-muted">Days logged</span>
            <span className="t-base font-mono tnum">{loggedDays}</span>
          </div>
          <div className="flex items-baseline justify-between">
            <span className="t-base text-muted">7-day compliance</span>
            <span className={`t-base font-mono tnum ${last7 === 7 ? 'gold font-semibold' : ''}`}>{last7}/7</span>
          </div>
          <div className="flex items-baseline justify-between">
            <span className="t-base text-muted">Next milestone</span>
            <span className="t-base font-mono tnum">{daysToFull > 0 ? `in ${daysToFull} days` : 'achieved'}</span>
          </div>
        </div>
      </div>
    </section>
  );
}

// ── PersonalBestsCard ──────────────────────────────────────────────────────────

function PersonalBestsCardV3({ personalBests }: {
  personalBests: PersonalBests | null;
}) {
  const fmtLbs = (n: number) => new Intl.NumberFormat('en-US').format(Math.round(n));
  const fmtDate = (d: string) => new Date(d + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

  return (
    <section className="card overflow-hidden h-full flex flex-col">
      <V3CardHeader label="Personal Bests" meta="All time" />
      <div className="flex-1 divide-y divide-bd">

        {/* Volume by routine — compact 3-col mini-grid */}
        {personalBests && personalBests.bestVolumeByRoutine.length > 0 ? (
          <div className="px-6 py-3">
            <div className="t-xs text-muted font-mono uppercase tracking-wide mb-2">Best Session Volume</div>
            <div className="grid gap-x-4" style={{ gridTemplateColumns: `repeat(${personalBests.bestVolumeByRoutine.length}, 1fr)` }}>
              {personalBests.bestVolumeByRoutine.map((r) => (
                <div key={r.routineId} className="min-w-0">
                  <div className="font-display font-semibold text-[17px] tnum truncate">{fmtLbs(r.volumeKg * KG_TO_LBS)}<span className="text-[11px] font-sans font-normal text-muted ml-0.5">lbs</span></div>
                  <div className="t-xs text-muted font-mono truncate">{r.routineName}</div>
                  {r.workoutDate && <div className="t-xs text-muted font-mono opacity-60">{fmtDate(r.workoutDate)}</div>}
                </div>
              ))}
            </div>
          </div>
        ) : null}

        {/* Heaviest single lift */}
        {personalBests?.heaviestLift ? (() => {
          const lift = personalBests.heaviestLift!;
          return (
            <div className="flex items-baseline justify-between px-6 py-4">
              <div>
                <div className="t-base font-medium">{lift.exerciseName}</div>
                <div className="t-sm text-muted font-mono mt-0.5">
                  {lift.reps != null ? `${lift.reps} rep${lift.reps !== 1 ? 's' : ''} · ` : ''}Heaviest set · {fmtDate(lift.workoutDate)}
                </div>
              </div>
              <div className="font-display font-semibold text-[20px] tnum shrink-0 ml-4">{fmtLbs(lift.weightKg * KG_TO_LBS)} lbs</div>
            </div>
          );
        })() : null}

        {/* Most calories burned */}
        <div className="flex items-baseline justify-between px-6 py-4">
          <div>
            <div className="t-base font-medium">Most Calories Burned</div>
            <div className="t-sm text-muted font-mono mt-0.5">
              {personalBests?.mostCaloriesBurned
                ? `${personalBests.mostCaloriesBurned.workoutName} · ${fmtDate(personalBests.mostCaloriesBurned.workoutDate)}`
                : 'No data yet'}
            </div>
          </div>
          <div className="font-display font-semibold text-[20px] tnum shrink-0 ml-4">
            {personalBests?.mostCaloriesBurned
              ? <>{fmtLbs(personalBests.mostCaloriesBurned.calories)}<span className="text-[12px] font-sans font-normal text-muted ml-1">kcal</span></>
              : <span className="text-muted text-base">—</span>}
          </div>
        </div>

        {/* Best stair pace */}
        <div className="flex items-baseline justify-between px-6 py-4">
          <div>
            <div className="t-base font-medium">{personalBests?.bestStairPace?.exerciseName ?? 'Best Stair Pace'}</div>
            <div className="t-sm text-muted font-mono mt-0.5">
              {personalBests?.bestStairPace ? `Best pace · ${fmtDate(personalBests.bestStairPace.workoutDate)}` : 'No data yet'}
            </div>
          </div>
          <div className="font-display font-semibold text-[20px] tnum shrink-0 ml-4">
            {personalBests?.bestStairPace
              ? <>{Math.round(personalBests.bestStairPace.pacePerMinute)}<span className="text-[12px] font-sans font-normal text-muted ml-1">stairs/min</span></>
              : <span className="text-muted text-base">—</span>}
          </div>
        </div>

      </div>
    </section>
  );
}

// ── RecentWorkoutsCard ─────────────────────────────────────────────────────────

function computeWorkoutHighlight(w: WorkoutSummary, allWorkouts: WorkoutSummary[]): string[] {
  return computeHighlights(w, allWorkouts);
}

function RecentWorkoutsCardV3({
  workouts,
  routinesList,
}: {
  workouts: WorkoutSummary[];
  routinesList: RoutineSummary[];
}) {
  const navigate = useNavigate();
  const routineById = Object.fromEntries(routinesList.map((r) => [r.id, r]));
  const completed = [...workouts].sort((a, b) => b.workoutDate.localeCompare(a.workoutDate));
  const last10 = completed.slice(0, 10);
  const fmtNum = (n: number) => new Intl.NumberFormat('en-US').format(Math.round(n));

  return (
    <section className="card overflow-hidden">
      <V3CardHeader
        label="Recent Workouts"
        meta={`Last ${last10.length} sessions`}
        action={<button onClick={() => navigate('/workouts')} className="t-xs text-muted hover:gold font-mono transition-colors">View all →</button>}
      />
      {last10.length === 0 ? (
        <div className="p-10 text-center"><div className="t-sm text-muted">No workouts logged yet.</div></div>
      ) : (
        <table className="w-full">
          <thead>
            <tr className="border-b border-bd">
              <th className="text-left px-6 py-3 micro text-muted">Date</th>
              <th className="text-left px-4 py-3 micro text-muted">Session</th>
              <th className="text-right px-4 py-3 micro text-muted">Volume</th>
              <th className="text-right px-4 py-3 micro text-muted">Calories</th>
              <th className="text-left px-4 py-3 micro text-muted">Highlight</th>
              <th className="text-right px-4 py-3 micro text-muted">vs Prior</th>
              <th className="px-6 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {last10.map((w) => {
              const volLbs = Math.round((w.totalVolumeKg ?? 0) * KG_TO_LBS);
              const rt = w.routineType ?? (volLbs > 0 ? 'strength' : 'cardio_duration');
              const routineName = w.routineId ? (routineById[w.routineId]?.name ?? w.routineName ?? `Routine ${w.routineId}`) : (w.name ?? 'Free workout');

              // Primary metric display by routine type
              const totalSecs = w.totalDurationSeconds ?? w.exercises.reduce((s, e) => s + (e.totalDurationSeconds ?? 0), 0);
              const stepsDurMin = totalSecs ? Math.round(totalSecs / 60) : (w.durationMinutes ?? null);
              const stepsVal = w.totalSteps ?? null;
              let primaryVal: number | null = null;
              let primaryUnit = 'lbs';
              if (rt === 'steps') {
                primaryVal = stepsVal != null && totalSecs > 0 ? Math.round(stepsVal / (totalSecs / 60)) : null;
                primaryUnit = 'stairs/min';
              } else if (rt === 'cardio_distance') {
                const distMiles = w.totalDistanceMeters ? w.totalDistanceMeters / 1609.34 : null;
                primaryVal = distMiles && w.durationMinutes ? Number((distMiles / w.durationMinutes).toFixed(2)) : null;
                primaryUnit = 'mi/min';
              } else if (rt === 'cardio_duration') {
                primaryVal = stepsDurMin;
                primaryUnit = 'min';
              } else {
                primaryVal = volLbs > 0 ? volLbs : null;
              }

              const volumeDisplay = primaryVal != null ? (
                <span>{primaryUnit === 'lbs' ? fmtNum(primaryVal) : primaryVal}<span className="text-muted"> {primaryUnit}</span></span>
              ) : (
                <span className="text-muted">—</span>
              );

              let prior: WorkoutSummary | undefined;
              if (w.routineId) {
                prior = completed.find((x) => x.id !== w.id && x.routineId === w.routineId && x.workoutDate < w.workoutDate);
              }

              // Compare same metric vs prior — steps uses pace (steps/min) so duration differences don't skew it
              let priorVal: number | null = null;
              let currentCompare: number | null = primaryVal;
              if (prior) {
                if (rt === 'steps') {
                  const priorSecs = prior.totalDurationSeconds ?? prior.exercises?.reduce((s, e) => s + (e.totalDurationSeconds ?? 0), 0) ?? 0;
                  const priorMin = priorSecs ? priorSecs / 60 : (prior.durationMinutes ?? null);
                  priorVal = prior.totalSteps != null && priorMin ? Math.round(prior.totalSteps / priorMin) : null;
                } else if (rt === 'cardio_distance') {
                  const priorMiles = prior.totalDistanceMeters ? prior.totalDistanceMeters / 1609.34 : null;
                  priorVal = priorMiles && prior.durationMinutes ? Number((priorMiles / prior.durationMinutes).toFixed(2)) : null;
                } else if (rt === 'cardio_duration') {
                  const ps = prior.totalDurationSeconds ?? prior.exercises?.reduce((s, e) => s + (e.totalDurationSeconds ?? 0), 0) ?? 0;
                  priorVal = ps ? Math.floor(ps / 60) : (prior.durationMinutes ?? null);
                } else {
                  priorVal = Math.round((prior.totalVolumeKg ?? 0) * KG_TO_LBS);
                }
              }

              const delta = priorVal != null && currentCompare != null ? currentCompare - priorVal : null;
              const deltaPct = delta != null && priorVal && priorVal > 0 ? (delta / priorVal * 100) : null;

              return (
                <tr
                  key={w.id}
                  className="border-b border-bd/60 last:border-0 hover:bg-bg/40 transition-colors cursor-pointer"
                  onClick={() => navigate(`/workouts/${w.id}`)}
                >
                  <td className="px-6 py-4 t-base font-mono tnum text-muted whitespace-nowrap">
                    {new Date(w.workoutDate + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                  </td>
                  <td className="px-4 py-4 t-base font-medium">{routineName}</td>
                  <td className="px-4 py-4 t-base text-right font-mono tnum">{volumeDisplay}</td>
                  <td className="px-4 py-4 t-base text-right font-mono tnum">
                    {w.caloriesBurned ? <span>{fmtNum(w.caloriesBurned)}<span className="text-muted"> kcal</span></span> : <span className="text-muted">—</span>}
                  </td>
                  <td className="px-4 py-4 t-base">
                    {(() => {
                      const highlights = computeWorkoutHighlight(w, completed);
                      return highlights.length > 0
                        ? <div className="flex flex-col gap-0.5">
                            {highlights.map((h, i) => (
                              <span key={i} className="inline-flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full bg-gold shrink-0" /><span className="gold">{h}</span></span>
                            ))}
                          </div>
                        : <span className="text-muted/40">—</span>;
                    })()}
                  </td>
                  <td className="px-4 py-4 t-base text-right">
                    {deltaPct != null ? (
                      <span className="font-mono tnum font-semibold" style={{ color: delta! >= 0 ? '#86AA80' : '#C5896E' }}>
                        {delta! >= 0 ? '▲' : '▼'}{Math.abs(Math.round(deltaPct))}%
                      </span>
                    ) : prior === undefined && w.routineId ? (
                      <span className="text-muted t-xs">first</span>
                    ) : (
                      <span style={{ color: 'rgba(var(--color-muted), 0.4)' }}>—</span>
                    )}
                  </td>
                  <td className="px-6 py-4 text-right">
                    <span className="t-xs text-muted hover:gold cursor-pointer font-mono">open →</span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </section>
  );
}

// ── DashboardV3 shell ──────────────────────────────────────────────────────────

function DashboardV3({
  workouts, measurements, measurementGoals,
  waterHistory, foodLogHistory, routinesList, routineGoals,
  caloriesGoal, proteinGoal, carbsGoal, fatGoal,
  todayTDEE, exGoals, weeklyData, personalBests,
  loading, onWaterLogged, onMeasurementLogged,
}: {
  workouts: WorkoutSummary[];
  measurements: BodyMeasurement[];
  measurementGoals: Record<string, MeasurementGoal>;
  waterHistory: WaterHistory | null;
  foodLogHistory: FoodLogHistoryDay[];
  routinesList: RoutineSummary[];
  routineGoals: Record<number, number>;
  caloriesGoal: number | null;
  proteinGoal: number | null;
  carbsGoal: number | null;
  fatGoal: number | null;
  todayTDEE: TDEEBreakdown | null;
  exGoals: ExerciseGoals | null;
  weeklyData: WeekBucket[];
  personalBests: PersonalBests | null;
  loading: boolean;
  onWaterLogged?: () => void;
  onMeasurementLogged?: () => void;
}) {
  if (loading) return <div className="flex-1 flex items-center justify-center text-muted t-sm">Loading…</div>;

  const today = localDateStr();
  const sessionsLeftThisWeek = (() => {
    const goal = exGoals?.workoutsPerWeek ?? null;
    if (!goal) return null;
    const weekStart = getWeekStart(today);
    const done = workouts.filter((w) => getWeekStart(w.workoutDate) === weekStart).length;
    return Math.max(0, goal - done);
  })();
  const streak = computeDayStreak(workouts);
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  const dateStr = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
  const timeStr = new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });

  return (
    <div className="flex-1 overflow-y-auto">
      {/* Slim header */}
      <div className="border-b border-bd">
        <div className="px-8 pt-9 pb-7 flex items-end justify-between gap-6">
          <div>
            <div className="flex items-center gap-3 mb-3">
              <span className="micro text-muted">Dashboard — {dateStr}</span>
              <V3GoldRule />
              <span className="t-xs text-muted font-mono">{timeStr}</span>
            </div>
            <h1 className="font-display font-semibold tracking-tight t-display">
              {greeting}, <span className="gold">Jeff.</span>
            </h1>
            <p className="t-base text-muted mt-2 max-w-[60ch]">
              {sessionsLeftThisWeek != null
                ? `${sessionsLeftThisWeek} session${sessionsLeftThisWeek !== 1 ? 's' : ''} left this week to hit your target. ${streak}-day streak.`
                : `You're all set this week. ${streak}-day streak — keep it going.`}
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0 pb-1">
            <a href="/nutrition/today" className="border border-bd hover:border-gold t-sm px-4 py-2.5 rounded-md whitespace-nowrap transition-colors">
              + Log food
            </a>
            <a href="/workouts" className="bg-gold text-slate-900 font-semibold t-sm px-5 py-2.5 rounded-md hover:brightness-110 whitespace-nowrap transition-all">
              + Start workout
            </a>
          </div>
        </div>
      </div>

      {/* Main content */}
      <main className="px-8 py-10 space-y-6">
        <FuelTodayCard
          foodLogHistory={foodLogHistory}
          waterHistory={waterHistory}
          workouts={workouts}
          caloriesGoal={caloriesGoal}
          proteinGoal={proteinGoal}
          carbsGoal={carbsGoal}
          fatGoal={fatGoal}
          todayTDEE={todayTDEE}
          onWaterLogged={onWaterLogged}
        />

        <ThisWeekCardV3 workouts={workouts} exGoals={exGoals} weeklyData={weeklyData} routinesList={routinesList} routineGoals={routineGoals} />

        <BodyCompositionCardV3 measurements={measurements} onMeasurementLogged={onMeasurementLogged} />

        {/* Progress over time */}
        <TrendingSection
          foodLogHistory={foodLogHistory}
          workouts={workouts}
          measurements={measurements}
          measurementGoals={measurementGoals}
          routinesList={routinesList}
          todayTDEE={todayTDEE}
          caloriesGoal={caloriesGoal}
          proteinGoal={proteinGoal}
        />

        {/* Long game */}
        <div className="pt-4">
          <div className="flex items-end justify-between mb-4">
            <div>
              <div className="flex items-center gap-3 mb-1.5">
                <V3GoldRule />
                <span className="micro text-muted font-semibold tracking-wider">Long game</span>
              </div>
              <h2 className="font-display font-semibold text-[22px] tracking-tight text-white">North star goals</h2>
            </div>
          </div>
          <NorthStarCardV3 measurements={measurements} measurementGoals={measurementGoals} />
        </div>

        <div className="grid grid-cols-[1fr_1fr] gap-6">
          <CreatineCardV3 foodLogHistory={foodLogHistory} />
          <PersonalBestsCardV3 personalBests={personalBests} />
        </div>

        <RecentWorkoutsCardV3 workouts={workouts} routinesList={routinesList} />

        <footer className="pt-8 pb-4 flex items-center justify-between t-xs text-muted font-mono">
          <div className="flex items-center gap-3">
            <V3GoldRule w={14} />
            <span>Pulse · health tracker</span>
          </div>
          <div>Last sync {new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}</div>
        </footer>
      </main>
    </div>
  );
}


// ─── Main page ────────────────────────────────────────────────────────────────

export default function WorkoutsDashboardPage() {
  const navigate = useNavigate();
  const [workouts, setWorkouts] = useState<WorkoutSummary[]>([]);
  const [exGoals, setExGoals] = useState<ExerciseGoals | null>(null);
  const [measurements, setMeasurements] = useState<BodyMeasurement[]>([]);
  const [measurementGoals, setMeasurementGoals] = useState<Record<string, MeasurementGoal>>({});
  const [personalBests, setPersonalBests] = useState<PersonalBests | null>(null);
  const [nutritionSummary, setNutritionSummary] = useState<GoalsSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [v2Loading, setV2Loading] = useState(false);
  const [v2Loaded, setV2Loaded] = useState(false);
  const [waterHistory, setWaterHistory] = useState<WaterHistory | null>(null);
  const [foodLogHistory, setFoodLogHistory] = useState<FoodLogHistoryDay[]>([]);
  const [todayTDEE, setTodayTDEE] = useState<TDEEBreakdown | null>(null);
  const [routinesList, setRoutinesList] = useState<RoutineSummary[]>([]);
  const [routineGoals, setRoutineGoals] = useState<Record<number, number>>({});
  const [, setStarting] = useState(false);
  const [startingRoutineId, setStartingRoutineId] = useState<number | null>(null);
  const [startPickerOpen, setStartPickerOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'dashboard' | 'other'>('dashboard');

  function load() {
    Promise.all([
      workoutsApi.getAll({ limit: 200 }),
      goalsApi.getExercise().catch(() => null),
      goalsApi.getSummary().catch(() => null),
      measurementsApi.getAll().catch(() => []),
      measurementsApi.getGoals().catch(() => ({})),
      workoutsApi.getPersonalBests().catch(() => null),
    ]).then(([ws, eg, summary, ms, mg, pb]) => {
      setWorkouts(ws);
      setExGoals(eg);
      setNutritionSummary(summary);
      setMeasurements(ms as BodyMeasurement[]);
      setMeasurementGoals(mg as Record<string, MeasurementGoal>);
      setPersonalBests(pb);
    }).catch(() => {}).finally(() => setLoading(false));
  }

  async function loadV2() {
    if (v2Loaded) return;
    setV2Loading(true);
    try {
      const end = localDateStr();
      const startD = new Date(); startD.setDate(startD.getDate() - 29);
      const start = localDateStr(startD);
      const [wh, fl, rl, tdee, rg] = await Promise.all([
        waterApi.getHistory(start, end).catch(() => null),
        logApi.getHistory(30).catch(() => []),
        routinesApi.getAll().catch(() => []),
        goalsApi.getTDEE().catch(() => null),
        routinesApi.getAllGoals().catch(() => []),
      ]);
      setWaterHistory(wh);
      setFoodLogHistory(fl as FoodLogHistoryDay[]);
      setRoutinesList(rl as RoutineSummary[]);
      setRoutineGoals(Object.fromEntries((rg as import('@pulse/api-client').RoutineGoal[]).map((g) => [g.routineId, g.targetPerWeek])));
      if (tdee && tdee.available) setTodayTDEE(tdee);
      setV2Loaded(true);
    } catch { /* ignore */ } finally { setV2Loading(false); }
  }

  useEffect(() => { load(); loadV2(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleStartBlank() {
    setStarting(true);
    setStartPickerOpen(false);
    try {
      const workout = await workoutsApi.create();
      navigate(`/workouts/${workout.id}`);
    } catch { setStarting(false); }
  }

  async function handleStartRoutine(routineId: number) {
    setStartingRoutineId(routineId);
    setStartPickerOpen(false);
    try {
      const workout = await routinesApi.start(routineId);
      navigate(`/workouts/${workout.id}`);
    } catch { setStartingRoutineId(null); }
  }

  return (
    <div className="flex flex-col h-full overflow-hidden bg-dram-bg text-white">
      {/* Toolbar */}
      <div className="flex-shrink-0 px-6 pt-5 pb-0 border-b border-dram-border">
        <div className="flex items-center justify-between pb-3">
          <h1 className="text-xl font-semibold text-slate-200">Dashboard</h1>
        </div>
        <div className="flex gap-1">
          {(['dashboard', 'other'] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-2 text-sm font-medium transition border-b-2 -mb-px ${
                activeTab === tab
                  ? 'border-dram-accent text-dram-accent'
                  : 'border-transparent text-dram-muted hover:text-slate-200'
              }`}
            >
              {tab === 'dashboard' ? 'Dashboard' : 'Other'}
            </button>
          ))}
        </div>
      </div>

      {startPickerOpen && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60" onClick={() => setStartPickerOpen(false)}>
          <div
            className="bg-dram-card border border-dram-border rounded-t-2xl sm:rounded-2xl w-full sm:max-w-sm mx-4 overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-5 pt-5 pb-3 border-b border-dram-border">
              <h2 className="text-base font-semibold text-slate-200">Start Workout</h2>
              <button onClick={() => setStartPickerOpen(false)} className="text-slate-500 hover:text-slate-300 text-xl leading-none">×</button>
            </div>
            <div className="overflow-y-auto max-h-[60vh]">
              {/* Blank workout option */}
              <button
                onClick={handleStartBlank}
                className="w-full flex items-center gap-3 px-5 py-3.5 hover:bg-dram-bg/60 transition-colors border-b border-dram-border text-left"
              >
                <span className="text-xl leading-none">➕</span>
                <div>
                  <div className="text-sm font-semibold text-slate-200">Blank Workout</div>
                  <div className="text-sm text-dram-muted">Start from scratch</div>
                </div>
              </button>
              {/* Routines */}
              {routinesList.length > 0 && (
                <div className="px-5 pt-3 pb-1">
                  <div className="text-sm font-semibold text-dram-muted uppercase tracking-wider mb-2">Routines</div>
                </div>
              )}
              {routinesList.map((r) => (
                <button
                  key={r.id}
                  onClick={() => handleStartRoutine(r.id)}
                  disabled={startingRoutineId === r.id}
                  className="w-full flex items-center gap-3 px-5 py-3 hover:bg-dram-bg/60 disabled:opacity-50 transition-colors text-left"
                >
                  <span className="text-xl leading-none">📋</span>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold text-slate-200 truncate">{r.name}</div>
                    <div className="text-sm text-dram-muted">{r.exerciseCount} exercise{r.exerciseCount !== 1 ? 's' : ''}{r.lastUsedDate ? ` · last used ${new Date(r.lastUsedDate + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}` : ''}</div>
                  </div>
                  {startingRoutineId === r.id && <span className="text-sm text-dram-muted">Starting…</span>}
                </button>
              ))}
              {routinesList.length === 0 && (
                <div className="px-5 py-3 text-sm text-dram-muted">No routines yet. Create one from the Workouts page.</div>
              )}
            </div>
            <div className="px-5 py-3 border-t border-dram-border">
              <button onClick={() => setStartPickerOpen(false)} className="w-full text-sm text-slate-400 hover:text-slate-200 py-1 transition-colors">Cancel</button>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'dashboard' ? (
        <DashboardV3
          workouts={workouts}
          measurements={measurements}
          measurementGoals={measurementGoals}
          personalBests={personalBests}
          waterHistory={waterHistory}
          foodLogHistory={foodLogHistory}
          routinesList={routinesList}
          routineGoals={routineGoals}
          loading={loading || (v2Loading && !v2Loaded)}
          caloriesGoal={nutritionSummary?.nutrition.goals?.calories ?? null}
          proteinGoal={nutritionSummary?.nutrition.goals?.proteinG ?? null}
          carbsGoal={nutritionSummary?.nutrition.goals?.carbsG ?? null}
          fatGoal={nutritionSummary?.nutrition.goals?.fatG ?? null}
          todayTDEE={todayTDEE}
          exGoals={exGoals}
          weeklyData={buildWeeklyData(workouts)}
          onWaterLogged={() => {
            const end = localDateStr();
            const startD = new Date(); startD.setDate(startD.getDate() - 29);
            const start = localDateStr(startD);
            waterApi.getHistory(start, end).catch(() => null).then((wh) => { if (wh) setWaterHistory(wh); });
          }}
          onMeasurementLogged={() => {
            measurementsApi.getAll().catch(() => []).then((ms) => setMeasurements(ms as BodyMeasurement[]));
          }}
        />
      ) : (
        <div className="flex-1 overflow-y-auto px-6">
          <TodaysBlurb workouts={workouts} foodLogHistory={foodLogHistory} waterHistory={waterHistory} todayTDEE={todayTDEE} />
        </div>
      )}
    </div>
  );
}
