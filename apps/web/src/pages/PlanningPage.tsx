import { useEffect, useRef, useMemo, useState } from 'react';
import {
  goalsApi, measurementsApi, schedulesApi, routinesApi, exercisesApi,
  mealPlanApi, foodsApi, recipesApi, userGoalsApi,
  computeGoalPace,
  GLASS_OZ,
  getWeekStart, localDateStr, shortDate,
  type GoalsSummary, type ExerciseGoals, type MeasurementGoal, type BodyMeasurement, type PaceStatus, type TDEEResult,
  type WorkoutSchedule, type UpcomingSession, type ProgramTemplate, type RecurrenceType, type RoutineSummary,
  type MealPlanWeek, type MealPlanTemplate,
  type MealSlot, type Food, type Recipe, type Exercise,
  type UserGoal, type GoalMetricType, type GoalSourceType,
} from '@pulse/api-client';
import { useNavigate } from 'react-router-dom';
import PlanningCalendarCard from './PlanningCalendarCard';

// ─── Shared config ────────────────────────────────────────────────────────────

const METRIC_CONFIG: Record<string, { label: string; unit: string; dir: 'up' | 'down' }> = {
  weight:      { label: 'Weight',      unit: 'lbs', dir: 'down' },
  waist:       { label: 'Waist',       unit: 'in',  dir: 'down' },
  bicep:       { label: 'Bicep',       unit: 'in',  dir: 'up'   },
  chest:       { label: 'Chest',       unit: 'in',  dir: 'up'   },
  hips:        { label: 'Hips',        unit: 'in',  dir: 'down' },
  body_fat:    { label: 'Body Fat',    unit: '%',   dir: 'down' },
  muscle_mass: { label: 'Muscle Mass', unit: 'lbs', dir: 'up'   },
  water_pct:   { label: 'Water Mass',  unit: '%',   dir: 'up'   },
};

const ALL_METRICS = Object.keys(METRIC_CONFIG);

const DOW_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

const inputCls = 'w-full bg-dram-bg border border-dram-border rounded px-2 py-1.5 text-sm text-slate-100 focus:outline-none focus:border-dram-accent';

function ProgressBar({ actual, goal, color }: { actual: number; goal: number | null; color: string }) {
  const pct = goal ? Math.min(actual / goal, 1) : 0;
  return (
    <div className="h-2 rounded-full overflow-hidden" style={{ backgroundColor: 'rgba(255,255,255,0.08)' }}>
      <div className="h-full rounded-full transition-all duration-500" style={{ width: `${pct * 100}%`, backgroundColor: color }} />
    </div>
  );
}

function PaceBadge({ status }: { status: PaceStatus }) {
  const cfg = {
    done:   { label: '✓ Achieved', color: '#86AA80' },
    green:  { label: '↑ Ahead',    color: '#86AA80' },
    yellow: { label: '→ On track', color: '#D4A843' },
    red:    { label: '↓ Behind',   color: '#C5896E' },
  }[status];
  return <span className="text-xs font-medium px-2 py-0.5 rounded-full" style={{ color: cfg.color, backgroundColor: `${cfg.color}22` }}>{cfg.label}</span>;
}

function SectionHeader({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between mb-4">
      <h2 className="text-base font-semibold text-slate-200">{title}</h2>
      {children}
    </div>
  );
}

// ─── Week strip ───────────────────────────────────────────────────────────────

function WeekStrip({ upcoming }: { upcoming: UpcomingSession[] }) {
  const today = new Date().toISOString().slice(0, 10);
  const jsToday = new Date(today + 'T00:00:00');
  const jsDow = jsToday.getDay(); // 0=Sun
  const mondayOffset = jsDow === 0 ? -6 : 1 - jsDow;
  const monday = new Date(jsToday);
  monday.setDate(jsToday.getDate() + mondayOffset);

  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    const dateStr = d.toISOString().slice(0, 10);
    const session = upcoming.find((u) => u.date === dateStr);
    return { dateStr, dayNum: d.getDate(), session, isToday: dateStr === today };
  });

  function dotColor(session?: UpcomingSession) {
    if (!session) return 'transparent';
    if (session.status === 'completed') return '#86AA80';
    if (session.status === 'skipped')  return '#C5896E';
    if (session.status === 'rest')     return '#64748b';
    return '#D4A843';
  }

  return (
    <div className="grid grid-cols-7 gap-1">
      {days.map(({ dateStr, dayNum, session, isToday }, i) => (
        <div key={dateStr} className="flex flex-col items-center gap-1 min-w-0">
          <span className="text-xs text-slate-500">{DOW_LABELS[i][0]}</span>
          <div className={`w-7 h-7 rounded-full flex items-center justify-center text-sm ${isToday ? 'bg-dram-accent text-black font-bold' : 'text-slate-300'}`}>
            {dayNum}
          </div>
          <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: dotColor(session) }} />
          {session && !session.isRestDay && (
            <span className="text-[10px] text-slate-500 leading-tight truncate w-full text-center" title={session.exerciseName ?? session.routineName ?? session.dayLabel ?? ''}>
              {session.exerciseName ?? session.routineName ?? session.dayLabel ?? ''}
            </span>
          )}
        </div>
      ))}
    </div>
  );
}

// ─── Week calorie bar chart ───────────────────────────────────────────────────

