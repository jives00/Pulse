import { useState, useEffect, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  workoutsApi, goalsApi, measurementsApi, routinesApi, logApi, schedulesApi, assistantApi, recoveryApi,
  localDateStr, getWeekStart, buildWeeklyData, computeHighlights, shortDate,
  KG_TO_LBS,
  type WorkoutSummary, type ExerciseGoals, type GoalsSummary,
  type BodyMeasurement, type MeasurementGoal, type PersonalBests,
  type RoutineSummary, type RoutineGoal, type RoutineDetail, type FoodLogHistoryDay, type TDEEBreakdown, type TDEEResult,
  type WeekBucket, type UpcomingSession, type InsightPeriod, type RecoveryData,
} from '@pulse/api-client';

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
const fmt1  = (n: number) => n.toFixed(1);

// ─── Spark (pure SVG sparkline with optional projection tail) ─────────────────

interface SparkProps {
  values: number[];
  projection?: number[];
  color?: string;
  w?: number;
  h?: number;
  area?: boolean;
  dot?: boolean;
  goalVal?: number;
  minO?: number;
  maxO?: number;
}

function Spark({ values, projection, color = ACCENT, w = 300, h = 40, area = false, dot = true, goalVal, minO, maxO }: SparkProps) {
  if (!values.length) return null;
  const all = projection ? [...values, ...projection] : values;
  const min = minO ?? Math.min(...all.filter(v => v != null));
  const max = maxO ?? Math.max(...all, goalVal ?? 0, min + 1);
  const rng = max - min || 1;
  const total = values.length + (projection?.length ?? 0);
  const X = (i: number) => (i / (total - 1)) * w;
  const Y = (v: number) => h - ((v - min) / rng) * (h - 4) - 2;
  const pts = values.map((v, i) => [X(i), Y(v)] as [number, number]);
  const line = pts.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join('');
  const aPath = `${line} L${pts.at(-1)![0]},${h} L0,${h} Z`;
  const id = `sp${Math.abs(color.length * 31 + w)}`;
  const goalY = goalVal != null ? Y(goalVal) : null;
  const projPts = projection ? projection.map((v, i) => [X(values.length + i), Y(v)] as [number, number]) : null;
  const projLine = projPts ? [pts.at(-1)!, ...projPts].map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join('') : null;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} style={{ width: '100%', height: h, display: 'block' }} preserveAspectRatio="none">
      {area && (
        <defs>
          <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.18" />
            <stop offset="100%" stopColor={color} stopOpacity="0" />
          </linearGradient>
        </defs>
      )}
      {area && <path d={aPath} fill={`url(#${id})`} />}
      {goalY != null && <line x1="0" x2={w} y1={goalY} y2={goalY} stroke={color} strokeWidth="0.7" strokeDasharray="2 3" opacity="0.45" />}
      <path d={line} fill="none" stroke={color} strokeWidth="1.4" />
      {projLine && <path d={projLine} fill="none" stroke={color} strokeWidth="1.4" strokeDasharray="3 3" opacity="0.65" />}
      {dot && pts.length > 0 && <circle cx={pts.at(-1)![0]} cy={pts.at(-1)![1]} r="2.6" fill={color} />}
      {projPts && projPts.length > 0 && <circle cx={projPts.at(-1)![0]} cy={projPts.at(-1)![1]} r="2.6" fill={color} opacity="0.65" />}
    </svg>
  );
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

// ─── AI Insight banner ────────────────────────────────────────────────────────

const INSIGHT_LABELS: Record<InsightPeriod, string> = {
  morning:   'Yesterday',
  afternoon: 'Today so far',
  evening:   'Today',
};

function InsightBanner({ text, streak, date, period }: { text: string; streak: number; date: string; period: InsightPeriod }) {
  const label = INSIGHT_LABELS[period];
  return (
    <div style={{
      background: CARD, border: `1px solid ${LINE}`, borderLeft: `2px solid ${ACCENT}`,
      padding: '14px 22px', display: 'flex', alignItems: 'center', gap: 22, marginBottom: 0,
    }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="font-mono" style={{ fontSize: 12, color: MUTED2, letterSpacing: '.1em', marginBottom: 5 }}>{date}</div>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexShrink: 0 }}>
            <svg width="12" height="12" viewBox="0 0 14 14" fill="none">
              <path d="M7 0.5 L8.2 5 L13 6.5 L8.2 8 L7 12.5 L5.8 8 L1 6.5 L5.8 5 Z" fill={ACCENT} />
            </svg>
            <span className="micro" style={{ color: ACCENT, whiteSpace: 'nowrap' }}>{label}</span>
          </div>
          <p style={{ margin: 0, fontSize: 14, lineHeight: 1.5, color: 'white', paddingLeft: 6 }}>{text}</p>
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, flexShrink: 0 }}>
        <svg width="10" height="13" viewBox="0 0 14 17" fill="none">
          <path d="M7 0.5 C8.5 3.5 13 5 13 9.5 C13 13 10.5 16 7 16 C3.5 16 1 13 1 9.5 C1 6.5 3 5.5 4 3 C4.5 5 5.5 5.5 7 0.5Z" fill={ACCENT} />
        </svg>
        <span className="font-display" style={{ fontSize: 18, fontWeight: 600, color: 'white' }}>{streak}</span>
        <span className="micro" style={{ fontSize: 9, color: MUTED2 }}>day streak</span>
      </div>
    </div>
  );
}

// ─── Fuel Today ───────────────────────────────────────────────────────────────

function MacroBlock({ label, val, goal }: { label: string; val: number; goal: number }) {
  const pctRaw = goal > 0 ? val / goal : 0;
  const pctClamped = clamp(pctRaw);
  const over = val > goal;
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
        <div style={{ height: '100%', width: `${pctClamped * 100}%`, background: over ? COL_WARN : ACCENT }} />
      </div>
      <div className="font-mono" style={{ fontSize: 11, color: over ? COL_WARN : MUTED2, marginTop: 6 }}>
        {over ? `+${val - goal}g over` : `${Math.max(0, goal - val)}g left`}
      </div>
    </div>
  );
}

