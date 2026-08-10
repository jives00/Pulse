import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  workoutsApi, nutritionTargetsApi, measurementsApi, routinesApi, logApi, schedulesApi, recoveryApi, waterApi, stepsApi,
  localDateStr, getWeekStart, buildWeeklyData, computeHighlights, buildWorkoutLine,
  KG_TO_LBS,
  WIDGET_BY_KEY, resolveLayout, groupLayout,
  type WorkoutSummary, type NutritionSummary,
  type BodyMeasurement, type PersonalBests,
  type RoutineSummary, type RoutineDetail, type FoodLogHistoryDay, type TDEEBreakdown,
  type WeekBucket, type UpcomingSession, type RecoveryData, type WaterDay, type StepsDay, type WaterHistoryDay,
  goalsV2Api, type Goal, type UpdateGoalPayload,
  resolveGoalCard, type GoalCardConfig,
  type DashboardWidgetKey, type LayoutEntry, type StoredDashboardLayout,
} from '@pulse/api-client';
import { copyText } from '../utils/clipboard';
import { DashboardGoalCard } from '../components/goals/dashboard/DashboardGoalCard';
import { useFeaturesStore } from '../store/featuresStore';
import { WidgetEditorBar } from '../components/dashboard/WidgetEditorBar';
import { AddWidgetTray } from '../components/dashboard/AddWidgetTray';
import { GoalEditorBar } from '../components/dashboard/GoalEditorBar';
import { GoalOptionsPopover } from '../components/dashboard/GoalOptionsPopover';
import { UnpinnedGoalsTray } from '../components/dashboard/UnpinnedGoalsTray';
import {
  moveWidget, setWidgetSpan, setWidgetVisible, resetLayoutWidgets, isWidgetEditable, reorderEditableWidgets,
} from '../components/dashboard/layoutReducer';
import {
  moveGoal, setGoalSpan, setGoalCardConfig, setGoalPinned, reorderPinnedGoals, pinnedGoalsSorted,
} from '../components/dashboard/goalOrderReducer';

// ─── Constants ────────────────────────────────────────────────────────────────

const COL_GOOD = '#7BB389';
const COL_WARN = '#C9714F';
const ACCENT = 'rgb(var(--color-accent))';
const MUTED   = 'rgb(var(--color-muted))';
const MUTED2  = 'rgba(var(--color-muted) / 0.55)';
const BG      = 'rgb(var(--color-bg))';
const CARD    = 'rgb(var(--color-card))';
const LINE    = 'rgb(var(--color-border))';
const LINE_SOFT = 'rgba(255,255,255,0.06)';

const clamp = (n: number, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, n));
const fmt   = (n: number) => Math.round(n).toLocaleString();

// ─── Shared copy-to-clipboard hook ───────────────────────────────────────────

function useCopy() {
  const [state, setState] = useState<'idle' | 'copied' | 'failed'>('idle');
  const copy = async (text: string) => {
    const ok = await copyText(text);
    setState(ok ? 'copied' : 'failed');
    setTimeout(() => setState('idle'), 1800);
  };
  return { copied: state === 'copied', failed: state === 'failed', copy };
}

// ─── Band section header ──────────────────────────────────────────────────────

