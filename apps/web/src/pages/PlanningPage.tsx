import { useEffect, useRef, useMemo, useState } from 'react';
import {
  goalsApi, measurementsApi, schedulesApi, routinesApi,
  mealPlanApi, foodsApi, recipesApi,
  computeGoalPace,
  GLASS_OZ,
  getWeekStart, localDateStr, shortDate,
  type GoalsSummary, type ExerciseGoals, type MeasurementGoal, type BodyMeasurement, type PaceStatus, type TDEEResult,
  type WorkoutSchedule, type UpcomingSession, type ProgramTemplate, type RecurrenceType, type RoutineSummary,
  type MealPlanWeek, type MealPlanTemplate,
  type MealSlot, type Food, type Recipe,
} from '@pulse/api-client';
import { useNavigate } from 'react-router-dom';

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
    <div className="flex gap-1">
      {days.map(({ dateStr, dayNum, session, isToday }, i) => (
        <div key={dateStr} className="flex-1 flex flex-col items-center gap-1">
          <span className="text-xs text-slate-500">{DOW_LABELS[i][0]}</span>
          <div className={`w-7 h-7 rounded-full flex items-center justify-center text-sm ${isToday ? 'bg-dram-accent text-black font-bold' : 'text-slate-300'}`}>
            {dayNum}
          </div>
          <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: dotColor(session) }} />
          {session && !session.isRestDay && (
            <span className="text-[10px] text-slate-500 leading-tight truncate w-full text-center" title={session.routineName ?? session.dayLabel ?? ''}>
              {session.routineName ?? session.dayLabel ?? ''}
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
          <label className="block text-xs text-slate-500 mb-1">Target</label>
          <input type="number" min="0" step="0.1" value={value} onChange={(e) => setValue(e.target.value)} className={inputCls} autoFocus />
        </div>
        <div>
          <label className="block text-xs text-slate-500 mb-1">By date (optional)</label>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={inputCls} />
        </div>
      </div>
      <div className="flex gap-2">
        <button onClick={onCancel} className="flex-1 text-xs text-slate-400 hover:text-slate-200 py-1.5 transition-colors">Cancel</button>
        <button
          onClick={submit}
          disabled={saving || !value}
          className="flex-1 bg-dram-accent text-black text-xs font-semibold rounded py-1.5 hover:brightness-110 disabled:opacity-50 transition"
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
                className="text-xs px-2 py-1 border border-dram-border rounded-full text-slate-400 hover:text-slate-200 hover:border-slate-500 transition-colors"
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

// ─── Add schedule modal ───────────────────────────────────────────────────────

function AddScheduleModal({ routinesList, onClose, onSaved }: {
  routinesList: RoutineSummary[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [isRestDay,     setIsRestDay]     = useState(false);
  const [routineId,     setRoutineId]     = useState<number | null>(null);
  const [label,         setLabel]         = useState('');
  const [recType,       setRecType]       = useState<RecurrenceType>('days_of_week');
  const [dowDays,       setDowDays]       = useState<number[]>([]);
  const [xDaysInterval, setXDaysInterval] = useState('3');
  const [domType,       setDomType]       = useState<'specific_dates' | 'nth_weekday'>('specific_dates');
  const [domDates,      setDomDates]      = useState('1, 15');
  const [domN,          setDomN]          = useState('1');
  const [domWeekday,    setDomWeekday]    = useState('0');
  const [startDate,     setStartDate]     = useState(new Date().toISOString().slice(0, 10));
  const [endDate,       setEndDate]       = useState('');
  const [saving,        setSaving]        = useState(false);

  function buildConfig() {
    if (recType === 'daily' || recType === 'every_other_day') return {};
    if (recType === 'days_of_week') return { days: dowDays };
    if (recType === 'every_x_days') return { interval: Number(xDaysInterval) || 3 };
    if (recType === 'day_of_month') {
      if (domType === 'specific_dates') {
        return {
          type: 'specific_dates',
          dates: domDates.split(',').map((d) => Number(d.trim())).filter((d) => d >= 1 && d <= 31),
        };
      }
      return { type: 'nth_weekday', n: Number(domN) || 1, weekday: Number(domWeekday) || 0 };
    }
    return {};
  }

  async function handleSave() {
    if (!isRestDay && routineId === null) return;
    setSaving(true);
    try {
      await schedulesApi.create({
        routineId: isRestDay ? null : routineId,
        label: label.trim() || undefined,
        isRestDay,
        recurrenceType: recType,
        recurrenceConfig: buildConfig(),
        startDate,
        endDate: endDate.trim() || null,
      });
      onSaved();
    } catch { /* ignore */ } finally { setSaving(false); }
  }

  const canSave = isRestDay || routineId !== null;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60" onClick={onClose}>
      <div
        className="bg-dram-card border border-dram-border rounded-t-2xl sm:rounded-2xl w-full sm:max-w-md mx-4 max-h-[90vh] overflow-y-auto p-5 space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-slate-200">Add Schedule</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-200 text-xl leading-none">×</button>
        </div>

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

        {/* Routine picker */}
        {!isRestDay && (
          <div>
            <label className="block text-sm text-slate-500 mb-1">Routine</label>
            <select
              value={routineId ?? ''}
              onChange={(e) => setRoutineId(e.target.value ? Number(e.target.value) : null)}
              className={inputCls}
            >
              <option value="">Select a routine…</option>
              {routinesList.map((r) => (
                <option key={r.id} value={r.id}>{r.name}</option>
              ))}
            </select>
          </div>
        )}

        {/* Label */}
        <div>
          <label className="block text-sm text-slate-500 mb-1">Label (optional)</label>
          <input
            type="text" value={label} onChange={(e) => setLabel(e.target.value)}
            className={inputCls} placeholder="e.g. Morning workout"
          />
        </div>

        {/* Recurrence type */}
        <div>
          <label className="block text-sm text-slate-500 mb-1.5">Repeats</label>
          <div className="flex flex-wrap gap-1.5">
            {(['daily', 'every_other_day', 'days_of_week', 'every_x_days', 'day_of_month'] as RecurrenceType[]).map((rt) => (
              <button
                key={rt}
                onClick={() => setRecType(rt)}
                className={`text-xs px-2.5 py-1 rounded-lg transition-colors ${recType === rt ? 'bg-dram-accent text-black font-semibold' : 'bg-dram-border text-slate-300 hover:text-slate-100'}`}
              >
                {rt === 'daily' ? 'Daily'
                  : rt === 'every_other_day' ? 'Every other day'
                  : rt === 'days_of_week'    ? 'Days of week'
                  : rt === 'every_x_days'    ? 'Every X days'
                  :                            'Day of month'}
              </button>
            ))}
          </div>
        </div>

        {/* days_of_week config */}
        {recType === 'days_of_week' && (
          <div className="flex gap-1.5">
            {DOW_LABELS.map((lbl, i) => (
              <button
                key={i}
                onClick={() => setDowDays((prev) => prev.includes(i) ? prev.filter((d) => d !== i) : [...prev, i])}
                className={`flex-1 py-2 rounded-lg text-xs transition-colors ${dowDays.includes(i) ? 'bg-dram-accent text-black font-semibold' : 'bg-dram-border text-slate-300 hover:text-slate-100'}`}
              >
                {lbl[0]}
              </button>
            ))}
          </div>
        )}

        {/* every_x_days config */}
        {recType === 'every_x_days' && (
          <div>
            <label className="block text-sm text-slate-500 mb-1">Interval (days)</label>
            <input type="number" min="1" value={xDaysInterval} onChange={(e) => setXDaysInterval(e.target.value)} className={inputCls} />
          </div>
        )}

        {/* day_of_month config */}
        {recType === 'day_of_month' && (
          <div className="space-y-2">
            <div className="flex gap-2">
              {(['specific_dates', 'nth_weekday'] as const).map((dt) => (
                <button
                  key={dt}
                  onClick={() => setDomType(dt)}
                  className={`flex-1 text-xs py-1.5 rounded-lg transition-colors ${domType === dt ? 'bg-dram-accent text-black font-semibold' : 'bg-dram-border text-slate-300 hover:text-slate-100'}`}
                >
                  {dt === 'specific_dates' ? 'Specific dates' : 'Nth weekday'}
                </button>
              ))}
            </div>
            {domType === 'specific_dates' ? (
              <div>
                <label className="block text-xs text-slate-500 mb-1">Dates (comma-separated, e.g. 1, 15)</label>
                <input type="text" value={domDates} onChange={(e) => setDomDates(e.target.value)} className={inputCls} />
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs text-slate-500 mb-1">Which (1–4)</label>
                  <input type="number" min="1" max="4" value={domN} onChange={(e) => setDomN(e.target.value)} className={inputCls} />
                </div>
                <div>
                  <label className="block text-xs text-slate-500 mb-1">Weekday (0=Mon … 6=Sun)</label>
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

        <div className="flex gap-2 pt-1">
          <button onClick={onClose} className="flex-1 text-sm text-slate-400 hover:text-slate-200 py-2 transition-colors">Cancel</button>
          <button
            onClick={handleSave}
            disabled={saving || !canSave}
            className="flex-[2] bg-dram-accent text-black text-sm font-semibold rounded-lg py-2 hover:brightness-110 disabled:opacity-50 transition"
          >
            {saving ? 'Saving…' : 'Add Schedule'}
          </button>
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
                    <label className="block text-xs text-slate-500 mb-1">{slot}</label>
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
  schedules, upcoming, routinesList, templates, onReload,
}: {
  schedules: WorkoutSchedule[];
  upcoming: UpcomingSession[];
  routinesList: RoutineSummary[];
  templates: ProgramTemplate[];
  onReload: () => void;
}) {
  const [showAdd,    setShowAdd]    = useState(false);
  const [showImport, setShowImport] = useState(false);

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
              <div key={sch.id} className="flex items-center gap-3 py-2.5">
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-slate-200">
                    {sch.isRestDay ? 'Rest day' : (sch.routineName ?? sch.label ?? 'Workout')}
                  </p>
                  <p className="text-xs text-slate-500">{sch.recurrenceDescription}</p>
                </div>
                <button
                  onClick={() => handleDelete(sch.id)}
                  className="text-sm text-slate-500 hover:text-red-400 px-2 py-1 transition-colors"
                >
                  ✕
                </button>
              </div>
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
          onClose={() => setShowAdd(false)}
          onSaved={() => { setShowAdd(false); onReload(); }}
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
        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">Planned Macros · This Week</p>
        {!plannedTotals || plannedTotals.daysWithData === 0 ? (
          <p className="text-sm text-slate-500">No meals planned for this week yet.</p>
        ) : (
          <div className="space-y-3">
            <p className="text-xs text-slate-500">{plannedTotals.daysWithData} of 7 days have meals planned</p>
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
        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">Projected Calorie Burn · This Week</p>
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
        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">Weight Projection</p>
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
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">Goal Progress Projection</p>
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
  const [templates,        setTemplates]        = useState<ProgramTemplate[]>([]);
  const [loading,          setLoading]          = useState(true);
  const [projRefreshKey,   setProjRefreshKey]   = useState(0);

  async function load() {
    try {
      const [s, eg, mg, ms, scheds, upc, routines, tmplts] = await Promise.all([
        goalsApi.getSummary().catch(() => null),
        goalsApi.getExercise().catch(() => null),
        measurementsApi.getGoals().catch(() => ({})),
        measurementsApi.getAll().catch(() => []),
        schedulesApi.getAll().catch(() => []),
        schedulesApi.getUpcoming(14).catch(() => []),
        routinesApi.getAll().catch(() => []),
        schedulesApi.getProgramTemplates().catch(() => []),
      ]);
      setSummary(s);
      setExGoals(eg);
      setMeasurementGoals(mg as Record<string, MeasurementGoal>);
      setMeasurements(ms as BodyMeasurement[]);
      setSchedules(scheds as WorkoutSchedule[]);
      setUpcoming(upc as UpcomingSession[]);
      setRoutinesList(routines as RoutineSummary[]);
      setTemplates(tmplts as ProgramTemplate[]);
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
        <div className="flex-1 overflow-y-auto p-6 space-y-5 max-w-2xl">
          <NutritionSection summary={summary} onSaved={load} />
          <ExerciseSection summary={summary} exGoals={exGoals} onSaved={load} />
          <MeasurementGoalsSection goals={measurementGoals} measurements={measurements} onReload={load} />
          <WorkoutScheduleSection
            schedules={schedules}
            upcoming={upcoming}
            routinesList={routinesList}
            templates={templates}
            onReload={load}
          />
          <MealPlanningSection onPlanChange={() => setProjRefreshKey(k => k + 1)} />
          <ProjectionsSection
            summary={summary}
            measurements={measurements}
            measurementGoals={measurementGoals}
            upcoming={upcoming}
            refreshKey={projRefreshKey}
          />
        </div>
      )}
    </div>
  );
}