function FuelToday({ actual, goals, tdee }: {
  actual: GoalsSummary['nutrition']['actual'] | null;
  goals: GoalsSummary['nutrition']['goals'] | null;
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
  const pct   = calG > 0 ? clamp(cal / calG) : 0;
  const size  = 200, sw = 10, r = (size - sw) / 2, c = 2 * Math.PI * r;
  const remaining = calG - cal;
  const net = cal - tdeeVal;

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: 36, alignItems: 'center' }}>
      {/* Ring */}
      <div style={{ position: 'relative', width: size, height: size, flexShrink: 0 }}>
        <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
          <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={LINE_SOFT} strokeWidth={sw} />
          <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={ACCENT} strokeWidth={sw}
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
      <span style={{ fontSize: 11, color: MUTED2, marginLeft: 'auto', maxWidth: 160, textAlign: 'right' }}>{recovery.hint}</span>
    </div>
  ) : null;

  if (workout) {
    const highlights = computeHighlights(workout, allWorkouts);
    return (
      <div>
        {recoveryStrip}
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 14 }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 12 }}>
              <span className="font-display" style={{ fontSize: 26, fontWeight: 600, color: 'white' }}>{workout.routineName ?? workout.name ?? 'Workout'}</span>
              {highlights[0] && <span className="font-mono" style={{ fontSize: 11, color: ACCENT }}>★ {highlights[0]}</span>}
            </div>
            <div className="font-mono" style={{ fontSize: 12, color: MUTED2, marginTop: 5 }}>
              {workout.durationMinutes} min
            </div>
          </div>
          <button
            onClick={() => navigate(`/workouts/${workout.id}`)}
            style={{ padding: '6px 13px', borderRadius: 6, border: `1px solid ${LINE}`, background: 'transparent', color: MUTED, fontSize: 11, cursor: 'pointer' }}
          >Open</button>
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
        <div style={{ fontSize: 13, color: MUTED2 }}>Rest day — take it easy.</div>
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

function RecoveryCard({ data }: { data: RecoveryData | null }) {
  if (!data) return <div style={{ fontSize: 11, color: MUTED2 }}>Loading…</div>;
  const color = RECOVERY_COLOR[data.level];
  const pct = data.score / 100;
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 10 }}>
        <span className="font-display" style={{ fontSize: 26, fontWeight: 600, color }}>{data.score}</span>
        <span style={{ padding: '3px 9px', borderRadius: 99, background: color + '22', color, fontSize: 10, fontWeight: 600, letterSpacing: '.05em', textTransform: 'uppercase' as const }}>{data.level}</span>
      </div>
      <div style={{ position: 'relative', height: 6, borderRadius: 3, background: 'rgba(255,255,255,0.06)', marginBottom: 10, overflow: 'hidden' }}>
        <div style={{ position: 'absolute', top: 0, left: 0, height: '100%', width: `${pct * 100}%`, background: color, borderRadius: 3, transition: 'width 0.4s ease' }} />
      </div>
      <div style={{ fontSize: 11, color: MUTED2, lineHeight: 1.5 }}>{data.hint}</div>
    </div>
  );
}

// ─── Upcoming workouts ────────────────────────────────────────────────────────

function UpcomingCard({ upcoming, navigate }: { upcoming: UpcomingSession[]; navigate: (p: string) => void }) {
  if (!upcoming.length) {
    return <div style={{ fontSize: 13, color: MUTED2 }}>No schedule configured. Set one up in <span style={{ color: ACCENT, cursor: 'pointer' }} onClick={() => navigate('/planning')}>Planning</span>.</div>;
  }

  function statusColor(status: string) {
    if (status === 'completed') return '#86AA80';
    if (status === 'skipped')  return '#C5896E';
    if (status === 'rest')     return MUTED2;
    return ACCENT;
  }

  function fmtDate(dateStr: string) {
    return new Date(dateStr + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  }

  return (
    <div>
      {upcoming.map((session, i) => (
        <div
          key={`${session.scheduleId}-${session.date}`}
          style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderTop: i === 0 ? 'none' : `1px solid ${LINE_SOFT}` }}
        >
          <div style={{ width: 2, height: 22, background: statusColor(session.status), opacity: 0.75, flexShrink: 0 }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 12, color: 'white', fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {session.isRestDay ? 'Rest' : (session.routineName ?? 'Workout')}
            </div>
            <div className="font-mono" style={{ fontSize: 9, color: MUTED2, marginTop: 2 }}>{fmtDate(session.date)}</div>
          </div>
          {session.status === 'completed' && <span style={{ fontSize: 11, color: '#86AA80' }}>✓</span>}
          {session.status === 'skipped'   && <span style={{ fontSize: 11, color: '#C5896E' }}>✕</span>}
          {session.status === 'scheduled' && !session.isRestDay && (
            <button
              onClick={() => navigate('/workouts')}
              style={{ background: 'transparent', border: 'none', color: MUTED, fontSize: 11, cursor: 'pointer' }}
            >Start</button>
          )}
        </div>
      ))}
    </div>
  );
}

// ─── Personal bests table ─────────────────────────────────────────────────────

function PersonalBestsTable({ pb }: { pb: PersonalBests | null }) {
  if (!pb) return <div style={{ fontSize: 13, color: MUTED2 }}>No workouts yet.</div>;
  const rows: { lift: string; value: string; meta: string }[] = [];
  if (pb.heaviestLift) rows.push({
    lift: pb.heaviestLift.exerciseName,
    value: `${Math.round(pb.heaviestLift.weightKg * KG_TO_LBS)} lb${pb.heaviestLift.reps ? ` × ${pb.heaviestLift.reps}` : ''}`,
    meta: pb.heaviestLift.workoutDate,
  });
  pb.bestVolumeByRoutine.slice(0, 2).forEach(r => rows.push({
    lift: r.routineName,
    value: `${fmt(r.volumeKg * KG_TO_LBS)} lb vol`,
    meta: r.workoutDate ?? '',
  }));
  if (pb.mostCaloriesBurned) rows.push({
    lift: pb.mostCaloriesBurned.workoutName ?? 'Workout',
    value: `${pb.mostCaloriesBurned.calories.toLocaleString()} kcal`,
    meta: pb.mostCaloriesBurned.workoutDate,
  });
  if (pb.bestStairPace) rows.push({
    lift: pb.bestStairPace.exerciseName,
    value: `${pb.bestStairPace.pacePerMinute.toFixed(0)} steps/min`,
    meta: pb.bestStairPace.workoutDate,
  });
  if (!rows.length) return <div style={{ fontSize: 13, color: MUTED2 }}>No records yet.</div>;
  return (
    <div>
      {rows.map((p, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', padding: '10px 0', borderTop: i ? `1px solid ${LINE_SOFT}` : 'none' }}>
          <div>
            <div style={{ fontSize: 12, color: 'white' }}>{p.lift}</div>
            <div className="font-mono" style={{ fontSize: 9, color: MUTED2, marginTop: 2 }}>{p.meta}</div>
          </div>
          <span className="font-display" style={{ fontSize: 14, fontWeight: 600, color: ACCENT }}>{p.value}</span>
        </div>
      ))}
    </div>
  );
}

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