function Band({ kicker, title, meta, children }: { kicker: string; title?: string; meta?: string; children: React.ReactNode }) {
  return (
    <section style={{ padding: '28px 36px 8px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 18 }}>
        <div style={{ width: 18, height: 1, background: ACCENT, flexShrink: 0, alignSelf: 'center' }} />
        <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-300">{kicker}</h2>
        {title && <span className="font-display" style={{ fontSize: 18, fontWeight: 600, color: 'white' }}>{title}</span>}
        {meta && <span className="font-mono" style={{ fontSize: 11, color: MUTED2, marginLeft: 'auto' }}>{meta}</span>}
      </div>
      {children}
    </section>
  );
}

// ─── Panel (card) ─────────────────────────────────────────────────────────────

function Panel({ title, meta, children, span = 1, padded = true, action }: {
  title?: string; meta?: string; children: React.ReactNode;
  span?: number; padded?: boolean; action?: React.ReactNode;
}) {
  return (
    <div style={{
      gridColumn: `span ${span}`, background: CARD, border: `1px solid ${LINE}`,
      borderRadius: 0, padding: padded ? '18px 20px' : 0, display: 'flex', flexDirection: 'column',
    }}>
      {(title || action) && (
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 14 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
            <span className="micro" style={{ color: MUTED, fontSize: 12 }}>{title}</span>
            {meta && <span className="font-mono" style={{ fontSize: 10, color: MUTED2 }}>{meta}</span>}
          </div>
          {action}
        </div>
      )}
      <div style={{ flex: 1 }}>{children}</div>
    </div>
  );
}

// ─── Today Snapshot ──────────────────────────────────────────────────────────

function TodaySnapshot({ workouts, nutrition, water, steps }: {
  workouts: WorkoutSummary[];
  nutrition: NutritionSummary['nutrition']['actual'] | null;
  water: WaterDay | null;
  steps: StepsDay | null;
}) {
  const { copied, failed, copy } = useCopy();

  const glasses      = water ? Math.round(water.totalOz / 8) : 0;
  const hasNutrition = (nutrition?.calories ?? 0) > 0;

  const lines: string[] = ["Today's stats:"];
  for (const w of workouts) {
    if (w.exerciseCount > 0) lines.push(`- ${buildWorkoutLine(w)}`);
  }
  if (hasNutrition) {
    lines.push(`- Calories: ${fmt(nutrition!.calories)}, Protein: ${Math.round(nutrition!.proteinG)}g, Carbs: ${Math.round(nutrition!.carbsG)}g, Fats: ${Math.round(nutrition!.fatG)}g`);
  }
  if (glasses > 0) lines.push(`- Water: ${glasses} glasses`);
  if ((steps?.steps ?? 0) > 0) lines.push(`- Steps: ${steps!.steps!.toLocaleString()}`);

  const text = lines.join('\n');

  return (
    <div style={{ position: 'relative', background: CARD, borderRadius: 10, border: `1px solid ${LINE_SOFT}`, padding: '14px 18px' }}>
      <pre style={{ margin: 0, fontFamily: 'var(--font-mono)', fontSize: 13, color: MUTED, whiteSpace: 'pre-wrap', lineHeight: 1.7 }}>{text}</pre>
      <button onClick={() => copy(text)} style={{ position: 'absolute', top: 10, right: 12, fontSize: 11, color: copied ? COL_GOOD : failed ? COL_WARN : MUTED2, background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'var(--font-mono)' }}>
        {copied ? 'copied' : failed ? 'failed' : 'copy'}
      </button>
    </div>
  );
}

// ─── Weekly Blurb ────────────────────────────────────────────────────────────

function WeeklyBlurb({ weekStart, today, workouts, foodLogHistory, stepsHistory, waterWeekHistory, measurements }: {
  weekStart: string;
  today: string;
  workouts: WorkoutSummary[];
  foodLogHistory: FoodLogHistoryDay[];
  stepsHistory: StepsDay[];
  waterWeekHistory: WaterHistoryDay[];
  measurements: BodyMeasurement[];
}) {
  const { copied, failed, copy } = useCopy();

  const weekEndDate = new Date(weekStart + 'T12:00:00');
  weekEndDate.setDate(weekEndDate.getDate() + 6);
  const weekEnd = weekEndDate.toISOString().slice(0, 10);
  const fmtDay = (d: string) => new Date(d + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  const header = `Weekly stats (${fmtDay(weekStart)} – ${fmtDay(weekEnd)}):`;

  const weekWorkouts = workouts.filter(w => getWeekStart(w.workoutDate) === weekStart && w.exerciseCount > 0);
  const grouped: Map<string, number> = new Map();
  for (const w of weekWorkouts) {
    const name = w.routineName ?? w.name ?? 'Free workout';
    grouped.set(name, (grouped.get(name) ?? 0) + (w.totalVolumeKg ?? 0) * KG_TO_LBS);
  }
  const totalVolumeLbs = [...grouped.values()].reduce((s, v) => s + v, 0);

  const weekFoodDays = foodLogHistory.filter(d => d.date >= weekStart && d.date <= today);
  const totalCal     = weekFoodDays.reduce((s, d) => s + d.calories, 0);
  const totalProtein = weekFoodDays.reduce((s, d) => s + d.protein, 0);
  const totalCarbs   = weekFoodDays.reduce((s, d) => s + d.entries.reduce((e, en) => e + en.carbsG, 0), 0);
  const totalFat     = weekFoodDays.reduce((s, d) => s + d.entries.reduce((e, en) => e + en.fatG, 0), 0);
  const daysWithData = weekFoodDays.filter(d => d.calories > 0).length;

  const totalOz      = waterWeekHistory.filter(d => d.date >= weekStart && d.date <= today).reduce((s, d) => s + d.totalOz, 0);
  const totalGlasses = Math.round(totalOz / 8);

  const weekSteps = stepsHistory.filter(s => s.date >= weekStart && s.date <= today).reduce((s, d) => s + (d.steps ?? 0), 0);

  const priorWeekEndStr = (() => { const d = new Date(weekStart + 'T12:00:00'); d.setDate(d.getDate() - 1); return d.toISOString().slice(0, 10); })();
  function getLastStat(metric: string) {
    const sorted = measurements.filter(m => m.metric === metric).sort((a, b) => b.measuredAt.localeCompare(a.measuredAt));
    const current = sorted[0] ?? null;
    const prior   = sorted.find(m => m.measuredAt <= priorWeekEndStr) ?? null;
    return { current, prior };
  }
  function fmtM(m: BodyMeasurement) {
    const val = m.metric === 'weight' && m.unit === 'kg' ? m.value * KG_TO_LBS : m.value;
    return `${val.toFixed(1)} ${m.metric === 'weight' ? 'lb' : 'in'}`;
  }

  const lines: string[] = [header];

  if (totalCal > 0) {
    lines.push(`- Macros: ${fmt(totalCal)} cal | ${Math.round(totalProtein)}g protein | ${Math.round(totalCarbs)}g carbs | ${Math.round(totalFat)}g fat`);
    if (daysWithData > 0) {
      lines.push(`- Daily avg: ${fmt(Math.round(totalCal / daysWithData))} cal | ${Math.round(totalProtein / daysWithData)}g protein | ${Math.round(totalCarbs / daysWithData)}g carbs | ${Math.round(totalFat / daysWithData)}g fat`);
    }
  }
  for (const [name, volLbs] of grouped) {
    lines.push(volLbs > 0 ? `- ${name}: ${fmt(Math.round(volLbs))} lbs` : `- ${name}`);
  }
  if (weekWorkouts.length > 0 && totalVolumeLbs > 0) {
    lines.push(`- Total volume: ${fmt(Math.round(totalVolumeLbs))} lbs`);
  }
  if (totalGlasses > 0) lines.push(`- Water: ${totalGlasses} glasses`);
  if (weekSteps > 0) lines.push(`- Steps: ${weekSteps.toLocaleString()}`);

  for (const { metric, label } of [
    { metric: 'weight', label: 'Weight' },
    { metric: 'chest',  label: 'Chest'  },
    { metric: 'bicep',  label: 'Bicep'  },
    { metric: 'waist',  label: 'Waist'  },
  ]) {
    const { current, prior } = getLastStat(metric);
    if (current) {
      const priorStr = prior && prior.id !== current.id ? ` (prior: ${fmtM(prior)})` : '';
      lines.push(`- ${label}: ${fmtM(current)}${priorStr}`);
    }
  }

  const text = lines.join('\n');

  return (
    <div style={{ position: 'relative', background: CARD, borderRadius: 10, border: `1px solid ${LINE_SOFT}`, padding: '14px 18px' }}>
      <pre style={{ margin: 0, fontFamily: 'var(--font-mono)', fontSize: 13, color: MUTED, whiteSpace: 'pre-wrap', lineHeight: 1.7 }}>{text}</pre>
      <button onClick={() => copy(text)} style={{ position: 'absolute', top: 10, right: 12, fontSize: 11, color: copied ? COL_GOOD : failed ? COL_WARN : MUTED2, background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'var(--font-mono)' }}>
        {copied ? 'copied' : failed ? 'failed' : 'copy'}
      </button>
    </div>
  );
}

// ─── Fuel Today ───────────────────────────────────────────────────────────────

function MacroBlock({ label, val, goal }: { label: string; val: number; goal: number }) {
  const pctRaw = goal > 0 ? val / goal : 0;
  const pctClamped = clamp(pctRaw);
  const over = val > goal;
  const nearGoal = goal > 0 && pctRaw >= 0.95 && pctRaw <= 1.05;
  const barColor = nearGoal ? COL_GOOD : ACCENT;
  return (
    <div style={{ flex: 1 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 6 }}>
        <span className="micro" style={{ fontSize: 11, color: MUTED }}>{label}</span>
        <span className="font-mono" style={{ fontSize: 11, color: over ? COL_WARN : MUTED2 }}>{Math.round(pctRaw * 100)}%</span>
      </div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 4, marginBottom: 8 }}>
        <span className="font-display" style={{ fontSize: 22, fontWeight: 600, color: over ? COL_WARN : 'white' }}>{val}</span>
        <span style={{ fontSize: 12, color: MUTED }}>g</span>
        <span className="font-mono" style={{ fontSize: 11, color: MUTED2, marginLeft: 'auto' }}>/ {goal}</span>
      </div>
      <div style={{ height: 5, background: LINE_SOFT, borderRadius: 2, overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${pctClamped * 100}%`, background: barColor }} />
      </div>
      <div className="font-mono" style={{ fontSize: 11, color: over ? COL_WARN : MUTED2, marginTop: 6 }}>
        {over ? `+${val - goal}g over` : `${Math.max(0, goal - val)}g left`}
      </div>
    </div>
  );
}

function FuelToday({ actual, goals, tdee }: {
  actual: NutritionSummary['nutrition']['actual'] | null;
  goals: NutritionSummary['nutrition']['goals'] | null;
  tdee: TDEEBreakdown | null;
}) {
  const cal  = actual?.calories ?? 0;
  const prot = actual?.proteinG ?? 0;
  const carbs= actual?.carbsG ?? 0;
  const fat  = actual?.fatG ?? 0;
  const calG = goals?.calories ?? 0;
  const protG= goals?.proteinG ?? 0;
  const carbsG=goals?.carbsG ?? 0;
  const fatG  =goals?.fatG ?? 0;
  const tdeeVal = tdee?.total ?? 0;
  const calPctRaw = calG > 0 ? cal / calG : 0;
  const pct   = clamp(calPctRaw);
  const ringColor = calG > 0 && calPctRaw >= 0.95 && calPctRaw <= 1.05 ? COL_GOOD : ACCENT;
  const size  = 200, sw = 10, r = (size - sw) / 2, c = 2 * Math.PI * r;
  const net = cal - tdeeVal;

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: 36, alignItems: 'center', paddingTop: 12 }}>
      {/* Ring */}
      <div style={{ position: 'relative', width: size, height: size, flexShrink: 0 }}>
        <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
          <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={LINE_SOFT} strokeWidth={sw} />
          <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={ringColor} strokeWidth={sw}
            strokeDasharray={`${pct * c} ${c}`} strokeLinecap="round"
            style={{ transition: 'stroke-dasharray .5s ease' }} />
        </svg>
        <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
          <span className="micro" style={{ fontSize: 10, color: MUTED }}>Eaten</span>
          <span className="font-display t-display" style={{ color: 'white' }}>{fmt(cal)}</span>
          <span className="font-mono" style={{ fontSize: 11, color: MUTED }}>of {fmt(calG)} kcal</span>
        </div>
      </div>

      {/* Stats + macros */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
        <div style={{ display: 'flex', gap: 36, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          {tdeeVal > 0 && (
            <div>
              <div className="micro" style={{ fontSize: 11, marginBottom: 6, color: MUTED }}>Net vs TDEE</div>
              <div className="font-display" style={{ fontSize: 38, fontWeight: 700, lineHeight: 1, color: net < 0 ? COL_GOOD : COL_WARN }}>
                {net > 0 ? '+' : ''}{fmt(net)}
                <span style={{ fontSize: 13, color: MUTED, marginLeft: 7, fontWeight: 400 }}>{net < 0 ? 'deficit' : 'surplus'}</span>
              </div>
            </div>
          )}
          {tdeeVal > 0 && (
            <div>
              <div className="micro" style={{ fontSize: 11, marginBottom: 6, color: MUTED }}>TDEE</div>
              <div className="font-display" style={{ fontSize: 20, fontWeight: 500, color: MUTED }}>
                {fmt(tdeeVal)}<span style={{ fontSize: 12, color: MUTED2, marginLeft: 5, fontWeight: 400 }}>kcal</span>
              </div>
            </div>
          )}
          {cal > 0 && (
            <div>
              <div className="micro" style={{ fontSize: 11, marginBottom: 6, color: MUTED }}>Calories in</div>
              <div className="font-display" style={{ fontSize: 20, fontWeight: 500, color: MUTED }}>
                {fmt(cal)}<span style={{ fontSize: 12, color: MUTED2, marginLeft: 5, fontWeight: 400 }}>kcal</span>
              </div>
            </div>
          )}
        </div>
        <div style={{ height: 1, background: LINE_SOFT }} />
        {protG > 0 && (
          <div style={{ display: 'flex', gap: 28 }}>
            <MacroBlock label="Protein" val={Math.round(prot)} goal={protG} />
            <MacroBlock label="Carbs"   val={Math.round(carbs)} goal={carbsG} />
            <MacroBlock label="Fat"     val={Math.round(fat)}   goal={fatG} />
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Exercise Today ───────────────────────────────────────────────────────────

function StatsRow({ stats, muted }: { stats: [string, string, string][]; muted?: boolean }) {
  const col = muted ? MUTED : 'white';
  return (
    <div style={{ display: 'flex', marginBottom: 16 }}>
      {stats.map(([l, v, u], i) => (
        <div key={i} style={{ flex: 1, paddingLeft: i ? 16 : 0, borderLeft: i ? `1px solid ${LINE_SOFT}` : 'none' }}>
          <div className="micro" style={{ fontSize: 11, marginBottom: 4, color: MUTED }}>{l}</div>
          <div className="font-display" style={{ fontSize: 18, fontWeight: 600, color: col }}>
            {v}{u && <span style={{ fontSize: 12, color: MUTED, marginLeft: 3, fontWeight: 400 }}>{u}</span>}
          </div>
        </div>
      ))}
    </div>
  );
}

function LiftList({ exercises, muted }: {
  exercises: { name: string; setCount: number; maxWeightKg: number | null; avgReps: number | null }[];
  muted?: boolean;
}) {
  const col = muted ? MUTED : 'white';
  return (
    <div>
      {exercises.slice(0, 5).map((e, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', padding: '8px 0', borderTop: `1px solid ${LINE_SOFT}` }}>
          <span style={{ fontSize: 13, color: col }}>{e.name}</span>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 14 }}>
            <span className="font-mono" style={{ fontSize: 12, color: MUTED2 }}>{e.setCount} sets</span>
            {e.maxWeightKg != null && (
              <span className="font-display" style={{ fontSize: 13, fontWeight: 600, color: col, minWidth: 70, textAlign: 'right' }}>
                {Math.round(e.maxWeightKg * KG_TO_LBS)} lb{e.avgReps ? ` × ${Math.round(e.avgReps)}` : ''}
              </span>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

function ExerciseToday({ workout, allWorkouts, upcoming, recovery, navigate }: {
  workout: WorkoutSummary | null;
  allWorkouts: WorkoutSummary[];
  upcoming: UpcomingSession[];
  recovery: RecoveryData | null;
  navigate: (p: string) => void;
}) {
  const today = localDateStr();
  const [routineDetail, setRoutineDetail] = useState<RoutineDetail | null>(null);

  const todaySession = upcoming.find(s => s.date === today && s.status === 'scheduled' && !s.isRestDay) ?? null;
  const isTodayRestDay = !todaySession && upcoming.some(s => s.date === today && s.isRestDay);

  useEffect(() => {
    if (!workout && todaySession?.routineId) {
      routinesApi.get(todaySession.routineId).then(setRoutineDetail).catch(() => {});
    }
  }, [workout, todaySession?.routineId]);

  const recoveryStrip = recovery ? (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, paddingBottom: 12, marginBottom: 14, borderBottom: `1px solid ${LINE_SOFT}` }}>
      <span className="micro" style={{ fontSize: 11, color: MUTED }}>Recovery</span>
      <span className="font-display" style={{ fontSize: 18, fontWeight: 600, color: RECOVERY_COLOR[recovery.level] }}>{recovery.score}</span>
      <span style={{ padding: '2px 8px', borderRadius: 99, background: RECOVERY_COLOR[recovery.level] + '22', color: RECOVERY_COLOR[recovery.level], fontSize: 11, fontWeight: 600, letterSpacing: '.05em', textTransform: 'uppercase' as const }}>{recovery.level}</span>
      <span style={{ fontSize: 13, color: MUTED2, marginLeft: 'auto', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{recovery.hint}</span>
    </div>
  ) : null;

  if (workout) {
    const highlights = computeHighlights(workout, allWorkouts);
    return (
      <div>
        {recoveryStrip}
        <div style={{ display: 'flex', alignItems: 'baseline', marginBottom: 14 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 12 }}>
            <span
              className="font-display"
              style={{ fontSize: 26, fontWeight: 600, color: 'white', cursor: 'pointer', textDecoration: 'none' }}
              onClick={() => navigate(`/workouts/${workout.id}`)}
            >{workout.routineName ?? workout.name ?? 'Workout'}</span>
            {highlights[0] && <span className="font-mono" style={{ fontSize: 11, color: ACCENT }}>★ {highlights[0]}</span>}
          </div>
        </div>
        <StatsRow stats={[
          ['Volume', fmt(workout.totalVolumeKg * KG_TO_LBS), 'lb'],
          ['Sets', String(workout.setCount), ''],
          ['Burned', workout.caloriesBurned ? String(workout.caloriesBurned) : '—', workout.caloriesBurned ? 'kcal' : ''],
        ]} />
        <LiftList exercises={workout.exercises} />
      </div>
    );
  }

  if (isTodayRestDay) {
    return (
      <div>
        {recoveryStrip}
        <div style={{ fontSize: 18, fontWeight: 500, color: MUTED }}>Rest day — take it easy.</div>
      </div>
    );
  }

  if (!todaySession) {
    return (
      <div>
        {recoveryStrip}
        <div style={{ fontSize: 13, color: MUTED2, marginBottom: 14 }}>No workout scheduled today.</div>
        <button
          onClick={() => navigate('/workouts')}
          style={{ padding: '7px 14px', borderRadius: 6, border: 'none', background: ACCENT, color: '#1a1206', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
        >Start workout</button>
      </div>
    );
  }

  return (
    <div>
      {recoveryStrip}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
        <div>
          <div className="micro" style={{ fontSize: 11, color: MUTED, marginBottom: 4 }}>Scheduled today</div>
          <div style={{ fontSize: 20, fontWeight: 600, color: 'white' }}>{todaySession.routineName ?? todaySession.exerciseName ?? 'Workout'}</div>
        </div>
        <button
          onClick={() => navigate('/workouts')}
          style={{ padding: '7px 14px', borderRadius: 6, border: 'none', background: ACCENT, color: '#1a1206', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
        >Start</button>
      </div>
      {routineDetail ? (
        <div>
          {routineDetail.exercises.slice(0, 5).map((re, i) => {
            const last = re.lastPerformedSets;
            const maxWeightKg = last?.reduce((m, s) => Math.max(m, s.weightKg ?? 0), 0) ?? 0;
            const setCount = last?.length ?? re.templateSets.length;
            const topReps = last?.find(s => s.weightKg === maxWeightKg)?.reps ?? null;
            return (
              <div key={i} style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', padding: '8px 0', borderTop: `1px solid ${LINE_SOFT}` }}>
                <span style={{ fontSize: 13, color: 'white' }}>{re.exercise.name}</span>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 14 }}>
                  <span className="font-mono" style={{ fontSize: 12, color: MUTED2 }}>{setCount} sets</span>
                  {maxWeightKg > 0 && (
                    <span className="font-display" style={{ fontSize: 13, fontWeight: 600, color: MUTED, minWidth: 70, textAlign: 'right' }}>
                      {Math.round(maxWeightKg * KG_TO_LBS)} lb{topReps ? ` × ${topReps}` : ''}
                    </span>
                  )}
                </div>
              </div>
            );
          })}
          {routineDetail.exercises.length > 5 && (
            <div className="font-mono" style={{ fontSize: 12, color: MUTED2, paddingTop: 8 }}>
              +{routineDetail.exercises.length - 5} more
            </div>
          )}
        </div>
      ) : (
        <div style={{ fontSize: 11, color: MUTED2 }}>Loading exercises…</div>
      )}
    </div>
  );

}

// ─── Recovery ─────────────────────────────────────────────────────────────────

const RECOVERY_COLOR: Record<string, string> = { high: COL_GOOD, medium: '#D4A843', low: COL_WARN };

// ─── Flagship goal (weight) ───────────────────────────────────────────────────


// ─── This week ────────────────────────────────────────────────────────────────

function WeeklyProgressRow({ label, val, goal, fmtv, fmtg, daysIn }: {
  label: string; val: number; goal: number; fmtv: string; fmtg: string; daysIn: number;
}) {
  const pct = clamp(val / goal);
  const expected = goal * (daysIn / 7);
  const paceStatus = pct >= 1 ? 'done' : val >= expected * 0.95 ? 'ahead' : val >= expected * 0.75 ? 'close' : 'behind';
  const paceColor = paceStatus === 'done' || paceStatus === 'ahead' ? COL_GOOD : paceStatus === 'close' ? '#D4A843' : COL_WARN;
  const paceLabel = paceStatus === 'done' ? 'Done' : paceStatus === 'ahead' ? 'On pace' : paceStatus === 'close' ? 'Close' : 'Behind';
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span className="micro" style={{ fontSize: 11, color: MUTED }}>{label}</span>
        <span style={{ padding: '2px 8px', borderRadius: 99, background: paceColor + '28', color: paceColor, fontSize: 11, fontWeight: 600, letterSpacing: '.02em' }}>{paceLabel}</span>
      </div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
        <span className="font-display" style={{ fontSize: 22, fontWeight: 600, color: 'white' }}>{fmtv}</span>
        <span className="font-mono" style={{ fontSize: 12, color: MUTED2 }}>/ {fmtg}</span>
      </div>
      <div style={{ position: 'relative', height: 5, background: 'rgba(255,255,255,0.06)', borderRadius: 2, overflow: 'visible' }}>
        <div style={{ height: '100%', width: `${pct * 100}%`, background: ACCENT, opacity: 0.85, borderRadius: 2 }} />
        <div style={{ position: 'absolute', top: -6, bottom: -6, left: `calc(${(daysIn / 7) * 100}% - 1.5px)`, width: 3, background: 'rgba(255,255,255,0.75)', borderRadius: 1 }} />
      </div>
    </div>
  );
}

function ThisWeek({ summary, newGoals, workouts, thisWeekBucket, foodLogHistory, weekStart }: {
  summary: NutritionSummary | null; newGoals: Goal[]; workouts: WorkoutSummary[];
  thisWeekBucket: WeekBucket; foodLogHistory: FoodLogHistoryDay[]; weekStart: string;
}) {
  const today = localDateStr();
  const daysIn = Math.min(7, Math.max(1,
    Math.ceil((new Date(today + 'T00:00:00').getTime() - new Date(weekStart + 'T00:00:00').getTime()) / 86400000) + 1
  ));
  const weekCal = foodLogHistory.filter(d => d.date >= weekStart && d.date <= today).reduce((s, d) => s + d.calories, 0);
  const weekProt = foodLogHistory.filter(d => d.date >= weekStart && d.date <= today).reduce((s, d) => s + d.protein, 0);
  const calGoal = summary?.nutrition.goals?.calories ?? 0;
  const protGoal = summary?.nutrition.goals?.proteinG ?? 0;
  const workoutGoal = newGoals.find(g => g.catalogKey === 'exercise_workouts_per_week')?.targetValue ?? 0;
  const workoutActual = workouts.filter(w => w.workoutDate >= weekStart && w.workoutDate <= today).length;
  const volGoal = newGoals.find(g => g.catalogKey === 'exercise_volume_per_week')?.targetValue ?? 0;
  const items = [
    calGoal   > 0 && { label: 'Calories', val: weekCal,                   goal: calGoal * 7,    fmtv: fmt(weekCal),            fmtg: `${fmt(calGoal * 7)} kcal` },
    protGoal  > 0 && { label: 'Protein',  val: weekProt,                  goal: protGoal * 7,   fmtv: `${Math.round(weekProt)}g`, fmtg: `${protGoal * 7}g` },
    workoutGoal>0 && { label: 'Workouts', val: workoutActual,              goal: workoutGoal,    fmtv: String(workoutActual),   fmtg: `of ${workoutGoal}` },
    volGoal   > 0 && { label: 'Volume',   val: thisWeekBucket.volumeLbs,  goal: volGoal,        fmtv: fmt(thisWeekBucket.volumeLbs), fmtg: `${fmt(volGoal)} lb` },
  ].filter(Boolean) as { label: string; val: number; goal: number; fmtv: string; fmtg: string }[];

  if (!items.length) return <div style={{ fontSize: 13, color: MUTED2 }}>Set goals to track weekly progress.</div>;
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '20px 0' }}>
      {items.map((m, i) => (
        <div key={i} style={{ paddingLeft: i % 3 !== 0 ? 28 : 0, paddingRight: i % 3 !== 2 ? 28 : 0, borderLeft: i % 3 !== 0 ? `1px solid ${LINE_SOFT}` : 'none' }}>
          <WeeklyProgressRow {...m} daysIn={daysIn} />
        </div>
      ))}
    </div>
  );
}


// ─── Cal vs Burned (custom SVG chart) ────────────────────────────────────────

function CalVsBurned({ foodLogHistory, workouts, todayTDEE, stepsHistory }: {
  foodLogHistory: FoodLogHistoryDay[]; workouts: WorkoutSummary[]; todayTDEE: TDEEBreakdown | null; stepsHistory: StepsDay[];
}) {
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  const exerciseByDate: Record<string, number> = {};
  for (const w of workouts) {
    if (w.caloriesBurned) exerciseByDate[w.workoutDate] = (exerciseByDate[w.workoutDate] ?? 0) + w.caloriesBurned;
  }
  const stepsKcalByDate: Record<string, number> = {};
  for (const s of stepsHistory) {
    if (s.steps) stepsKcalByDate[s.date] = Math.round(s.steps * 0.05);
  }
  const baseline = todayTDEE ? todayTDEE.bmr + todayTDEE.neat : null;
  const series = foodLogHistory.slice(-30)
    .map(d => {
      const tef = Math.round(d.calories * 0.1);
      const ex = exerciseByDate[d.date] ?? 0;
      const stepsKcal = stepsKcalByDate[d.date] ?? 0;
      const tdee = baseline != null ? baseline + tef + ex + stepsKcal : 0;
      return { cal: Math.round(d.calories), tdee, label: d.date.slice(5), date: d.date };
    })
    .filter(d => d.cal > 0 || d.tdee > 0);

  if (!series.length) return <div style={{ fontSize: 13, color: MUTED2 }}>No nutrition data in the last 30 days.</div>;

  const cals  = series.map(d => d.cal);
  const tdees = series.map(d => d.tdee);
  const allVals = [...cals, ...tdees.filter(Boolean)].filter(Boolean);
  const min = Math.min(...allVals) * 0.92;
  const max = Math.max(...allVals) * 1.05;
  const w = 760, h = 180, pad = 10;

  function pathFor(vals: number[]) {
    return vals.map((v, i) => {
      const x = (i / (vals.length - 1)) * w;
      const y = h - ((v - min) / (max - min)) * (h - pad * 2) - pad;
      return `${i ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`;
    }).join('');
  }

  function xOf(i: number) { return (i / (series.length - 1)) * w; }
  function yOf(v: number) { return h - ((v - min) / (max - min)) * (h - pad * 2) - pad; }

  const consumedAvg = Math.round(cals.reduce((a, b) => a + b, 0) / cals.length);
  const burnedFiltered = tdees.filter(Boolean);
  const burnedAvg = burnedFiltered.length ? Math.round(burnedFiltered.reduce((a, b) => a + b, 0) / burnedFiltered.length) : 0;
  const deficit = consumedAvg - burnedAvg;

  function handleMouseMove(e: React.MouseEvent<SVGSVGElement>) {
    if (!svgRef.current) return;
    const rect = svgRef.current.getBoundingClientRect();
    const xRatio = (e.clientX - rect.left) / rect.width;
    setHoverIdx(Math.max(0, Math.min(series.length - 1, Math.round(xRatio * (series.length - 1)))));
  }

  const hovered = hoverIdx !== null ? series[hoverIdx] : null;
  const hoverXPct = hoverIdx !== null ? (hoverIdx / (series.length - 1)) * 100 : 0;
  const tooltipLeft = `clamp(0px, calc(${hoverXPct.toFixed(1)}% - 70px), calc(100% - 140px))`;

  return (
    <div>
      <div style={{ display: 'flex', gap: 32, marginBottom: 14, flexWrap: 'wrap' as const }}>
        <div>
          <div className="micro" style={{ fontSize: 9, marginBottom: 4, color: MUTED }}>Consumed avg</div>
          <div className="font-display" style={{ fontSize: 24, fontWeight: 600, color: 'white' }}>{fmt(consumedAvg)}<span style={{ fontSize: 11, color: MUTED, fontWeight: 400, marginLeft: 4 }}>kcal</span></div>
        </div>
        {burnedAvg > 0 && (
          <div>
            <div className="micro" style={{ fontSize: 9, marginBottom: 4, color: MUTED }}>Burned avg (TDEE)</div>
            <div className="font-display" style={{ fontSize: 24, fontWeight: 600, color: MUTED }}>{fmt(burnedAvg)}<span style={{ fontSize: 11, color: MUTED2, fontWeight: 400, marginLeft: 4 }}>kcal</span></div>
          </div>
        )}
        {burnedAvg > 0 && (
          <div>
            <div className="micro" style={{ fontSize: 9, marginBottom: 4, color: MUTED }}>Avg daily net</div>
            <div className="font-display" style={{ fontSize: 24, fontWeight: 600, color: deficit < 0 ? COL_GOOD : COL_WARN }}>{deficit > 0 ? '+' : ''}{fmt(deficit)}</div>
          </div>
        )}
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 16, alignSelf: 'flex-end' }}>
          <div className="font-mono" style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: MUTED2 }}>
            <div style={{ width: 14, height: 2, background: ACCENT }} />Consumed
          </div>
          {burnedAvg > 0 && (
            <div className="font-mono" style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: MUTED2 }}>
              <svg width="14" height="2"><line x1="0" x2="14" y1="1" y2="1" stroke={MUTED} strokeWidth="1.5" strokeDasharray="2 2" /></svg>Burned
            </div>
          )}
        </div>
      </div>
      <div style={{ position: 'relative' }}>
        <svg ref={svgRef} viewBox={`0 0 ${w} ${h}`} style={{ width: '100%', height: h, display: 'block', cursor: 'crosshair' }}
          preserveAspectRatio="none"
          onMouseMove={handleMouseMove}
          onMouseLeave={() => setHoverIdx(null)}
        >
          <defs>
            <linearGradient id="cvbg" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={ACCENT} stopOpacity="0.18" />
              <stop offset="100%" stopColor={ACCENT} stopOpacity="0" />
            </linearGradient>
          </defs>
          {[0.25, 0.5, 0.75].map((g, i) => <line key={i} x1="0" x2={w} y1={h * g} y2={h * g} stroke={LINE_SOFT} strokeWidth="1" />)}
          <path d={`${pathFor(cals)} L${w},${h} L0,${h} Z`} fill="url(#cvbg)" />
          {burnedAvg > 0 && <path d={pathFor(tdees)} fill="none" stroke={MUTED} strokeWidth="1.4" strokeDasharray="2 3" opacity="0.7" />}
          <path d={pathFor(cals)} fill="none" stroke={ACCENT} strokeWidth="1.8" />
          {hoverIdx !== null && hovered && (
            <>
              <line x1={xOf(hoverIdx)} x2={xOf(hoverIdx)} y1={0} y2={h} stroke={LINE} strokeWidth="1" strokeDasharray="3 2" opacity="0.8" />
              <circle cx={xOf(hoverIdx)} cy={yOf(hovered.cal)} r="3.5" fill={ACCENT} />
              {hovered.tdee > 0 && <circle cx={xOf(hoverIdx)} cy={yOf(hovered.tdee)} r="3" fill={MUTED} />}
            </>
          )}
        </svg>
        {hovered && (
          <div style={{ position: 'absolute', top: 8, left: tooltipLeft, background: CARD, border: `1px solid ${LINE}`, borderRadius: 4, padding: '8px 12px', pointerEvents: 'none', minWidth: 140, zIndex: 10 }}>
            <div className="font-mono" style={{ fontSize: 12, color: MUTED2, marginBottom: 6 }}>
              {new Date(hovered.date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16 }}>
                <span style={{ fontSize: 13, color: MUTED }}>Consumed</span>
                <span className="font-mono" style={{ fontSize: 13, color: 'white' }}>{fmt(hovered.cal)}</span>
              </div>
              {hovered.tdee > 0 && (
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16 }}>
                  <span style={{ fontSize: 13, color: MUTED }}>TDEE</span>
                  <span className="font-mono" style={{ fontSize: 13, color: MUTED }}>{fmt(hovered.tdee)}</span>
                </div>
              )}
              {hovered.tdee > 0 && (
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, borderTop: `1px solid ${LINE_SOFT}`, paddingTop: 4, marginTop: 2 }}>
                  <span style={{ fontSize: 13, color: MUTED }}>Net</span>
                  <span className="font-mono" style={{ fontSize: 13, fontWeight: 600, color: hovered.cal - hovered.tdee < 0 ? COL_GOOD : COL_WARN }}>
                    {hovered.cal - hovered.tdee > 0 ? '+' : ''}{fmt(hovered.cal - hovered.tdee)}
                  </span>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
      <div className="font-mono" style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6, fontSize: 11, color: MUTED2 }}>
        <span>30 days ago</span><span>today</span>
      </div>
    </div>
  );
}

// ─── Exercise volume week-over-week bar chart ─────────────────────────────────

function VolumeByWeek({ weeklyData }: { weeklyData: WeekBucket[] }) {
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  const weeks = weeklyData.slice(-12);
  const hasData = weeks.some(w => w.volumeLbs > 0);
  if (!hasData) return <div style={{ fontSize: 13, color: MUTED2 }}>No workout volume data yet.</div>;

  const maxVol = Math.max(...weeks.map(w => w.volumeLbs), 1);
  const currentWeek = weeks[weeks.length - 1];
  const prevWeeks = weeks.slice(0, -1).filter(w => w.volumeLbs > 0);
  const avgVol = prevWeeks.length ? Math.round(prevWeeks.reduce((s, w) => s + w.volumeLbs, 0) / prevWeeks.length) : 0;
  const bestVol = Math.max(...weeks.map(w => w.volumeLbs));
  const delta = avgVol > 0 ? Math.round(currentWeek.volumeLbs - avgVol) : null;

  const chartW = 760, chartH = 180, barGap = 4, topPad = 20;
  const barW = (chartW - barGap * (weeks.length - 1)) / weeks.length;

  function handleMouseMove(e: React.MouseEvent<SVGSVGElement>) {
    if (!svgRef.current) return;
    const rect = svgRef.current.getBoundingClientRect();
    const xRatio = (e.clientX - rect.left) / rect.width;
    setHoverIdx(Math.max(0, Math.min(weeks.length - 1, Math.floor(xRatio * weeks.length))));
  }

  const hovered = hoverIdx !== null ? weeks[hoverIdx] : null;
  const hoverXPct = hoverIdx !== null ? ((hoverIdx + 0.5) / weeks.length) * 100 : 0;
  const tooltipLeft = `clamp(0px, calc(${hoverXPct.toFixed(1)}% - 70px), calc(100% - 140px))`;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ display: 'flex', gap: 32, flexWrap: 'wrap' as const }}>
        <div>
          <div className="micro" style={{ fontSize: 9, marginBottom: 4, color: MUTED }}>This week</div>
          <div className="font-display" style={{ fontSize: 24, fontWeight: 600, color: 'white' }}>
            {fmt(Math.round(currentWeek.volumeLbs))}<span style={{ fontSize: 11, color: MUTED, fontWeight: 400, marginLeft: 4 }}>lb</span>
          </div>
        </div>
        {avgVol > 0 && (
          <div>
            <div className="micro" style={{ fontSize: 9, marginBottom: 4, color: MUTED }}>Avg / week</div>
            <div className="font-display" style={{ fontSize: 24, fontWeight: 600, color: MUTED }}>
              {fmt(avgVol)}<span style={{ fontSize: 11, color: MUTED2, fontWeight: 400, marginLeft: 4 }}>lb</span>
            </div>
          </div>
        )}
        {delta !== null && (
          <div>
            <div className="micro" style={{ fontSize: 9, marginBottom: 4, color: MUTED }}>vs avg</div>
            <div className="font-display" style={{ fontSize: 24, fontWeight: 600, color: delta >= 0 ? COL_GOOD : COL_WARN }}>
              {delta > 0 ? '+' : ''}{fmt(delta)}
            </div>
          </div>
        )}
        <div>
          <div className="micro" style={{ fontSize: 9, marginBottom: 4, color: MUTED }}>Best week</div>
          <div className="font-display" style={{ fontSize: 24, fontWeight: 600, color: MUTED }}>
            {fmt(Math.round(bestVol))}<span style={{ fontSize: 11, color: MUTED2, fontWeight: 400, marginLeft: 4 }}>lb</span>
          </div>
        </div>
      </div>
      <div style={{ marginTop: 'auto', paddingTop: 14, position: 'relative' }}>
        <svg ref={svgRef} viewBox={`0 0 ${chartW} ${chartH}`} style={{ width: '100%', height: chartH, display: 'block', cursor: 'crosshair' }}
          onMouseMove={handleMouseMove}
          onMouseLeave={() => setHoverIdx(null)}
        >
          {[0.25, 0.5, 0.75, 1].map((g, i) => (
            <line key={i} x1="0" x2={chartW} y1={chartH - g * (chartH - topPad)} y2={chartH - g * (chartH - topPad)} stroke={LINE_SOFT} strokeWidth="1" />
          ))}
          {weeks.map((wk, i) => {
            const barH = wk.volumeLbs > 0 ? Math.max(3, (wk.volumeLbs / maxVol) * (chartH - topPad)) : 0;
            const x = i * (barW + barGap);
            const isCurrent = i === weeks.length - 1;
            const isBest = wk.volumeLbs === bestVol && wk.volumeLbs > 0;
            const isHovered = i === hoverIdx;
            const fill = isCurrent ? ACCENT
              : isHovered ? `color-mix(in oklab, ${ACCENT} 70%, ${CARD})`
              : isBest ? `color-mix(in oklab, ${ACCENT} 55%, ${CARD})`
              : `color-mix(in oklab, ${ACCENT} 28%, ${CARD})`;
            return <rect key={i} x={x} y={chartH - barH} width={barW} height={barH} fill={fill} rx="2" />;
          })}
        </svg>
        {hovered && (
          <div style={{ position: 'absolute', top: 8, left: tooltipLeft, background: CARD, border: `1px solid ${LINE}`, borderRadius: 4, padding: '8px 12px', pointerEvents: 'none', minWidth: 140, zIndex: 10 }}>
            <div className="font-mono" style={{ fontSize: 12, color: MUTED2, marginBottom: 6 }}>
              Week of {hovered.label}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16 }}>
                <span style={{ fontSize: 13, color: MUTED }}>Volume</span>
                <span className="font-mono" style={{ fontSize: 13, color: 'white' }}>{fmt(Math.round(hovered.volumeLbs))} lb</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16 }}>
                <span style={{ fontSize: 13, color: MUTED }}>Workouts</span>
                <span className="font-mono" style={{ fontSize: 13, color: MUTED }}>{hovered.workouts}</span>
              </div>
              {hovered.minutes > 0 && (
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16 }}>
                  <span style={{ fontSize: 13, color: MUTED }}>Time</span>
                  <span className="font-mono" style={{ fontSize: 13, color: MUTED }}>{hovered.minutes} min</span>
                </div>
              )}
            </div>
          </div>
        )}
        <div className="font-mono" style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6, fontSize: 11, color: MUTED2 }}>
          <span>12 weeks ago</span><span>this week</span>
        </div>
      </div>
    </div>
  );
}

// ─── Weight trend (custom SVG chart) ─────────────────────────────────────────


// ─── Heatmap (12 weeks, volume-intensity) ─────────────────────────────────────

function Heatmap({ workouts }: { workouts: WorkoutSummary[] }) {
  const [hoveredCell, setHoveredCell] = useState<{ date: string; vol: number; wi: number; di: number } | null>(null);

  const today = new Date();
  const monday = new Date(today);
  monday.setDate(today.getDate() - ((today.getDay() + 6) % 7)); // this week's Monday

  type HeatCell = { date: string; vol: number };
  const weeks: HeatCell[][] = [];
  for (let w = 11; w >= 0; w--) {
    const row: HeatCell[] = [];
    for (let d = 0; d < 7; d++) {
      const cell = new Date(monday);
      cell.setDate(monday.getDate() - w * 7 + d);
      row.push({ date: localDateStr(cell), vol: 0 });
    }
    weeks.push(row);
  }
  for (const w of workouts) {
    for (const wk of weeks) {
      const cell = wk.find(c => c.date === w.workoutDate);
      if (cell) cell.vol += w.totalVolumeKg * KG_TO_LBS;
    }
  }

  const maxVol = Math.max(...weeks.flatMap(wk => wk.map(c => c.vol)), 1);
  const cellColor = (vol: number) => {
    if (!vol) return 'rgba(255,255,255,0.04)';
    const op = 0.2 + (vol / maxVol) * 0.72;
    return `color-mix(in oklab, ${ACCENT} ${Math.round(op * 100)}%, transparent)`;
  };
  const days = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

  const tooltipLeft = hoveredCell ? `clamp(0px, calc(${((hoveredCell.wi + 0.5) / weeks.length * 100).toFixed(1)}% - 70px), calc(100% - 140px))` : '0';
  const tooltipTop = hoveredCell ? `${hoveredCell.di * 23}px` : '0';

  return (
    <div>
      <div style={{ position: 'relative', display: 'flex', gap: 5 }} onMouseLeave={() => setHoveredCell(null)}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 5, marginRight: 6 }}>
          {days.map((d, i) => (
            <div key={i} className="font-mono" style={{ fontSize: 11, color: MUTED2, height: 18, lineHeight: '18px' }}>{d}</div>
          ))}
        </div>
        <div style={{ flex: 1, display: 'flex', gap: 5 }}>
          {weeks.map((wk, wi) => (
            <div key={wi} style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 5 }}>
              {wk.map((cell, di) => (
                <div key={di}
                  style={{ height: 18, background: cellColor(cell.vol), borderRadius: 2, cursor: cell.vol ? 'pointer' : 'default' }}
                  onMouseEnter={() => setHoveredCell({ ...cell, wi, di })}
                />
              ))}
            </div>
          ))}
        </div>
        {hoveredCell && (() => {
          const dayWorkouts = workouts.filter(w => w.workoutDate === hoveredCell.date);
          return (
            <div style={{ position: 'absolute', left: tooltipLeft, top: tooltipTop, background: CARD, border: `1px solid ${LINE}`, borderRadius: 4, padding: '8px 12px', pointerEvents: 'none', whiteSpace: 'nowrap', zIndex: 10 }}>
              <div className="font-mono" style={{ fontSize: 12, color: MUTED2, marginBottom: 6 }}>
                {new Date(hoveredCell.date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
              </div>
              {hoveredCell.vol > 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16 }}>
                    <span style={{ fontSize: 13, color: MUTED }}>Volume</span>
                    <span className="font-mono" style={{ fontSize: 13, color: 'white' }}>{fmt(Math.round(hoveredCell.vol))} lb</span>
                  </div>
                  {dayWorkouts.length > 0 && (
                    <div style={{ borderTop: `1px solid ${LINE_SOFT}`, paddingTop: 4, marginTop: 2, display: 'flex', flexDirection: 'column', gap: 3 }}>
                      {dayWorkouts.map(w => (
                        <div key={w.id} style={{ fontSize: 13, color: MUTED }}>
                          {w.routineName ?? w.exercises.map(e => e.name).join(', ') ?? 'Workout'}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                <div style={{ fontSize: 13, color: MUTED2 }}>Rest day</div>
              )}
            </div>
          );
        })()}
      </div>
      <div className="font-mono" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 12, fontSize: 11, color: MUTED2 }}>
        <span>12 weeks ago</span>
        <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
          <span>less</span>
          {[0.2, 0.4, 0.6, 0.85].map((o, i) => (
            <div key={i} style={{ width: 12, height: 12, borderRadius: 2, background: `color-mix(in oklab, ${ACCENT} ${o * 100}%, transparent)` }} />
          ))}
          <span>more</span>
        </div>
        <span>today</span>
      </div>
    </div>
  );
}

// ─── Weekly averages table ─────────────────────────────────────────────────────

function WeeklyAvgTable({ foodLogHistory, workouts, todayTDEE, stepsHistory }: {
  foodLogHistory: FoodLogHistoryDay[]; workouts: WorkoutSummary[]; todayTDEE: TDEEBreakdown | null; stepsHistory: StepsDay[];
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
  const stepsKcalByDate: Record<string, number> = {};
  for (const s of stepsHistory) {
    if (s.steps) stepsKcalByDate[s.date] = Math.round(s.steps * 0.05);
  }
  const baseline = todayTDEE ? todayTDEE.bmr + todayTDEE.neat : null;
  const todayStr = localDateStr();

  for (const day of foodLogHistory) {
    const ws = getWeekStart(day.date);
    const week = weeks.find(wk => wk.weekStart === ws);
    if (!week) continue;
    week.calories += day.calories;
    week.protein += day.protein;
    week.carbs += day.entries.reduce((s, e) => s + e.carbsG, 0);
    week.fat += day.entries.reduce((s, e) => s + e.fatG, 0);
    week.days++;
    if (baseline != null) {
      // For today use the server's authoritative TDEE total so it matches FuelToday exactly.
      // For past days reconstruct from components (no per-day TDEE endpoint available).
      const dayTDEE = (day.date === todayStr && todayTDEE)
        ? todayTDEE.total
        : baseline + Math.round(day.calories * 0.1) + (exerciseByDate[day.date] ?? 0) + (stepsKcalByDate[day.date] ?? 0);
      week.tdee = (week.tdee ?? 0) + dayTDEE;
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

  const displayWeeks = [...weeks].reverse().filter(w => w.days > 0 || w.isCurrentWeek).slice(0, 5);
  const hdStyle: React.CSSProperties = { fontSize: 11, color: MUTED2, fontFamily: 'var(--font-mono)', letterSpacing: '.08em', textTransform: 'uppercase', textAlign: 'right' as const, paddingBottom: 6, paddingLeft: 12 };

  return (
    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
      <thead>
        <tr style={{ borderBottom: `1px solid ${LINE_SOFT}` }}>
          <th style={{ ...hdStyle, textAlign: 'left', paddingLeft: 0 }}>Week of</th>
          <th style={hdStyle}>Calories</th>
          <th style={hdStyle}>Protein</th>
          <th style={hdStyle}>Carbs</th>
          <th style={hdStyle}>Fat</th>
          {todayTDEE && <th style={hdStyle}>TDEE</th>}
          {todayTDEE && <th style={hdStyle}>Net</th>}
        </tr>
      </thead>
      <tbody>
        {displayWeeks.map(week => (
          <tr key={week.weekStart} style={{ borderBottom: `1px solid ${LINE_SOFT}`, background: week.isCurrentWeek ? 'rgba(212,168,67,0.04)' : undefined }}>
            <td style={{ padding: '10px 0', fontSize: 13, color: week.isCurrentWeek ? 'white' : MUTED, fontFamily: 'var(--font-ui)', whiteSpace: 'nowrap' }}>
              {week.label}{week.isCurrentWeek && <span style={{ marginLeft: 8, color: ACCENT, fontWeight: 600 }}>current</span>}
            </td>
            <td style={{ padding: '10px 0 10px 12px', textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: 13, fontVariantNumeric: 'tabular-nums', color: week.isCurrentWeek ? 'white' : MUTED }}>{week.days > 0 ? fmt(week.calories) : <span style={{ color: MUTED2 }}>—</span>}</td>
            <td style={{ padding: '10px 0 10px 12px', textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: 13, fontVariantNumeric: 'tabular-nums', color: '#D4A843' }}>{week.days > 0 ? week.protein : <span style={{ color: MUTED2 }}>—</span>}</td>
            <td style={{ padding: '10px 0 10px 12px', textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: 13, fontVariantNumeric: 'tabular-nums', color: '#7C9ECB' }}>{week.days > 0 ? week.carbs : <span style={{ color: MUTED2 }}>—</span>}</td>
            <td style={{ padding: '10px 0 10px 12px', textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: 13, fontVariantNumeric: 'tabular-nums', color: '#C5896E' }}>{week.days > 0 ? week.fat : <span style={{ color: MUTED2 }}>—</span>}</td>
            {todayTDEE && <td style={{ padding: '10px 0 10px 12px', textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: 13, fontVariantNumeric: 'tabular-nums', color: MUTED2 }}>{week.tdee != null && week.days > 0 ? fmt(week.tdee) : '—'}</td>}
            {todayTDEE && (
              <td style={{ padding: '10px 0 10px 12px', textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: 13, fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>
                {week.net != null && week.days > 0 ? (
                  <span style={{ color: week.net < 0 ? '#86AA80' : week.net > 300 ? '#C5896E' : MUTED }}>
                    {week.net > 0 ? '+' : ''}{fmt(week.net)}
                  </span>
                ) : <span style={{ color: MUTED2 }}>—</span>}
              </td>
            )}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// ─── Recent sessions table ─────────────────────────────────────────────────────

function RecentSessions({ workouts, navigate }: { workouts: WorkoutSummary[]; navigate: (p: string) => void }) {
  const completed = [...workouts].sort((a, b) => b.workoutDate.localeCompare(a.workoutDate));
  const rows = completed.slice(0, 10);
  if (!rows.length) return <div style={{ fontSize: 13, color: MUTED2 }}>No sessions yet.</div>;
  const cols = '60px 1fr 140px 120px 1fr 70px';
  const hdStyle = { fontSize: 12, color: MUTED2, fontFamily: 'var(--font-mono)', letterSpacing: '.08em', textTransform: 'uppercase' as const };
  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: cols, gap: 10, padding: '6px 0 8px', borderBottom: `1px solid ${LINE_SOFT}` }}>
        {['Date', 'Session', 'Metric', 'Calories', 'Highlight', 'vs Prior'].map((h, i) =>
          i === 2
            ? <div key={h} style={{ ...hdStyle, textAlign: 'right', paddingRight: 20 }}>{h}</div>
            : <span key={h} style={{ ...hdStyle, paddingLeft: i === 3 || i === 4 ? 20 : 0 }}>{h}</span>
        )}
      </div>
      {rows.map((s) => {
        const highlights = computeHighlights(s, completed);
        const volLbs = Math.round((s.totalVolumeKg ?? 0) * KG_TO_LBS);
        const rt = s.routineType ?? (volLbs > 0 ? 'strength' : s.totalSteps ? 'steps' : 'cardio_duration');
        const totalSecs = s.totalDurationSeconds ?? s.exercises.reduce((acc, e) => acc + (e.totalDurationSeconds ?? 0), 0);

        let primaryVal: number | null = null;
        let primaryUnit = 'lbs';
        if (rt === 'steps') {
          primaryVal = s.totalSteps != null && totalSecs > 0 ? Math.round(s.totalSteps / (totalSecs / 60)) : null;
          primaryUnit = 'stairs/min';
        } else if (rt === 'cardio_distance') {
          const distMiles = s.totalDistanceMeters ? s.totalDistanceMeters / 1609.34 : null;
          primaryVal = distMiles && s.durationMinutes ? Number((distMiles / s.durationMinutes).toFixed(2)) : null;
          primaryUnit = 'mi/min';
        } else if (rt === 'cardio_duration') {
          primaryVal = totalSecs ? Math.round(totalSecs / 60) : (s.durationMinutes ?? null);
          primaryUnit = 'min';
        } else {
          primaryVal = volLbs > 0 ? volLbs : null;
        }

        const prior = completed.find(x => x.id !== s.id && x.routineId != null && x.routineId === s.routineId && x.workoutDate < s.workoutDate);
        let priorVal: number | null = null;
        if (prior) {
          const priorVolLbs = Math.round((prior.totalVolumeKg ?? 0) * KG_TO_LBS);
          const priorSecs = prior.totalDurationSeconds ?? prior.exercises.reduce((acc, e) => acc + (e.totalDurationSeconds ?? 0), 0);
          if (rt === 'steps') {
            priorVal = prior.totalSteps != null && priorSecs > 0 ? Math.round(prior.totalSteps / (priorSecs / 60)) : null;
          } else if (rt === 'cardio_distance') {
            const priorMiles = prior.totalDistanceMeters ? prior.totalDistanceMeters / 1609.34 : null;
            priorVal = priorMiles && prior.durationMinutes ? Number((priorMiles / prior.durationMinutes).toFixed(2)) : null;
          } else if (rt === 'cardio_duration') {
            priorVal = priorSecs ? Math.round(priorSecs / 60) : (prior.durationMinutes ?? null);
          } else {
            priorVal = priorVolLbs > 0 ? priorVolLbs : null;
          }
        }

        const delta = priorVal != null && primaryVal != null ? primaryVal - priorVal : null;
        const deltaPct = delta != null && priorVal && priorVal > 0 ? (delta / priorVal * 100) : null;

        return (
          <div key={s.id} onClick={() => navigate(`/workouts/${s.id}`)}
            style={{ display: 'grid', gridTemplateColumns: cols, gap: 10, padding: '12px 0', borderTop: `1px solid ${LINE_SOFT}`, alignItems: 'baseline', cursor: 'pointer' }}
            onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.02)')}
            onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
          >
            <span className="font-mono" style={{ fontSize: 12, color: MUTED2 }}>
              {new Date(s.workoutDate + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
            </span>
            <span style={{ fontSize: 14, color: 'white' }}>
              {s.routineName ?? s.name ?? (s.exercises.length > 0 ? s.exercises.map(e => e.name).join(', ') : 'Workout')}
            </span>
            <div style={{ fontSize: 13, fontFamily: 'var(--font-mono)', color: 'white', whiteSpace: 'nowrap', textAlign: 'right', paddingRight: 20 }}>
              {primaryVal != null ? <>{primaryUnit === 'lbs' ? fmt(primaryVal) : primaryVal}<span style={{ color: MUTED2 }}> {primaryUnit}</span></> : <span style={{ color: MUTED2 }}>—</span>}
            </div>
            <span className="font-mono" style={{ fontSize: 13, color: MUTED, paddingLeft: 20, whiteSpace: 'nowrap' }}>
              {s.caloriesBurned ? <>{fmt(s.caloriesBurned)}<span style={{ color: MUTED2 }}> kcal</span></> : <span style={{ color: MUTED2 }}>—</span>}
            </span>
            <span style={{ fontSize: 13, color: highlights.length ? ACCENT : MUTED2, paddingLeft: 20 }}>
              {highlights.length ? highlights.map((h, i) => <span key={i} style={{ display: 'block' }}>★ {h}</span>) : '—'}
            </span>
            <span className="font-mono" style={{ fontSize: 13, fontWeight: 600 }}>
              {deltaPct != null ? (
                <span style={{ color: delta! >= 0 ? '#86AA80' : '#C5896E' }}>
                  {delta! >= 0 ? '▲' : '▼'}{Math.abs(Math.round(deltaPct))}%
                </span>
              ) : prior === undefined && s.routineId ? (
                <span style={{ color: MUTED2 }}>first</span>
              ) : (
                <span style={{ color: MUTED2 }}>—</span>
              )}
            </span>
          </div>
        );
      })}
    </div>
  );
}

// ─── Goal Progress ──────────────────────────────────────────────────────────
// Card rendering lives in ../components/goals/dashboard/ (GoalCardShell + the four
// variant renderers + DashboardGoalCard dispatcher). See that folder for the shared
// goalDirection/goalStatusFor/fmtGoalValue/fmtDeadline/emptyMessageFor helpers.

// ─── Widget registry ───────────────────────────────────────────────────────────
// Maps each DASHBOARD_CATALOG key to the (unchanged) widget component above. This is
// what makes the layout data-driven: DashboardPage resolves a stored layout to an
// ordered, grouped list of DashboardWidgetKeys and looks each one up here rather than
// hardcoding five bands of JSX.

interface DashboardContext {
  workouts: WorkoutSummary[];
  summary: NutritionSummary | null;
  foodLogHistory: FoodLogHistoryDay[];
  todayTDEE: TDEEBreakdown | null;
  stepsHistory: StepsDay[];
  measurements: BodyMeasurement[];
  routines: RoutineSummary[];
  newGoals: Goal[];
  upcoming: UpcomingSession[];
  recovery: RecoveryData | null;
  todayWater: WaterDay | null;
  todaySteps: StepsDay | null;
  waterWeekHistory: WaterHistoryDay[];
  weeklyData: WeekBucket[];
  thisWeekBucket: WeekBucket;
  weekStart: string;
  today: string;
  navigate: (p: string) => void;
  phase2Ready: boolean;
  measurementsReady: boolean;
  // Goal-card customize-mode state, consulted only by the goalProgress renderer.
  editing: boolean;
  optionsGoalId: number | null;
  dragGoalId: number | null;
  onGoalMoveUp: (id: number) => void;
  onGoalMoveDown: (id: number) => void;
  onGoalSetSpan: (id: number, span: number) => void;
  onGoalUnpin: (id: number) => void;
  onGoalSetConfig: (id: number, cfg: GoalCardConfig) => void;
  onGoalOpenOptions: (id: number | null) => void;
  onGoalDragStart: (id: number) => void;
  onGoalDrop: (id: number) => void;
}

interface WidgetRenderDef {
  /** false for widgets that render bare inside a Band (blurbs, goal cards) rather
   *  than inside a titled Panel card. */
  panelled: boolean;
  /** Overrides the catalog label as the Panel title. Return undefined to render the
   *  Panel with no title at all (Recent sessions never had one). Only consulted when
   *  panelled is true. */
  title?: (ctx: DashboardContext) => string | undefined;
  meta?: (ctx: DashboardContext) => string | undefined;
  render: (ctx: DashboardContext) => React.ReactNode;
}

const LOADING = <div style={{ fontSize: 13, color: MUTED2 }}>Loading…</div>;

const WIDGET_RENDERERS: Record<DashboardWidgetKey, WidgetRenderDef> = {
  fuelToday: {
    panelled: true,
    render: (ctx) => (
      <FuelToday actual={ctx.summary?.nutrition.actual ?? null} goals={ctx.summary?.nutrition.goals ?? null} tdee={ctx.todayTDEE} />
    ),
  },

  exerciseToday: {
    panelled: true,
    render: (ctx) => {
      if (!ctx.phase2Ready && ctx.workouts.length === 0) return LOADING;
      const todayWorkout = ctx.workouts.find(w => w.workoutDate === ctx.today && w.exerciseCount > 0) ?? null;
      return <ExerciseToday workout={todayWorkout} allWorkouts={ctx.workouts} upcoming={ctx.upcoming} recovery={ctx.recovery} navigate={ctx.navigate} />;
    },
  },

  weeklyProgress: {
    panelled: true,
    meta: (ctx) => `day ${Math.min(7, Math.ceil((new Date(ctx.today + 'T00:00:00').getTime() - new Date(ctx.weekStart + 'T00:00:00').getTime()) / 86400000) + 1)} of 7`,
    render: (ctx) => (
      <ThisWeek summary={ctx.summary} newGoals={ctx.newGoals} workouts={ctx.workouts} thisWeekBucket={ctx.thisWeekBucket} foodLogHistory={ctx.foodLogHistory} weekStart={ctx.weekStart} />
    ),
  },

  calVsBurned: {
    panelled: true,
    render: (ctx) => {
      if (!ctx.phase2Ready && ctx.foodLogHistory.length === 0) return LOADING;
      return <CalVsBurned foodLogHistory={ctx.foodLogHistory} workouts={ctx.workouts} todayTDEE={ctx.todayTDEE} stepsHistory={ctx.stepsHistory} />;
    },
  },

  volumeByWeek: {
    panelled: true,
    render: (ctx) => {
      if (!ctx.phase2Ready && ctx.workouts.length === 0) return LOADING;
      return <VolumeByWeek weeklyData={ctx.weeklyData} />;
    },
  },

  heatmap: {
    panelled: true,
    render: (ctx) => <Heatmap workouts={ctx.workouts} />,
  },

  weeklyAverages: {
    panelled: true,
    render: (ctx) => (
      <WeeklyAvgTable foodLogHistory={ctx.foodLogHistory} workouts={ctx.workouts} todayTDEE={ctx.todayTDEE} stepsHistory={ctx.stepsHistory} />
    ),
  },

  goalProgress: {
    panelled: false,
    render: (ctx) => {
      // Fix #12: one flat pass, sorted by sortOrder then id — no more six hardcoded
      // filter groups deciding card order. Fix #11: variant comes from
      // resolveGoalCard inside DashboardGoalCard, not an if-ladder here.
      const dashboardGoals = ctx.newGoals
        .filter(g => g.showOnDashboard)
        .sort((a, b) => (a.sortOrder - b.sortOrder) || (a.id - b.id));
      if (!dashboardGoals.length) return null;
      return (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(12, 1fr)', gap: 14 }}>
          {dashboardGoals.map((g, i) => (
            <GoalGridCell
              key={g.id}
              goal={g}
              ctx={ctx}
              cfg={resolveGoalCard(g.catalogKey, g.cardConfig)}
              canMoveUp={i > 0}
              canMoveDown={i < dashboardGoals.length - 1}
            />
          ))}
        </div>
      );
    },
  },

  recentSessions: {
    panelled: true,
    title: () => undefined, // matches the pre-customization Panel, which had no title
    render: (ctx) => {
      if (!ctx.phase2Ready && ctx.workouts.length === 0) return LOADING;
      return <RecentSessions workouts={ctx.workouts} navigate={ctx.navigate} />;
    },
  },

  todayBlurb: {
    panelled: false,
    render: (ctx) => {
      const todayWorkouts = ctx.workouts.filter(w => w.workoutDate === ctx.today);
      return <TodaySnapshot workouts={todayWorkouts} nutrition={ctx.summary?.nutrition.actual ?? null} water={ctx.todayWater} steps={ctx.todaySteps} />;
    },
  },

  weeklyBlurb: {
    panelled: false,
    render: (ctx) => (
      <WeeklyBlurb
        weekStart={ctx.weekStart} today={ctx.today} workouts={ctx.workouts}
        foodLogHistory={ctx.foodLogHistory} stepsHistory={ctx.stepsHistory}
        waterWeekHistory={ctx.waterWeekHistory} measurements={ctx.measurements}
      />
    ),
  },
};

// ─── Widget cell (grid item; adds the customize-mode overlay when editing) ─────

function WidgetCell({
  entry, ctx, editing, canMoveUp, canMoveDown, onMoveUp, onMoveDown, onSetSpan, onHide, onDragStart, onDragOver, onDrop,
}: {
  entry: LayoutEntry;
  ctx: DashboardContext;
  editing: boolean;
  canMoveUp: boolean;
  canMoveDown: boolean;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onSetSpan: (span: number) => void;
  onHide: () => void;
  onDragStart: (e: React.DragEvent) => void;
  onDragOver: (e: React.DragEvent) => void;
  onDrop: (e: React.DragEvent) => void;
}) {
  const widget  = WIDGET_BY_KEY[entry.key];
  const def     = WIDGET_RENDERERS[entry.key];
  const content = def.render(ctx);
  const title   = def.title ? def.title(ctx) : widget.label;
  const meta    = def.meta?.(ctx);
  const body    = def.panelled ? <Panel title={title} meta={meta}>{content}</Panel> : content;

  if (!editing) {
    return <div style={{ gridColumn: `span ${entry.span}` }}>{body}</div>;
  }

  return (
    <div
      draggable
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDrop={onDrop}
      style={{ gridColumn: `span ${entry.span}`, outline: `1px dashed rgba(var(--color-accent) / 0.4)`, outlineOffset: 2, borderRadius: 4 }}
    >
      <WidgetEditorBar
        label={widget.label}
        span={entry.span}
        minSpan={widget.minSpan}
        canMoveUp={canMoveUp}
        canMoveDown={canMoveDown}
        onMoveUp={onMoveUp}
        onMoveDown={onMoveDown}
        onSetSpan={onSetSpan}
        onHide={onHide}
      />
      <div style={{ padding: 4 }}>{body}</div>
    </div>
  );
}

// ─── Goal grid cell (grid item; adds the customize-mode overlay + options popover) ──
// The goalProgress widget owns its own 12-col grid (separate from the outer band
// grid), so a goal card's `span` here comes from its resolved cardConfig, not the
// dashboard layout entry that governs the goalProgress widget as a whole.

function GoalGridCell({ goal, ctx, cfg, canMoveUp, canMoveDown }: {
  goal: Goal;
  ctx: DashboardContext;
  cfg: GoalCardConfig;
  canMoveUp: boolean;
  canMoveDown: boolean;
}) {
  const card = (
    <DashboardGoalCard
      goal={goal}
      measurements={ctx.measurements}
      foodLogHistory={ctx.foodLogHistory}
      stepsHistory={ctx.stepsHistory}
      weeklyData={ctx.weeklyData}
      workouts={ctx.workouts}
      routines={ctx.routines}
      tdee={ctx.todayTDEE}
      measurementsReady={ctx.measurementsReady}
      phase2Ready={ctx.phase2Ready}
    />
  );

  if (!ctx.editing) {
    return <div style={{ gridColumn: `span ${cfg.span}` }}>{card}</div>;
  }

  const optionsOpen = ctx.optionsGoalId === goal.id;

  return (
    <div
      draggable
      onDragStart={() => ctx.onGoalDragStart(goal.id)}
      onDragOver={(e) => e.preventDefault()}
      onDrop={() => ctx.onGoalDrop(goal.id)}
      style={{ gridColumn: `span ${cfg.span}`, position: 'relative', outline: `1px dashed rgba(var(--color-accent) / 0.4)`, outlineOffset: 2, borderRadius: 4 }}
    >
      <GoalEditorBar
        label={goal.name}
        span={cfg.span}
        canMoveUp={canMoveUp}
        canMoveDown={canMoveDown}
        onMoveUp={() => ctx.onGoalMoveUp(goal.id)}
        onMoveDown={() => ctx.onGoalMoveDown(goal.id)}
        onSetSpan={(span) => ctx.onGoalSetSpan(goal.id, span)}
        onUnpin={() => ctx.onGoalUnpin(goal.id)}
        onToggleOptions={() => ctx.onGoalOpenOptions(optionsOpen ? null : goal.id)}
        optionsOpen={optionsOpen}
      />
      {optionsOpen && (
        <GoalOptionsPopover
          goal={goal}
          cfg={cfg}
          onChange={(next) => ctx.onGoalSetConfig(goal.id, next)}
          onClose={() => ctx.onGoalOpenOptions(null)}
        />
      )}
      <div style={{ padding: 4 }}>{card}</div>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const navigate = useNavigate();
  const today = localDateStr();
  const [workouts,       setWorkouts]       = useState<WorkoutSummary[]>([]);
  const [measurements,   setMeasurements]   = useState<BodyMeasurement[]>([]);
  const [summary,        setSummary]        = useState<NutritionSummary | null>(null);
  const [,               setPersonalBests]  = useState<PersonalBests | null>(null);
  const [foodLogHistory, setFoodLogHistory] = useState<FoodLogHistoryDay[]>([]);
  const [routines,       setRoutines]       = useState<RoutineSummary[]>([]);
  const [todayTDEE,      setTodayTDEE]      = useState<TDEEBreakdown | null>(null);
  const [upcoming,       setUpcoming]       = useState<UpcomingSession[]>([]);
  const [recovery,       setRecovery]       = useState<RecoveryData | null>(null);
  const [todayWater,     setTodayWater]     = useState<WaterDay | null>(null);
  const [todaySteps,     setTodaySteps]     = useState<StepsDay | null>(null);
  const [stepsHistory,      setStepsHistory]      = useState<StepsDay[]>([]);
  const [waterWeekHistory,  setWaterWeekHistory]  = useState<WaterHistoryDay[]>([]);
  const [newGoals,          setNewGoals]          = useState<Goal[]>([]);
  const [loading,            setLoading]            = useState(true);
  const [phase2Ready,        setPhase2Ready]        = useState(false);
  const [measurementsReady,  setMeasurementsReady]  = useState(false);
  const [editing,            setEditing]            = useState(false);
  const [dragKey,            setDragKey]            = useState<DashboardWidgetKey | null>(null);
  const [dragGoalId,         setDragGoalId]         = useState<number | null>(null);
  const [optionsGoalId,      setOptionsGoalId]      = useState<number | null>(null);

  const features        = useFeaturesStore(s => s.features);
  const dashboardLayout = useFeaturesStore(s => s.dashboardLayout);
  const persistLayout   = useFeaturesStore(s => s.setLayout);

  // Debounced persistence for the customize editor: every edit updates the store
  // instantly (optimistic UI — the dashboard IS the preview), but the network PUT is
  // deferred ~600ms so a rapid burst of edits results in a single request. Leaving
  // edit mode or unmounting flushes whatever is pending immediately.
  const pendingSaveRef = useRef<StoredDashboardLayout | null>(null);
  const saveTimerRef   = useRef<ReturnType<typeof setTimeout> | null>(null);

  const flushPendingSave = () => {
    if (saveTimerRef.current) { clearTimeout(saveTimerRef.current); saveTimerRef.current = null; }
    if (pendingSaveRef.current) {
      const payload = pendingSaveRef.current;
      pendingSaveRef.current = null;
      persistLayout(payload);
    }
  };

  function applyLayoutChange(nextWidgets: LayoutEntry[]) {
    const nextStored: StoredDashboardLayout = { ...dashboardLayout, web: { v: 1, widgets: nextWidgets } };
    useFeaturesStore.setState({ dashboardLayout: nextStored }); // instant optimistic UI
    pendingSaveRef.current = nextStored;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(flushPendingSave, 600);
  }

  // Debounced persistence for per-goal card edits (reorder / span / options / pin).
  // Same shape as the widget-layout save above, but per-goal: repeated edits to the
  // same goal coalesce into a single PATCH, and a failed save reverts only that goal
  // (goalSnapshotRef holds the last server-confirmed copy, captured lazily the first
  // time an id gets a pending edit) rather than the whole newGoals array.
  const pendingGoalPayloadRef = useRef<Map<number, UpdateGoalPayload>>(new Map());
  const goalSnapshotRef       = useRef<Map<number, Goal>>(new Map());
  const goalSaveTimerRef      = useRef<ReturnType<typeof setTimeout> | null>(null);

  function flushPendingGoalSaves() {
    if (goalSaveTimerRef.current) { clearTimeout(goalSaveTimerRef.current); goalSaveTimerRef.current = null; }
    const entries = [...pendingGoalPayloadRef.current.entries()];
    pendingGoalPayloadRef.current.clear();
    for (const [id, payload] of entries) {
      goalsV2Api.update(id, payload)
        .then(() => { goalSnapshotRef.current.delete(id); })
        .catch((err) => {
          console.warn('DashboardPage: failed to save goal card change, reverting', err);
          const snapshot = goalSnapshotRef.current.get(id);
          goalSnapshotRef.current.delete(id);
          if (snapshot) setNewGoals((gs) => gs.map((g) => (g.id === id ? snapshot : g)));
        });
    }
  }

  function queueGoalSave(id: number, payload: UpdateGoalPayload, priorGoal: Goal) {
    if (!goalSnapshotRef.current.has(id)) goalSnapshotRef.current.set(id, priorGoal);
    const existing = pendingGoalPayloadRef.current.get(id) ?? {};
    pendingGoalPayloadRef.current.set(id, { ...existing, ...payload });
    if (goalSaveTimerRef.current) clearTimeout(goalSaveTimerRef.current);
    goalSaveTimerRef.current = setTimeout(flushPendingGoalSaves, 600);
  }

  useEffect(() => () => { flushPendingSave(); flushPendingGoalSaves(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function moveGoalKey(id: number, direction: 'up' | 'down') {
    const priorGoals = newGoals;
    const { goals: next, changed } = moveGoal(priorGoals, id, direction);
    if (!changed.length) return;
    setNewGoals(next);
    for (const c of changed) {
      const prior = priorGoals.find((g) => g.id === c.id);
      if (prior) queueGoalSave(c.id, { sortOrder: c.sortOrder }, prior);
    }
  }

  function setGoalSpanKey(id: number, span: number) {
    const priorGoals = newGoals;
    const priorGoal  = priorGoals.find((g) => g.id === id);
    const next = setGoalSpan(priorGoals, id, span);
    setNewGoals(next);
    const updated = next.find((g) => g.id === id);
    if (priorGoal && updated) queueGoalSave(id, { cardConfig: updated.cardConfig }, priorGoal);
  }

  function setGoalConfigKey(id: number, cfg: GoalCardConfig) {
    const priorGoals = newGoals;
    const priorGoal  = priorGoals.find((g) => g.id === id);
    const next = setGoalCardConfig(priorGoals, id, cfg);
    setNewGoals(next);
    if (priorGoal) queueGoalSave(id, { cardConfig: cfg }, priorGoal);
  }

  function setGoalPinnedKey(id: number, pinned: boolean) {
    const priorGoals = newGoals;
    const priorGoal  = priorGoals.find((g) => g.id === id);
    const next = setGoalPinned(priorGoals, id, pinned);
    setNewGoals(next);
    const updated = next.find((g) => g.id === id);
    if (priorGoal) queueGoalSave(id, { showOnDashboard: pinned, sortOrder: updated?.sortOrder }, priorGoal);
  }

  function handleGoalDrop(targetId: number) {
    if (dragGoalId == null || dragGoalId === targetId) { setDragGoalId(null); return; }
    const priorGoals = newGoals;
    const pinnedIds  = pinnedGoalsSorted(priorGoals).map((g) => g.id);
    const withoutDrag = pinnedIds.filter((i) => i !== dragGoalId);
    const targetIdx = withoutDrag.indexOf(targetId);
    withoutDrag.splice(targetIdx, 0, dragGoalId);
    const { goals: next, changed } = reorderPinnedGoals(priorGoals, withoutDrag);
    if (changed.length) {
      setNewGoals(next);
      for (const c of changed) {
        const prior = priorGoals.find((g) => g.id === c.id);
        if (prior) queueGoalSave(c.id, { sortOrder: c.sortOrder }, prior);
      }
    }
    setDragGoalId(null);
  }

  useEffect(() => {
    // Fire all requests simultaneously — but only for modules that are enabled.
    // Fetches are gated on FEATURES, not on dashboard layout: a widget merely hidden
    // by layout must still have its data ready so toggling it back on is instant, and
    // the blurbs share these same feeds.
    const workoutsP     = features.exercise ? workoutsApi.getAll({ limit: 200 }).catch(() => [] as WorkoutSummary[]) : Promise.resolve([] as WorkoutSummary[]);
    const summaryP      = features.nutrition ? nutritionTargetsApi.getSummary().catch(() => null) : Promise.resolve(null);
    const oneYearAgo = (() => { const d = new Date(today + 'T12:00:00'); d.setFullYear(d.getFullYear() - 1); return d.toISOString().slice(0, 10); })();
    const measurementsP = features.body ? measurementsApi.getAll({ start: oneYearAgo }).catch(() => [] as BodyMeasurement[]) : Promise.resolve([] as BodyMeasurement[]);
    const pbP           = features.exercise ? workoutsApi.getPersonalBests().catch(() => null) : Promise.resolve(null);
    const foodHistP     = features.nutrition ? logApi.getHistory({ limit: 60 }).catch(() => [] as FoodLogHistoryDay[]) : Promise.resolve([] as FoodLogHistoryDay[]);
    const routinesP     = features.exercise && features.routines ? routinesApi.getAll().catch(() => [] as RoutineSummary[]) : Promise.resolve([] as RoutineSummary[]);
    const tdeeP         = features.nutrition ? nutritionTargetsApi.getTDEE().catch(() => null) : Promise.resolve(null);
    const upcomingP     = features.exercise && features.workoutSchedules ? schedulesApi.getUpcoming(7).catch(() => [] as UpcomingSession[]) : Promise.resolve([] as UpcomingSession[]);
    const recoveryP     = features.exercise && features.recovery ? recoveryApi.get().catch(() => null) : Promise.resolve(null);
    const waterP        = features.nutrition && features.water ? waterApi.getDay(today).catch(() => null) : Promise.resolve(null);
    const stepsTodayP   = features.activity ? stepsApi.getDay(today).catch(() => null) : Promise.resolve(null);
    const stepsHistP       = features.activity ? stepsApi.getHistory(60).catch(() => [] as StepsDay[]) : Promise.resolve([] as StepsDay[]);
    const thisWeekStart    = getWeekStart(today);
    const waterWeekHistP   = features.nutrition && features.water ? waterApi.getHistory(thisWeekStart, today).catch(() => ({ goalOz: 0, days: [] as WaterHistoryDay[] })) : Promise.resolve({ goalOz: 0, days: [] as WaterHistoryDay[] });
    const goalsP        = features.goals ? goalsV2Api.getAll('active').catch(() => [] as Goal[]) : Promise.resolve([] as Goal[]);

    // Unblock the page as soon as essential above-the-fold data arrives
    Promise.all([summaryP, tdeeP, waterP, stepsTodayP, goalsP])
      .then(([s, tdee, wd, sd, ug]) => {
        setSummary(s as NutritionSummary | null);
        const t = tdee as import('@pulse/api-client').TDEEResult | null;
        if (t?.available) setTodayTDEE(t as TDEEBreakdown);
        if (wd) setTodayWater(wd as WaterDay);
        if (sd) setTodaySteps(sd as StepsDay);
        setNewGoals(ug as Goal[]);
        setLoading(false);
      })
      .catch(() => setLoading(false));

    // Background — fill in charts and history as they arrive
    workoutsP.then(ws => setWorkouts(ws));
    measurementsP.then(ms => { setMeasurements(ms); setMeasurementsReady(true); });
    pbP.then(pb => setPersonalBests(pb));
    foodHistP.then(fl => setFoodLogHistory(fl.sort((a, b) => a.date.localeCompare(b.date))));
    routinesP.then(rl => setRoutines(rl));
    upcomingP.then(upc => setUpcoming(upc));
    recoveryP.then(rec => setRecovery((rec as RecoveryData | null) ?? null));
    stepsHistP.then(sh => setStepsHistory(sh));
    waterWeekHistP.then(wh => setWaterWeekHistory(wh.days));

    // Signal when background data is ready so loading indicators can clear
    Promise.all([workoutsP, measurementsP, foodHistP, stepsHistP]).finally(() => setPhase2Ready(true));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', background: BG }}>
        <div className="micro" style={{ color: MUTED }}>Loading…</div>
      </div>
    );
  }

  const weekStart      = getWeekStart(today);
  const weeklyData     = buildWeeklyData(workouts);
  const thisWeekBucket = weeklyData[weeklyData.length - 1];

  const ctx: DashboardContext = {
    workouts, summary, foodLogHistory, todayTDEE, stepsHistory, measurements, routines, newGoals,
    upcoming, recovery, todayWater, todaySteps, waterWeekHistory, weeklyData, thisWeekBucket,
    weekStart, today, navigate, phase2Ready, measurementsReady,
    editing, optionsGoalId, dragGoalId,
    onGoalMoveUp:      (id) => moveGoalKey(id, 'up'),
    onGoalMoveDown:    (id) => moveGoalKey(id, 'down'),
    onGoalSetSpan:     setGoalSpanKey,
    onGoalUnpin:       (id) => setGoalPinnedKey(id, false),
    onGoalSetConfig:   setGoalConfigKey,
    onGoalOpenOptions: setOptionsGoalId,
    onGoalDragStart:   setDragGoalId,
    onGoalDrop:        handleGoalDrop,
  };

  // Full merged widget list (every catalog key, including feature-disabled ones —
  // their stored position/width is preserved even while hidden). `editable` is the
  // subset the user can currently see/manage; disabled-feature entries never appear
  // on the dashboard or in the customize UI.
  const fullLayout = resolveLayout(dashboardLayout, 'web');
  const editable    = fullLayout.widgets.filter(e => isWidgetEditable(e, features));
  const editableKeys = editable.map(e => e.key);
  const hiddenWidgets = editable.filter(e => !e.visible);

  // groupLayout already drops invisible entries, so `editable` (visible + hidden) can
  // be passed straight through — the bands below only ever see what should render.
  // Goal progress renders nothing when there are no dashboard-pinned goals (same as
  // before customization existed) — drop it, and any band left with no widgets, so an
  // empty section header never appears.
  const dashboardGoalCount = newGoals.filter(g => g.showOnDashboard).length;
  const groups = groupLayout({ v: 1, widgets: editable })
    .map(g => (g.group === 'Goal progress' && dashboardGoalCount === 0) ? { ...g, widgets: [] } : g)
    .filter(g => g.widgets.length > 0);

  function moveKey(key: DashboardWidgetKey, direction: 'up' | 'down') {
    applyLayoutChange(moveWidget(fullLayout.widgets, key, direction, features));
  }
  function setSpanKey(key: DashboardWidgetKey, span: number) {
    applyLayoutChange(setWidgetSpan(fullLayout.widgets, key, span));
  }
  function setVisibleKey(key: DashboardWidgetKey, visible: boolean) {
    applyLayoutChange(setWidgetVisible(fullLayout.widgets, key, visible));
  }
  function resetToDefault() {
    applyLayoutChange(resetLayoutWidgets('web'));
  }
  function handleDrop(targetKey: DashboardWidgetKey) {
    if (!dragKey || dragKey === targetKey) { setDragKey(null); return; }
    const withoutDrag = editableKeys.filter(k => k !== dragKey);
    const targetIdx = withoutDrag.indexOf(targetKey);
    withoutDrag.splice(targetIdx, 0, dragKey);
    applyLayoutChange(reorderEditableWidgets(fullLayout.widgets, features, withoutDrag));
    setDragKey(null);
  }
  function handleDone() {
    flushPendingSave();
    flushPendingGoalSaves();
    setEditing(false);
  }

  const goalProgressEntry = fullLayout.widgets.find((w) => w.key === 'goalProgress');
  const unpinnedGoals = newGoals.filter((g) => !g.showOnDashboard);
  const showUnpinnedTray = editing && features.goals && !!goalProgressEntry?.visible;

  return (
    <div style={{ flex: 1, minWidth: 0, background: BG, height: '100%', overflowY: 'auto' }}>

      {/* Topbar */}
      <div className="flex-shrink-0 px-6 pt-5 pb-3 border-b border-dram-border flex items-center justify-between">
        <h1 className="text-xl font-semibold text-slate-200">Dashboard</h1>
        <div className="flex items-center gap-2">
          {editing ? (
            <>
              <button onClick={resetToDefault}
                className="border border-dram-border text-slate-300 font-semibold px-4 py-2 rounded-lg text-sm hover:bg-white/5 transition">
                Reset to default
              </button>
              <button onClick={handleDone}
                className="bg-dram-accent text-black font-semibold px-4 py-2 rounded-lg text-sm hover:brightness-110 transition">
                Done
              </button>
            </>
          ) : (
            <>
              <button onClick={() => navigate('/nutrition/today')}
                className="border border-dram-accent text-dram-accent font-semibold px-4 py-2 rounded-lg text-sm hover:bg-dram-accent/10 transition">
                + Log
              </button>
              <button onClick={() => navigate('/workouts')}
                className="bg-dram-accent text-black font-semibold px-4 py-2 rounded-lg text-sm hover:brightness-110 transition">
                + Train
              </button>
              <button onClick={() => setEditing(true)}
                className="border border-dram-border text-slate-300 font-semibold px-4 py-2 rounded-lg text-sm hover:bg-white/5 transition">
                Customize
              </button>
            </>
          )}
        </div>
      </div>

      {groups.map(({ group, widgets }) => (
        <Band key={group} kicker={group}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(12, 1fr)', gap: 14 }}>
            {widgets.map((entry) => {
              const pos = editableKeys.indexOf(entry.key);
              return (
                <WidgetCell
                  key={entry.key}
                  entry={entry}
                  ctx={ctx}
                  editing={editing}
                  canMoveUp={pos > 0}
                  canMoveDown={pos < editableKeys.length - 1}
                  onMoveUp={() => moveKey(entry.key, 'up')}
                  onMoveDown={() => moveKey(entry.key, 'down')}
                  onSetSpan={(span) => setSpanKey(entry.key, span)}
                  onHide={() => setVisibleKey(entry.key, false)}
                  onDragStart={() => setDragKey(entry.key)}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={() => handleDrop(entry.key)}
                />
              );
            })}
          </div>
        </Band>
      ))}

      {editing && <AddWidgetTray hidden={hiddenWidgets} onShow={(key) => setVisibleKey(key, true)} />}
      {showUnpinnedTray && <UnpinnedGoalsTray goals={unpinnedGoals} onPin={(id) => setGoalPinnedKey(id, true)} />}

      <div style={{ padding: '24px 36px 60px' }} className="font-mono">
        <div style={{ height: 1, background: LINE_SOFT, marginBottom: 14 }} />
        <span style={{ fontSize: 10, color: MUTED2 }}>Pulse · Dashboard</span>
      </div>
    </div>
  );
}