function WeekCalorieChart({ days, goal }: {
  days: Array<{ label: string; calories: number }>;
  goal: number | null;
}) {
  const H = 48;
  const max = Math.max(...days.map(d => d.calories), goal ?? 0, 100);
  return (
    <div>
      <div className="relative" style={{ height: `${H}px` }}>
        {goal != null && goal > 0 && (
          <div
            className="absolute left-0 right-0 border-t border-dashed border-dram-accent/40 pointer-events-none"
            style={{ bottom: `${Math.round((goal / max) * H)}px` }}
          />
        )}
        <div className="flex items-end gap-0.5 h-full">
          {days.map((d, i) => (
            <div key={i} className="flex-1 h-full flex items-end">
              <div
                className="w-full rounded-t"
                style={{
                  height: d.calories > 0
                    ? `${Math.max(Math.round((d.calories / max) * H), 3)}px`
                    : '2px',
                  backgroundColor: d.calories > 0 ? '#D4A84388' : 'rgba(255,255,255,0.05)',
                }}
              />
            </div>
          ))}
        </div>
      </div>
      <div className="flex gap-0.5 mt-1">
        {days.map((d, i) => (
          <div key={i} className="flex-1 text-center">
            <span className="text-[10px] text-slate-600">{d.label.slice(0, 1)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function computeETAFromSlope(latestLbs: number, targetLbs: number, slopePerWeek: number): string | null {
  if (Math.abs(slopePerWeek) < 0.001) return null;
  const remaining = targetLbs - latestLbs;
  if ((remaining < 0 && slopePerWeek < 0) || (remaining > 0 && slopePerWeek > 0)) {
    const weeks = remaining / slopePerWeek;
    const d = new Date();
    d.setDate(d.getDate() + Math.round(weeks * 7));
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  }
  return null;
}

// ─── Section 1: Nutrition Targets ────────────────────────────────────────────

function NutritionSection({ summary, onSaved }: { summary: GoalsSummary | null; onSaved: () => void }) {
  const goals = summary?.nutrition.goals;
  const actual = summary?.nutrition.actual;
  const [editing, setEditing] = useState(false);
  const [calories, setCalories] = useState('');
  const [protein, setProtein] = useState('');
  const [carbs, setCarbs] = useState('');
  const [fat, setFat] = useState('');
  const [water, setWater] = useState('');
  const [saving, setSaving] = useState(false);

  function openEdit() {
    setCalories(String(goals?.calories ?? ''));
    setProtein(String(goals?.proteinG ?? ''));
    setCarbs(String(goals?.carbsG ?? ''));
    setFat(String(goals?.fatG ?? ''));
    setWater(goals?.waterGoalOz != null ? String(Math.round(goals.waterGoalOz / GLASS_OZ)) : '');
    setEditing(true);
  }

  async function handleSave() {
    if (!calories || !protein || !carbs || !fat) return;
    setSaving(true);
    try {
      await goalsApi.saveNutrition({
        calories: Number(calories),
        proteinG: Number(protein),
        carbsG: Number(carbs),
        fatG: Number(fat),
        waterGoalOz: water !== '' ? Number(water) * GLASS_OZ : undefined,
      });
      setEditing(false);
      onSaved();
    } catch { /* ignore */ } finally { setSaving(false); }
  }

  const bars = [
    { label: 'Calories', actual: actual?.calories ?? 0, goal: goals?.calories ?? null, unit: 'kcal', color: '#D4A843' },
    { label: 'Protein',  actual: actual?.proteinG ?? 0, goal: goals?.proteinG ?? null, unit: 'g',    color: '#60a5fa' },
    { label: 'Carbs',    actual: actual?.carbsG ?? 0,   goal: goals?.carbsG ?? null,   unit: 'g',    color: '#34d399' },
    { label: 'Fat',      actual: actual?.fatG ?? 0,     goal: goals?.fatG ?? null,     unit: 'g',    color: '#fb923c' },
  ];

  return (
    <div className="bg-dram-card border border-dram-border p-5 space-y-4">
      <SectionHeader title="Daily Nutrition Targets">
        {!editing && (
          <button onClick={openEdit} className="text-sm text-dram-accent hover:brightness-110 transition-colors">
            Edit
          </button>
        )}
      </SectionHeader>

      {!editing ? (
        <div className="space-y-3">
          {bars.map(({ label, actual: a, goal, unit, color }) => (
            <div key={label}>
              <div className="flex justify-between items-baseline mb-1.5">
                <span className="text-sm text-slate-300">{label}</span>
                <span className="text-sm text-slate-400">
                  {Math.round(a)} {unit}{goal != null ? ` / ${goal} ${unit}` : ' — no target set'}
                </span>
              </div>
              <ProgressBar actual={a} goal={goal} color={color} />
            </div>
          ))}
        </div>
      ) : (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            {([
              ['Calories (kcal)', calories, setCalories],
              ['Protein (g)',     protein,  setProtein],
              ['Carbs (g)',       carbs,    setCarbs],
              ['Fat (g)',         fat,      setFat],
              ['Water (glasses)', water,    setWater],
            ] as [string, string, (v: string) => void][]).map(([label, val, setter]) => (
              <div key={label}>
                <label className="block text-sm text-slate-500 mb-1">{label}</label>
                <input type="number" min="0" value={val} onChange={(e) => setter(e.target.value)} className={inputCls} />
              </div>
            ))}
          </div>
          <div className="flex gap-2 pt-1">
            <button onClick={() => setEditing(false)} className="flex-1 text-sm text-slate-400 hover:text-slate-200 transition-colors py-2">Cancel</button>
            <button
              onClick={handleSave}
              disabled={saving || !calories || !protein || !carbs || !fat}
              className="flex-1 bg-dram-accent text-black text-sm font-semibold rounded-lg py-2 hover:brightness-110 disabled:opacity-50 transition"
            >
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Section 2: Exercise Targets ─────────────────────────────────────────────

function ExerciseSection({ summary, exGoals, onSaved }: {
  summary: GoalsSummary | null;
  exGoals: ExerciseGoals | null;
  onSaved: () => void;
}) {
  const actual = summary?.workouts.actual;
  const [editing, setEditing] = useState(false);
  const [workouts, setWorkouts] = useState('');
  const [minutes, setMinutes] = useState('');
  const [volume, setVolume] = useState('');
  const [saving, setSaving] = useState(false);

  function openEdit() {
    setWorkouts(exGoals?.workoutsPerWeek != null ? String(exGoals.workoutsPerWeek) : '');
    setMinutes(exGoals?.minutesPerWeek != null ? String(exGoals.minutesPerWeek) : '');
    setVolume(exGoals?.volumeLbsPerWeek != null ? String(exGoals.volumeLbsPerWeek) : '');
    setEditing(true);
  }

  async function handleSave() {
    setSaving(true);
    try {
      await goalsApi.saveExercise({
        workoutsPerWeek: workouts !== '' ? Number(workouts) : null,
        minutesPerWeek: minutes !== '' ? Number(minutes) : null,
        volumeLbsPerWeek: volume !== '' ? Number(volume) : null,
      });
      setEditing(false);
      onSaved();
    } catch { /* ignore */ } finally { setSaving(false); }
  }

  const bars = [
    { label: 'Workouts this week', actual: actual?.workoutCount ?? 0, goal: exGoals?.workoutsPerWeek ?? null, unit: '' },
    { label: 'Minutes this week',  actual: actual?.totalMinutes ?? 0, goal: exGoals?.minutesPerWeek ?? null,  unit: ' min' },
  ];

  return (
    <div className="bg-dram-card border border-dram-border p-5 space-y-4">
      <SectionHeader title="Weekly Exercise Targets">
        {!editing && (
          <button onClick={openEdit} className="text-sm text-dram-accent hover:brightness-110 transition-colors">
            Edit
          </button>
        )}
      </SectionHeader>

      {!editing ? (
        <div className="space-y-3">
          {bars.map(({ label, actual: a, goal, unit }) => (
            <div key={label}>
              <div className="flex justify-between items-baseline mb-1.5">
                <span className="text-sm text-slate-300">{label}</span>
                <span className="text-sm text-slate-400">
                  {Math.round(a)}{unit}{goal != null ? ` / ${goal}${unit}` : ' — no target set'}
                </span>
              </div>
              <ProgressBar actual={a} goal={goal} color="#a78bfa" />
            </div>
          ))}
          <div className="flex justify-between items-baseline pt-1">
            <span className="text-sm text-slate-300">Volume target</span>
            <span className="text-sm text-slate-400">
              {exGoals?.volumeLbsPerWeek != null ? `${exGoals.volumeLbsPerWeek} lbs / week` : '— no target set'}
            </span>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm text-slate-500 mb-1">Workouts / week</label>
              <input type="number" min="0" value={workouts} onChange={(e) => setWorkouts(e.target.value)} className={inputCls} placeholder="e.g. 4" />
            </div>
            <div>
              <label className="block text-sm text-slate-500 mb-1">Minutes / week</label>
              <input type="number" min="0" value={minutes} onChange={(e) => setMinutes(e.target.value)} className={inputCls} placeholder="e.g. 180" />
            </div>
            <div>
              <label className="block text-sm text-slate-500 mb-1">Volume / week (lbs)</label>
              <input type="number" min="0" value={volume} onChange={(e) => setVolume(e.target.value)} className={inputCls} placeholder="e.g. 10000" />
            </div>
          </div>
          <div className="flex gap-2 pt-1">
            <button onClick={() => setEditing(false)} className="flex-1 text-sm text-slate-400 hover:text-slate-200 transition-colors py-2">Cancel</button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex-1 bg-dram-accent text-black text-sm font-semibold rounded-lg py-2 hover:brightness-110 disabled:opacity-50 transition"
            >
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Section 3: Body Measurement Goals ───────────────────────────────────────

function MeasurementGoalRow({
  metric, goal, measurements, onEdit, onDelete,
}: {
  metric: string;
  goal: MeasurementGoal;
  measurements: BodyMeasurement[];
  onEdit: () => void;
  onDelete: () => void;
}) {
  const cfg = METRIC_CONFIG[metric];
  if (!cfg) return null;

  const sorted = measurements
    .filter((m) => m.metric === metric)
    .sort((a, b) => b.measuredAt.localeCompare(a.measuredAt));
  const latest = sorted[0];
  const { status, projectedDate } = computeGoalPace(measurements, metric, goal, cfg.dir);

  const displayVal = latest
    ? (metric === 'weight' && latest.unit === 'kg' ? (latest.value * 2.20462).toFixed(1) : Number(latest.value).toFixed(1))
    : null;

  return (
    <div className="flex items-center gap-3 py-3 border-b border-dram-border last:border-0">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-0.5">
          <span className="text-sm font-medium text-slate-200">{cfg.label}</span>
          <PaceBadge status={status} />
        </div>
        <div className="text-sm text-slate-400">
          {displayVal != null ? `${displayVal} ${cfg.unit} now` : 'No data'}
          {' → '}<span className="text-slate-300">{goal.targetValue} {cfg.unit}</span>
          {goal.targetDate && <span className="text-slate-500"> · by {new Date(goal.targetDate + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>}
          {projectedDate && status !== 'done' && <span className="text-slate-500"> · proj. {projectedDate}</span>}
        </div>
      </div>
      <div className="flex gap-1">
        <button onClick={onEdit} className="text-sm text-slate-400 hover:text-slate-200 px-2 py-1 transition-colors">Edit</button>
        <button onClick={onDelete} className="text-sm text-slate-500 hover:text-red-400 px-2 py-1 transition-colors">✕</button>
      </div>
    </div>
  );
}

function GoalEditForm({
  metric, current, onSave, onCancel,
}: {
  metric: string;
  current: MeasurementGoal | null;
  onSave: (data: { targetValue: number; unit: string; targetDate: string | null }) => Promise<void>;
  onCancel: () => void;
}) {
  const cfg = METRIC_CONFIG[metric];
  const [value, setValue] = useState(current ? String(current.targetValue) : '');
  const [date, setDate] = useState(current?.targetDate ?? '');
  const [saving, setSaving] = useState(false);

  async function submit() {
    if (!value) return;
    setSaving(true);
    try {
      await onSave({ targetValue: Number(value), unit: cfg.unit, targetDate: date || null });
    } finally { setSaving(false); }
  }

  return (
    <div className="bg-dram-bg rounded-lg border border-dram-border p-3 mt-1">
      <div className="text-sm font-medium text-slate-300 mb-2">{cfg.label} ({cfg.unit})</div>
      <div className="grid grid-cols-2 gap-2 mb-2">
        <div>
          <label className="block text-sm text-slate-500 mb-1">Target</label>
          <input type="number" min="0" step="0.1" value={value} onChange={(e) => setValue(e.target.value)} className={inputCls} autoFocus />
        </div>
        <div>
          <label className="block text-sm text-slate-500 mb-1">By date (optional)</label>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={inputCls} />
        </div>
      </div>
      <div className="flex gap-2">
        <button onClick={onCancel} className="flex-1 text-sm text-slate-400 hover:text-slate-200 py-1.5 transition-colors">Cancel</button>
        <button
          onClick={submit}
          disabled={saving || !value}
          className="flex-1 bg-dram-accent text-black text-sm font-semibold rounded py-1.5 hover:brightness-110 disabled:opacity-50 transition"
        >
          {saving ? 'Saving…' : 'Save Goal'}
        </button>
      </div>
    </div>
  );
}

function MeasurementGoalsSection({
  goals, measurements, onReload,
}: {
  goals: Record<string, MeasurementGoal>;
  measurements: BodyMeasurement[];
  onReload: () => void;
}) {
  const [editingMetric, setEditingMetric] = useState<string | null>(null);
  const [addingMetric, setAddingMetric] = useState<string | null>(null);
  const activeMetrics = ALL_METRICS.filter((m) => goals[m]);
  const availableToAdd = ALL_METRICS.filter((m) => !goals[m]);

  async function handleSave(metric: string, data: { targetValue: number; unit: string; targetDate: string | null }) {
    await measurementsApi.setGoal(metric, data);
    setEditingMetric(null);
    setAddingMetric(null);
    onReload();
  }

  async function handleDelete(metric: string) {
    await measurementsApi.deleteGoal(metric);
    onReload();
  }

  return (
    <div className="bg-dram-card border border-dram-border p-5">
      <SectionHeader title="Body Measurement Goals" />

      {activeMetrics.length === 0 && !addingMetric && (
        <p className="text-sm text-slate-500 mb-4">No measurement goals set. Add one below to start tracking.</p>
      )}

      {activeMetrics.map((metric) => (
        <div key={metric}>
          {editingMetric === metric ? (
            <GoalEditForm
              metric={metric}
              current={goals[metric]}
              onSave={(data) => handleSave(metric, data)}
              onCancel={() => setEditingMetric(null)}
            />
          ) : (
            <MeasurementGoalRow
              metric={metric}
              goal={goals[metric]}
              measurements={measurements}
              onEdit={() => { setEditingMetric(metric); setAddingMetric(null); }}
              onDelete={() => handleDelete(metric)}
            />
          )}
        </div>
      ))}

      {addingMetric ? (
        <GoalEditForm
          metric={addingMetric}
          current={null}
          onSave={(data) => handleSave(addingMetric, data)}
          onCancel={() => setAddingMetric(null)}
        />
      ) : availableToAdd.length > 0 ? (
        <div className="mt-3 pt-3 border-t border-dram-border">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm text-slate-500">Add goal:</span>
            {availableToAdd.map((m) => (
              <button
                key={m}
                onClick={() => { setAddingMetric(m); setEditingMetric(null); }}
                className="text-sm px-2 py-1 border border-dram-border rounded-full text-slate-400 hover:text-slate-200 hover:border-slate-500 transition-colors"
              >
                + {METRIC_CONFIG[m].label}
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

// ─── User Goal Form ───────────────────────────────────────────────────────────

type MetricGroup = { label: string; metrics: GoalMetricType[] };

const METRIC_GROUPS: MetricGroup[] = [
  { label: 'Strength', metrics: ['exercise_max_weight', 'exercise_max_reps', 'exercise_session_volume', 'exercise_weekly_volume', 'exercise_session_reps', 'exercise_weekly_reps'] },
  { label: 'Cardio',   metrics: ['exercise_session_distance', 'exercise_weekly_distance', 'exercise_session_duration', 'exercise_weekly_duration'] },
  { label: 'Steps',    metrics: ['exercise_session_steps', 'exercise_weekly_steps'] },
  { label: 'Frequency',metrics: ['exercise_weekly_sessions'] },
  { label: 'Pedometer',metrics: ['daily_steps_avg', 'weekly_steps_total'] },
  { label: 'Body',     metrics: ['body_measurement'] },
  { label: 'Nutrition',metrics: ['nutrition_daily_avg'] },
];

const METRIC_LABELS: Record<GoalMetricType, string> = {
  exercise_max_weight:       'Max weight (single lift)',
  exercise_max_reps:         'Max reps (single set)',
  exercise_session_volume:   'Session volume',
  exercise_weekly_volume:    'Weekly volume',
  exercise_session_reps:     'Session total reps',
  exercise_weekly_reps:      'Weekly total reps',
  exercise_session_steps:    'Session steps',
  exercise_weekly_steps:     'Weekly steps',
  exercise_session_distance: 'Session distance',
  exercise_weekly_distance:  'Weekly distance',
  exercise_session_duration: 'Session duration',
  exercise_weekly_duration:  'Weekly duration',
  exercise_weekly_sessions:  'Weekly sessions',
  daily_steps_avg:           'Daily steps average',
  weekly_steps_total:        'Weekly steps total',
  body_measurement:          'Body measurement',
  nutrition_daily_avg:       'Daily nutrition average',
};

const METRIC_DEFAULT_UNIT: Record<GoalMetricType, string> = {
  exercise_max_weight:       'lbs',
  exercise_max_reps:         'reps',
  exercise_session_volume:   'lbs',
  exercise_weekly_volume:    'lbs',
  exercise_session_reps:     'reps',
  exercise_weekly_reps:      'reps',
  exercise_session_steps:    'steps',
  exercise_weekly_steps:     'steps',
  exercise_session_distance: 'miles',
  exercise_weekly_distance:  'miles',
  exercise_session_duration: 'min',
  exercise_weekly_duration:  'min',
  exercise_weekly_sessions:  'sessions',
  daily_steps_avg:           'steps',
  weekly_steps_total:        'steps',
  body_measurement:          '',
  nutrition_daily_avg:       '',
};

const METRIC_REQUIRED_FIELD: Partial<Record<GoalMetricType, string>> = {
  exercise_max_weight:       'weight',
  exercise_session_volume:   'weight',
  exercise_weekly_volume:    'weight',
  exercise_max_reps:         'reps',
  exercise_session_reps:     'reps',
  exercise_weekly_reps:      'reps',
  exercise_session_steps:    'steps',
  exercise_weekly_steps:     'steps',
  exercise_session_distance: 'distance',
  exercise_weekly_distance:  'distance',
  exercise_session_duration: 'duration',
  exercise_weekly_duration:  'duration',
};

const METRIC_SOURCE_TYPE: Record<GoalMetricType, GoalSourceType> = {
  exercise_max_weight:       'exercise',
  exercise_max_reps:         'exercise',
  exercise_session_volume:   'exercise',
  exercise_weekly_volume:    'exercise',
  exercise_session_reps:     'exercise',
  exercise_weekly_reps:      'exercise',
  exercise_session_steps:    'exercise',
  exercise_weekly_steps:     'exercise',
  exercise_session_distance: 'exercise',
  exercise_weekly_distance:  'exercise',
  exercise_session_duration: 'exercise',
  exercise_weekly_duration:  'exercise',
  exercise_weekly_sessions:  'exercise',
  daily_steps_avg:           'steps',
  weekly_steps_total:        'steps',
  body_measurement:          'measurement',
  nutrition_daily_avg:       'nutrition',
};

const MEASUREMENT_KEY_OPTIONS = [
  { key: 'weight',      label: 'Weight',      unit: 'lbs' },
  { key: 'waist',       label: 'Waist',       unit: 'in'  },
  { key: 'bicep',       label: 'Bicep',       unit: 'in'  },
  { key: 'chest',       label: 'Chest',       unit: 'in'  },
  { key: 'hips',        label: 'Hips',        unit: 'in'  },
  { key: 'body_fat',    label: 'Body Fat',    unit: '%'   },
  { key: 'muscle_mass', label: 'Muscle Mass', unit: 'lbs' },
  { key: 'water_pct',   label: 'Water Mass',  unit: '%'   },
];

const NUTRITION_KEY_OPTIONS = [
  { key: 'calories', label: 'Calories', unit: 'kcal' },
  { key: 'protein',  label: 'Protein',  unit: 'g'    },
  { key: 'carbs',    label: 'Carbs',    unit: 'g'    },
  { key: 'fat',      label: 'Fat',      unit: 'g'    },
  { key: 'water',    label: 'Water',    unit: 'glasses' },
];

function UserGoalForm({
  initial,
  exercisesList,
  routinesList,
  onClose,
  onSaved,
}: {
  initial?: UserGoal;
  exercisesList: Exercise[];
  routinesList: RoutineSummary[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name,        setName]        = useState(initial?.name        ?? '');
  const [metricType,  setMetricType]  = useState<GoalMetricType>(initial?.metricType ?? 'exercise_max_weight');
  const [sourceType,  setSourceType]  = useState<GoalSourceType>(initial?.sourceType ?? 'exercise');
  const [sourceId,    setSourceId]    = useState<number | ''>(initial?.sourceId ?? '');
  const [sourceKey,   setSourceKey]   = useState(initial?.sourceKey   ?? '');
  const [targetValue, setTargetValue] = useState(initial?.targetValue != null ? String(initial.targetValue) : '');
  const [unit,        setUnit]        = useState(initial?.unit        ?? 'lbs');
  const [targetDate,  setTargetDate]  = useState(initial?.targetDate  ?? '');
  const [saving,      setSaving]      = useState(false);

  function applyMetric(m: GoalMetricType) {
    setMetricType(m);
    const st = METRIC_SOURCE_TYPE[m];
    setSourceType(st);
    setSourceId('');
    setSourceKey('');
    const defUnit = METRIC_DEFAULT_UNIT[m];
    if (defUnit) setUnit(defUnit);
  }

  function applySourceKey(key: string) {
    setSourceKey(key);
    if (metricType === 'body_measurement') {
      const opt = MEASUREMENT_KEY_OPTIONS.find((o) => o.key === key);
      if (opt) setUnit(opt.unit);
    } else if (metricType === 'nutrition_daily_avg') {
      const opt = NUTRITION_KEY_OPTIONS.find((o) => o.key === key);
      if (opt) setUnit(opt.unit);
    }
  }

  const requiredField = METRIC_REQUIRED_FIELD[metricType];
  const compatibleExercises = requiredField
    ? exercisesList.filter((e) => e.trackedFields?.includes(requiredField))
    : exercisesList;

  const canPickRoutine = ['exercise_session_volume', 'exercise_weekly_volume', 'exercise_weekly_sessions'].includes(metricType);

  async function handleSave() {
    if (!name || !targetValue) return;
    setSaving(true);
    try {
      const payload = {
        name,
        metricType,
        sourceType,
        sourceId:    sourceId !== '' ? Number(sourceId) : null,
        sourceKey:   sourceKey || null,
        targetValue: Number(targetValue),
        unit,
        targetDate:  targetDate || null,
      };
      if (initial) {
        await userGoalsApi.update(initial.id, payload);
      } else {
        await userGoalsApi.create(payload);
      }
      onSaved();
    } catch { } finally { setSaving(false); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onClose}>
      <div className="bg-dram-card border border-dram-border rounded-xl w-full max-w-md mx-4 p-5 space-y-4" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-sm font-semibold uppercase tracking-wider text-dram-accent">{initial ? 'Edit Goal' : 'Add Goal'}</h3>

        <div>
          <label className="block text-xs text-slate-500 mb-1">Goal name</label>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Deadlift 300 lbs" className={inputCls} />
        </div>

        <div>
          <label className="block text-xs text-slate-500 mb-1">Metric</label>
          <select value={metricType} onChange={(e) => applyMetric(e.target.value as GoalMetricType)} className={inputCls}>
            {METRIC_GROUPS.map((g) => (
              <optgroup key={g.label} label={g.label}>
                {g.metrics.map((m) => (
                  <option key={m} value={m}>{METRIC_LABELS[m]}</option>
                ))}
              </optgroup>
            ))}
          </select>
        </div>

        {/* Exercise source */}
        {(sourceType === 'exercise' || (canPickRoutine && sourceType === 'routine')) && (
          <div className="space-y-2">
            {canPickRoutine && (
              <div className="flex gap-1.5">
                {(['exercise', 'routine'] as GoalSourceType[]).map((t) => (
                  <button key={t} type="button" onClick={() => { setSourceType(t); setSourceId(''); }}
                    className={`flex-1 text-sm py-1 rounded-lg transition-colors capitalize ${(sourceType as string) === t ? 'bg-dram-accent text-black font-semibold' : 'bg-dram-border text-slate-300 hover:text-slate-100'}`}
                  >{t}</button>
                ))}
              </div>
            )}
            <div>
              <label className="block text-xs text-slate-500 mb-1">{(sourceType as string) === 'routine' ? 'Routine' : 'Exercise'}</label>
              <select value={sourceId} onChange={(e) => setSourceId(e.target.value ? Number(e.target.value) : '')} className={inputCls}>
                <option value="">Select…</option>
                {(sourceType as string) === 'routine'
                  ? routinesList.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)
                  : compatibleExercises.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)
                }
              </select>
            </div>
          </div>
        )}

        {/* Body measurement source */}
        {sourceType === 'measurement' && (
          <div>
            <label className="block text-xs text-slate-500 mb-1">Measurement</label>
            <select value={sourceKey} onChange={(e) => applySourceKey(e.target.value)} className={inputCls}>
              <option value="">Select…</option>
              {MEASUREMENT_KEY_OPTIONS.map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}
            </select>
          </div>
        )}

        {/* Nutrition source */}
        {sourceType === 'nutrition' && (
          <div>
            <label className="block text-xs text-slate-500 mb-1">Nutrient</label>
            <select value={sourceKey} onChange={(e) => applySourceKey(e.target.value)} className={inputCls}>
              <option value="">Select…</option>
              {NUTRITION_KEY_OPTIONS.map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}
            </select>
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs text-slate-500 mb-1">Target value</label>
            <div className="flex gap-1.5">
              <input type="number" min="0" value={targetValue} onChange={(e) => setTargetValue(e.target.value)} className={inputCls} />
              <input value={unit} onChange={(e) => setUnit(e.target.value)} className={`${inputCls} w-20 text-center`} title="Unit" />
            </div>
          </div>
          <div>
            <label className="block text-xs text-slate-500 mb-1">Target date (optional)</label>
            <input type="date" value={targetDate} onChange={(e) => setTargetDate(e.target.value)} className={inputCls} />
          </div>
        </div>

        <div className="flex gap-2 pt-1">
          <button onClick={onClose} className="flex-1 text-sm text-slate-400 hover:text-slate-200 py-2 transition-colors">Cancel</button>
          <button onClick={handleSave} disabled={saving || !name || !targetValue}
            className="flex-[2] bg-dram-accent text-black text-sm font-semibold rounded-lg py-2 hover:brightness-110 disabled:opacity-50 transition"
          >{saving ? 'Saving…' : initial ? 'Save changes' : 'Add goal'}</button>
        </div>
      </div>
    </div>
  );
}

function UserGoalRows({
  goals, onEdit, onDelete,
}: {
  goals: UserGoal[];
  onEdit: (g: UserGoal) => void;
  onDelete: (id: number) => void;
}) {
  if (!goals.length) return null;
  return (
    <div className="mt-3 pt-3 border-t border-dram-border/50 space-y-0">
      {goals.map((g) => {
        const dateStr = g.targetDate
          ? 'by ' + new Date(g.targetDate + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
          : null;
        return (
          <div key={g.id} className="flex items-start justify-between gap-2 py-1.5 border-b border-dram-border/50 last:border-0">
            <div className="min-w-0 flex-1">
              <button onClick={() => onEdit(g)} className="text-sm font-medium text-slate-200 hover:text-dram-accent transition-colors truncate text-left w-full">
                {g.name}
              </button>
              <p className="text-xs text-slate-500">
                {g.targetValue.toLocaleString()} {g.unit}
                {g.sourceName ? ` · ${g.sourceName}` : ''}
                {dateStr ? ` · ${dateStr}` : ''}
              </p>
            </div>
            <button onClick={() => onDelete(g.id)} className="text-xs text-slate-500 hover:text-red-400 transition-colors px-1 shrink-0">✕</button>
          </div>
        );
      })}
    </div>
  );
}

// ─── Goals Stats Band ─────────────────────────────────────────────────────────

const ACCENT = '#D4A843';

function GoalCard({ title, onEdit, children }: { title: string; onEdit?: () => void; children: React.ReactNode }) {
  return (
    <div className="bg-dram-card border border-dram-border overflow-hidden flex flex-col">
      <div className="h-[3px]" style={{ background: ACCENT }} />
      <div className="px-5 py-4 flex-1 flex flex-col">
        <div className="flex items-center justify-between mb-4">
          <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: ACCENT }}>{title}</span>
        </div>
        {children}
      </div>
    </div>
  );
}

function StatRow({ label, value, unit, date, onClick }: { label: string; value: string | number | null; unit?: string; date?: string | null; onClick?: () => void }) {
  if (value == null || value === '') return null;
  const inner = (
    <>
      <span className={`text-sm ${onClick ? 'text-slate-300 group-hover:text-dram-accent transition-colors' : 'text-slate-400'}`}>{label}</span>
      <div className="flex items-baseline gap-1 text-right">
        <span className="text-sm font-semibold text-slate-100">{value}</span>
        {unit && <span className="text-xs text-slate-500">{unit}</span>}
        {date && <span className="text-xs text-slate-600 ml-1">{date}</span>}
      </div>
    </>
  );
  if (onClick) {
    return (
      <button onClick={onClick} className="group flex items-baseline justify-between gap-2 py-1.5 border-b border-dram-border/50 last:border-0 w-full text-left cursor-pointer">
        {inner}
      </button>
    );
  }
  return (
    <div className="flex items-baseline justify-between gap-2 py-1.5 border-b border-dram-border/50 last:border-0">
      {inner}
    </div>
  );
}

function EditForm({ fields, onSave, onCancel, saving, disabled }: {
  fields: [string, string, (v: string) => void][];
  onSave: () => void;
  onCancel: () => void;
  saving: boolean;
  disabled?: boolean;
}) {
  return (
    <div className="space-y-2">
      {fields.map(([label, val, setter]) => (
        <div key={label}>
          <label className="block text-xs text-slate-500 mb-0.5">{label}</label>
          <input type="number" min="0" value={val} onChange={(e) => setter(e.target.value)} className={inputCls} />
        </div>
      ))}
      <div className="flex gap-2 pt-1">
        <button onClick={onCancel} className="flex-1 text-sm text-slate-400 py-1.5">Cancel</button>
        <button onClick={onSave} disabled={saving || disabled}
          className="flex-1 bg-dram-accent text-black text-sm font-semibold rounded py-1.5 disabled:opacity-50"
        >{saving ? 'Saving…' : 'Save'}</button>
      </div>
    </div>
  );
}

function GoalsStatsBand({
  summary, exGoals, measurementGoals, measurements, userGoals, exercisesList, routinesList, onAddGoal, onSaved,
}: {
  summary: GoalsSummary | null;
  exGoals: ExerciseGoals | null;
  measurementGoals: Record<string, MeasurementGoal>;
  measurements: BodyMeasurement[];
  userGoals: UserGoal[];
  exercisesList: Exercise[];
  routinesList: RoutineSummary[];
  onAddGoal: () => void;
  onSaved: () => void;
}) {
  const [editingGoal, setEditingGoal] = useState<UserGoal | null>(null);

  async function deleteGoal(id: number) {
    if (!confirm('Remove this goal?')) return;
    try { await userGoalsApi.delete(id); onSaved(); } catch { /* ignore */ }
  }

  const bodyGoals      = userGoals.filter((g) => g.category === 'body');
  const nutritionGoals = userGoals.filter((g) => g.category === 'nutrition');
  const exerciseGoals  = userGoals.filter((g) => g.category === 'exercise');

  const [editingNutrition,   setEditingNutrition]   = useState(false);
  const [calInput,           setCalInput]           = useState('');
  const [proteinInput,       setProteinInput]       = useState('');
  const [carbsInput,         setCarbsInput]         = useState('');
  const [fatInput,           setFatInput]           = useState('');
  const [waterInput,         setWaterInput]         = useState('');
  const [savingNut,          setSavingNut]          = useState(false);

  const [editingExercise,    setEditingExercise]    = useState(false);
  const [workoutsInput,      setWorkoutsInput]      = useState('');
  const [minutesInput,       setMinutesInput]       = useState('');
  const [volumeInput,        setVolumeInput]        = useState('');
  const [savingEx,           setSavingEx]           = useState(false);

  const [editingWeeklyNut,   setEditingWeeklyNut]   = useState(false);
  const [wkCalInput,         setWkCalInput]         = useState('');
  const [wkProteinInput,     setWkProteinInput]     = useState('');
  const [wkCarbsInput,       setWkCarbsInput]       = useState('');
  const [wkFatInput,         setWkFatInput]         = useState('');
  const [savingWeeklyNut,    setSavingWeeklyNut]    = useState(false);

  const [editingMeasurement, setEditingMeasurement] = useState<string | null>(null);

  const nutGoals = summary?.nutrition.goals;
  const waterGlasses = nutGoals?.waterGoalOz != null ? Math.round(nutGoals.waterGoalOz / GLASS_OZ) : null;

  const BODY_METRICS = ['weight', 'waist', 'bicep'] as const;

  function fmtDate(dateStr: string | null | undefined) {
    if (!dateStr) return null;
    return 'by ' + new Date(dateStr + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }

  function openNutritionEdit() {
    setCalInput(String(nutGoals?.calories ?? ''));
    setProteinInput(String(nutGoals?.proteinG ?? ''));
    setCarbsInput(String(nutGoals?.carbsG ?? ''));
    setFatInput(String(nutGoals?.fatG ?? ''));
    setWaterInput(waterGlasses != null ? String(waterGlasses) : '');
    setEditingNutrition(true);
  }

  async function saveNutrition() {
    if (!calInput || !proteinInput || !carbsInput || !fatInput) return;
    setSavingNut(true);
    try {
      await goalsApi.saveNutrition({
        calories: Number(calInput), proteinG: Number(proteinInput),
        carbsG: Number(carbsInput), fatG: Number(fatInput),
        waterGoalOz: waterInput !== '' ? Number(waterInput) * GLASS_OZ : undefined,
      });
      setEditingNutrition(false);
      onSaved();
    } catch { } finally { setSavingNut(false); }
  }

  function openExerciseEdit() {
    setWorkoutsInput(exGoals?.workoutsPerWeek != null ? String(exGoals.workoutsPerWeek) : '');
    setMinutesInput(exGoals?.minutesPerWeek != null ? String(exGoals.minutesPerWeek) : '');
    setVolumeInput(exGoals?.volumeLbsPerWeek != null ? String(exGoals.volumeLbsPerWeek) : '');
    setEditingExercise(true);
  }

  async function saveExercise() {
    setSavingEx(true);
    try {
      await goalsApi.saveExercise({
        workoutsPerWeek:  workoutsInput !== '' ? Number(workoutsInput) : null,
        minutesPerWeek:   minutesInput  !== '' ? Number(minutesInput)  : null,
        volumeLbsPerWeek: volumeInput   !== '' ? Number(volumeInput)   : null,
      });
      setEditingExercise(false);
      onSaved();
    } catch { } finally { setSavingEx(false); }
  }

  function openWeeklyNutEdit() {
    const wkCal     = nutGoals?.weeklyCalories    ?? (nutGoals?.calories    ? nutGoals.calories    * 7 : null);
    const wkProtein = nutGoals?.weeklyProteinG    ?? (nutGoals?.proteinG    ? Math.round(nutGoals.proteinG    * 7) : null);
    const wkCarbs   = nutGoals?.weeklyCarbsG      ?? (nutGoals?.carbsG     ? Math.round(nutGoals.carbsG      * 7) : null);
    const wkFat     = nutGoals?.weeklyFatG        ?? (nutGoals?.fatG       ? Math.round(nutGoals.fatG        * 7) : null);
    setWkCalInput(wkCal     != null ? String(wkCal)     : '');
    setWkProteinInput(wkProtein != null ? String(wkProtein) : '');
    setWkCarbsInput(wkCarbs   != null ? String(wkCarbs)   : '');
    setWkFatInput(wkFat     != null ? String(wkFat)     : '');
    setEditingWeeklyNut(true);
  }

  async function saveWeeklyNutrition() {
    setSavingWeeklyNut(true);
    try {
      await goalsApi.saveWeeklyNutrition({
        weeklyCalories:  wkCalInput     !== '' ? Number(wkCalInput)     : null,
        weeklyProteinG:  wkProteinInput !== '' ? Number(wkProteinInput) : null,
        weeklyCarbsG:    wkCarbsInput   !== '' ? Number(wkCarbsInput)   : null,
        weeklyFatG:      wkFatInput     !== '' ? Number(wkFatInput)     : null,
      });
      setEditingWeeklyNut(false);
      onSaved();
    } catch { } finally { setSavingWeeklyNut(false); }
  }

  return (
    <div className="grid grid-cols-4 gap-3">

      {/* ── Body Composition ── */}
      <GoalCard title="Body Composition">
        {BODY_METRICS.map((metric) => {
          const g = measurementGoals[metric];
          const cfg = METRIC_CONFIG[metric];
          if (editingMeasurement === metric) {
            return (
              <GoalEditForm
                key={metric}
                metric={metric}
                current={g ?? null}
                onSave={async (data) => { await measurementsApi.setGoal(metric, data); setEditingMeasurement(null); onSaved(); }}
                onCancel={() => setEditingMeasurement(null)}
              />
            );
          }
          return (
            <button key={metric} onClick={() => setEditingMeasurement(metric)} className="group flex items-baseline justify-between gap-2 py-1.5 border-b border-dram-border/50 last:border-0 w-full text-left">
              <span className="text-sm text-slate-300 group-hover:text-dram-accent transition-colors">{cfg.label}</span>
              <div className="flex items-baseline gap-1 text-right">
                {g ? (
                  <>
                    <span className="text-sm font-semibold text-slate-100">{g.targetValue}</span>
                    <span className="text-xs text-slate-500">{cfg.unit}</span>
                    {g.targetDate && <span className="text-xs text-slate-600 ml-0.5">{fmtDate(g.targetDate)}</span>}
                  </>
                ) : (
                  <span className="text-xs text-slate-600 group-hover:text-dram-accent transition-colors">Set goal</span>
                )}
              </div>
            </button>
          );
        })}
        <UserGoalRows goals={bodyGoals} onEdit={setEditingGoal} onDelete={deleteGoal} />
      </GoalCard>

      {/* ── Daily Nutrition ── */}
      <GoalCard title="Daily Nutrition" onEdit={!editingNutrition ? openNutritionEdit : undefined}>
        {editingNutrition ? (
          <EditForm
            fields={[
              ['Calories (kcal)', calInput, setCalInput],
              ['Protein (g)', proteinInput, setProteinInput],
              ['Carbs (g)', carbsInput, setCarbsInput],
              ['Fat (g)', fatInput, setFatInput],
              ['Water (glasses)', waterInput, setWaterInput],
            ]}
            onSave={saveNutrition}
            onCancel={() => setEditingNutrition(false)}
            saving={savingNut}
            disabled={!calInput || !proteinInput || !carbsInput || !fatInput}
          />
        ) : (
          <>
            <StatRow label="Calories" value={nutGoals?.calories ?? null} unit="kcal" onClick={openNutritionEdit} />
            <StatRow label="Protein"  value={nutGoals?.proteinG ?? null} unit="g"    onClick={openNutritionEdit} />
            <StatRow label="Carbs"    value={nutGoals?.carbsG   ?? null} unit="g"    onClick={openNutritionEdit} />
            <StatRow label="Fat"      value={nutGoals?.fatG     ?? null} unit="g"    onClick={openNutritionEdit} />
            {waterGlasses != null && <StatRow label="Water" value={waterGlasses} unit="glasses" onClick={openNutritionEdit} />}
            <UserGoalRows goals={nutritionGoals} onEdit={setEditingGoal} onDelete={deleteGoal} />
          </>
        )}
      </GoalCard>

      {/* ── Weekly Nutrition ── */}
      <GoalCard title="Weekly Nutrition" onEdit={!editingWeeklyNut ? openWeeklyNutEdit : undefined}>
        {editingWeeklyNut ? (
          <EditForm
            fields={[
              ['Calories (kcal)', wkCalInput, setWkCalInput],
              ['Protein (g)',     wkProteinInput, setWkProteinInput],
              ['Carbs (g)',       wkCarbsInput,   setWkCarbsInput],
              ['Fat (g)',         wkFatInput,     setWkFatInput],
            ]}
            onSave={saveWeeklyNutrition}
            onCancel={() => setEditingWeeklyNut(false)}
            saving={savingWeeklyNut}
          />
        ) : (
          <>
            {(() => {
              const cal     = nutGoals?.weeklyCalories    ?? (nutGoals?.calories    ? nutGoals.calories    * 7 : null);
              const protein = nutGoals?.weeklyProteinG    ?? (nutGoals?.proteinG    ? Math.round(nutGoals.proteinG    * 7) : null);
              const carbs   = nutGoals?.weeklyCarbsG      ?? (nutGoals?.carbsG     ? Math.round(nutGoals.carbsG      * 7) : null);
              const fat     = nutGoals?.weeklyFatG        ?? (nutGoals?.fatG       ? Math.round(nutGoals.fatG        * 7) : null);
              const isCustom = nutGoals?.weeklyCalories != null || nutGoals?.weeklyProteinG != null;
              return (
                <>
                  {isCustom && <p className="text-[10px] text-dram-accent mb-1">Custom weekly targets</p>}
                  <StatRow label="Calories" value={cal     != null ? Number(cal).toLocaleString() : null} unit="kcal" onClick={openWeeklyNutEdit} />
                  <StatRow label="Protein"  value={protein} unit="g" onClick={openWeeklyNutEdit} />
                  <StatRow label="Carbs"    value={carbs}   unit="g" onClick={openWeeklyNutEdit} />
                  <StatRow label="Fat"      value={fat}     unit="g" onClick={openWeeklyNutEdit} />
                  {waterGlasses != null && <StatRow label="Water" value={waterGlasses * 7} unit="glasses" onClick={openWeeklyNutEdit} />}
                  {!isCustom && <p className="text-[10px] text-slate-500 mt-1">Based on daily × 7</p>}
                </>
              );
            })()}
          </>
        )}
      </GoalCard>

      {/* ── Weekly Exercise ── */}
      <GoalCard title="Weekly Exercise" onEdit={!editingExercise ? openExerciseEdit : undefined}>
        {editingExercise ? (
          <EditForm
            fields={[
              ['Volume / week (lbs)', volumeInput, setVolumeInput],
              ['Workouts / week', workoutsInput, setWorkoutsInput],
              ['Minutes / week',  minutesInput,  setMinutesInput],
            ]}
            onSave={saveExercise}
            onCancel={() => setEditingExercise(false)}
            saving={savingEx}
          />
        ) : (
          <>
            <StatRow label="Volume"   value={exGoals?.volumeLbsPerWeek != null ? exGoals.volumeLbsPerWeek.toLocaleString() : null} unit="lbs"  onClick={openExerciseEdit} />
            <StatRow label="Workouts" value={exGoals?.workoutsPerWeek  ?? null} unit="/ wk" onClick={openExerciseEdit} />
            <StatRow label="Minutes"  value={exGoals?.minutesPerWeek   ?? null} unit="min"  onClick={openExerciseEdit} />
            <UserGoalRows goals={exerciseGoals} onEdit={setEditingGoal} onDelete={deleteGoal} />
          </>
        )}
      </GoalCard>

      {/* Edit goal modal (add is triggered from page header) */}
      {editingGoal && (
        <UserGoalForm
          initial={editingGoal}
          exercisesList={exercisesList}
          routinesList={routinesList}
          onClose={() => setEditingGoal(null)}
          onSaved={() => { setEditingGoal(null); onSaved(); }}
        />
      )}

    </div>
  );
}

// ─── Shared schedule form fields ─────────────────────────────────────────────

function ScheduleFormFields({
  isRestDay, setIsRestDay,
  scheduleType, setScheduleType,
  routineId, setRoutineId,
  exerciseId, setExerciseId,
  label, setLabel,
  recType, setRecType,
  dowDays, setDowDays,
  xDaysInterval, setXDaysInterval,
  domType, setDomType,
  domDates, setDomDates,
  domN, setDomN,
  domWeekday, setDomWeekday,
  startDate, setStartDate,
  endDate, setEndDate,
  routinesList, exercisesList,
}: {
  isRestDay: boolean; setIsRestDay: (v: boolean) => void;
  scheduleType: 'routine' | 'exercise'; setScheduleType: (v: 'routine' | 'exercise') => void;
  routineId: number | null; setRoutineId: (v: number | null) => void;
  exerciseId: number | null; setExerciseId: (v: number | null) => void;
  label: string; setLabel: (v: string) => void;
  recType: RecurrenceType; setRecType: (v: RecurrenceType) => void;
  dowDays: number[]; setDowDays: (v: number[]) => void;
  xDaysInterval: string; setXDaysInterval: (v: string) => void;
  domType: 'specific_dates' | 'nth_weekday'; setDomType: (v: 'specific_dates' | 'nth_weekday') => void;
  domDates: string; setDomDates: (v: string) => void;
  domN: string; setDomN: (v: string) => void;
  domWeekday: string; setDomWeekday: (v: string) => void;
  startDate: string; setStartDate: (v: string) => void;
  endDate: string; setEndDate: (v: string) => void;
  routinesList: RoutineSummary[]; exercisesList: Exercise[];
}) {
  return (
    <>
      {/* Rest day toggle */}
      <div className="flex items-center justify-between">
        <span className="text-sm text-slate-300">Rest day</span>
        <button
          onClick={() => setIsRestDay(!isRestDay)}
          className={`relative w-11 h-6 rounded-full transition-colors ${isRestDay ? 'bg-dram-accent' : 'bg-dram-border'}`}
        >
          <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white transition-all ${isRestDay ? 'left-[22px]' : 'left-0.5'}`} />
        </button>
      </div>

      {/* Type toggle + picker */}
      {!isRestDay && (
        <div className="space-y-2">
          <div className="flex gap-2">
            {(['routine', 'exercise'] as const).map((t) => (
              <button
                key={t}
                onClick={() => setScheduleType(t)}
                className={`flex-1 text-sm py-1.5 rounded-lg transition-colors ${scheduleType === t ? 'bg-dram-accent text-black font-semibold' : 'bg-dram-border text-slate-300 hover:text-slate-100'}`}
              >
                {t === 'routine' ? 'Routine' : 'Exercise'}
              </button>
            ))}
          </div>
          {scheduleType === 'routine' ? (
            <select value={routineId ?? ''} onChange={(e) => setRoutineId(e.target.value ? Number(e.target.value) : null)} className={inputCls}>
              <option value="">Select a routine…</option>
              {routinesList.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
            </select>
          ) : (
            <select value={exerciseId ?? ''} onChange={(e) => setExerciseId(e.target.value ? Number(e.target.value) : null)} className={inputCls}>
              <option value="">Select an exercise…</option>
              {exercisesList.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
            </select>
          )}
        </div>
      )}

      {/* Label */}
      <div>
        <label className="block text-sm text-slate-500 mb-1">Label (optional)</label>
        <input type="text" value={label} onChange={(e) => setLabel(e.target.value)} className={inputCls} placeholder="e.g. Morning workout" />
      </div>

      {/* Recurrence type */}
      <div>
        <label className="block text-sm text-slate-500 mb-1.5">Repeats</label>
        <div className="flex flex-wrap gap-1.5">
          {(['daily', 'every_other_day', 'days_of_week', 'every_x_days', 'day_of_month'] as RecurrenceType[]).map((rt) => (
            <button key={rt} onClick={() => setRecType(rt)}
              className={`text-sm px-2.5 py-1 rounded-lg transition-colors ${recType === rt ? 'bg-dram-accent text-black font-semibold' : 'bg-dram-border text-slate-300 hover:text-slate-100'}`}
            >
              {rt === 'daily' ? 'Daily' : rt === 'every_other_day' ? 'Every other day' : rt === 'days_of_week' ? 'Days of week' : rt === 'every_x_days' ? 'Every X days' : 'Day of month'}
            </button>
          ))}
        </div>
      </div>

      {recType === 'days_of_week' && (
        <div className="flex gap-1.5">
          {DOW_LABELS.map((lbl, i) => (
            <button key={i}
              onClick={() => setDowDays(dowDays.includes(i) ? dowDays.filter((d) => d !== i) : [...dowDays, i])}
              className={`flex-1 py-2 rounded-lg text-sm transition-colors ${dowDays.includes(i) ? 'bg-dram-accent text-black font-semibold' : 'bg-dram-border text-slate-300 hover:text-slate-100'}`}
            >{lbl[0]}</button>
          ))}
        </div>
      )}

      {recType === 'every_x_days' && (
        <div>
          <label className="block text-sm text-slate-500 mb-1">Interval (days)</label>
          <input type="number" min="1" value={xDaysInterval} onChange={(e) => setXDaysInterval(e.target.value)} className={inputCls} />
        </div>
      )}

      {recType === 'day_of_month' && (
        <div className="space-y-2">
          <div className="flex gap-2">
            {(['specific_dates', 'nth_weekday'] as const).map((dt) => (
              <button key={dt} onClick={() => setDomType(dt)}
                className={`flex-1 text-sm py-1.5 rounded-lg transition-colors ${domType === dt ? 'bg-dram-accent text-black font-semibold' : 'bg-dram-border text-slate-300 hover:text-slate-100'}`}
              >{dt === 'specific_dates' ? 'Specific dates' : 'Nth weekday'}</button>
            ))}
          </div>
          {domType === 'specific_dates' ? (
            <div>
              <label className="block text-sm text-slate-500 mb-1">Dates (comma-separated, e.g. 1, 15)</label>
              <input type="text" value={domDates} onChange={(e) => setDomDates(e.target.value)} className={inputCls} />
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-sm text-slate-500 mb-1">Which (1–4)</label>
                <input type="number" min="1" max="4" value={domN} onChange={(e) => setDomN(e.target.value)} className={inputCls} />
              </div>
              <div>
                <label className="block text-sm text-slate-500 mb-1">Weekday (0=Mon … 6=Sun)</label>
                <input type="number" min="0" max="6" value={domWeekday} onChange={(e) => setDomWeekday(e.target.value)} className={inputCls} />
              </div>
            </div>
          )}
        </div>
      )}

      {/* Start / end dates */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-sm text-slate-500 mb-1">Start date</label>
          <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className={inputCls} />
        </div>
        <div>
          <label className="block text-sm text-slate-500 mb-1">End date (optional)</label>
          <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className={inputCls} />
        </div>
      </div>
    </>
  );
}

function useScheduleFormState(init?: WorkoutSchedule) {
  const [isRestDay,     setIsRestDay]     = useState(init?.isRestDay ?? false);
  const [scheduleType,  setScheduleType]  = useState<'routine' | 'exercise'>(init?.exerciseId ? 'exercise' : 'routine');
  const [routineId,     setRoutineId]     = useState<number | null>(init?.routineId ?? null);
  const [exerciseId,    setExerciseId]    = useState<number | null>(init?.exerciseId ?? null);
  const [label,         setLabel]         = useState(init?.label ?? '');
  const [recType,       setRecType]       = useState<RecurrenceType>(init?.recurrenceType ?? 'days_of_week');
  const [dowDays,       setDowDays]       = useState<number[]>(init?.recurrenceConfig?.days ?? []);
  const [xDaysInterval, setXDaysInterval] = useState(String(init?.recurrenceConfig?.interval ?? 3));
  const [domType,       setDomType]       = useState<'specific_dates' | 'nth_weekday'>(init?.recurrenceConfig?.type ?? 'specific_dates');
  const [domDates,      setDomDates]      = useState((init?.recurrenceConfig?.dates as number[] | undefined)?.join(', ') ?? '1, 15');
  const [domN,          setDomN]          = useState(String(init?.recurrenceConfig?.n ?? 1));
  const [domWeekday,    setDomWeekday]    = useState(String(init?.recurrenceConfig?.weekday ?? 0));
  const [startDate,     setStartDate]     = useState(init?.startDate ?? new Date().toISOString().slice(0, 10));
  const [endDate,       setEndDate]       = useState(init?.endDate ?? '');

  function buildConfig() {
    if (recType === 'daily' || recType === 'every_other_day') return {};
    if (recType === 'days_of_week') return { days: dowDays };
    if (recType === 'every_x_days') return { interval: Number(xDaysInterval) || 3 };
    if (recType === 'day_of_month') {
      if (domType === 'specific_dates') return { type: 'specific_dates', dates: domDates.split(',').map((d) => Number(d.trim())).filter((d) => d >= 1 && d <= 31) };
      return { type: 'nth_weekday', n: Number(domN) || 1, weekday: Number(domWeekday) || 0 };
    }
    return {};
  }

  const canSave = isRestDay || (scheduleType === 'routine' ? routineId !== null : exerciseId !== null);

  return {
    isRestDay, setIsRestDay, scheduleType, setScheduleType,
    routineId, setRoutineId, exerciseId, setExerciseId,
    label, setLabel, recType, setRecType,
    dowDays, setDowDays, xDaysInterval, setXDaysInterval,
    domType, setDomType, domDates, setDomDates,
    domN, setDomN, domWeekday, setDomWeekday,
    startDate, setStartDate, endDate, setEndDate,
    buildConfig, canSave,
  };
}

// ─── Add schedule modal ───────────────────────────────────────────────────────

function AddScheduleModal({ routinesList, exercisesList, onClose, onSaved }: {
  routinesList: RoutineSummary[];
  exercisesList: Exercise[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const form = useScheduleFormState();
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    if (!form.canSave) return;
    setSaving(true);
    try {
      await schedulesApi.create({
        routineId:  form.isRestDay ? null : (form.scheduleType === 'routine'  ? form.routineId  : null),
        exerciseId: form.isRestDay ? null : (form.scheduleType === 'exercise' ? form.exerciseId : null),
        label: form.label.trim() || undefined,
        isRestDay: form.isRestDay,
        recurrenceType: form.recType,
        recurrenceConfig: form.buildConfig(),
        startDate: form.startDate,
        endDate: form.endDate.trim() || null,
      });
      onSaved();
    } catch { /* ignore */ } finally { setSaving(false); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60" onClick={onClose}>
      <div className="bg-dram-card border border-dram-border rounded-t-2xl sm:rounded-2xl w-full sm:max-w-md mx-4 max-h-[90vh] overflow-y-auto p-5 space-y-4" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-slate-200">Add Schedule</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-200 text-xl leading-none">×</button>
        </div>
        <ScheduleFormFields {...form} routinesList={routinesList} exercisesList={exercisesList} />
        <div className="flex gap-2 pt-1">
          <button onClick={onClose} className="flex-1 text-sm text-slate-400 hover:text-slate-200 py-2 transition-colors">Cancel</button>
          <button onClick={handleSave} disabled={saving || !form.canSave}
            className="flex-[2] bg-dram-accent text-black text-sm font-semibold rounded-lg py-2 hover:brightness-110 disabled:opacity-50 transition"
          >{saving ? 'Saving…' : 'Add Schedule'}</button>
        </div>
      </div>
    </div>
  );
}

// ─── Edit schedule modal ──────────────────────────────────────────────────────

function EditScheduleModal({ schedule, routinesList, exercisesList, onClose, onSaved }: {
  schedule: WorkoutSchedule;
  routinesList: RoutineSummary[];
  exercisesList: Exercise[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const form = useScheduleFormState(schedule);
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    if (!form.canSave) return;
    setSaving(true);
    try {
      await schedulesApi.update(schedule.id, {
        routineId:  form.isRestDay ? null : (form.scheduleType === 'routine'  ? form.routineId  : null),
        exerciseId: form.isRestDay ? null : (form.scheduleType === 'exercise' ? form.exerciseId : null),
        label: form.label.trim() || null,
        isRestDay: form.isRestDay,
        recurrenceType: form.recType,
        recurrenceConfig: form.buildConfig(),
        startDate: form.startDate,
        endDate: form.endDate.trim() || null,
      });
      onSaved();
    } catch { /* ignore */ } finally { setSaving(false); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60" onClick={onClose}>
      <div className="bg-dram-card border border-dram-border rounded-t-2xl sm:rounded-2xl w-full sm:max-w-md mx-4 max-h-[90vh] overflow-y-auto p-5 space-y-4" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-slate-200">Edit Schedule</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-200 text-xl leading-none">×</button>
        </div>
        <ScheduleFormFields {...form} routinesList={routinesList} exercisesList={exercisesList} />
        <div className="flex gap-2 pt-1">
          <button onClick={onClose} className="flex-1 text-sm text-slate-400 hover:text-slate-200 py-2 transition-colors">Cancel</button>
          <button onClick={handleSave} disabled={saving || !form.canSave}
            className="flex-[2] bg-dram-accent text-black text-sm font-semibold rounded-lg py-2 hover:brightness-110 disabled:opacity-50 transition"
          >{saving ? 'Saving…' : 'Save Changes'}</button>
        </div>
      </div>
    </div>
  );
}

// ─── Import program modal ─────────────────────────────────────────────────────

function ImportProgramModal({ templates, routinesList, onClose, onSaved }: {
  templates: ProgramTemplate[];
  routinesList: RoutineSummary[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [selectedTemplate, setSelectedTemplate] = useState<ProgramTemplate | null>(null);
  const [slotMap,          setSlotMap]          = useState<Record<string, number | null>>({});
  const [startDate,        setStartDate]        = useState(new Date().toISOString().slice(0, 10));
  const [saving,           setSaving]           = useState(false);

  const slots = useMemo(() => {
    if (!selectedTemplate) return [];
    const seen = new Set<string>();
    selectedTemplate.days.forEach((d) => {
      if (!d.isRestDay && d.slotLabel) seen.add(d.slotLabel);
    });
    return Array.from(seen);
  }, [selectedTemplate]);

  async function handleImport() {
    if (!selectedTemplate) return;
    setSaving(true);
    try {
      await schedulesApi.importProgramTemplate(selectedTemplate.id, { startDate, slotMap });
      onSaved();
    } catch { /* ignore */ } finally { setSaving(false); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60" onClick={onClose}>
      <div
        className="bg-dram-card border border-dram-border rounded-t-2xl sm:rounded-2xl w-full sm:max-w-md mx-4 max-h-[90vh] overflow-y-auto p-5 space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-slate-200">Import Program</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-200 text-xl leading-none">×</button>
        </div>

        {!selectedTemplate ? (
          <div className="space-y-2">
            {templates.map((t) => (
              <button
                key={t.id}
                onClick={() => setSelectedTemplate(t)}
                className="w-full text-left bg-dram-bg border border-dram-border rounded-lg px-4 py-3 hover:border-slate-500 transition-colors"
              >
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-slate-200">{t.name}</span>
                  <span className="text-xs text-slate-500">{t.weeks}w ›</span>
                </div>
                {t.description && <p className="text-xs text-slate-500 mt-0.5">{t.description}</p>}
              </button>
            ))}
          </div>
        ) : (
          <div className="space-y-4">
            <button onClick={() => setSelectedTemplate(null)} className="text-sm text-dram-accent hover:brightness-110">
              ← Change program
            </button>
            <p className="text-sm font-medium text-slate-200">{selectedTemplate.name}</p>

            {slots.length > 0 && (
              <div className="space-y-3">
                <p className="text-sm text-slate-500">Map slots to your routines:</p>
                {slots.map((slot) => (
                  <div key={slot}>
                    <label className="block text-sm text-slate-500 mb-1">{slot}</label>
                    <select
                      value={slotMap[slot] ?? ''}
                      onChange={(e) => setSlotMap((prev) => ({ ...prev, [slot]: e.target.value ? Number(e.target.value) : null }))}
                      className={inputCls}
                    >
                      <option value="">None (skip slot)</option>
                      {routinesList.map((r) => (
                        <option key={r.id} value={r.id}>{r.name}</option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>
            )}

            <div>
              <label className="block text-sm text-slate-500 mb-1">Start date</label>
              <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className={inputCls} />
            </div>

            <div className="flex gap-2 pt-1">
              <button onClick={onClose} className="flex-1 text-sm text-slate-400 hover:text-slate-200 py-2 transition-colors">Cancel</button>
              <button
                onClick={handleImport}
                disabled={saving}
                className="flex-[2] bg-dram-accent text-black text-sm font-semibold rounded-lg py-2 hover:brightness-110 disabled:opacity-50 transition"
              >
                {saving ? 'Importing…' : 'Import'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Section 4: Workout Schedule ─────────────────────────────────────────────

function WorkoutScheduleSection({
  schedules, upcoming, routinesList, exercisesList, templates, onReload,
}: {
  schedules: WorkoutSchedule[];
  upcoming: UpcomingSession[];
  routinesList: RoutineSummary[];
  exercisesList: Exercise[];
  templates: ProgramTemplate[];
  onReload: () => void;
}) {
  const [showAdd,    setShowAdd]    = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [editing,    setEditing]    = useState<WorkoutSchedule | null>(null);

  async function handleDelete(id: number) {
    if (!confirm('Remove this schedule?')) return;
    try {
      await schedulesApi.delete(id);
      onReload();
    } catch { /* ignore */ }
  }

  return (
    <>
      <div className="bg-dram-card border border-dram-border p-5 space-y-4">
        <SectionHeader title="Workout Schedule">
          <button onClick={() => setShowImport(true)} className="text-sm text-dram-accent hover:brightness-110 transition-colors">
            Import
          </button>
        </SectionHeader>

        <WeekStrip upcoming={upcoming} />

        {schedules.length === 0 && (
          <p className="text-sm text-slate-500">No schedule yet. Add one or import a program.</p>
        )}

        {schedules.length > 0 && (
          <div className="divide-y divide-dram-border">
            {schedules.map((sch) => (
              <button
                key={sch.id}
                onClick={() => setEditing(sch)}
                className="w-full flex items-center gap-3 py-2.5 text-left hover:bg-white/5 transition-colors -mx-1 px-1 rounded"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-slate-200 truncate">
                    {sch.isRestDay ? 'Rest day' : (sch.exerciseName ?? sch.routineName ?? sch.label ?? 'Workout')}
                  </p>
                  <p className="text-sm text-slate-500">{sch.recurrenceDescription}</p>
                </div>
                <button
                  onClick={(e) => { e.stopPropagation(); handleDelete(sch.id); }}
                  className="text-sm text-slate-500 hover:text-red-400 px-2 py-1 transition-colors shrink-0"
                >
                  ✕
                </button>
              </button>
            ))}
          </div>
        )}

        <button
          onClick={() => setShowAdd(true)}
          className="w-full border border-dram-accent text-dram-accent text-sm font-semibold rounded-lg py-2 hover:brightness-110 transition"
        >
          + Add schedule
        </button>
      </div>

      {showAdd && (
        <AddScheduleModal
          routinesList={routinesList}
          exercisesList={exercisesList}
          onClose={() => setShowAdd(false)}
          onSaved={() => { setShowAdd(false); onReload(); }}
        />
      )}

      {editing && (
        <EditScheduleModal
          schedule={editing}
          routinesList={routinesList}
          exercisesList={exercisesList}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); onReload(); }}
        />
      )}

      {showImport && (
        <ImportProgramModal
          templates={templates}
          routinesList={routinesList}
          onClose={() => setShowImport(false)}
          onSaved={() => { setShowImport(false); onReload(); }}
        />
      )}
    </>
  );
}

// ─── Meal Planning ────────────────────────────────────────────────────────────

const MEAL_LABELS: Record<MealSlot, string> = { breakfast: 'Breakfast', lunch: 'Lunch', dinner: 'Dinner', snack: 'Snack' };
const MEAL_ORDER: MealSlot[] = ['breakfast', 'lunch', 'dinner', 'snack'];

function FoodPickerModal({ meal, date, onClose, onAdded }: {
  meal: MealSlot;
  date: string;
  onClose: () => void;
  onAdded: () => void;
}) {
  const [tab, setTab] = useState<'food' | 'recipe'>('food');
  const [search, setSearch] = useState('');
  const [foodResults, setFoodResults] = useState<Food[]>([]);
  const [recipeResults, setRecipeResults] = useState<Recipe[]>([]);
  const [searching, setSearching] = useState(false);
  const [selectedFood, setSelectedFood] = useState<Food | null>(null);
  const [selectedServingId, setSelectedServingId] = useState<number | null>(null);
  const [quantity, setQuantity] = useState('1');
  const [selectedRecipe, setSelectedRecipe] = useState<Recipe | null>(null);
  const [recipeServings, setRecipeServings] = useState('1');
  const [adding, setAdding] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    if (!search.trim()) { setFoodResults([]); setRecipeResults([]); return; }
    timerRef.current = setTimeout(async () => {
      setSearching(true);
      try {
        if (tab === 'food') {
          setFoodResults(await foodsApi.search(search, 20));
        } else {
          setRecipeResults(await recipesApi.getAll({ search, type: 'food', limit: 30 }));
        }
      } finally { setSearching(false); }
    }, 400);
  }, [search, tab]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (selectedFood) {
      const def = selectedFood.servingSizes.find(s => s.isDefault) ?? selectedFood.servingSizes[0];
      setSelectedServingId(def?.id ?? null);
    }
  }, [selectedFood]);

  async function handleAdd() {
    setAdding(true);
    try {
      if (tab === 'food' && selectedFood && selectedServingId) {
        await mealPlanApi.addFoodEntry({ planDate: date, meal, foodId: selectedFood.id, servingSizeId: selectedServingId, quantity: Number(quantity) || 1 });
      } else if (tab === 'recipe' && selectedRecipe) {
        await mealPlanApi.addRecipeEntry({ planDate: date, meal, recipeId: selectedRecipe.id, recipeServings: Number(recipeServings) || 1 });
      }
      onAdded();
    } catch { /* ignore */ } finally { setAdding(false); }
  }

  const preview = (() => {
    if (tab === 'food' && selectedFood && selectedServingId) {
      const ss = selectedFood.servingSizes.find(s => s.id === selectedServingId);
      if (!ss) return null;
      const f = ss.grams * (Number(quantity) || 1) / 100;
      return {
        cal:   Math.round(selectedFood.nutrition.calories * f),
        pro:   Math.round(selectedFood.nutrition.protein  * f * 10) / 10,
        carbs: Math.round(selectedFood.nutrition.carbs    * f * 10) / 10,
        fat:   Math.round(selectedFood.nutrition.fat      * f * 10) / 10,
      };
    }
    if (tab === 'recipe' && selectedRecipe?.calories != null) {
      const totalServings = selectedRecipe.servings ?? 1;
      const f = (Number(recipeServings) || 1) / totalServings;
      return {
        cal:   Math.round(Number(selectedRecipe.calories)  * f),
        pro:   Math.round(Number(selectedRecipe.protein_g) * f * 10) / 10,
        carbs: Math.round(Number(selectedRecipe.carbs_g)   * f * 10) / 10,
        fat:   Math.round(Number(selectedRecipe.fat_g)     * f * 10) / 10,
      };
    }
    return null;
  })();

  const canAdd = tab === 'food'
    ? !!(selectedFood && selectedServingId && Number(quantity) > 0)
    : !!(selectedRecipe && Number(recipeServings) > 0);

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60" onClick={onClose}>
      <div className="dram-card w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl p-4 flex flex-col gap-3 max-h-[85vh]"
        onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-200">Add to {MEAL_LABELS[meal]}</h3>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-300 text-xl leading-none">×</button>
        </div>

        <div className="flex gap-2">
          {(['food', 'recipe'] as const).map(t => (
            <button key={t}
              onClick={() => { setTab(t); setSearch(''); setSelectedFood(null); setSelectedRecipe(null); }}
              className={`px-3 py-1 rounded-full text-xs font-medium transition-colors
                ${tab === t ? 'bg-dram-accent text-black' : 'bg-dram-card border border-dram-border text-slate-400 hover:text-slate-200'}`}>
              {t === 'food' ? 'Food' : 'Recipe'}
            </button>
          ))}
        </div>

        <input
          className={inputCls}
          placeholder={tab === 'food' ? 'Search foods…' : 'Search recipes…'}
          value={search}
          onChange={e => { setSearch(e.target.value); setSelectedFood(null); setSelectedRecipe(null); }}
          autoFocus
        />

        {!selectedFood && !selectedRecipe && (
          <div className="overflow-y-auto max-h-52 space-y-0.5 -mx-1">
            {searching && <p className="text-xs text-slate-500 py-3 text-center">Searching…</p>}
            {!searching && !search.trim() && <p className="text-xs text-slate-500 py-3 text-center">Type to search</p>}
            {tab === 'food' && !searching && foodResults.map(f => {
              const def = f.servingSizes.find(s => s.isDefault) ?? f.servingSizes[0];
              const cal = def ? Math.round(f.nutrition.calories * def.grams / 100) : null;
              return (
                <button key={f.id} onClick={() => setSelectedFood(f)}
                  className="w-full text-left px-3 py-2 rounded hover:bg-white/5 flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm text-slate-200 truncate">{f.name}</p>
                    {f.brand && <p className="text-xs text-slate-500 truncate">{f.brand}</p>}
                  </div>
                  {cal != null && <span className="text-xs text-slate-400 shrink-0">{cal} kcal</span>}
                </button>
              );
            })}
            {tab === 'recipe' && !searching && recipeResults.map(r => (
              <button key={r.id} onClick={() => setSelectedRecipe(r)}
                className="w-full text-left px-3 py-2 rounded hover:bg-white/5 flex items-center justify-between gap-2">
                <p className="text-sm text-slate-200 truncate">{r.name}</p>
                {r.calories != null && <span className="text-xs text-slate-400 shrink-0">{Math.round(Number(r.calories))} kcal</span>}
              </button>
            ))}
          </div>
        )}

        {selectedFood && (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <button onClick={() => setSelectedFood(null)} className="text-xs text-dram-accent hover:opacity-75">← Back</button>
              <p className="text-sm font-medium text-slate-200 truncate flex-1">{selectedFood.name}</p>
            </div>
            <div className="flex gap-2">
              <div className="flex-1">
                <label className="text-xs text-slate-500 mb-1 block">Serving</label>
                <select value={selectedServingId ?? ''} onChange={e => setSelectedServingId(Number(e.target.value))}
                  className={inputCls}>
                  {selectedFood.servingSizes.map(s => (
                    <option key={s.id} value={s.id}>{s.label} ({s.grams}g)</option>
                  ))}
                </select>
              </div>
              <div className="w-20">
                <label className="text-xs text-slate-500 mb-1 block">Qty</label>
                <input type="number" min="0.1" step="0.1" value={quantity}
                  onChange={e => setQuantity(e.target.value)} className={inputCls} />
              </div>
            </div>
            {preview && (
              <p className="text-xs text-slate-400">{preview.cal} kcal · {preview.pro}g P · {preview.carbs}g C · {preview.fat}g F</p>
            )}
          </div>
        )}

        {selectedRecipe && (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <button onClick={() => setSelectedRecipe(null)} className="text-xs text-dram-accent hover:opacity-75">← Back</button>
              <p className="text-sm font-medium text-slate-200 truncate flex-1">{selectedRecipe.name}</p>
            </div>
            <div>
              <label className="text-xs text-slate-500 mb-1 block">
                Servings (recipe makes {selectedRecipe.servings ?? 1})
              </label>
              <input type="number" min="0.5" step="0.5" value={recipeServings}
                onChange={e => setRecipeServings(e.target.value)} className={inputCls + ' w-24'} />
            </div>
            {preview && (
              <p className="text-xs text-slate-400">{preview.cal} kcal · {preview.pro}g P · {preview.carbs}g C · {preview.fat}g F</p>
            )}
          </div>
        )}

        <button onClick={handleAdd} disabled={!canAdd || adding}
          className="w-full py-2 rounded-lg text-sm font-semibold bg-dram-accent text-black disabled:opacity-40 transition-opacity">
          {adding ? 'Adding…' : `Add to ${MEAL_LABELS[meal]}`}
        </button>
      </div>
    </div>
  );
}

function MealPlanningSection({ onPlanChange }: { onPlanChange?: () => void }) {
  const today = localDateStr();
  const [weekStart, setWeekStart] = useState(() => getWeekStart(today));
  const [plan, setPlan] = useState<MealPlanWeek | null>(null);
  const [selectedDate, setSelectedDate] = useState(today);
  const [templates, setTemplates] = useState<MealPlanTemplate[]>([]);
  const [loadingPlan, setLoadingPlan] = useState(false);
  const [picker, setPicker] = useState<{ meal: MealSlot; date: string } | null>(null);
  const [saveOpen, setSaveOpen] = useState(false);
  const [templateName, setTemplateName] = useState('');
  const [savingTemplate, setSavingTemplate] = useState(false);
  const [applyId, setApplyId] = useState('');
  const [applying, setApplying] = useState(false);

  async function loadPlan() {
    setLoadingPlan(true);
    try {
      const [p, tmplts] = await Promise.all([
        mealPlanApi.getWeek(weekStart),
        mealPlanApi.getTemplates().catch(() => []),
      ]);
      setPlan(p);
      setTemplates(tmplts as MealPlanTemplate[]);
      onPlanChange?.();
    } finally { setLoadingPlan(false); }
  }

  useEffect(() => { loadPlan(); }, [weekStart]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!plan) return;
    const dates = plan.days.map(d => d.date);
    if (!dates.includes(selectedDate)) setSelectedDate(dates[0]);
  }, [plan]); // eslint-disable-line react-hooks/exhaustive-deps

  function shiftWeek(delta: number) {
    const d = new Date(weekStart + 'T12:00:00');
    d.setDate(d.getDate() + delta * 7);
    setWeekStart(localDateStr(d));
  }

  async function handleDelete(id: number) {
    await mealPlanApi.deleteEntry(id);
    loadPlan();
  }

  async function handleSaveTemplate() {
    if (!templateName.trim()) return;
    setSavingTemplate(true);
    try {
      await mealPlanApi.saveTemplate(templateName.trim(), weekStart);
      setTemplateName('');
      setSaveOpen(false);
      setTemplates(await mealPlanApi.getTemplates());
    } finally { setSavingTemplate(false); }
  }

  async function handleApply() {
    if (!applyId) return;
    setApplying(true);
    try {
      await mealPlanApi.applyTemplate(Number(applyId), weekStart);
      setApplyId('');
      loadPlan();
    } finally { setApplying(false); }
  }

  async function handleDeleteTemplate(id: number) {
    if (!confirm('Delete this template?')) return;
    await mealPlanApi.deleteTemplate(id);
    setTemplates(await mealPlanApi.getTemplates());
  }

  const selectedDay = plan?.days.find(d => d.date === selectedDate);
  const weekEnd = plan?.days[6]?.date;
  const weekLabel = plan ? `${shortDate(weekStart)} – ${shortDate(weekEnd!)}` : '…';

  return (
    <>
      <div className="dram-card p-4 space-y-4">
        <SectionHeader title="Meal Planning">
          <div className="flex items-center gap-1 text-sm">
            <button onClick={() => shiftWeek(-1)} className="text-slate-400 hover:text-slate-200 w-6 text-center">‹</button>
            <span className="text-slate-400 text-xs min-w-[118px] text-center">{weekLabel}</span>
            <button onClick={() => shiftWeek(1)} className="text-slate-400 hover:text-slate-200 w-6 text-center">›</button>
          </div>
        </SectionHeader>

        {/* Day strip */}
        <div className="flex gap-1">
          {plan?.days.map((day) => {
            const isSelected = day.date === selectedDate;
            const isToday = day.date === today;
            const hasMeals = Object.values(day.meals).some(m => m.length > 0);
            return (
              <button key={day.date} onClick={() => setSelectedDate(day.date)}
                className={`flex-1 flex flex-col items-center gap-0.5 py-1.5 rounded-lg transition-colors
                  ${isSelected ? 'bg-dram-accent/20 ring-1 ring-dram-accent/40' : 'hover:bg-white/5'}`}>
                <span className={`text-xs font-medium ${isSelected ? 'text-dram-accent' : 'text-slate-500'}`}>
                  {day.dayLabel}
                </span>
                <span className={`text-sm font-semibold ${isSelected ? 'text-dram-accent' : isToday ? 'text-slate-200' : 'text-slate-400'}`}>
                  {new Date(day.date + 'T12:00:00').getDate()}
                </span>
                <div className={`w-1.5 h-1.5 rounded-full transition-colors ${hasMeals ? 'bg-dram-accent' : 'bg-transparent'}`} />
              </button>
            );
          })}
        </div>

        {loadingPlan ? (
          <p className="text-xs text-slate-500 text-center py-4">Loading…</p>
        ) : selectedDay ? (
          <>
            {/* Daily totals */}
            {Object.values(selectedDay.meals).some(m => m.length > 0) && (
              <div className="flex gap-3 text-xs text-slate-400 px-1 flex-wrap">
                <span><strong className="text-slate-200">{Math.round(selectedDay.totals.calories)}</strong> kcal</span>
                <span><strong className="text-slate-200">{selectedDay.totals.proteinG.toFixed(0)}g</strong> protein</span>
                <span><strong className="text-slate-200">{selectedDay.totals.carbsG.toFixed(0)}g</strong> carbs</span>
                <span><strong className="text-slate-200">{selectedDay.totals.fatG.toFixed(0)}g</strong> fat</span>
              </div>
            )}

            {/* Meal slots */}
            <div className="space-y-3">
              {MEAL_ORDER.map((meal) => {
                const entries = selectedDay.meals[meal];
                return (
                  <div key={meal}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">{MEAL_LABELS[meal]}</span>
                      <button onClick={() => setPicker({ meal, date: selectedDay.date })}
                        className="text-xs text-dram-accent hover:opacity-75 font-medium">+ Add</button>
                    </div>
                    {entries.length === 0 ? (
                      <p className="text-xs text-slate-600 italic px-1">Nothing planned</p>
                    ) : (
                      <div className="space-y-1">
                        {entries.map((entry) => (
                          <div key={entry.id}
                            className="flex items-center justify-between gap-2 py-1.5 px-2 rounded-lg bg-white/[0.03] hover:bg-white/[0.06] group">
                            <div className="flex-1 min-w-0">
                              <p className="text-sm text-slate-200 truncate">{entry.name}</p>
                              <p className="text-xs text-slate-500">
                                {Math.round(entry.calories)} kcal · {entry.proteinG.toFixed(0)}g P · {entry.carbsG.toFixed(0)}g C · {entry.fatG.toFixed(0)}g F
                              </p>
                            </div>
                            <button onClick={() => handleDelete(entry.id)}
                              className="text-slate-600 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity text-lg leading-none shrink-0 ml-1">
                              ×
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </>
        ) : null}

        {/* Template controls */}
        <div className="border-t border-dram-border pt-3 space-y-2">
          <div className="flex flex-wrap gap-2 items-center">
            <button onClick={() => setSaveOpen(!saveOpen)}
              className="text-xs px-3 py-1.5 rounded-lg border border-dram-border text-slate-400 hover:text-slate-200 hover:border-slate-600 transition-colors">
              Save as template
            </button>
            {templates.length > 0 && (
              <div className="flex gap-1.5 items-center flex-1 min-w-[140px]">
                <select value={applyId} onChange={e => setApplyId(e.target.value)}
                  className="flex-1 text-xs bg-dram-bg border border-dram-border rounded-lg px-2 py-1.5 text-slate-300 focus:outline-none">
                  <option value="">Apply template…</option>
                  {templates.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
                {applyId && (
                  <button onClick={handleApply} disabled={applying}
                    className="text-xs px-2.5 py-1.5 rounded-lg bg-dram-accent text-black font-semibold disabled:opacity-40">
                    {applying ? '…' : 'Apply'}
                  </button>
                )}
              </div>
            )}
          </div>

          {saveOpen && (
            <div className="flex gap-2">
              <input value={templateName} onChange={e => setTemplateName(e.target.value)}
                placeholder="Template name…" className={inputCls + ' flex-1 text-sm'} />
              <button onClick={handleSaveTemplate} disabled={savingTemplate || !templateName.trim()}
                className="px-3 py-1.5 rounded-lg bg-dram-accent text-black text-sm font-semibold disabled:opacity-40">
                {savingTemplate ? '…' : 'Save'}
              </button>
              <button onClick={() => { setSaveOpen(false); setTemplateName(''); }}
                className="text-slate-500 hover:text-slate-300 text-sm px-1">Cancel</button>
            </div>
          )}

          {templates.length > 0 && (
            <div className="space-y-0.5">
              {templates.map(t => (
                <div key={t.id} className="flex items-center justify-between text-xs text-slate-500 py-0.5 px-1">
                  <span>{t.name}</span>
                  <button onClick={() => handleDeleteTemplate(t.id)}
                    className="text-slate-600 hover:text-red-400 ml-2 transition-colors">×</button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {picker && (
        <FoodPickerModal
          meal={picker.meal}
          date={picker.date}
          onClose={() => setPicker(null)}
          onAdded={() => { setPicker(null); loadPlan(); }}
        />
      )}
    </>
  );
}

// ─── Section 6: Projections ───────────────────────────────────────────────────

function ProjectionsSection({
  summary,
  measurements,
  measurementGoals,
  upcoming,
  refreshKey,
}: {
  summary: GoalsSummary | null;
  measurements: BodyMeasurement[];
  measurementGoals: Record<string, MeasurementGoal>;
  upcoming: UpcomingSession[];
  refreshKey: number;
}) {
  const today = localDateStr();
  const weekStart = getWeekStart(today);

  const [weekPlan, setWeekPlan] = useState<MealPlanWeek | null>(null);
  const [tdee,     setTdee]     = useState<TDEEResult | null>(null);
  const [loading,  setLoading]  = useState(false);
  const [whatIfMode, setWhatIfMode] = useState(false);
  const [whatIfCals, setWhatIfCals] = useState('');

  async function fetchData() {
    setLoading(true);
    try {
      const [plan, tdeeResult] = await Promise.all([
        mealPlanApi.getWeek(weekStart).catch(() => null),
        goalsApi.getTDEE().catch(() => null),
      ]);
      setWeekPlan(plan);
      setTdee(tdeeResult);
    } finally { setLoading(false); }
  }

  useEffect(() => { fetchData(); }, [refreshKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const tdeePDay = tdee?.available ? tdee.total : null;
  const goals = summary?.nutrition.goals;

  // Weekly planned totals from current meal plan
  const plannedTotals = useMemo(() => {
    if (!weekPlan) return null;
    return weekPlan.days.reduce(
      (acc, d) => ({
        calories:     acc.calories     + d.totals.calories,
        proteinG:     acc.proteinG     + d.totals.proteinG,
        carbsG:       acc.carbsG       + d.totals.carbsG,
        fatG:         acc.fatG         + d.totals.fatG,
        daysWithData: acc.daysWithData + (d.totals.calories > 0 ? 1 : 0),
      }),
      { calories: 0, proteinG: 0, carbsG: 0, fatG: 0, daysWithData: 0 },
    );
  }, [weekPlan]);

  // Scheduled workout sessions this week (non-rest)
  const scheduledSessionCount = useMemo(() => {
    const endOfWeek = new Date(weekStart + 'T12:00:00');
    endOfWeek.setDate(endOfWeek.getDate() + 6);
    const endStr = localDateStr(endOfWeek);
    return upcoming.filter(s => !s.isRestDay && s.date >= weekStart && s.date <= endStr).length;
  }, [upcoming, weekStart]);

  // 14-day weight trend slope
  const weightTrend = useMemo(() => {
    const all = measurements
      .filter(m => m.metric === 'weight')
      .map(m => ({ date: m.measuredAt, lbs: m.unit === 'kg' ? m.value * 2.20462 : m.value }))
      .sort((a, b) => a.date.localeCompare(b.date));
    if (all.length === 0) return null;
    const latest = all[all.length - 1];
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 14);
    const recent = all.filter(m => new Date(m.date + 'T12:00:00') >= cutoff);
    if (recent.length < 2) return { slopePerWeek: 0, latestLbs: latest.lbs };
    const oldest = recent[0];
    const newest = recent[recent.length - 1];
    const days = (new Date(newest.date + 'T12:00:00').getTime() - new Date(oldest.date + 'T12:00:00').getTime()) / 86400000;
    return { slopePerWeek: days > 0 ? ((newest.lbs - oldest.lbs) / days) * 7 : 0, latestLbs: latest.lbs };
  }, [measurements]);

  // Weight change rate implied by current meal plan vs TDEE
  const mealPlanRate = useMemo(() => {
    if (!tdeePDay || !plannedTotals || plannedTotals.daysWithData === 0) return null;
    const avgDailyPlanned = plannedTotals.calories / plannedTotals.daysWithData;
    const weeklyDeficit  = (tdeePDay - avgDailyPlanned) * 7;
    const weeklyChange   = -weeklyDeficit / 3500;
    return { avgDailyPlanned, weeklyDeficit, weeklyChange };
  }, [tdeePDay, plannedTotals]);

  // What-if rate
  const whatIfCalNum = Number(whatIfCals) || 0;
  const whatIfRate   = whatIfMode && tdeePDay && whatIfCalNum > 0
    ? -((tdeePDay - whatIfCalNum) * 7) / 3500
    : null;

  const weightGoal = measurementGoals['weight'];
  const dayBars    = weekPlan?.days.map(d => ({ label: d.dayLabel, calories: d.totals.calories })) ?? [];

  function slopeLabel(s: number): string {
    if (Math.abs(s) < 0.01) return 'Stable';
    return `${s > 0 ? '+' : ''}${s.toFixed(2)} lbs/wk`;
  }
  function slopeColor(s: number): string {
    if (Math.abs(s) < 0.01) return 'text-slate-400';
    return s < 0 ? 'text-emerald-400' : 'text-amber-400';
  }

  return (
    <div className="bg-dram-card border border-dram-border p-5 space-y-5">
      <SectionHeader title="Projections">
        <button onClick={fetchData} disabled={loading} className="text-sm text-dram-accent hover:brightness-110 transition-colors disabled:opacity-50">
          {loading ? '…' : '↻ Refresh'}
        </button>
      </SectionHeader>

      {/* ── Planned Macros ── */}
      <div>
        <p className="text-sm font-semibold text-slate-500 uppercase tracking-wide mb-3">Planned Macros · This Week</p>
        {!plannedTotals || plannedTotals.daysWithData === 0 ? (
          <p className="text-sm text-slate-500">No meals planned for this week yet.</p>
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-slate-500">{plannedTotals.daysWithData} of 7 days have meals planned</p>
            {([
              { label: 'Calories', val: plannedTotals.calories, goal: goals?.calories != null ? goals.calories * 7 : null, unit: 'kcal', color: '#D4A843' },
              { label: 'Protein',  val: plannedTotals.proteinG, goal: goals?.proteinG != null ? goals.proteinG * 7 : null, unit: 'g',    color: '#60a5fa' },
              { label: 'Carbs',    val: plannedTotals.carbsG,   goal: goals?.carbsG   != null ? goals.carbsG * 7   : null, unit: 'g',    color: '#34d399' },
              { label: 'Fat',      val: plannedTotals.fatG,     goal: goals?.fatG     != null ? goals.fatG * 7     : null, unit: 'g',    color: '#fb923c' },
            ] as Array<{ label: string; val: number; goal: number | null; unit: string; color: string }>).map(({ label, val, goal: g, unit, color }) => (
              <div key={label}>
                <div className="flex justify-between items-baseline mb-1">
                  <span className="text-sm text-slate-300">{label}</span>
                  <span className="text-sm text-slate-400">
                    {Math.round(val).toLocaleString()} {unit}
                    {g != null ? ` / ${Math.round(g).toLocaleString()} ${unit}` : ''}
                  </span>
                </div>
                <ProgressBar actual={val} goal={g} color={color} />
              </div>
            ))}
            {dayBars.length > 0 && (
              <div className="pt-1">
                <WeekCalorieChart days={dayBars} goal={goals?.calories ?? null} />
              </div>
            )}
          </div>
        )}
      </div>

      <div className="border-t border-dram-border" />

      {/* ── Projected Calorie Burn ── */}
      <div>
        <p className="text-sm font-semibold text-slate-500 uppercase tracking-wide mb-3">Projected Calorie Burn · This Week</p>
        <div className="space-y-2">
          <div className="flex justify-between">
            <span className="text-sm text-slate-300">Scheduled workouts</span>
            <span className="text-sm font-medium text-slate-200">{scheduledSessionCount}</span>
          </div>
          {scheduledSessionCount > 0 && (
            <div className="flex justify-between">
              <span className="text-sm text-slate-400">Estimated burn (~350 kcal/session)</span>
              <span className="text-sm text-slate-400">~{(scheduledSessionCount * 350).toLocaleString()} kcal</span>
            </div>
          )}
          {tdeePDay != null && (
            <div className="flex justify-between">
              <span className="text-sm text-slate-400">TDEE (daily)</span>
              <span className="text-sm text-slate-400">{Math.round(tdeePDay).toLocaleString()} kcal</span>
            </div>
          )}
          {tdeePDay != null && mealPlanRate != null && (
            <div className="flex justify-between pt-1 border-t border-dram-border">
              <span className="text-sm text-slate-300">Est. weekly {mealPlanRate.weeklyDeficit > 0 ? 'deficit' : 'surplus'}</span>
              <span className={`text-sm font-medium ${mealPlanRate.weeklyDeficit > 0 ? 'text-emerald-400' : 'text-amber-400'}`}>
                {mealPlanRate.weeklyDeficit > 0 ? '−' : '+'}
                {Math.abs(Math.round(mealPlanRate.weeklyDeficit)).toLocaleString()} kcal
              </span>
            </div>
          )}
        </div>
      </div>

      <div className="border-t border-dram-border" />

      {/* ── Weight Projection ── */}
      <div>
        <p className="text-sm font-semibold text-slate-500 uppercase tracking-wide mb-3">Weight Projection</p>
        {!weightTrend ? (
          <p className="text-sm text-slate-500">No weight measurements found. Log measurements to see projections.</p>
        ) : (
          <div className="space-y-2">
            <div className="flex justify-between">
              <span className="text-sm text-slate-300">Current weight</span>
              <span className="text-sm font-medium text-slate-200">{weightTrend.latestLbs.toFixed(1)} lbs</span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm text-slate-300">14-day trend</span>
              <span className={`text-sm font-medium ${slopeColor(weightTrend.slopePerWeek)}`}>
                {slopeLabel(weightTrend.slopePerWeek)}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm text-slate-400">In 30 days (current rate)</span>
              <span className="text-sm text-slate-400">
                {(weightTrend.latestLbs + weightTrend.slopePerWeek * (30 / 7)).toFixed(1)} lbs
              </span>
            </div>

            {mealPlanRate && (
              <div className="pt-1 border-t border-dram-border space-y-2">
                <div className="flex justify-between">
                  <span className="text-sm text-slate-400">Avg planned (logged days)</span>
                  <span className="text-sm text-slate-400">{Math.round(mealPlanRate.avgDailyPlanned).toLocaleString()} kcal/day</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-slate-300">Rate with meal plan</span>
                  <span className={`text-sm font-medium ${slopeColor(mealPlanRate.weeklyChange)}`}>
                    {slopeLabel(mealPlanRate.weeklyChange)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-slate-400">In 30 days (with plan)</span>
                  <span className="text-sm text-slate-400">
                    {(weightTrend.latestLbs + mealPlanRate.weeklyChange * (30 / 7)).toFixed(1)} lbs
                  </span>
                </div>
              </div>
            )}

            {/* What if mode */}
            <div className="pt-2 border-t border-dram-border">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-slate-300">What if mode</span>
                <button
                  onClick={() => {
                    if (!whatIfMode && !whatIfCals && goals?.calories) setWhatIfCals(String(goals.calories));
                    setWhatIfMode(m => !m);
                  }}
                  className={`relative w-9 h-5 rounded-full transition-colors ${whatIfMode ? 'bg-dram-accent' : 'bg-dram-border'}`}
                >
                  <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all ${whatIfMode ? 'left-[18px]' : 'left-0.5'}`} />
                </button>
              </div>
              {whatIfMode && (
                <div className="space-y-2">
                  {!tdeePDay ? (
                    <p className="text-xs text-slate-500">Complete your profile to enable TDEE-based projections.</p>
                  ) : (
                    <>
                      <div className="flex items-center gap-2">
                        <label className="text-sm text-slate-400 shrink-0">Daily intake:</label>
                        <input
                          type="number" min="500" max="10000"
                          value={whatIfCals}
                          onChange={(e) => setWhatIfCals(e.target.value)}
                          className={inputCls + ' w-28 text-center text-sm'}
                          placeholder="kcal/day"
                        />
                        <span className="text-sm text-slate-500">kcal/day</span>
                      </div>
                      {whatIfRate != null && (
                        <div className="space-y-1 pl-1">
                          <div className="flex justify-between">
                            <span className="text-sm text-slate-400">Projected rate</span>
                            <span className={`text-sm font-medium ${slopeColor(whatIfRate)}`}>
                              {slopeLabel(whatIfRate)}
                            </span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-sm text-slate-400">In 30 days</span>
                            <span className="text-sm font-medium text-slate-200">
                              {(weightTrend.latestLbs + whatIfRate * (30 / 7)).toFixed(1)} lbs
                            </span>
                          </div>
                          {weightGoal && (
                            <div className="flex justify-between">
                              <span className="text-sm text-slate-400">Goal ({weightGoal.targetValue} lbs) ETA</span>
                              <span className="text-sm text-slate-300">
                                {computeETAFromSlope(weightTrend.latestLbs, weightGoal.targetValue, whatIfRate) ?? 'N/A'}
                              </span>
                            </div>
                          )}
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* ── Goal Progress Projection ── */}
      {Object.keys(measurementGoals).length > 0 && (
        <>
          <div className="border-t border-dram-border" />
          <div>
            <p className="text-sm font-semibold text-slate-500 uppercase tracking-wide mb-3">Goal Progress Projection</p>
            <div className="space-y-3">
              {Object.entries(measurementGoals).map(([metric, goal]) => {
                const cfg = METRIC_CONFIG[metric];
                if (!cfg) return null;

                const sorted = measurements
                  .filter(m => m.metric === metric)
                  .sort((a, b) => b.measuredAt.localeCompare(a.measuredAt));
                const latest = sorted[0];
                if (!latest) return null;

                const currentVal = metric === 'weight' && latest.unit === 'kg'
                  ? latest.value * 2.20462
                  : latest.value;

                const { status } = computeGoalPace(measurements, metric, goal, cfg.dir);

                const currentETA = metric === 'weight' && weightTrend
                  ? computeETAFromSlope(weightTrend.latestLbs, goal.targetValue, weightTrend.slopePerWeek)
                  : computeGoalPace(measurements, metric, goal, cfg.dir).projectedDate;

                const planETA = metric === 'weight' && mealPlanRate && weightTrend
                  ? computeETAFromSlope(weightTrend.latestLbs, goal.targetValue, mealPlanRate.weeklyChange)
                  : null;

                const hasPlanCol = metric === 'weight' && mealPlanRate != null && weightTrend != null;

                return (
                  <div key={metric} className="bg-dram-bg/50 rounded-lg p-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-slate-200">{cfg.label}</span>
                      <PaceBadge status={status} />
                    </div>
                    <p className="text-xs text-slate-400">
                      {currentVal.toFixed(1)} {cfg.unit} now → {goal.targetValue} {cfg.unit} target
                      {goal.targetDate && (
                        <span className="text-slate-500"> · deadline {new Date(goal.targetDate + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>
                      )}
                    </p>
                    <div className={`grid gap-2 ${hasPlanCol ? 'grid-cols-2' : 'grid-cols-1'}`}>
                      <div>
                        <p className="text-xs text-slate-500 mb-0.5">Current trajectory</p>
                        {metric === 'weight' && weightTrend && (
                          <p className={`text-xs font-medium ${slopeColor(weightTrend.slopePerWeek)}`}>
                            {slopeLabel(weightTrend.slopePerWeek)}
                          </p>
                        )}
                        <p className="text-xs text-slate-500">ETA: {currentETA ?? '—'}</p>
                      </div>
                      {hasPlanCol && (
                        <div>
                          <p className="text-xs text-slate-500 mb-0.5">With meal plan</p>
                          <p className={`text-xs font-medium ${slopeColor(mealPlanRate!.weeklyChange)}`}>
                            {slopeLabel(mealPlanRate!.weeklyChange)}
                          </p>
                          <p className={`text-xs ${planETA ? 'text-emerald-400' : 'text-slate-500'}`}>
                            ETA: {planETA ?? '—'}
                          </p>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function PlanningPage() {
  const navigate = useNavigate();
  const [summary,          setSummary]          = useState<GoalsSummary | null>(null);
  const [exGoals,          setExGoals]          = useState<ExerciseGoals | null>(null);
  const [measurementGoals, setMeasurementGoals] = useState<Record<string, MeasurementGoal>>({});
  const [measurements,     setMeasurements]     = useState<BodyMeasurement[]>([]);
  const [schedules,        setSchedules]        = useState<WorkoutSchedule[]>([]);
  const [upcoming,         setUpcoming]         = useState<UpcomingSession[]>([]);
  const [routinesList,     setRoutinesList]     = useState<RoutineSummary[]>([]);
  const [exercisesList,    setExercisesList]    = useState<Exercise[]>([]);
  const [templates,        setTemplates]        = useState<ProgramTemplate[]>([]);
  const [userGoals,        setUserGoals]        = useState<UserGoal[]>([]);
  const [addingGoal,       setAddingGoal]       = useState(false);
  const [loading,          setLoading]          = useState(true);
  const [projRefreshKey,   setProjRefreshKey]   = useState(0);

  async function load() {
    try {
      const [s, eg, mg, ms, scheds, upc, routines, exs, tmplts, ugs] = await Promise.all([
        goalsApi.getSummary().catch(() => null),
        goalsApi.getExercise().catch(() => null),
        measurementsApi.getGoals().catch(() => ({})),
        measurementsApi.getAll().catch(() => []),
        schedulesApi.getAll().catch(() => []),
        schedulesApi.getUpcoming(14).catch(() => []),
        routinesApi.getAll().catch(() => []),
        exercisesApi.getAll().catch(() => []),
        schedulesApi.getProgramTemplates().catch(() => []),
        userGoalsApi.getAll().catch(() => []),
      ]);
      setSummary(s);
      setExGoals(eg);
      setMeasurementGoals(mg as Record<string, MeasurementGoal>);
      setMeasurements(ms as BodyMeasurement[]);
      setSchedules(scheds as WorkoutSchedule[]);
      setUpcoming(upc as UpcomingSession[]);
      setRoutinesList(routines as RoutineSummary[]);
      setExercisesList(exs as Exercise[]);
      setTemplates(tmplts as ProgramTemplate[]);
      setUserGoals(ugs as UserGoal[]);
    } finally { setLoading(false); }
  }

  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="flex flex-col h-full overflow-hidden bg-dram-bg text-white">
      <div className="flex-shrink-0 px-6 pt-5 pb-4 border-b border-dram-border">
        <h1 className="text-xl font-semibold text-slate-200">Planning</h1>
      </div>

      {loading ? (
        <div className="flex-1 flex items-center justify-center text-slate-500 text-sm">Loading…</div>
      ) : (
        <div className="flex-1 overflow-y-auto">
          <div className="px-6 pt-6 pb-3">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <div style={{ width: 14, height: 2, background: '#D4A843' }} />
                <h2 className="text-sm font-semibold uppercase tracking-wider text-white">Goals</h2>
              </div>
              <button
                onClick={() => setAddingGoal(true)}
                className="text-xs text-slate-400 hover:text-dram-accent transition-colors border border-dram-border hover:border-dram-accent rounded px-2.5 py-1"
              >+ Add goal</button>
            </div>
            <GoalsStatsBand
              summary={summary}
              exGoals={exGoals}
              measurementGoals={measurementGoals}
              measurements={measurements}
              userGoals={userGoals}
              exercisesList={exercisesList}
              routinesList={routinesList}
              onAddGoal={() => setAddingGoal(true)}
              onSaved={load}
            />
            {addingGoal && (
              <UserGoalForm
                exercisesList={exercisesList}
                routinesList={routinesList}
                onClose={() => setAddingGoal(false)}
                onSaved={() => { setAddingGoal(false); load(); }}
              />
            )}
          </div>

          <div className="px-6 pt-3 pb-5">
            <PlanningCalendarCard
              routinesList={routinesList}
              exercisesList={exercisesList}
            />
          </div>

          {/* Schedules — full width 2-col */}
          <div className="px-6 pb-5 space-y-3">
            <div className="flex items-center gap-3">
              <div style={{ width: 14, height: 2, background: '#D4A843' }} />
              <h2 className="text-sm font-semibold uppercase tracking-wider text-white">Schedules</h2>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <WorkoutScheduleSection
                schedules={schedules}
                upcoming={upcoming}
                routinesList={routinesList}
                exercisesList={exercisesList}
                templates={templates}
                onReload={load}
              />
              <MealPlanningSection onPlanChange={() => setProjRefreshKey(k => k + 1)} />
            </div>
          </div>

          <div className="p-6 space-y-5 max-w-2xl">
          <NutritionSection summary={summary} onSaved={load} />
          <ExerciseSection summary={summary} exGoals={exGoals} onSaved={load} />
          <MeasurementGoalsSection goals={measurementGoals} measurements={measurements} onReload={load} />
          <div className="flex items-center gap-3">
            <div style={{ width: 14, height: 2, background: '#D4A843' }} />
            <h2 className="text-sm font-semibold uppercase tracking-wider text-white">Projections</h2>
          </div>
          <ProjectionsSection
            summary={summary}
            measurements={measurements}
            measurementGoals={measurementGoals}
            upcoming={upcoming}
            refreshKey={projRefreshKey}
          />
          </div>
        </div>
      )}
    </div>
  );
}