function ThisWeek({ summary, exGoals, thisWeekBucket, foodLogHistory, weekStart }: {
  summary: GoalsSummary | null; exGoals: ExerciseGoals | null;
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
  const workoutGoal = summary?.workouts.goals?.workoutsPerWeek ?? 0;
  const workoutActual = summary?.workouts.actual.workoutCount ?? 0;
  const volGoal = exGoals?.volumeLbsPerWeek ?? 0;
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

function CalVsBurned({ foodLogHistory, workouts, todayTDEE }: {
  foodLogHistory: FoodLogHistoryDay[]; workouts: WorkoutSummary[]; todayTDEE: TDEEBreakdown | null;
}) {
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  const exerciseByDate: Record<string, number> = {};
  for (const w of workouts) {
    if (w.caloriesBurned) exerciseByDate[w.workoutDate] = (exerciseByDate[w.workoutDate] ?? 0) + w.caloriesBurned;
  }
  const baseline = todayTDEE ? todayTDEE.bmr + todayTDEE.neat : null;
  const series = foodLogHistory.slice(-30)
    .map(d => {
      const tef = Math.round(d.calories * 0.1);
      const ex = exerciseByDate[d.date] ?? 0;
      const tdee = baseline != null ? baseline + tef + ex : 0;
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

function WeeklyAvgTable({ foodLogHistory, workouts, todayTDEE }: {
  foodLogHistory: FoodLogHistoryDay[]; workouts: WorkoutSummary[]; todayTDEE: TDEEBreakdown | null;
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
    const week = weeks.find(wk => wk.weekStart === ws);
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

  const displayWeeks = [...weeks].reverse().filter(w => w.days > 0 || w.isCurrentWeek).slice(0, 5);
  const fmtNum = (n: number) => new Intl.NumberFormat('en-US').format(Math.round(n));
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
            <td style={{ padding: '10px 0 10px 12px', textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: 13, fontVariantNumeric: 'tabular-nums', color: week.isCurrentWeek ? 'white' : MUTED }}>{week.days > 0 ? fmtNum(week.calories) : <span style={{ color: MUTED2 }}>—</span>}</td>
            <td style={{ padding: '10px 0 10px 12px', textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: 13, fontVariantNumeric: 'tabular-nums', color: '#D4A843' }}>{week.days > 0 ? week.protein : <span style={{ color: MUTED2 }}>—</span>}</td>
            <td style={{ padding: '10px 0 10px 12px', textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: 13, fontVariantNumeric: 'tabular-nums', color: '#7C9ECB' }}>{week.days > 0 ? week.carbs : <span style={{ color: MUTED2 }}>—</span>}</td>
            <td style={{ padding: '10px 0 10px 12px', textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: 13, fontVariantNumeric: 'tabular-nums', color: '#C5896E' }}>{week.days > 0 ? week.fat : <span style={{ color: MUTED2 }}>—</span>}</td>
            {todayTDEE && <td style={{ padding: '10px 0 10px 12px', textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: 13, fontVariantNumeric: 'tabular-nums', color: MUTED2 }}>{week.tdee != null && week.days > 0 ? fmtNum(week.tdee) : '—'}</td>}
            {todayTDEE && (
              <td style={{ padding: '10px 0 10px 12px', textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: 13, fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>
                {week.net != null && week.days > 0 ? (
                  <span style={{ color: week.net < 0 ? '#86AA80' : week.net > 300 ? '#C5896E' : MUTED }}>
                    {week.net > 0 ? '+' : ''}{fmtNum(week.net)}
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
  const rows = workouts.slice(0, 8);
  if (!rows.length) return <div style={{ fontSize: 13, color: MUTED2 }}>No sessions yet.</div>;
  const cols = '60px 1fr 80px 44px 64px 52px 1fr';
  const hdStyle = { fontSize: 9, color: MUTED2, fontFamily: 'var(--font-mono)', letterSpacing: '.08em', textTransform: 'uppercase' as const };
  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: cols, gap: 10, padding: '6px 0', color: MUTED2 }}>
        {['Date', 'Session', 'Volume', 'Sets', 'Burn', 'Min', 'Highlight'].map(h => <span key={h} style={hdStyle}>{h}</span>)}
      </div>
      {rows.map((s, i) => {
        const highlight = computeHighlights(s, workouts)[0] ?? null;
        return (
          <div key={s.id} onClick={() => navigate(`/workouts/${s.id}`)}
            style={{ display: 'grid', gridTemplateColumns: cols, gap: 10, padding: '12px 0', borderTop: `1px solid ${LINE_SOFT}`, alignItems: 'baseline', cursor: 'pointer' }}
            onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.02)')}
            onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
          >
            <span className="font-mono" style={{ fontSize: 11, color: MUTED2 }}>
              {new Date(s.workoutDate + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
            </span>
            <span style={{ fontSize: 13, color: 'white' }}>{s.routineName ?? s.name ?? 'Workout'}</span>
            <span className="font-mono" style={{ fontSize: 12, color: 'white', textAlign: 'right' }}>{s.totalVolumeKg > 0 ? fmt(s.totalVolumeKg * KG_TO_LBS) : '—'}</span>
            <span className="font-mono" style={{ fontSize: 11, color: MUTED, textAlign: 'right' }}>{s.setCount}</span>
            <span className="font-mono" style={{ fontSize: 11, color: MUTED, textAlign: 'right' }}>{s.caloriesBurned ?? '—'}</span>
            <span className="font-mono" style={{ fontSize: 11, color: MUTED, textAlign: 'right' }}>{s.durationMinutes ?? '—'}</span>
            <span style={{ fontSize: 11, color: highlight ? ACCENT : MUTED2 }}>{highlight ? `★ ${highlight}` : '—'}</span>
          </div>
        );
      })}
    </div>
  );
}

// ─── Goal Progress: shared helpers ───────────────────────────────────────────

type GoalStatus = 'achieved' | 'ahead' | 'on_track' | 'behind' | 'no_data';

const STATUS_CFG: Record<GoalStatus, { color: string; label: string }> = {
  achieved: { color: COL_GOOD,  label: 'Achieved' },
  ahead:    { color: COL_GOOD,  label: 'Ahead'    },
  on_track: { color: '#D4A843', label: 'On track' },
  behind:   { color: COL_WARN,  label: 'Behind'   },
  no_data:  { color: MUTED,     label: '—'        },
};

function StatusChip({ status }: { status: GoalStatus }) {
  const { color, label } = STATUS_CFG[status];
  return (
    <span style={{ padding: '2px 9px', borderRadius: 99, background: color + '28', color, fontSize: 11, fontWeight: 600, letterSpacing: '.02em' }}>
      {label}
    </span>
  );
}

function deadlineStatus(etaDays: number | null, deadlineStr: string | null, achieved: boolean): GoalStatus {
  if (achieved) return 'achieved';
  if (etaDays == null || !deadlineStr) return 'no_data';
  const deadlineDays = Math.ceil(
    (new Date(deadlineStr + 'T12:00:00').getTime() - Date.now()) / 86400000
  );
  if (etaDays <= deadlineDays - 21) return 'ahead';
  if (etaDays <= deadlineDays + 14) return 'on_track';
  return 'behind';
}

function fmtETA(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function fmtISODate(isoStr: string): string {
  return new Date(isoStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function normDateStr(isoStr: string): string {
  return isoStr.slice(0, 10);
}

// ─── Goal Progress: Weight card ───────────────────────────────────────────────

function WeightGoalCard({ measurements, goal, foodLogHistory, tdee }: {
  measurements: BodyMeasurement[];
  goal: MeasurementGoal | undefined;
  foodLogHistory: FoodLogHistoryDay[];
  tdee: TDEEBreakdown | null;
}) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  const sorted = measurements
    .filter(m => m.metric === 'weight')
    .sort((a, b) => a.measuredAt.localeCompare(b.measuredAt))
    .map(m => ({ date: m.measuredAt, val: m.unit === 'kg' ? m.value * KG_TO_LBS : m.value }));

  const target   = goal?.targetValue;
  const deadline = goal?.targetDate ? normDateStr(goal.targetDate) : null;

  if (!sorted.length) {
    return (
      <Panel title="Weight goal" meta={target ? `target ${fmt1(target)} lb` : undefined}>
        <div style={{ fontSize: 13, color: MUTED2 }}>No weight entries yet.</div>
      </Panel>
    );
  }

  const current  = sorted[sorted.length - 1].val;
  const startVal = sorted[0].val;
  const todayMs  = new Date(localDateStr() + 'T12:00:00').getTime();

  // 28-day trend slope via linear regression (lbs/day)
  const cutoff28Ms = todayMs - 28 * 86400000;
  const recent28   = sorted.filter(m => new Date(m.date + 'T12:00:00').getTime() >= cutoff28Ms);
  let trendLbsPerDay = 0;
  if (recent28.length >= 2) {
    const xs  = recent28.map(m => (new Date(m.date + 'T12:00:00').getTime() - cutoff28Ms) / 86400000);
    const ys  = recent28.map(m => m.val);
    const n   = xs.length;
    const xM  = xs.reduce((a, b) => a + b, 0) / n;
    const yM  = ys.reduce((a, b) => a + b, 0) / n;
    const den = xs.reduce((s, x) => s + (x - xM) ** 2, 0);
    trendLbsPerDay = den > 0 ? xs.reduce((s, x, i) => s + (x - xM) * (ys[i] - yM), 0) / den : 0;
  }

  // TDEE-based slope (lbs/day): net calories / 3500
  let tdeeLbsPerDay: number | null = null;
  if (tdee) {
    const recentFood = foodLogHistory.slice(-14).filter(d => d.calories > 0);
    if (recentFood.length > 0) {
      const avgCal = recentFood.reduce((s, d) => s + d.calories, 0) / recentFood.length;
      tdeeLbsPerDay = (avgCal - tdee.total) / 3500;
    }
  }

  function etaDays(slopePerDay: number): number | null {
    if (!target || Math.abs(slopePerDay) < 0.001) return null;
    const d = (target - current) / slopePerDay;
    return d > 0 ? Math.round(d) : null;
  }

  const trendEta   = etaDays(trendLbsPerDay);
  const tdeeEta    = tdeeLbsPerDay != null ? etaDays(tdeeLbsPerDay) : null;
  const isAchieved = target != null && current <= target;
  const status = deadlineStatus(trendEta, deadline, isAchieved);

  // Chart: 90-day window + 14-day projection
  const chart90 = sorted.filter(m => new Date(m.date + 'T12:00:00').getTime() >= todayMs - 90 * 86400000);
  const chartData = chart90.length > 0 ? chart90 : sorted.slice(-30); // fallback
  const t0Ms  = new Date(chartData[0].date + 'T12:00:00').getTime();
  const endMs = todayMs + 28 * 86400000;
  const W = 760, H = 170;
  const X = (ms: number) => ((ms - t0Ms) / (endMs - t0Ms)) * W;
  const todayX = X(todayMs);

  // Build 28-day projection arrays (daily points)
  const trendPts = Array.from({ length: 29 }, (_, i) => ({
    x: X(todayMs + i * 86400000),
    y: current + trendLbsPerDay * i,
  }));
  const tdeePts = tdeeLbsPerDay != null
    ? Array.from({ length: 29 }, (_, i) => ({
        x: X(todayMs + i * 86400000),
        y: current + tdeeLbsPerDay! * i,
      }))
    : null;

  const allY = [
    ...chartData.map(m => m.val),
    ...trendPts.map(p => p.y),
    ...(tdeePts ?? []).map(p => p.y),
    target ?? 0,
  ].filter(v => v > 0);
  const minV = Math.min(...allY) * 0.994;
  const maxV = Math.max(...allY) * 1.006;
  const Y = (v: number) => H - ((v - minV) / (maxV - minV)) * (H - 20) - 10;

  const histPath = chartData.map((m, i) =>
    `${i ? 'L' : 'M'}${X(new Date(m.date + 'T12:00:00').getTime()).toFixed(1)},${Y(m.val).toFixed(1)}`
  ).join('');
  const aPath = `${histPath} L${todayX.toFixed(1)},${H} L${X(t0Ms).toFixed(1)},${H} Z`;
  const trendPath = trendPts.map((p, i) => `${i ? 'L' : 'M'}${p.x.toFixed(1)},${Y(p.y).toFixed(1)}`).join('');
  const tdeePath  = tdeePts ? tdeePts.map((p, i) => `${i ? 'L' : 'M'}${p.x.toFixed(1)},${Y(p.y).toFixed(1)}`).join('') : null;
  const targetY   = target != null ? Y(target) : null;

  return (
    <Panel title="Weight goal" meta={goal ? `${fmt1(target!)} lb by ${goal.targetDate ? fmtISODate(goal.targetDate) : '—'}` : undefined}>
      {/* Status row */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 20, marginBottom: 12, flexWrap: 'wrap' as const }}>
        <div>
          <div className="micro" style={{ fontSize: 9, color: MUTED, marginBottom: 3 }}>Current</div>
          <span className="font-display" style={{ fontSize: 22, fontWeight: 600, color: 'white' }}>
            {fmt1(current)}<span style={{ fontSize: 11, color: MUTED, marginLeft: 4 }}>lb</span>
          </span>
        </div>
        {target != null && (
          <div>
            <div className="micro" style={{ fontSize: 9, color: MUTED, marginBottom: 3 }}>Target</div>
            <span className="font-display" style={{ fontSize: 22, fontWeight: 600, color: MUTED }}>
              {fmt1(target)}<span style={{ fontSize: 11, color: MUTED2, marginLeft: 4 }}>lb</span>
            </span>
          </div>
        )}
        {trendEta != null && (
          <div>
            <div className="micro" style={{ fontSize: 9, color: ACCENT, marginBottom: 3 }}>ETA · trend</div>
            <span className="font-mono" style={{ fontSize: 12, color: ACCENT }}>{fmtETA(trendEta)}</span>
          </div>
        )}
        {tdeeEta != null && (
          <div>
            <div className="micro" style={{ fontSize: 9, color: '#D4A843', marginBottom: 3 }}>ETA · TDEE pace</div>
            <span className="font-mono" style={{ fontSize: 12, color: '#D4A843' }}>{fmtETA(tdeeEta)}</span>
          </div>
        )}
        <div style={{ marginLeft: 'auto' }}>
          <StatusChip status={status} />
        </div>
      </div>

      {/* Chart */}
      <div style={{ position: 'relative' }}>
        <svg
          ref={svgRef}
          viewBox={`0 0 ${W} ${H}`}
          style={{ width: '100%', height: H, display: 'block', cursor: 'crosshair' }}
          preserveAspectRatio="none"
          onMouseMove={e => {
            if (!svgRef.current) return;
            const rect = svgRef.current.getBoundingClientRect();
            const xRatio = (e.clientX - rect.left) / rect.width;
            const hoverMs = t0Ms + xRatio * (endMs - t0Ms);
            let closest = 0, minDist = Infinity;
            chartData.forEach((m, i) => {
              const dist = Math.abs(new Date(m.date + 'T12:00:00').getTime() - hoverMs);
              if (dist < minDist) { minDist = dist; closest = i; }
            });
            setHoverIdx(closest);
          }}
          onMouseLeave={() => setHoverIdx(null)}
        >
          <defs>
            <linearGradient id="wgc" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={ACCENT} stopOpacity="0.14" />
              <stop offset="100%" stopColor={ACCENT} stopOpacity="0" />
            </linearGradient>
          </defs>
          {[0.25, 0.5, 0.75].map((g, i) => (
            <line key={i} x1="0" x2={W} y1={H * g} y2={H * g} stroke={LINE_SOFT} strokeWidth="1" />
          ))}
          {targetY != null && (
            <line x1="0" x2={W} y1={targetY} y2={targetY} stroke={MUTED} strokeWidth="1" strokeDasharray="3 3" opacity="0.5" />
          )}
          <path d={aPath} fill="url(#wgc)" />
          <path d={histPath} fill="none" stroke={ACCENT} strokeWidth="1.8" />
          <line x1={todayX.toFixed(1)} x2={todayX.toFixed(1)} y1="0" y2={H} stroke={LINE} strokeWidth="1" strokeDasharray="2 2" opacity="0.5" />
          {tdeePath && (
            <path d={tdeePath} fill="none" stroke="#f97316" strokeWidth="1.4" strokeDasharray="4 3" opacity="0.85" />
          )}
          <path d={trendPath} fill="none" stroke="#818cf8" strokeWidth="1.4" strokeDasharray="4 3" opacity="0.9" />
          <circle cx={todayX.toFixed(1)} cy={Y(current).toFixed(1)} r="3" fill={ACCENT} />
          {hoverIdx !== null && (() => {
            const m = chartData[hoverIdx];
            const hx = X(new Date(m.date + 'T12:00:00').getTime());
            const hy = Y(m.val);
            return (
              <>
                <line x1={hx.toFixed(1)} x2={hx.toFixed(1)} y1="0" y2={H} stroke="rgba(255,255,255,0.15)" strokeWidth="1" />
                <circle cx={hx.toFixed(1)} cy={hy.toFixed(1)} r="4" fill={ACCENT} stroke={CARD} strokeWidth="2" />
              </>
            );
          })()}
        </svg>
        {hoverIdx !== null && (() => {
          const m = chartData[hoverIdx];
          const hx = X(new Date(m.date + 'T12:00:00').getTime());
          const hy = Y(m.val);
          const leftPct = (hx / W) * 100;
          return (
            <div style={{
              position: 'absolute',
              left: `clamp(0px, calc(${leftPct.toFixed(1)}% - 52px), calc(100% - 104px))`,
              top: Math.max(0, hy - 46),
              background: CARD, border: `1px solid ${LINE}`,
              padding: '5px 10px', borderRadius: 4,
              pointerEvents: 'none', zIndex: 10, minWidth: 104,
            }}>
              <div className="font-mono" style={{ fontSize: 10, color: MUTED2 }}>{m.date}</div>
              <div className="font-display" style={{ fontSize: 14, fontWeight: 600, color: 'white' }}>
                {fmt1(m.val)}<span style={{ fontSize: 11, color: MUTED, marginLeft: 3 }}>lb</span>
              </div>
            </div>
          );
        })()}
      </div>

      {/* Legend */}
      <div className="font-mono" style={{ display: 'flex', gap: 16, marginTop: 6, fontSize: 11, color: MUTED2, flexWrap: 'wrap' as const }}>
        <span style={{ color: ACCENT }}>── actual</span>
        <span style={{ color: '#818cf8' }}>╌╌ trend proj</span>
        {tdeePath && <span style={{ color: '#f97316' }}>╌╌ TDEE proj</span>}
        {targetY != null && <span>╌╌ target {fmt1(target!)} lb</span>}
        <span style={{ marginLeft: 'auto' }}>{chartData.length} entries · 28d proj</span>
      </div>
    </Panel>
  );
}

// ─── Goal Progress: Body measurement card (waist / bicep) ────────────────────

function BodyMeasGoalCard({ label, metric, unit, dir, measurements, goal }: {
  label: string; metric: string; unit: string; dir: 'up' | 'down';
  measurements: BodyMeasurement[]; goal: MeasurementGoal | undefined;
}) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  const sorted = measurements
    .filter(m => m.metric === metric)
    .sort((a, b) => a.measuredAt.localeCompare(b.measuredAt))
    .map(m => ({ date: m.measuredAt, val: m.value }));

  const target   = goal?.targetValue;
  const deadline = goal?.targetDate ? normDateStr(goal.targetDate) : null;

  if (!sorted.length) {
    return (
      <Panel title={`${label} goal`} meta={target ? `target ${fmt1(target)} ${unit}` : undefined}>
        <div style={{ fontSize: 13, color: MUTED2 }}>No entries yet.</div>
      </Panel>
    );
  }

  const current  = sorted[sorted.length - 1].val;
  const todayMs  = new Date(localDateStr() + 'T12:00:00').getTime();
  const t0Ms     = new Date(sorted[0].date + 'T12:00:00').getTime();

  // Linear regression slope (units/day)
  let slopePerDay = 0;
  if (sorted.length >= 2) {
    const n   = sorted.length;
    const xs  = sorted.map(m => (new Date(m.date + 'T12:00:00').getTime() - t0Ms) / 86400000);
    const ys  = sorted.map(m => m.val);
    const xM  = xs.reduce((a, b) => a + b, 0) / n;
    const yM  = ys.reduce((a, b) => a + b, 0) / n;
    const den = xs.reduce((s, x) => s + (x - xM) ** 2, 0);
    slopePerDay = den > 0 ? xs.reduce((s, x, i) => s + (x - xM) * (ys[i] - yM), 0) / den : 0;
  }

  let etaDaysVal: number | null = null;
  if (target != null && Math.abs(slopePerDay) > 0.0001) {
    const d = (target - current) / slopePerDay;
    etaDaysVal = d > 0 ? Math.round(d) : null;
  }

  const isAchieved = target != null && (dir === 'down' ? current <= target : current >= target);
  const status     = deadlineStatus(etaDaysVal, deadline, isAchieved);

  // Chart: all history + 30-day projection
  const endMs  = todayMs + 30 * 86400000;
  const W = 760, H = 170;
  const X = (ms: number) => ((ms - t0Ms) / (endMs - t0Ms)) * W;
  const todayX = X(todayMs);

  const projPts = Array.from({ length: 31 }, (_, i) => ({
    x: X(todayMs + i * 86400000),
    y: current + slopePerDay * i,
  }));

  const allY = [...sorted.map(m => m.val), ...projPts.map(p => p.y), target ?? 0].filter(Boolean);
  const minV = Math.min(...allY) * 0.994;
  const maxV = Math.max(...allY) * 1.006;
  const Y = (v: number) => H - ((v - minV) / (maxV - minV)) * (H - 20) - 10;

  const histPath = sorted.map((m, i) =>
    `${i ? 'L' : 'M'}${X(new Date(m.date + 'T12:00:00').getTime()).toFixed(1)},${Y(m.val).toFixed(1)}`
  ).join('');
  const aPath    = `${histPath} L${todayX.toFixed(1)},${H} L${X(t0Ms).toFixed(1)},${H} Z`;
  const projPath = projPts.map((p, i) => `${i ? 'L' : 'M'}${p.x.toFixed(1)},${Y(p.y).toFixed(1)}`).join('');
  const targetY  = target != null ? Y(target) : null;
  const gradId   = `bmgc-${metric}`;

  return (
    <Panel title={`${label} goal`} meta={goal ? `${fmt1(target!)} ${unit} by ${goal.targetDate ? fmtISODate(goal.targetDate) : '—'}` : undefined}>
      {/* Status row */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 20, marginBottom: 12, flexWrap: 'wrap' as const }}>
        <div>
          <div className="micro" style={{ fontSize: 9, color: MUTED, marginBottom: 3 }}>Current</div>
          <span className="font-display" style={{ fontSize: 22, fontWeight: 600, color: 'white' }}>
            {fmt1(current)}<span style={{ fontSize: 11, color: MUTED, marginLeft: 4 }}>{unit}</span>
          </span>
        </div>
        {target != null && (
          <div>
            <div className="micro" style={{ fontSize: 9, color: MUTED, marginBottom: 3 }}>Target</div>
            <span className="font-display" style={{ fontSize: 22, fontWeight: 600, color: MUTED }}>
              {fmt1(target)}<span style={{ fontSize: 11, color: MUTED2, marginLeft: 4 }}>{unit}</span>
            </span>
          </div>
        )}
        {etaDaysVal != null && (
          <div>
            <div className="micro" style={{ fontSize: 9, color: ACCENT, marginBottom: 3 }}>ETA · trend</div>
            <span className="font-mono" style={{ fontSize: 12, color: ACCENT }}>{fmtETA(etaDaysVal)}</span>
          </div>
        )}
        <div style={{ marginLeft: 'auto' }}>
          <StatusChip status={status} />
        </div>
      </div>

      {/* Chart */}
      <div style={{ position: 'relative' }}>
        <svg
          ref={svgRef}
          viewBox={`0 0 ${W} ${H}`}
          style={{ width: '100%', height: H, display: 'block', cursor: 'crosshair' }}
          preserveAspectRatio="none"
          onMouseMove={e => {
            if (!svgRef.current) return;
            const rect = svgRef.current.getBoundingClientRect();
            const xRatio = (e.clientX - rect.left) / rect.width;
            const hoverMs = t0Ms + xRatio * (endMs - t0Ms);
            let closest = 0, minDist = Infinity;
            sorted.forEach((m, i) => {
              const dist = Math.abs(new Date(m.date + 'T12:00:00').getTime() - hoverMs);
              if (dist < minDist) { minDist = dist; closest = i; }
            });
            setHoverIdx(closest);
          }}
          onMouseLeave={() => setHoverIdx(null)}
        >
          <defs>
            <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={ACCENT} stopOpacity="0.14" />
              <stop offset="100%" stopColor={ACCENT} stopOpacity="0" />
            </linearGradient>
          </defs>
          {[0.25, 0.5, 0.75].map((g, i) => (
            <line key={i} x1="0" x2={W} y1={H * g} y2={H * g} stroke={LINE_SOFT} strokeWidth="1" />
          ))}
          {targetY != null && (
            <line x1="0" x2={W} y1={targetY} y2={targetY} stroke={MUTED} strokeWidth="1" strokeDasharray="3 3" opacity="0.5" />
          )}
          <path d={aPath} fill={`url(#${gradId})`} />
          <path d={histPath} fill="none" stroke={ACCENT} strokeWidth="1.8" />
          <line x1={todayX.toFixed(1)} x2={todayX.toFixed(1)} y1="0" y2={H} stroke={LINE} strokeWidth="1" strokeDasharray="2 2" opacity="0.5" />
          <path d={projPath} fill="none" stroke="#818cf8" strokeWidth="1.4" strokeDasharray="4 3" opacity="0.9" />
          <circle cx={todayX.toFixed(1)} cy={Y(current).toFixed(1)} r="3" fill={ACCENT} />
          {hoverIdx !== null && (() => {
            const m = sorted[hoverIdx];
            const hx = X(new Date(m.date + 'T12:00:00').getTime());
            const hy = Y(m.val);
            return (
              <>
                <line x1={hx.toFixed(1)} x2={hx.toFixed(1)} y1="0" y2={H} stroke="rgba(255,255,255,0.15)" strokeWidth="1" />
                <circle cx={hx.toFixed(1)} cy={hy.toFixed(1)} r="4" fill={ACCENT} stroke={CARD} strokeWidth="2" />
              </>
            );
          })()}
        </svg>
        {hoverIdx !== null && (() => {
          const m = sorted[hoverIdx];
          const hx = X(new Date(m.date + 'T12:00:00').getTime());
          const hy = Y(m.val);
          const leftPct = (hx / W) * 100;
          return (
            <div style={{
              position: 'absolute',
              left: `clamp(0px, calc(${leftPct.toFixed(1)}% - 52px), calc(100% - 104px))`,
              top: Math.max(0, hy - 46),
              background: CARD, border: `1px solid ${LINE}`,
              padding: '5px 10px', borderRadius: 4,
              pointerEvents: 'none', zIndex: 10, minWidth: 104,
            }}>
              <div className="font-mono" style={{ fontSize: 10, color: MUTED2 }}>{m.date}</div>
              <div className="font-display" style={{ fontSize: 14, fontWeight: 600, color: 'white' }}>
                {fmt1(m.val)}<span style={{ fontSize: 11, color: MUTED, marginLeft: 3 }}>{unit}</span>
              </div>
            </div>
          );
        })()}
      </div>

      {/* Legend */}
      <div className="font-mono" style={{ display: 'flex', gap: 16, marginTop: 6, fontSize: 11, color: MUTED2, flexWrap: 'wrap' as const }}>
        <span style={{ color: ACCENT }}>── actual</span>
        <span style={{ color: '#818cf8' }}>╌╌ trend proj</span>
        {targetY != null && <span>╌╌ target {fmt1(target!)} {unit}</span>}
        <span style={{ marginLeft: 'auto' }}>{sorted.length} entries · 30d proj</span>
      </div>
    </Panel>
  );
}
// ─── Goal Progress: Workout frequency card ────────────────────────────────────

function WorkoutFreqCard({ routines, routineGoals, workouts }: {
  routines: RoutineSummary[];
  routineGoals: RoutineGoal[];
  workouts: WorkoutSummary[];
}) {
  // Deduplicate by routineId, keep highest id (most recent insert), filter to frequency goals only (≤7)
  const deduped: Record<number, RoutineGoal> = {};
  for (const rg of routineGoals.filter(rg => rg.targetPerWeek <= 7 && rg.targetPerWeek > 0)) {
    if (!deduped[rg.routineId] || rg.id > deduped[rg.routineId].id) deduped[rg.routineId] = rg;
  }
  const goals = Object.values(deduped);

  if (!goals.length) {
    return (
      <Panel title="Workout frequency">
        <div style={{ fontSize: 13, color: MUTED2 }}>No per-routine frequency goals set.</div>
      </Panel>
    );
  }

  // Build 8 week-start strings (oldest → newest)
  const today = localDateStr();
  const weeks: string[] = [];
  for (let i = 7; i >= 0; i--) {
    const d = new Date(today + 'T12:00:00');
    d.setDate(d.getDate() - i * 7);
    weeks.push(getWeekStart(localDateStr(d)));
  }
  const thisWeek = weeks[weeks.length - 1];

  function weekEnd(ws: string): string {
    const d = new Date(ws + 'T12:00:00');
    d.setDate(d.getDate() + 6);
    return localDateStr(d);
  }

  function countForRoutineWeek(routineId: number, ws: string): number {
    const we = weekEnd(ws);
    return workouts.filter(w => w.routineId === routineId && w.workoutDate >= ws && w.workoutDate <= we).length;
  }

  function routineName(id: number): string {
    return routines.find(r => r.id === id)?.name ?? `Routine ${id}`;
  }

  // Overall status: all routines hit target this week?
  const allDone = goals.every(rg => countForRoutineWeek(rg.routineId, thisWeek) >= rg.targetPerWeek);
  const overallStatus: GoalStatus = allDone ? 'achieved' : 'on_track';

  return (
    <Panel title="Workout frequency" meta={`${goals.length} routine${goals.length !== 1 ? 's' : ''} · weekly targets`}>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
        <StatusChip status={overallStatus} />
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {goals.map(rg => {
          const name      = routineName(rg.routineId);
          const thisCount = countForRoutineWeek(rg.routineId, thisWeek);
          const hit       = thisCount >= rg.targetPerWeek;
          return (
            <div key={rg.routineId}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                <span style={{ fontSize: 12, color: 'white', fontWeight: 500 }}>{name}</span>
                <span style={{ fontSize: 11, color: hit ? COL_GOOD : MUTED2, fontFamily: 'var(--font-mono)' }}>
                  {thisCount}/{rg.targetPerWeek} this week
                </span>
              </div>
              <div style={{ display: 'flex', gap: 4 }}>
                {weeks.map(ws => {
                  const count   = countForRoutineWeek(rg.routineId, ws);
                  const isHit   = count >= rg.targetPerWeek;
                  const isThis  = ws === thisWeek;
                  return (
                    <div
                      key={ws}
                      title={`${ws}: ${count}/${rg.targetPerWeek}`}
                      style={{
                        flex: 1, height: 22, borderRadius: 3,
                        background: isHit
                          ? isThis ? ACCENT : COL_GOOD + 'aa'
                          : LINE_SOFT,
                        border: isThis ? `1px solid ${ACCENT}55` : 'none',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                      }}
                    >
                      {isHit && (
                        <span style={{ fontSize: 8, color: isThis ? 'rgba(0,0,0,0.7)' : 'rgba(255,255,255,0.6)' }}>✓</span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
      <div className="font-mono" style={{ display: 'flex', justifyContent: 'space-between', marginTop: 12, fontSize: 9, color: MUTED2 }}>
        <span>8 weeks ago</span>
        <span>this week</span>
      </div>
    </Panel>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const navigate = useNavigate();
  const today = localDateStr();
  const now = new Date();
  const hour = now.getHours();
  const greeting = hour < 12 ? 'Morning' : hour < 17 ? 'Afternoon' : 'Evening';
  const dateStr = now.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }).replace(',', ' ·');

  const [workouts,       setWorkouts]       = useState<WorkoutSummary[]>([]);
  const [exGoals,        setExGoals]        = useState<ExerciseGoals | null>(null);
  const [measurements,   setMeasurements]   = useState<BodyMeasurement[]>([]);
  const [measGoals,      setMeasGoals]      = useState<Record<string, MeasurementGoal>>({});
  const [summary,        setSummary]        = useState<GoalsSummary | null>(null);
  const [personalBests,  setPersonalBests]  = useState<PersonalBests | null>(null);
  const [foodLogHistory, setFoodLogHistory] = useState<FoodLogHistoryDay[]>([]);
  const [routines,       setRoutines]       = useState<RoutineSummary[]>([]);
  const [todayTDEE,      setTodayTDEE]      = useState<TDEEBreakdown | null>(null);
  const [upcoming,       setUpcoming]       = useState<UpcomingSession[]>([]);
  const [insight,        setInsight]        = useState<string | null>(null);
  const [insightPeriod,  setInsightPeriod]  = useState<InsightPeriod>('morning');
  const [recovery,       setRecovery]       = useState<RecoveryData | null>(null);
  const [routineGoals,   setRoutineGoals]   = useState<RoutineGoal[]>([]);
  const [loading,        setLoading]        = useState(true);

  useEffect(() => {
    Promise.all([
      workoutsApi.getAll({ limit: 200 }),
      goalsApi.getExercise().catch(() => null),
      goalsApi.getSummary().catch(() => null),
      measurementsApi.getAll().catch(() => []),
      measurementsApi.getGoals().catch(() => ({})),
      workoutsApi.getPersonalBests().catch(() => null),
      logApi.getHistory(60).catch(() => []),
      routinesApi.getAll().catch(() => []),
      goalsApi.getTDEE().catch(() => null),
      schedulesApi.getUpcoming(7).catch(() => []),
      assistantApi.getInsight().catch(() => null),
      recoveryApi.get().catch(() => null),
      routinesApi.getAllGoals().catch(() => []),
    ]).then(([ws, eg, s, ms, mg, pb, fl, rl, tdee, upc, ins, rec, rg]) => {
      setWorkouts(ws);
      setExGoals(eg);
      setSummary(s as GoalsSummary | null);
      setMeasurements(ms as BodyMeasurement[]);
      setMeasGoals(mg as Record<string, MeasurementGoal>);
      setPersonalBests(pb);
      setFoodLogHistory(fl as FoodLogHistoryDay[]);
      setRoutines(rl as RoutineSummary[]);
      const t = tdee as import('@pulse/api-client').TDEEResult | null;
      if (t?.available) setTodayTDEE(t as TDEEBreakdown);
      setUpcoming(upc as UpcomingSession[]);
      if (ins?.text) { setInsight(ins.text); setInsightPeriod(ins.period ?? 'morning'); }
      if (rec) setRecovery(rec as RecoveryData);
      if (rg) setRoutineGoals(rg as RoutineGoal[]);
    }).catch(() => {}).finally(() => setLoading(false));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', background: BG }}>
        <div className="micro" style={{ color: MUTED }}>Loading…</div>
      </div>
    );
  }

  const todayWorkout   = workouts.find(w => w.workoutDate === today && w.exerciseCount > 0) ?? null;
  const weekStart      = summary?.weekStart ?? getWeekStart(today);
  const weeklyData     = buildWeeklyData(workouts);
  const thisWeekBucket = weeklyData[weeklyData.length - 1];

  // Weight streak (consecutive days with a logged workout)
  function computeStreak() {
    const days = new Set(workouts.map(w => w.workoutDate));
    let streak = 0, cursor = new Date(today + 'T12:00:00');
    if (!days.has(today)) cursor.setDate(cursor.getDate() - 1);
    while (days.has(localDateStr(cursor))) { streak++; cursor.setDate(cursor.getDate() - 1); }
    return streak;
  }
  const streak = computeStreak();

  return (
    <div style={{ flex: 1, minWidth: 0, background: BG, height: '100%', overflowY: 'auto' }}>

      {/* Topbar */}
      <div className="flex-shrink-0 px-6 pt-5 pb-3 border-b border-dram-border flex items-center justify-between">
        <h1 className="text-xl font-semibold text-slate-200">Dashboard</h1>
        <div className="flex items-center gap-2">
          <button onClick={() => navigate('/nutrition/today')}
            className="border border-dram-accent text-dram-accent font-semibold px-4 py-2 rounded-lg text-sm hover:bg-dram-accent/10 transition">
            + Log
          </button>
          <button onClick={() => navigate('/workouts')}
            className="bg-dram-accent text-black font-semibold px-4 py-2 rounded-lg text-sm hover:brightness-110 transition">
            + Train
          </button>
        </div>
      </div>

      {/* Insight banner */}
      <div style={{ padding: '18px 36px 0' }}>
        <InsightBanner
          text={insight || 'Track daily to unlock personalized AI insights about your health habits and progress.'}
          streak={streak}
          date={dateStr}
          period={insightPeriod}
        />
      </div>

      {/* ── TODAY ─────────────────────────────────────────────────────────────── */}
      <Band kicker="Today">
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1.2fr', gap: 14 }}>
          <Panel title="Fuel today">
            <FuelToday actual={summary?.nutrition.actual ?? null} goals={summary?.nutrition.goals ?? null} tdee={todayTDEE} />
          </Panel>
          <Panel title="Exercise today" meta={todayWorkout ? `${todayWorkout.durationMinutes ?? '—'} min · ${fmt(todayWorkout.totalVolumeKg * KG_TO_LBS)} lb` : undefined}>
            <ExerciseToday workout={todayWorkout} allWorkouts={workouts} upcoming={upcoming} recovery={recovery} navigate={navigate} />
          </Panel>
        </div>
        <div style={{ marginTop: 14 }}>
          <Panel title="Weekly Goal Progress" meta={`day ${Math.min(7, Math.ceil((new Date(today + 'T00:00:00').getTime() - new Date(weekStart + 'T00:00:00').getTime()) / 86400000) + 1)} of 7`}>
            <ThisWeek summary={summary} exGoals={exGoals} thisWeekBucket={thisWeekBucket} foodLogHistory={foodLogHistory} weekStart={weekStart} />
          </Panel>
        </div>
      </Band>

      {/* ── TRENDS ────────────────────────────────────────────────────────────── */}
      <Band kicker="Trends">
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
          <Panel title="Calories · consumed vs burned">
            <CalVsBurned foodLogHistory={foodLogHistory} workouts={workouts} todayTDEE={todayTDEE} />
          </Panel>
          <Panel title="Exercise volume · week over week">
            <VolumeByWeek weeklyData={weeklyData} />
          </Panel>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.4fr', gap: 14, marginTop: 14 }}>
          <Panel title="Exercise volume · 12-week heatmap">
            <Heatmap workouts={workouts} />
          </Panel>
          <Panel title="Weekly averages">
            <WeeklyAvgTable foodLogHistory={foodLogHistory} workouts={workouts} todayTDEE={todayTDEE} />
          </Panel>
        </div>
      </Band>

      {/* ── GOAL PROGRESS ─────────────────────────────────────────────────────── */}
      <Band kicker="Goal progress">
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
          <WeightGoalCard measurements={measurements} goal={measGoals['weight']} foodLogHistory={foodLogHistory} tdee={todayTDEE} />
          <BodyMeasGoalCard label="Waist" metric="waist" unit="in" dir="down" measurements={measurements} goal={measGoals['waist']} />
          <BodyMeasGoalCard label="Bicep" metric="bicep" unit="in" dir="up" measurements={measurements} goal={measGoals['bicep']} />
          <WorkoutFreqCard routines={routines} routineGoals={routineGoals} workouts={workouts} />
        </div>
      </Band>

      {/* ── SESSIONS ──────────────────────────────────────────────────────────── */}
      <Band kicker="Sessions" title="Recent workouts logged">
        <Panel title="Recent sessions" meta={`${workouts.length} total`}>
          <RecentSessions workouts={workouts} navigate={navigate} />
        </Panel>
      </Band>

      <div style={{ padding: '24px 36px 60px' }} className="font-mono">
        <div style={{ height: 1, background: LINE_SOFT, marginBottom: 14 }} />
        <span style={{ fontSize: 10, color: MUTED2 }}>Pulse · Dashboard v4 preview · Phase 4a</span>
      </div>
    </div>
  );
}
