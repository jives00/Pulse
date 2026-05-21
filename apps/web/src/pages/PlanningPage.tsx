import { useEffect, useState } from 'react';
import {
  goalsApi, measurementsApi, schedulesApi, routinesApi, exercisesApi, userGoalsApi,
  computeGoalPace,
  GLASS_OZ,
  getWeekStart, localDateStr, shortDate,
  type GoalsSummary, type ExerciseGoals, type MeasurementGoal, type BodyMeasurement, type PaceStatus, type TDEEResult,
  type WorkoutSchedule, type UpcomingSession, type RecurrenceType, type RoutineSummary,
  type Exercise,
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

// ─── Goal Editing Helper (for measurement goals in GoalsStatsBand) ─────────

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
  summary, measurementGoals, measurements, userGoals, exercisesList, routinesList, onAddGoal, onSaved,
}: {
  summary: GoalsSummary | null;
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
  const exGoals = summary?.workouts.goals;
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

// ─── Main page ────────────────────────────────────────────────────────────────

export default function PlanningPage() {
  const navigate = useNavigate();
  const [summary,          setSummary]          = useState<GoalsSummary | null>(null);
  const [measurementGoals, setMeasurementGoals] = useState<Record<string, MeasurementGoal>>({});
  const [measurements,     setMeasurements]     = useState<BodyMeasurement[]>([]);
  const [upcoming,         setUpcoming]         = useState<UpcomingSession[]>([]);
  const [routinesList,     setRoutinesList]     = useState<RoutineSummary[]>([]);
  const [exercisesList,    setExercisesList]    = useState<Exercise[]>([]);
  const [userGoals,        setUserGoals]        = useState<UserGoal[]>([]);
  const [addingGoal,       setAddingGoal]       = useState(false);
  const [loading,          setLoading]          = useState(true);

  async function load() {
    try {
      const [s, mg, ms, upc, routines, exs, ugs] = await Promise.all([
        goalsApi.getSummary().catch(() => null),
        measurementsApi.getGoals().catch(() => ({})),
        measurementsApi.getAll().catch(() => []),
        schedulesApi.getUpcoming(14).catch(() => []),
        routinesApi.getAll().catch(() => []),
        exercisesApi.getAll().catch(() => []),
        userGoalsApi.getAll().catch(() => []),
      ]);
      setSummary(s);
      setMeasurementGoals(mg as Record<string, MeasurementGoal>);
      setMeasurements(ms as BodyMeasurement[]);
      setUpcoming(upc as UpcomingSession[]);
      setRoutinesList(routines as RoutineSummary[]);
      setExercisesList(exs as Exercise[]);
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

          <div className="px-6 pt-3 pb-5 space-y-3">
            <div className="flex items-center gap-3">
              <div style={{ width: 14, height: 2, background: '#D4A843' }} />
              <h2 className="text-sm font-semibold uppercase tracking-wider text-white">Planning Board</h2>
            </div>
            <PlanningCalendarCard
              routinesList={routinesList}
              exercisesList={exercisesList}
            />
          </div>

        </div>
      )}
    </div>
  );
}
