import { useState, useEffect, useRef, useImperativeHandle, forwardRef } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { BarChart, Bar, XAxis, YAxis, Tooltip, Cell, ResponsiveContainer, LineChart, Line, Legend, ComposedChart, Area, ReferenceLine } from 'recharts';
import {
  workoutsApi, goalsApi, measurementsApi, routinesApi, exercisesApi,
  waterApi, logApi, historyApi,
  type WorkoutSummary, type ExerciseGoals, type GoalsSummary,
  type BodyMeasurement, type MeasurementGoal, type PersonalBests,
  type RoutineSummary, type Exercise,
  type WaterHistory, type FoodLogHistoryDay,
} from '@pulse/api-client';
import Spinner from '../components/Spinner';
import { useSettingsStore } from '../store/settings';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function localDateStr(d: Date = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

function formatDate(dateStr: string) {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

function getWeekStart(dateStr: string) {
  const d = new Date(dateStr + 'T12:00:00');
  const day = d.getDay();
  d.setDate(d.getDate() - (day === 0 ? 6 : day - 1));
  return localDateStr(d);
}

type WeekBucket = { weekStart: string; label: string; workouts: number; minutes: number; calories: number; volumeLbs: number };

function buildWeeklyData(workouts: WorkoutSummary[]): WeekBucket[] {
  const now = new Date();
  const weeks: WeekBucket[] = [];
  for (let i = 12; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i * 7);
    const ws = getWeekStart(localDateStr(d));
    const weekDate = new Date(ws + 'T12:00:00');
    weeks.push({
      weekStart: ws,
      label: weekDate.toLocaleDateString('en-US', { month: 'numeric', day: 'numeric' }),
      workouts: 0,
      minutes: 0,
      calories: 0,
      volumeLbs: 0,
    });
  }
  for (const w of workouts) {
    const ws = getWeekStart(w.workoutDate);
    const week = weeks.find((wk) => wk.weekStart === ws);
    if (week) {
      week.workouts++;
      week.minutes += w.durationMinutes ?? 0;
      week.calories += w.caloriesBurned ?? 0;
      week.volumeLbs += (w.totalVolumeKg ?? 0) * 2.20462;
    }
  }
  return weeks;
}

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

// ─── UI primitives ────────────────────────────────────────────────────────────

function Ring({ pct, color, size = 108 }: { pct: number; color: string; size?: number }) {
  const r = (size - 10) / 2;
  const circ = 2 * Math.PI * r;
  const filled = Math.min(pct, 1) * circ;
  return (
    <svg width={size} height={size} className="-rotate-90">
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth={9} />
      <circle
        cx={size / 2} cy={size / 2} r={r} fill="none"
        stroke={color} strokeWidth={9}
        strokeDasharray={`${filled} ${circ}`}
        strokeLinecap="round"
        style={{ transition: 'stroke-dasharray 0.5s ease' }}
      />
    </svg>
  );
}

function ProgressBar({ label, actual, goal, unit, color }: {
  label: string; actual: number; goal: number | null; unit: string; color: string;
}) {
  const pct = goal ? Math.min(actual / goal, 1) : 0;
  return (
    <div>
      <div className="flex justify-between items-baseline mb-1.5">
        <span className="text-sm text-slate-300">{label}</span>
        <span className="text-sm text-slate-400">
          {actual} {unit}{goal != null ? ` / ${goal} ${unit}` : ''}
        </span>
      </div>
      <div className="h-2 rounded-full overflow-hidden" style={{ backgroundColor: 'rgba(255,255,255,0.08)' }}>
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{ width: `${pct * 100}%`, backgroundColor: color }}
        />
      </div>
    </div>
  );
}

function StatTile({ icon, label, value, unit, color }: {
  icon: string; label: string; value: number | string; unit: string; color: string;
}) {
  return (
    <div className="flex flex-col gap-1.5 px-4 py-4">
      <div className="flex items-center gap-1.5">
        <span className="text-xl leading-none">{icon}</span>
        <span className="text-xs font-semibold uppercase tracking-wider" style={{ color }}>{label}</span>
      </div>
      <div className="flex items-baseline gap-1">
        <span className="text-xl font-bold text-white">{value}</span>
        {unit && <span className="text-xs text-slate-400">{unit}</span>}
      </div>
    </div>
  );
}

// ─── Goals modal ─────────────────────────────────────────────────────────────

function GoalsModal({ exGoals, measurementGoals, onSaved, onClose }: {
  exGoals: ExerciseGoals | null;
  measurementGoals: Record<string, MeasurementGoal>;
  onSaved: () => void;
  onClose: () => void;
}) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  const inputCls = 'w-full bg-dram-bg border border-dram-border rounded px-2 py-1.5 text-sm text-slate-100 focus:outline-none focus:border-dram-accent';

  const [volume, setVolume] = useState(String(exGoals?.volumeLbsPerWeek ?? ''));
  const [workoutCount, setWorkoutCount] = useState(String(exGoals?.workoutsPerWeek ?? ''));
  const [saving, setSaving] = useState(false);

  // One state entry per displayed measurement metric
  const [mGoals, setMGoals] = useState<Record<string, { value: string; date: string }>>(() => {
    const init: Record<string, { value: string; date: string }> = {};
    for (const key of DISPLAYED_METRICS) {
      const g = measurementGoals[key];
      init[key] = { value: g ? String(g.targetValue) : '', date: g?.targetDate ?? '' };
    }
    return init;
  });

  async function handleSave() {
    setSaving(true);
    try {
      await goalsApi.saveExercise({
        workoutsPerWeek: workoutCount !== '' ? Number(workoutCount) : null,
        minutesPerWeek: exGoals?.minutesPerWeek ?? null,
        volumeLbsPerWeek: volume !== '' ? Number(volume) : null,
      });

      await Promise.all(
        DISPLAYED_METRICS.map((key) => {
          const { value, date } = mGoals[key];
          if (!value) return Promise.resolve();
          const cfg = METRIC_CONFIG[key];
          return measurementsApi.setGoal(key, {
            targetValue: Number(value),
            unit: cfg.unit,
            targetDate: date || null,
          });
        })
      );

      onSaved();
      onClose();
    } catch { /* ignore */ } finally { setSaving(false); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60" onClick={onClose}>
      <div
        className="bg-dram-card rounded-t-2xl sm:rounded-2xl w-full sm:max-w-md max-h-[85vh] flex flex-col border border-dram-border"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 pt-5 pb-3 shrink-0 border-b border-dram-border">
          <h2 className="text-base font-semibold text-slate-200">Edit Goals</h2>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-300 text-xl leading-none">×</button>
        </div>

        <div className="overflow-y-auto flex-1 px-5 py-4 space-y-5">
          {/* Workout goals */}
          <div>
            <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">This Week</div>
            <div className="space-y-3">
              <div>
                <label className="block text-sm text-slate-400 mb-1">Volume goal (lbs / week)</label>
                <input type="number" min="0" value={volume} onChange={(e) => setVolume(e.target.value)} className={inputCls} placeholder="e.g. 10000" />
              </div>
              <div>
                <label className="block text-sm text-slate-400 mb-1">Workouts / week</label>
                <input type="number" min="0" value={workoutCount} onChange={(e) => setWorkoutCount(e.target.value)} className={inputCls} />
              </div>
            </div>
          </div>

          {/* Body measurement goals */}
          <div>
            <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">Body Measurements</div>
            <div className="space-y-4">
              {DISPLAYED_METRICS.map((key) => {
                const cfg = METRIC_CONFIG[key];
                const g = mGoals[key];
                return (
                  <div key={key}>
                    <div className="flex items-center gap-1.5 mb-2">
                      <span className="text-sm leading-none">{cfg.icon}</span>
                      <span className="text-sm font-medium text-slate-300">{cfg.label}</span>
                      <span className="text-xs text-slate-500">({cfg.unit})</span>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block text-xs text-slate-500 mb-1">Target</label>
                        <input
                          type="number" min="0" step="0.1"
                          value={g.value}
                          onChange={(e) => setMGoals((prev) => ({ ...prev, [key]: { ...prev[key], value: e.target.value } }))}
                          className={inputCls}
                          placeholder={`e.g. ${cfg.unit === 'lbs' ? '180' : cfg.unit === '%' ? '15' : '32'}`}
                        />
                      </div>
                      <div>
                        <label className="block text-xs text-slate-500 mb-1">By date</label>
                        <input
                          type="date"
                          value={g.date}
                          onChange={(e) => setMGoals((prev) => ({ ...prev, [key]: { ...prev[key], date: e.target.value } }))}
                          className={inputCls}
                        />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        <div className="px-5 pb-5 pt-3 border-t border-dram-border shrink-0 flex gap-2">
          <button onClick={onClose} className="flex-1 text-sm text-slate-400 hover:text-slate-200 py-2 transition-colors">Cancel</button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex-1 bg-dram-accent hover:brightness-110 disabled:opacity-50 text-black text-sm font-semibold rounded-lg py-2 transition-colors"
          >
            {saving ? 'Saving…' : 'Save Goals'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Weekly bar charts ────────────────────────────────────────────────────────

const BAR_WIDTH = 16;
const BAR_GAP = 4;
const CHART_HEIGHT = 80;

function ChartTooltip({ active, payload, label, unit }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-dram-card border border-dram-border rounded-lg px-3 py-2 text-xs text-slate-200 shadow-lg">
      <p className="font-medium mb-0.5 text-slate-400">{label}</p>
      <p style={{ color: payload[0]?.fill }}>{Math.round(payload[0]?.value)}{unit}</p>
    </div>
  );
}

function WeeklyChart({ data, dataKey, label, icon, color, goal, unit }: {
  data: WeekBucket[];
  dataKey: keyof WeekBucket;
  label: string;
  icon: string;
  color: string;
  goal?: number | null;
  unit: string;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const chartWidth = Math.max(data.length * (BAR_WIDTH + BAR_GAP) + 20, 200);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollLeft = scrollRef.current.scrollWidth;
  }, [data.length]);

  return (
    <div className="flex-1 min-w-0 bg-dram-card rounded-xl border border-dram-border px-4 pt-3 pb-2 overflow-hidden">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-1.5">
          <span className="text-base leading-none">{icon}</span>
          <span className="text-xs font-semibold uppercase tracking-wider" style={{ color }}>{label}</span>
        </div>
        {goal != null && <span className="text-xs text-slate-400">Goal: {goal}{unit}/wk</span>}
      </div>
      <div ref={scrollRef} className="overflow-x-auto" style={{ scrollbarWidth: 'none' }}>
        <div style={{ width: chartWidth, height: CHART_HEIGHT }}>
          <BarChart
            width={chartWidth}
            height={CHART_HEIGHT}
            data={data}
            margin={{ top: 4, right: 4, left: 0, bottom: 0 }}
            barCategoryGap={BAR_GAP}
          >
            <XAxis
              dataKey="label"
              tick={{ fontSize: 12, fill: '#cbd5e1' }}
              axisLine={false}
              tickLine={false}
              interval={2}
            />
            <YAxis hide domain={[0, 'auto']} />
            <Tooltip content={<ChartTooltip unit={unit} />} cursor={{ fill: 'rgba(255,255,255,0.04)' }} />
            <Bar dataKey={dataKey as string} maxBarSize={BAR_WIDTH} radius={[3, 3, 0, 0]}>
              {data.map((entry, i) => {
                const val = (entry[dataKey] as number) ?? 0;
                const isCurrentWeek = i === data.length - 1;
                const pct = goal ? val / goal : 1;
                const barColor = isCurrentWeek ? color : pct >= 0.85 ? color : `${color}55`;
                return <Cell key={entry.weekStart} fill={barColor} />;
              })}
            </Bar>
          </BarChart>
        </div>
      </div>
    </div>
  );
}

// ─── Body measurements card ───────────────────────────────────────────────────

const METRIC_CONFIG: Record<string, { label: string; unit: string; icon: string; color: string; defaultGoalDir: 'down' | 'up' }> = {
  weight:   { label: 'Weight',   unit: 'lbs', icon: '⚖️', color: '#60a5fa', defaultGoalDir: 'down' },
  waist:    { label: 'Waist',    unit: 'in',  icon: '📏', color: '#fb923c', defaultGoalDir: 'down' },
  bicep:    { label: 'Bicep',    unit: 'in',  icon: '💪', color: '#818cf8', defaultGoalDir: 'up'   },
  chest:    { label: 'Chest',    unit: 'in',  icon: '🫁', color: '#34d399', defaultGoalDir: 'up'   },
  hips:     { label: 'Hips',     unit: 'in',  icon: '📐', color: '#f472b6', defaultGoalDir: 'down' },
  body_fat: { label: 'Body Fat', unit: '%',   icon: '🔥', color: '#facc15', defaultGoalDir: 'down' },
};

const DISPLAYED_METRICS = ['weight', 'waist', 'bicep'];

interface LogMeasurementFormState {
  metric: string;
  value: string;
  date: string;
}

function computeMeasurementProgress(
  measurements: BodyMeasurement[],
  key: string,
  goal: MeasurementGoal,
  dir: 'up' | 'down'
): { pct: number; onTrack: boolean | null; barColor: string; defaultColor: string } {
  const forMetric = measurements.filter((m) => m.metric === key).sort((a, b) => b.measuredAt.localeCompare(a.measuredAt));
  const latest = forMetric[0];
  const oldest = forMetric[forMetric.length - 1];
  const cfg = METRIC_CONFIG[key];

  if (!latest) return { pct: 0, onTrack: null, barColor: cfg.color, defaultColor: cfg.color };

  const start = oldest?.value ?? latest.value;
  const target = goal.targetValue;
  const range = dir === 'down' ? start - target : target - start;
  const progress = dir === 'down' ? start - latest.value : latest.value - start;
  const pct = range > 0 ? Math.min(Math.max(progress / range, 0), 1) : (
    dir === 'down' ? (latest.value <= target ? 1 : 0) : (latest.value >= target ? 1 : 0)
  );

  // On-track: compare actual progress to expected linear progress toward target date
  let onTrack: boolean | null = null;
  if (goal.targetDate && oldest && oldest.measuredAt !== latest.measuredAt) {
    const startDate = new Date(oldest.measuredAt + 'T12:00:00').getTime();
    const endDate = new Date(goal.targetDate + 'T12:00:00').getTime();
    const nowDate = Date.now();
    const totalDays = endDate - startDate;
    const elapsedDays = nowDate - startDate;
    if (totalDays > 0 && elapsedDays > 0) {
      const expectedPct = Math.min(elapsedDays / totalDays, 1);
      onTrack = pct >= expectedPct;
    }
  }

  const barColor = pct >= 1 ? '#34d399' : onTrack === false ? '#f87171' : cfg.color;
  return { pct, onTrack, barColor, defaultColor: cfg.color };
}

// ─── Dashboard: on-pace helpers ───────────────────────────────────────────────

type PaceStatus = 'green' | 'yellow' | 'red' | 'done';
interface PaceResult { status: PaceStatus; projectedDate: string | null; pct: number; }

const PACE_COLORS: Record<PaceStatus, string> = {
  green:  '#34d399',
  yellow: '#facc15',
  red:    '#f87171',
  done:   '#34d399',
};
const PACE_LABELS: Record<PaceStatus, string> = {
  green:  'On pace',
  yellow: 'Slightly behind',
  red:    'Behind',
  done:   '🎉 Done!',
};

function PaceBadge({ status }: { status: PaceStatus }) {
  const color = PACE_COLORS[status];
  return (
    <span
      className="text-[10px] font-semibold px-2 py-0.5 rounded-full"
      style={{ color, backgroundColor: `${color}22` }}
    >
      {PACE_LABELS[status]}
    </span>
  );
}

function computeGoalPace(
  measurements: BodyMeasurement[],
  key: string,
  goal: MeasurementGoal,
  dir: 'up' | 'down',
): PaceResult {
  const forMetric = measurements
    .filter((m) => m.metric === key)
    .sort((a, b) => b.measuredAt.localeCompare(a.measuredAt));

  const latest = forMetric[0];
  const oldest = forMetric[forMetric.length - 1];

  if (!latest) return { status: 'red', projectedDate: null, pct: 0 };

  // Convert weight from kg to lbs if needed
  const latestVal  = key === 'weight' && latest.unit === 'kg'  ? latest.value  * 2.20462 : latest.value;
  const oldestVal  = oldest  ? (key === 'weight' && oldest.unit === 'kg'  ? oldest.value  * 2.20462 : oldest.value) : latestVal;
  const target     = goal.targetValue; // always stored in display unit (lbs/in/%)

  const totalChange  = dir === 'down' ? oldestVal - target : target - oldestVal;
  const actualChange = dir === 'down' ? oldestVal - latestVal : latestVal - oldestVal;

  const pct = totalChange > 0
    ? Math.min(Math.max(actualChange / totalChange, 0), 1)
    : (dir === 'down' ? (latestVal <= target ? 1 : 0) : (latestVal >= target ? 1 : 0));

  if (pct >= 1) return { status: 'done', projectedDate: null, pct: 1 };

  let projectedDate: string | null = null;
  let status: PaceStatus = 'red';

  if (goal.targetDate && oldest && oldest.measuredAt !== latest.measuredAt && actualChange > 0) {
    const startMs   = new Date(oldest.measuredAt + 'T12:00:00').getTime();
    const endMs     = new Date(goal.targetDate   + 'T12:00:00').getTime();
    const nowMs     = Date.now();
    const totalMs   = endMs - startMs;
    const elapsedMs = nowMs - startMs;

    if (totalMs > 0 && elapsedMs > 0) {
      const neededRate = totalChange / totalMs;
      const actualRate = actualChange / elapsedMs;
      const ratio      = actualRate / neededRate;

      const remainingChange = totalChange - actualChange;
      const msTillDone      = remainingChange / actualRate;
      const projMs          = nowMs + msTillDone;
      projectedDate = new Date(projMs).toLocaleDateString('en-US', {
        month: 'short', day: 'numeric', year: 'numeric',
      });

      if (ratio >= 1)        status = 'green';
      else if (ratio >= 0.8) status = 'yellow';
      else                   status = 'red';
    }
  } else if (actualChange <= 0 && totalChange > 0) {
    status = 'red';
  }

  return { status, projectedDate, pct };
}

// ─── Dashboard: compact volume sparkline ─────────────────────────────────────

function VolumeSparkline({ data, goal }: { data: WeekBucket[]; goal: number | null }) {
  return (
    <div style={{ height: 52 }}>
      <ResponsiveContainer width="100%" height={52}>
        <BarChart data={data} margin={{ top: 2, right: 0, left: 0, bottom: 0 }} barCategoryGap={3}>
          <YAxis hide domain={[0, 'auto']} />
          <Bar dataKey="volumeLbs" maxBarSize={14} radius={[2, 2, 0, 0]}>
            {data.map((entry, i) => {
              const isCurrent = i === data.length - 1;
              const dim = goal ? entry.volumeLbs / goal < 0.85 : false;
              const fill = isCurrent ? '#a78bfa' : dim ? '#a78bfa44' : '#a78bfa88';
              return <Cell key={entry.weekStart} fill={fill} />;
            })}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function BodyMeasurementsCard({
  measurements,
  goals,
  onAdd,
  onUpdate,
  onDelete,
}: {
  measurements: BodyMeasurement[];
  goals: Record<string, MeasurementGoal>;
  onAdd: (data: { metric: string; value: number; unit: string; measuredAt: string }) => Promise<void>;
  onUpdate: (id: number, data: { value: number; measuredAt: string }) => Promise<void>;
  onDelete: (id: number) => Promise<void>;
}) {
  const today = localDateStr();
  const [logForm, setLogForm] = useState<LogMeasurementFormState | null>(null);
  const [saving, setSaving] = useState(false);
  const [expandedMetric, setExpandedMetric] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editForm, setEditForm] = useState<{ value: string; date: string }>({ value: '', date: '' });
  const [deletingId, setDeletingId] = useState<number | null>(null);

  const latestByMetric: Record<string, BodyMeasurement> = {};
  for (const m of measurements) {
    if (!latestByMetric[m.metric]) latestByMetric[m.metric] = m;
  }

  async function handleLogSave() {
    if (!logForm || !logForm.value) return;
    const cfg = METRIC_CONFIG[logForm.metric];
    if (!cfg) return;
    setSaving(true);
    try {
      await onAdd({ metric: logForm.metric, value: Number(logForm.value), unit: cfg.unit, measuredAt: logForm.date || today });
      setLogForm(null);
    } finally { setSaving(false); }
  }

  async function handleEditSave(id: number) {
    if (!editForm.value) return;
    setSaving(true);
    try {
      await onUpdate(id, { value: Number(editForm.value), measuredAt: editForm.date || today });
      setEditingId(null);
    } finally { setSaving(false); }
  }

  async function handleDelete(id: number) {
    if (!confirm('Delete this measurement?')) return;
    setDeletingId(id);
    try {
      await onDelete(id);
    } finally { setDeletingId(null); }
  }

  const inputCls = 'w-full bg-dram-bg border border-dram-border rounded px-2 py-1.5 text-sm text-slate-100 focus:outline-none focus:border-dram-accent';

  return (
    <div className="bg-dram-card rounded-2xl overflow-hidden">
      <div className="h-[3px] bg-dram-accent rounded-t-2xl" />
      <div className="px-6 py-5">
        <h2 className="text-sm font-semibold text-slate-300 uppercase tracking-wide mb-4">Body Measurements</h2>

        <div className="grid grid-cols-3 gap-4 mb-4">
          {DISPLAYED_METRICS.map((key) => {
            const cfg = METRIC_CONFIG[key];
            const latest = latestByMetric[key];
            const goal = goals[key];
            const { pct, onTrack, barColor } = goal
              ? computeMeasurementProgress(measurements, key, goal, cfg.defaultGoalDir)
              : { pct: 0, onTrack: null, barColor: cfg.color };

            return (
              <div key={key} className="flex flex-col gap-2">
                <div className="flex items-center gap-1.5">
                  <span className="text-base leading-none">{cfg.icon}</span>
                  <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: cfg.color }}>{cfg.label}</span>
                </div>

                {/* Current */}
                <div>
                  <div className="text-xs text-slate-500 mb-0.5 uppercase tracking-wide">Current</div>
                  <div className="flex items-baseline gap-1">
                    {latest ? (
                      <>
                        <span className="text-xl font-bold text-white">{latest.value}</span>
                        <span className="text-xs text-slate-400">{cfg.unit}</span>
                      </>
                    ) : (
                      <span className="text-xl font-bold text-slate-500">—</span>
                    )}
                  </div>
                  {latest && <div className="text-sm text-slate-600 mt-0.5">{formatDate(latest.measuredAt)}</div>}
                </div>

                {/* Progress bar */}
                <div className="h-1.5 rounded-full overflow-hidden" style={{ backgroundColor: 'rgba(255,255,255,0.08)' }}>
                  <div className="h-full rounded-full transition-all duration-500" style={{ width: `${pct * 100}%`, backgroundColor: barColor }} />
                </div>

                {/* Goal */}
                <div>
                  <div className="text-xs text-slate-500 mb-0.5 uppercase tracking-wide">Goal</div>
                  {goal ? (
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-sm font-medium text-slate-300">{goal.targetValue}{cfg.unit}</span>
                      {goal.targetDate && (
                        <span className="text-xs text-slate-500">by {formatDate(goal.targetDate)}</span>
                      )}
                      {onTrack !== null && (
                        <span className={`text-xs font-medium ${onTrack ? 'text-emerald-400' : 'text-red-400'}`}>
                          {onTrack ? '✓ on track' : '⚠ behind'}
                        </span>
                      )}
                    </div>
                  ) : (
                    <span className="text-xs text-slate-600">No goal set</span>
                  )}
                </div>

                {/* Log / history buttons */}
                <div className="flex gap-3">
                  <button
                    onClick={() => { setLogForm({ metric: key, value: '', date: today }); setExpandedMetric(null); }}
                    className="text-sm text-slate-400 hover:text-slate-200 transition-colors"
                  >
                    + Log
                  </button>
                  {measurements.filter((m) => m.metric === key).length > 0 && (
                    <button
                      onClick={() => setExpandedMetric(expandedMetric === key ? null : key)}
                      className="text-sm text-slate-500 hover:text-slate-300 transition-colors"
                    >
                      {expandedMetric === key ? 'Hide' : `History (${measurements.filter((m) => m.metric === key).length})`}
                    </button>
                  )}
                </div>

                {/* Inline history list */}
                {expandedMetric === key && (
                  <div className="mt-1 space-y-1">
                    {measurements
                      .filter((m) => m.metric === key)
                      .map((m) => editingId === m.id ? (
                        <div key={m.id} className="space-y-1.5 pt-1">
                          <div className="grid grid-cols-2 gap-2">
                            <input
                              type="number" min="0" step="0.1"
                              value={editForm.value}
                              onChange={(e) => setEditForm((f) => ({ ...f, value: e.target.value }))}
                              className={inputCls}
                              autoFocus
                            />
                            <input
                              type="date"
                              value={editForm.date}
                              onChange={(e) => setEditForm((f) => ({ ...f, date: e.target.value }))}
                              className={inputCls}
                            />
                          </div>
                          <div className="flex gap-2">
                            <button onClick={() => setEditingId(null)} className="flex-1 text-xs text-slate-400 hover:text-slate-200 py-1 transition-colors">Cancel</button>
                            <button
                              onClick={() => handleEditSave(m.id)}
                              disabled={saving || !editForm.value}
                              className="flex-1 bg-dram-accent hover:brightness-110 disabled:opacity-50 text-black text-xs font-semibold rounded py-1 transition-colors"
                            >
                              {saving ? '…' : 'Save'}
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div key={m.id} className="flex items-center justify-between gap-2 text-sm py-0.5 group">
                          <div className="flex items-baseline gap-1.5 min-w-0">
                            <span className="font-medium text-slate-200">{m.value}</span>
                            <span className="text-slate-500">{cfg.unit}</span>
                            <span className="text-slate-600">·</span>
                            <span className="text-slate-500 truncate">{formatDate(m.measuredAt)}</span>
                          </div>
                          <div className="flex gap-2 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button
                              onClick={() => { setEditingId(m.id); setEditForm({ value: String(m.value), date: m.measuredAt }); }}
                              className="text-slate-500 hover:text-slate-200 transition-colors"
                              title="Edit"
                            >✎</button>
                            <button
                              onClick={() => handleDelete(m.id)}
                              disabled={deletingId === m.id}
                              className="text-slate-500 hover:text-red-400 transition-colors disabled:opacity-50"
                              title="Delete"
                            >✕</button>
                          </div>
                        </div>
                      )
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Log form */}
        {logForm && (
          <div className="border-t border-dram-border pt-4 mt-2 space-y-2">
            <div className="text-sm font-medium text-slate-300">
              Log {METRIC_CONFIG[logForm.metric]?.label} ({METRIC_CONFIG[logForm.metric]?.unit})
            </div>
            <div className="grid grid-cols-2 gap-2">
              <input
                type="number" min="0" step="0.1"
                value={logForm.value}
                onChange={(e) => setLogForm({ ...logForm, value: e.target.value })}
                className={inputCls}
                placeholder="Value"
                autoFocus
              />
              <input
                type="date"
                value={logForm.date}
                onChange={(e) => setLogForm({ ...logForm, date: e.target.value })}
                className={inputCls}
              />
            </div>
            <div className="flex gap-2">
              <button onClick={() => setLogForm(null)} className="flex-1 text-sm text-slate-400 hover:text-slate-200 py-1.5 transition-colors">Cancel</button>
              <button
                onClick={handleLogSave}
                disabled={saving || !logForm.value}
                className="flex-1 bg-dram-accent hover:brightness-110 disabled:opacity-50 text-black text-sm font-semibold rounded-lg py-1.5 transition-colors"
              >
                {saving ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Personal bests card ───────────────────────────────────────────────────────

function PersonalBestsCard({ bests }: { bests: PersonalBests | null }) {
  const weightLbs = bests?.heaviestLift
    ? Math.round(bests.heaviestLift.weightKg * 2.20462 * 10) / 10
    : null;

  const volLbs = bests?.bestSessionVolume
    ? Math.round(bests.bestSessionVolume.volumeKg * 2.20462).toLocaleString()
    : null;

  const items = [
    {
      icon: '🏋️',
      color: '#34d399',
      label: 'Heaviest lift',
      value: weightLbs != null ? `${weightLbs}` : '—',
      unit: weightLbs != null ? 'lbs' : '',
      sub: bests?.heaviestLift?.exerciseName ?? null,
    },
    {
      icon: '📈',
      color: '#60a5fa',
      label: 'Best session volume',
      value: volLbs ?? '—',
      unit: volLbs != null ? 'lbs' : '',
      sub: bests?.bestSessionVolume
        ? formatDate(bests.bestSessionVolume.workoutDate)
        : null,
    },
  ];

  return (
    <div className="bg-dram-card rounded-2xl overflow-hidden">
      <div className="h-[3px] bg-dram-accent rounded-t-2xl" />
      <div className="px-6 py-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold text-slate-300 uppercase tracking-wide">Personal Bests</h2>
        </div>
        <div className="grid grid-cols-2 gap-3">
          {items.map(({ icon, color, label, value, unit, sub }) => (
            <div key={label} className="flex flex-col gap-1.5">
              <span className="text-2xl leading-none">{icon}</span>
              <div className="flex items-baseline gap-1">
                <span className="text-xl font-bold" style={{ color: value !== '—' ? 'white' : '#475569' }}>{value}</span>
                {unit && <span className="text-xs text-slate-400">{unit}</span>}
              </div>
              <span className="text-sm text-slate-300">{label}</span>
              {sub && <span className="text-sm text-slate-400 truncate">{sub}</span>}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Dashboard V2 ────────────────────────────────────────────────────────────

const CREATINE_FOOD_NAME = 'Creatine Monohydrate';
// Saturation model: ~28 days to full saturation after consistent daily dosing
const SATURATION_DAYS = 28;

// Palette for per-routine lines in heatmap
const ROUTINE_COLORS = ['#a78bfa', '#34d399', '#60a5fa', '#fb923c', '#f472b6', '#facc15', '#38bdf8'];

function SemiCircleGauge({ pct, color, size = 120 }: { pct: number; color: string; size?: number }) {
  const strokeW = 10;
  const r = (size - strokeW) / 2;
  const cx = size / 2;
  // Place arc center at the BOTTOM of the SVG so the semicircle opens upward.
  // SVG height = r + strokeW so the arc fits exactly.
  const cy = r + strokeW / 2; // = size/2 (since r = (size-strokeW)/2)
  // Both endpoints sit on the horizontal center line (cy):
  //   left  = (cx - r, cy)
  //   right = (cx + r, cy)
  // We want the arc to go through the TOP (lower Y in SVG).
  // sweep-flag=1 (clockwise in SVG screen coords) goes UP through the top.
  const left  = { x: cx - r, y: cy };
  const right = { x: cx + r, y: cy };
  // Background: full semicircle left→top→right, sweep=1
  const bgPath = `M ${left.x} ${left.y} A ${r} ${r} 0 0 1 ${right.x} ${right.y}`;

  const clampedPct = Math.min(Math.max(pct, 0), 1);

  // Foreground: partial arc from left endpoint, sweeping right by pct*180°.
  // Angle in SVG: 0° = right, going clockwise. The left endpoint is at 180°.
  // End angle = 180° - clampedPct*180° (in standard math coords, which maps to SVG sweep).
  // We parameterise points as: x = cx + r*cos(θ), y = cy - r*sin(θ)
  //   θ=180° → left endpoint ✓
  //   θ=90°  → top of arc (cx, cy-r) ✓ (lower Y = higher on screen)
  //   θ=0°   → right endpoint ✓
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const endDeg = 180 - clampedPct * 180;
  const ex = cx + r * Math.cos(toRad(endDeg));
  const ey = cy - r * Math.sin(toRad(endDeg));

  // large-arc-flag=1 when pct>0.5 (arc spans more than 180° would, but since max is 180° here,
  // we actually only need it when the arc passes through the midpoint top → use 0 always because
  // our arc is always ≤180°; EXCEPT at exactly pct=1 start=end so we split into two arcs).
  const fgPath = clampedPct <= 0
    ? null
    : clampedPct >= 1
      // Split into two 90° arcs to avoid degenerate start=end path
      ? `M ${left.x} ${left.y} A ${r} ${r} 0 0 1 ${cx} ${cy - r} A ${r} ${r} 0 0 1 ${right.x} ${right.y}`
      : `M ${left.x} ${left.y} A ${r} ${r} 0 0 1 ${ex} ${ey}`;

  const svgH = r + strokeW;
  return (
    <svg width={size} height={svgH} style={{ overflow: 'visible' }}>
      <path d={bgPath} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth={strokeW} strokeLinecap="round" />
      {fgPath && <path d={fgPath} fill="none" stroke={color} strokeWidth={strokeW} strokeLinecap="round" style={{ transition: 'stroke-dasharray 0.5s ease' }} />}
    </svg>
  );
}

function GoalGaugeCard({
  measurements, goals, metric, creatineSatPct,
}: {
  measurements: BodyMeasurement[];
  goals: Record<string, MeasurementGoal>;
  metric: string;
  creatineSatPct?: number | null;
}) {
  const cfg = METRIC_CONFIG[metric];
  const goal = goals[metric];
  const sorted = measurements.filter((m) => m.metric === metric).sort((a, b) => b.measuredAt.localeCompare(a.measuredAt));
  const latest = sorted[0];

  const displayVal = latest
    ? (metric === 'weight' && latest.unit === 'kg' ? (latest.value * 2.20462).toFixed(1) : String(latest.value))
    : null;

  const { status, projectedDate, pct } = goal
    ? computeGoalPace(measurements, metric, goal, cfg.defaultGoalDir)
    : { status: 'red' as PaceStatus, projectedDate: null, pct: 0 };

  const paceColor = PACE_COLORS[status];

  // Delta from current to goal (signed: negative = need to lose, positive = need to gain)
  const delta = goal && displayVal != null
    ? (goal.targetValue - Number(displayVal)).toFixed(1)
    : null;
  const deltaNum = delta != null ? Number(delta) : null;
  const deltaDisplay = deltaNum != null
    ? `${deltaNum > 0 ? '+' : ''}${delta} ${cfg.unit}`
    : null;

  return (
    <div className="flex flex-col items-center gap-1.5 py-4 px-3">
      {/* Label + pace badge above gauge */}
      <div className="flex items-center gap-1.5">
        <span className="text-xs font-semibold uppercase tracking-wide" style={{ color: cfg.color }}>{cfg.label}</span>
        <PaceBadge status={status} />
      </div>
      {/* Gauge */}
      <div className="relative flex items-end justify-center mt-2" style={{ width: 120, height: 68 }}>
        <SemiCircleGauge pct={pct} color={paceColor} size={120} />
        <div className="absolute bottom-0 inset-x-0 flex flex-col items-center pb-1">
          <span className="text-xl font-bold text-white leading-none">{displayVal ?? '—'}</span>
          <span className="text-[10px] text-dram-muted leading-none">{cfg.unit}</span>
        </div>
      </div>
      {/* Target + delta — aligned to semicircle endpoints */}
      {goal ? (
        <div className="flex justify-between mt-0.5" style={{ width: 120 }}>
          <span className="text-sm font-semibold text-dram-muted">{goal.targetValue} <span className="font-normal text-xs">{cfg.unit}</span></span>
          {deltaDisplay && deltaNum !== 0 && (
            <span className="text-sm font-semibold" style={{ color: paceColor }}>{deltaDisplay}</span>
          )}
        </div>
      ) : (
        <div className="text-sm text-dram-muted">No goal set</div>
      )}
      {/* Projected date — centered */}
      {projectedDate && (
        <div className="text-sm font-medium text-center" style={{ width: 120, color: paceColor }}>Proj: {projectedDate}</div>
      )}
      {/* Water weight callout during creatine loading phase */}
      {metric === 'weight' && creatineSatPct != null && creatineSatPct > 0 && creatineSatPct < 1 && (
        <div className="mt-2 px-2 py-1.5 rounded-lg text-center" style={{ backgroundColor: 'rgba(56,189,248,0.10)', border: '1px solid rgba(56,189,248,0.25)' }}>
          <div className="text-[10px] font-semibold" style={{ color: '#38bdf8' }}>💧 Water Weight Loading</div>
          <div className="text-[10px] text-slate-400 leading-snug mt-0.5">
            Creatine may add 1–3 lbs of water weight. Scale bump is expected — muscle gains are real.
          </div>
        </div>
      )}
    </div>
  );
}

/** Derives creatine saturation data from food log history. Returns null if no creatine found. */
function computeCreatineSaturation(foodLogHistory: FoodLogHistoryDay[]): {
  satPct: number;
  daysSinceStart: number;
  loggedDays: number;
  firstDate: string;
  daysToFull: number;
  phase: string;
  compliancePct: number;
} | null {
  // All days in history that had creatine logged
  const creatineDays = foodLogHistory
    .filter((day) => day.entries.some((e) => e.foodName.toLowerCase().includes('creatine')))
    .map((day) => day.date)
    .sort();

  if (creatineDays.length === 0) return null;

  const firstDate = creatineDays[0];
  const firstMs = new Date(firstDate + 'T12:00:00').getTime();
  // +1 to count both the start day and today (e.g. started 7 days ago = 8 days: day0…day7)
  const daysSinceStart = Math.max(1, Math.floor((Date.now() - firstMs) / (24 * 3600 * 1000)) + 1);
  const loggedDays = creatineDays.length;

  // Compliance = fraction of days since start that had creatine logged
  const compliancePct = Math.min(loggedDays / daysSinceStart, 1);

  // Saturation model: 28-day curve, weighted by compliance
  const timePct = Math.min(daysSinceStart / SATURATION_DAYS, 1);
  const satPct = timePct * compliancePct;

  // Days remaining to projected full saturation at current compliance rate
  const daysToFull = satPct >= 1
    ? 0
    : compliancePct > 0
      ? Math.ceil((SATURATION_DAYS - daysSinceStart / compliancePct) / compliancePct)
      : SATURATION_DAYS - daysSinceStart;

  // Phase label
  const phase = daysSinceStart <= 7
    ? 'Initial Uptake'
    : satPct >= 1
      ? 'Full Saturation'
      : daysSinceStart <= 21
        ? 'The Build'
        : 'Peak Performance';

  return { satPct, daysSinceStart, loggedDays, firstDate, daysToFull: Math.max(0, daysToFull), phase, compliancePct };
}

function CreatineWidget({ foodLogHistory }: { foodLogHistory: FoodLogHistoryDay[] }) {
  const data = computeCreatineSaturation(foodLogHistory);

  if (!data) {
    return (
      <div className="flex flex-col items-center gap-2 py-6 px-4 text-center">
        <div className="text-2xl">🧪</div>
        <div className="text-xs text-dram-muted">No creatine logged in the last 30 days</div>
      </div>
    );
  }

  const { satPct, daysSinceStart, loggedDays, firstDate, daysToFull, phase, compliancePct } = data;
  const satDisplay = Math.round(satPct * 100);
  const satColor = satPct >= 0.9 ? '#34d399' : satPct >= 0.5 ? '#facc15' : '#f87171';
  const complianceColor = compliancePct >= 0.9 ? '#34d399' : compliancePct >= 0.7 ? '#facc15' : '#f87171';

  const startFormatted = new Date(firstDate + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

  return (
    <div className="flex flex-col gap-4 px-5 py-4">
      {/* Gauge + center label */}
      <div className="flex flex-col items-center gap-1">
        <div className="relative flex items-end justify-center" style={{ width: 120, height: 68 }}>
          <SemiCircleGauge pct={satPct} color={satColor} size={120} />
          <div className="absolute bottom-0 inset-x-0 flex flex-col items-center pb-1">
            <span className="text-xl font-bold text-white leading-none">{satDisplay}%</span>
            <span className="text-xs text-dram-muted leading-none">saturated</span>
          </div>
        </div>
        {/* Phase badge */}
        <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full mt-1"
          style={{ color: satColor, backgroundColor: `${satColor}22` }}>
          {phase}
        </span>
      </div>

      {/* Milestone countdown */}
      {satPct < 1 && (
        <div className="text-center text-sm text-dram-muted">
          {daysToFull > 0
            ? <><span className="text-slate-300 font-semibold">{daysToFull}d</span> to peak performance</>
            : <span className="text-slate-300 font-semibold">Almost there!</span>
          }
        </div>
      )}
      {satPct >= 1 && (
        <div className="text-center text-sm font-semibold" style={{ color: '#34d399' }}>
          Peak performance achieved 🎯
        </div>
      )}

      {/* Stats row */}
      <div className="grid grid-cols-2 gap-2 text-center">
        <div className="rounded-lg py-2" style={{ backgroundColor: 'rgba(255,255,255,0.04)' }}>
          <div className="text-base font-bold text-white">{daysSinceStart}d</div>
          <div className="text-xs text-dram-muted">since {startFormatted}</div>
        </div>
        <div className="rounded-lg py-2" style={{ backgroundColor: 'rgba(255,255,255,0.04)' }}>
          <div className="text-base font-bold" style={{ color: complianceColor }}>{Math.round(compliancePct * 100)}%</div>
          <div className="text-xs text-dram-muted">{loggedDays} / {daysSinceStart} days</div>
        </div>
      </div>

      {/* Compliance label */}
      <div className="text-center text-xs text-dram-muted -mt-2">compliance</div>

      {/* Compliance bar */}
      <div>
        <div className="h-1.5 rounded-full overflow-hidden" style={{ backgroundColor: 'rgba(255,255,255,0.08)' }}>
          <div className="h-full rounded-full transition-all duration-700" style={{ width: `${compliancePct * 100}%`, backgroundColor: complianceColor }} />
        </div>
      </div>
    </div>
  );
}

function NutritionFuelWidget({
  foodLogHistory,
  waterHistory,
  workouts,
  caloriesGoal,
  proteinGoal,
}: {
  foodLogHistory: FoodLogHistoryDay[];
  waterHistory: WaterHistory | null;
  workouts: WorkoutSummary[];
  caloriesGoal: number | null;
  proteinGoal: number | null;
}) {
  const now = new Date();
  const days30 = Array.from({ length: 30 }, (_, i) => {
    const d = new Date(now);
    d.setDate(d.getDate() - (29 - i));
    return localDateStr(d);
  });

  const foodByDate = Object.fromEntries(foodLogHistory.map((d) => [d.date, d]));
  const waterByDate = Object.fromEntries((waterHistory?.days ?? []).map((d) => [d.date, d.totalOz]));
  const waterGoal = waterHistory?.goalOz ?? 64;
  const GLASS = 8;

  // Calories burned per day from workouts
  const burnedByDate: Record<string, number> = {};
  for (const w of workouts) {
    if (w.caloriesBurned) {
      burnedByDate[w.workoutDate] = (burnedByDate[w.workoutDate] ?? 0) + w.caloriesBurned;
    }
  }

  const chartData = days30.map((date) => {
    const food = foodByDate[date];
    const waterOz = waterByDate[date] ?? 0;
    const calories = food?.calories ?? 0;
    const burned = burnedByDate[date] ?? 0;
    const net = calories > 0 || burned > 0 ? calories - burned : 0;
    return {
      date,
      label: new Date(date + 'T12:00:00').toLocaleDateString('en-US', { month: 'numeric', day: 'numeric' }),
      calories,
      burned,
      net,
      protein: food?.protein ?? 0,
      water: Math.round(waterOz / GLASS * 10) / 10,
      waterGoalGlasses: waterGoal / GLASS,
    };
  });

  const hasBurnedData = Object.keys(burnedByDate).length > 0;

  // Sparse x-axis tick: show label every ~5 days
  const xTicks = chartData
    .filter((_, i) => i % 5 === 0 || i === chartData.length - 1)
    .map((d) => d.date);

  const chartH = 80;
  const margin = { top: 4, right: 4, left: 0, bottom: 0 };

  const xAxis = (
    <XAxis
      dataKey="date"
      ticks={xTicks}
      tickFormatter={(v) => {
        const d = new Date(v + 'T12:00:00');
        return d.toLocaleDateString('en-US', { month: 'numeric', day: 'numeric' });
      }}
      tick={{ fontSize: 11, fill: '#64748b' }}
      tickLine={false}
      axisLine={false}
      height={20}
    />
  );

  const tooltipStyle = {
    contentStyle: { backgroundColor: 'var(--color-dram-card, #1e2433)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 6, padding: '6px 10px', fontSize: 13 },
    itemStyle: { color: '#e2e8f0' },
    labelStyle: { color: '#64748b', marginBottom: 2, fontSize: 12 },
    cursor: { stroke: 'rgba(255,255,255,0.08)' },
  };

  const calDomain: [number, number] = [
    0,
    Math.max(
      ...chartData.map((d) => Math.max(d.calories, d.burned)),
      caloriesGoal ?? 0,
      1
    ) * 1.1,
  ];

  return (
    <div className="flex flex-col gap-4 pt-3">
      <div className="text-xs font-semibold text-dram-muted uppercase tracking-wide">Last 30 Days</div>

      {/* ── Calories ── */}
      <div>
        <div className="flex items-center gap-3 mb-1.5">
          <span className="text-sm text-slate-400">Calories</span>
          <span className="flex items-center gap-1.5 text-sm text-slate-400">
            <span className="inline-block w-4 h-0.5 rounded" style={{ backgroundColor: '#fb923c' }} /> in
          </span>
          {hasBurnedData && (
            <span className="flex items-center gap-1.5 text-sm text-slate-400">
              <span className="inline-block w-4 border-t border-dashed" style={{ borderColor: '#f87171' }} /> burned
            </span>
          )}
          {caloriesGoal && (
            <span className="flex items-center gap-1.5 text-sm text-slate-400">
              <span className="inline-block w-4 border-t border-dashed" style={{ borderColor: 'rgba(251,146,60,0.55)' }} /> goal
            </span>
          )}
        </div>
        <ResponsiveContainer width="100%" height={chartH + 18}>
          <ComposedChart data={chartData} margin={margin}>
            <YAxis hide domain={calDomain} />
            {xAxis}
            <Tooltip
              {...tooltipStyle}
              content={({ active, payload, label: lbl }) => {
                if (!active || !payload?.length) return null;
                const row = chartData.find((d) => d.date === lbl);
                return (
                  <div style={tooltipStyle.contentStyle}>
                    <div style={tooltipStyle.labelStyle}>{row?.label ?? lbl}</div>
                    {row && row.calories > 0 && <div style={{ color: '#fb923c' }}>{row.calories.toLocaleString()} kcal in</div>}
                    {row && row.burned > 0 && <div style={{ color: '#f87171' }}>{row.burned.toLocaleString()} kcal burned</div>}
                    {row && (row.calories > 0 || row.burned > 0) && (
                      <div style={{ color: '#facc15' }}>net: {(row.calories - row.burned).toLocaleString()}</div>
                    )}
                  </div>
                );
              }}
            />
            {caloriesGoal && (
              <ReferenceLine y={caloriesGoal} stroke="rgba(251,146,60,0.55)" strokeDasharray="4 3" strokeWidth={1.5} />
            )}
            <Area
              type="monotone"
              dataKey="calories"
              stroke="#fb923c"
              strokeWidth={1.5}
              fill="#fb923c"
              fillOpacity={0.12}
              dot={false}
              activeDot={{ r: 3, fill: '#fb923c' }}
            />
            {hasBurnedData && (
              <Line
                type="monotone"
                dataKey="burned"
                stroke="#f87171"
                strokeWidth={1.5}
                strokeDasharray="4 3"
                dot={false}
                activeDot={{ r: 3, fill: '#f87171' }}
              />
            )}
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      {/* ── Protein ── */}
      <div>
        <div className="flex items-center gap-3 mb-1.5">
          <span className="text-sm text-slate-400">Protein</span>
          {proteinGoal && (
            <span className="flex items-center gap-1 text-xs text-slate-500">
              <span className="inline-block w-3 border-t border-dashed" style={{ borderColor: 'rgba(96,165,250,0.35)' }} /> goal {proteinGoal}g
            </span>
          )}
        </div>
        <ResponsiveContainer width="100%" height={chartH + 18}>
          <LineChart data={chartData} margin={margin}>
            <YAxis hide domain={[0, Math.max(...chartData.map((d) => d.protein), proteinGoal ?? 0, 1) * 1.1]} />
            {xAxis}
            <Tooltip
              {...tooltipStyle}
              content={({ active, payload, label: lbl }) => {
                if (!active || !payload?.length) return null;
                const row = chartData.find((d) => d.date === lbl);
                return (
                  <div style={tooltipStyle.contentStyle}>
                    <div style={tooltipStyle.labelStyle}>{row?.label ?? lbl}</div>
                    {row && <div style={{ color: '#60a5fa' }}>{row.protein}g protein</div>}
                  </div>
                );
              }}
            />
            {proteinGoal && (
              <ReferenceLine y={proteinGoal} stroke="rgba(96,165,250,0.55)" strokeDasharray="4 3" strokeWidth={1.5} />
            )}
            <Line
              type="monotone"
              dataKey="protein"
              stroke="#60a5fa"
              strokeWidth={1.5}
              dot={false}
              activeDot={{ r: 3, fill: '#60a5fa' }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* ── Water ── */}
      <div>
        <div className="flex items-center gap-3 mb-1.5">
          <span className="text-sm text-slate-400">Water</span>
          <span className="flex items-center gap-1 text-xs text-slate-500">
            <span className="inline-block w-3 border-t border-dashed" style={{ borderColor: 'rgba(56,189,248,0.35)' }} /> goal {Math.round(waterGoal / GLASS)} glasses
          </span>
        </div>
        <ResponsiveContainer width="100%" height={chartH + 18}>
          <LineChart data={chartData} margin={margin}>
            <YAxis hide domain={[0, Math.max(Math.ceil(waterGoal / GLASS) + 2, ...chartData.map((d) => d.water))]} />
            {xAxis}
            <Tooltip
              {...tooltipStyle}
              content={({ active, payload, label: lbl }) => {
                if (!active || !payload?.length) return null;
                const row = chartData.find((d) => d.date === lbl);
                return (
                  <div style={tooltipStyle.contentStyle}>
                    <div style={tooltipStyle.labelStyle}>{row?.label ?? lbl}</div>
                    {row && <div style={{ color: '#38bdf8' }}>{row.water} glasses ({Math.round(row.water * GLASS)} oz)</div>}
                  </div>
                );
              }}
            />
            <ReferenceLine y={waterGoal / GLASS} stroke="rgba(56,189,248,0.55)" strokeDasharray="4 3" strokeWidth={1.5} />
            <Line
              type="monotone"
              dataKey="water"
              stroke="#38bdf8"
              strokeWidth={1.5}
              dot={false}
              activeDot={{ r: 3, fill: '#38bdf8' }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

// Weekly total volume line chart (13 weeks)
function WeeklyVolumeChart({ data }: { data: { label: string; volume: number | null }[] }) {
  const hasData = data.some((d) => d.volume !== null);
  if (!hasData) return null;
  return (
    <div className="mt-4">
      <div className="text-sm text-dram-muted mb-1">Total volume / week (lbs)</div>
      <ResponsiveContainer width="100%" height={72}>
        <LineChart data={data} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
          <XAxis dataKey="label" tick={{ fontSize: 9, fill: 'var(--color-dram-muted, #94a3b8)' }} tickLine={false} axisLine={false} />
          <YAxis hide />
          <Tooltip
            contentStyle={{ background: 'var(--color-dram-card, #1e2433)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 6, fontSize: 11 }}
            labelStyle={{ color: 'var(--color-dram-muted, #94a3b8)' }}
            itemStyle={{ color: '#a78bfa' }}
            formatter={(v: number) => [`${v.toLocaleString()} lbs`, 'Volume']}
          />
          <Line
            type="monotone"
            dataKey="volume"
            stroke="#a78bfa"
            strokeWidth={2}
            dot={{ r: 2, fill: '#a78bfa', strokeWidth: 0 }}
            activeDot={{ r: 4 }}
            connectNulls={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

// Routine volume heatmap — 13 weeks × routines grid
function RoutineHeatmap({ workouts, routinesList }: { workouts: WorkoutSummary[]; routinesList: RoutineSummary[] }) {
  const scrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollLeft = scrollRef.current.scrollWidth;
  }, [workouts.length]);
  // Build 13-week buckets
  const now = new Date();
  const weeks = Array.from({ length: 13 }, (_, i) => {
    const d = new Date(now);
    d.setDate(d.getDate() - (12 - i) * 7);
    const ws = getWeekStart(localDateStr(d));
    const weekDate = new Date(ws + 'T12:00:00');
    return {
      weekStart: ws,
      label: weekDate.toLocaleDateString('en-US', { month: 'numeric', day: 'numeric' }),
    };
  });

  // Get routines that have volume (any workout using that routine with totalVolumeKg > 0)
  const routineVolumes: Record<number, Record<string, number>> = {}; // routineId → weekStart → volumeLbs
  for (const w of workouts) {
    if (!w.routineId || w.totalVolumeKg <= 0) continue;
    const ws = getWeekStart(w.workoutDate);
    if (!routineVolumes[w.routineId]) routineVolumes[w.routineId] = {};
    routineVolumes[w.routineId][ws] = (routineVolumes[w.routineId][ws] ?? 0) + w.totalVolumeKg * 2.20462;
  }

  // Only keep routines that appear in our 13-week window and have volume
  const relevantRoutineIds = Object.keys(routineVolumes)
    .map(Number)
    .filter((rid) => weeks.some((wk) => (routineVolumes[rid][wk.weekStart] ?? 0) > 0));

  // Weekly totals for the line chart (all routines combined, including non-routine workouts)
  const weeklyTotals: Record<string, number> = {};
  for (const w of workouts) {
    if (w.totalVolumeKg <= 0) continue;
    const ws = getWeekStart(w.workoutDate);
    weeklyTotals[ws] = (weeklyTotals[ws] ?? 0) + w.totalVolumeKg * 2.20462;
  }
  const lineData = weeks.map((wk) => ({
    label: wk.label,
    volume: weeklyTotals[wk.weekStart] ? Math.round(weeklyTotals[wk.weekStart]) : null,
  }));

  if (relevantRoutineIds.length === 0) {
    return (
      <div className="flex flex-col gap-3">
        <div className="text-xs text-dram-muted py-4 text-center">No routine volume data in the last 13 weeks</div>
        <WeeklyVolumeChart data={lineData} />
      </div>
    );
  }

  // Global max across all routines — so cells scale relative to each other
  const globalMax = Math.max(
    ...relevantRoutineIds.flatMap((rid) => Object.values(routineVolumes[rid]))
  );

  const routineNameById = Object.fromEntries(routinesList.map((r) => [r.id, r.name]));

  // Sticky-column approach: wrap in a relative container, scroll only the week columns,
  // keep routine name column pinned to the left at all times.
  return (
    <div className="flex flex-col gap-2">
      <div ref={scrollRef} className="overflow-x-auto" style={{ scrollbarWidth: 'none' }}>
        <table className="text-xs border-collapse" style={{ tableLayout: 'auto' }}>
          <thead>
            <tr>
              {/* Sticky routine label header */}
              <th
                className="text-left text-dram-muted font-normal pb-1 pr-3 whitespace-nowrap"
                style={{ position: 'sticky', left: 0, zIndex: 2, backgroundColor: 'var(--color-dram-card, #1e2433)' }}
              >
                Routine
              </th>
              {weeks.map((wk) => (
                <th key={wk.weekStart} className="text-dram-muted font-normal pb-1 px-0.5 text-center" style={{ minWidth: 28 }}>
                  {wk.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {relevantRoutineIds.map((rid) => {
              return (
                <tr key={rid}>
                  {/* Sticky routine name cell */}
                  <td
                    className="text-slate-300 pr-3 py-0.5 whitespace-nowrap"
                    style={{ position: 'sticky', left: 0, zIndex: 1, backgroundColor: 'var(--color-dram-card, #1e2433)', maxWidth: 120 }}
                  >
                    <span className="block truncate max-w-[110px]">{routineNameById[rid] ?? `Routine ${rid}`}</span>
                  </td>
                  {weeks.map((wk) => {
                    const vol = routineVolumes[rid][wk.weekStart] ?? 0;
                    const intensity = globalMax > 0 ? vol / globalMax : 0;
                    // Higher volume = dark purple; low volume = light/muted purple
                    const r = Math.round(167 - intensity * (167 - 80));
                    const g = Math.round(139 - intensity * (139 - 60));
                    const b = Math.round(250 - intensity * (250 - 160));
                    const bgColor = vol > 0
                      ? `rgb(${r},${g},${b})`
                      : 'rgba(255,255,255,0.04)';
                    return (
                      <td key={wk.weekStart} className="px-0.5 py-0.5">
                        <div
                          title={vol > 0 ? `${Math.round(vol).toLocaleString()} lbs` : 'No workout'}
                          className="rounded-sm mx-auto cursor-default"
                          style={{ width: 24, height: 20, backgroundColor: bgColor }}
                        />
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {/* Legend */}
      <div className="flex items-center gap-2 text-[10px] text-dram-muted">
        <span>Lower</span>
        <div className="flex gap-0.5">
          {[0.1, 0.3, 0.55, 0.75, 1.0].map((t) => {
            const r = Math.round(167 - t * (167 - 80));
            const g = Math.round(139 - t * (139 - 60));
            const b = Math.round(250 - t * (250 - 160));
            return <div key={t} className="w-3 h-3 rounded-sm" style={{ backgroundColor: `rgb(${r},${g},${b})` }} />;
          })}
        </div>
        <span>Higher volume</span>
      </div>
      <WeeklyVolumeChart data={lineData} />
    </div>
  );
}

// Last 10 workouts log with delta vs prior same-routine session
function WorkoutLog({ workouts, routinesList }: { workouts: WorkoutSummary[]; routinesList: RoutineSummary[] }) {
  const routineNameById = Object.fromEntries(routinesList.map((r) => [r.id, r.name]));
  const completed = [...workouts].sort((a, b) => b.workoutDate.localeCompare(a.workoutDate));
  const last10 = completed.slice(0, 10);

  return (
    <div className="space-y-1">
      {last10.length === 0 && <div className="text-xs text-dram-muted py-2">No workouts yet.</div>}
      {last10.map((w) => {
        const volLbs = Math.round(w.totalVolumeKg * 2.20462);
        const routineName = w.routineId ? (routineNameById[w.routineId] ?? `Routine ${w.routineId}`) : (w.name ?? 'Free workout');

        // Find prior session of same routine (or same name if no routine)
        let prior: WorkoutSummary | undefined;
        if (w.routineId) {
          prior = completed.find((x) => x.id !== w.id && x.routineId === w.routineId && x.workoutDate < w.workoutDate);
        }

        const priorVolLbs = prior ? Math.round(prior.totalVolumeKg * 2.20462) : null;
        const delta = priorVolLbs != null && volLbs > 0 ? volLbs - priorVolLbs : null;
        const deltaPct = delta != null && priorVolLbs && priorVolLbs > 0 ? (delta / priorVolLbs * 100) : null;

        // For duration-only workouts, sum exercise set durations for precise MM:SS
        const totalDurSecs = volLbs === 0
          ? w.exercises.reduce((sum, ex) => sum + (ex.totalDurationSeconds ?? 0), 0)
          : 0;
        const durationDisplay = volLbs > 0
          ? `${volLbs.toLocaleString()} lbs`
          : totalDurSecs > 0
            ? `${Math.floor(totalDurSecs / 60)}:${String(totalDurSecs % 60).padStart(2, '0')}`
            : w.durationMinutes
              ? `${w.durationMinutes} min`
              : '—';

        return (
          <div key={w.id} className="flex items-center gap-2 py-2 border-b border-dram-border/60 last:border-0">
            <div className="flex-1 min-w-0">
              <div className="text-sm text-slate-200 font-medium truncate">{routineName}</div>
              <div className="text-xs text-dram-muted">{new Date(w.workoutDate + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</div>
            </div>
            <div className="text-right shrink-0">
              <div className="text-sm text-slate-200">{durationDisplay}</div>
              {delta !== null && deltaPct !== null ? (
                <div className="flex items-center justify-end gap-0.5 text-xs font-semibold" style={{ color: delta >= 0 ? '#34d399' : '#f87171' }}>
                  <span>{delta >= 0 ? '▲' : '▼'}</span>
                  <span>{Math.abs(Math.round(deltaPct))}%</span>
                </div>
              ) : prior === undefined && w.routineId ? (
                <div className="text-xs text-dram-muted">first run</div>
              ) : null}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// Personal bests column — 1 stat per row
function PersonalBestsColumn({
  bests,
  workouts,
  routinesList,
  foodLogHistory,
  waterHistory,
}: {
  bests: PersonalBests | null;
  workouts: WorkoutSummary[];
  routinesList: RoutineSummary[];
  foodLogHistory: FoodLogHistoryDay[];
  waterHistory: WaterHistory | null;
}) {
  const GLASS = 8;

  // Highest protein day from food log history
  const highProteinDay = foodLogHistory.reduce<{ protein: number; date: string } | null>((best, day) => {
    if (!best || day.protein > best.protein) return { protein: day.protein, date: day.date };
    return best;
  }, null);

  // Highest water day from water history
  const highWaterDay = (waterHistory?.days ?? []).reduce<{ oz: number; date: string } | null>((best, day) => {
    if (!best || day.totalOz > best.oz) return { oz: day.totalOz, date: day.date };
    return best;
  }, null);

  // Per-routine best session volume and longest session
  const routineNameById = Object.fromEntries(routinesList.map((r) => [r.id, r.name]));
  const routineVolBests: Record<number, { volumeLbs: number; date: string }> = {};
  for (const w of workouts) {
    if (!w.routineId || w.totalVolumeKg <= 0) continue;
    const volLbs = Math.round(w.totalVolumeKg * 2.20462);
    const cur = routineVolBests[w.routineId];
    if (!cur || volLbs > cur.volumeLbs) {
      routineVolBests[w.routineId] = { volumeLbs: volLbs, date: w.workoutDate };
    }
  }
  const routineVolItems = Object.entries(routineVolBests)
    .map(([rid, v]) => ({ routineId: Number(rid), name: routineNameById[Number(rid)] ?? `Routine ${rid}`, ...v }))
    .sort((a, b) => b.volumeLbs - a.volumeLbs);

  const items: { icon: string; label: string; color: string; value: string | null; sub: string | null; date: string | null }[] = [
    {
      icon: '🏋️',
      label: 'Heaviest Lift',
      color: '#34d399',
      value: bests?.heaviestLift ? `${Math.round(bests.heaviestLift.weightKg * 2.20462 * 10) / 10} lbs` : null,
      sub: bests?.heaviestLift
        ? `${bests.heaviestLift.exerciseName}${bests.heaviestLift.reps != null ? ` · ${bests.heaviestLift.reps} reps` : ''}`
        : null,
      date: bests?.heaviestLift?.workoutDate ?? null,
    },
    ...(bests?.bestStairPace ? [{
      icon: '🪜',
      label: 'Best Stair Pace',
      color: '#fb923c',
      value: `${bests.bestStairPace.secsPerRep.toFixed(1)}s/step`,
      sub: `${bests.bestStairPace.reps} steps · ${Math.floor(bests.bestStairPace.durationSeconds / 60)}m${bests.bestStairPace.durationSeconds % 60}s`,
      date: bests.bestStairPace.workoutDate,
    }] : []),
    ...(highProteinDay ? [{
      icon: '🥩',
      label: 'Highest Protein Day',
      color: '#60a5fa',
      value: `${highProteinDay.protein}g`,
      sub: null,
      date: highProteinDay.date,
    }] : []),
    ...(highWaterDay ? [{
      icon: '💧',
      label: 'Most Water in a Day',
      color: '#38bdf8',
      value: `${Math.round(highWaterDay.oz / GLASS * 10) / 10} glasses`,
      sub: `${highWaterDay.oz} oz`,
      date: highWaterDay.date,
    }] : []),
    ...routineVolItems.map((r) => ({
      icon: '🔁',
      label: `Best Volume: ${r.name}`,
      color: '#a78bfa',
      value: `${r.volumeLbs.toLocaleString()} lbs`,
      sub: null,
      date: r.date,
    })),
  ];

  return (
    <div className="space-y-0">
      {items.map(({ icon, label, color, value, sub, date }) => (
        <div key={label} className="flex items-start gap-3 py-3 border-b border-dram-border last:border-0">
          <span className="text-xl leading-none mt-0.5">{icon}</span>
          <div className="flex-1 min-w-0">
            <div className="text-xs text-dram-muted uppercase tracking-wide mb-0.5">{label}</div>
            <div className="text-lg font-bold" style={{ color: value ? 'white' : '#475569' }}>{value ?? '—'}</div>
            {sub && <div className="text-xs text-slate-400 truncate mt-0.5">{sub}</div>}
            {date && <div className="text-xs text-dram-muted mt-0.5">{new Date(date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</div>}
          </div>
        </div>
      ))}
    </div>
  );
}

function DashboardV2({
  workouts, measurements, measurementGoals, personalBests,
  waterHistory, foodLogHistory, routinesList, loading,
  caloriesGoal, proteinGoal,
}: {
  workouts: WorkoutSummary[];
  measurements: BodyMeasurement[];
  measurementGoals: Record<string, MeasurementGoal>;
  personalBests: PersonalBests | null;
  waterHistory: WaterHistory | null;
  foodLogHistory: FoodLogHistoryDay[];
  routinesList: RoutineSummary[];
  loading: boolean;
  caloriesGoal: number | null;
  proteinGoal: number | null;
}) {
  if (loading) return <div className="flex-1 flex items-center justify-center text-slate-400 text-sm">Loading…</div>;

  const cardCls = 'bg-dram-card rounded-2xl border border-dram-border overflow-hidden';
  const cardHeaderCls = 'text-sm font-semibold text-slate-300 uppercase tracking-wider px-5 pt-4 pb-2';

  // Creatine data needed by both CreatineWidget and the weight GoalGaugeCard callout
  const creatineData = computeCreatineSaturation(foodLogHistory);
  const creatineSatPct = creatineData?.satPct ?? null;

  return (
    <div className="flex-1 overflow-y-auto p-6">
      {/* 3-column grid: col1=50%, col2=25%, col3=25% */}
      <div className="grid gap-4" style={{ gridTemplateColumns: '2fr 1fr 1fr', gridTemplateRows: 'auto auto' }}>

        {/* ── Col 1, Row 1: Body Goal Gauges ── */}
        <div className={cardCls}>
          <div className="h-[3px] bg-dram-accent rounded-t-2xl" />
          <div className={cardHeaderCls}>North Star Goals</div>
          <div className="grid grid-cols-3 divide-x divide-dram-border border-t border-dram-border">
            {DISPLAYED_METRICS.map((key) => (
              <GoalGaugeCard
                key={key}
                measurements={measurements}
                goals={measurementGoals}
                metric={key}
                creatineSatPct={key === 'weight' ? creatineSatPct : null}
              />
            ))}
          </div>
        </div>

        {/* ── Col 2, Row 1: Routine Heatmap ── */}
        <div className={`${cardCls} col-start-2`}>
          <div className="h-[3px] rounded-t-2xl" style={{ backgroundColor: '#a78bfa' }} />
          <div className={cardHeaderCls}>Volume Heatmap</div>
          <div className="px-4 pb-4">
            <RoutineHeatmap workouts={workouts} routinesList={routinesList} />
          </div>
        </div>

        {/* ── Col 3, Row 1: Creatine Saturation ── */}
        <div className={`${cardCls} col-start-3`}>
          <div className="h-[3px] rounded-t-2xl" style={{ backgroundColor: '#a78bfa' }} />
          <div className={cardHeaderCls}>Creatine</div>
          <CreatineWidget foodLogHistory={foodLogHistory} />
        </div>

        {/* ── Col 1, Row 2: Nutrition & Fuel ── */}
        <div className={cardCls}>
          <div className="h-[3px] rounded-t-2xl" style={{ backgroundColor: '#fb923c' }} />
          <div className={cardHeaderCls}>Nutrition &amp; Fuel</div>
          <div className="px-5 pb-4">
            <NutritionFuelWidget foodLogHistory={foodLogHistory} waterHistory={waterHistory} workouts={workouts} caloriesGoal={caloriesGoal} proteinGoal={proteinGoal} />
          </div>
        </div>

        {/* ── Col 2, Row 2: Last 10 Workouts ── */}
        <div className={`${cardCls} col-start-2`}>
          <div className="h-[3px] rounded-t-2xl" style={{ backgroundColor: '#60a5fa' }} />
          <div className={cardHeaderCls}>Recent Workouts</div>
          <div className="px-4 pb-4">
            <WorkoutLog workouts={workouts} routinesList={routinesList} />
          </div>
        </div>

        {/* ── Col 3, Row 2: Personal Bests ── */}
        <div className={`${cardCls} col-start-3`}>
          <div className="h-[3px] rounded-t-2xl" style={{ backgroundColor: '#34d399' }} />
          <div className={cardHeaderCls}>Personal Bests</div>
          <div className="px-5 pb-4">
            <PersonalBestsColumn
              bests={personalBests}
              workouts={workouts}
              routinesList={routinesList}
              foodLogHistory={foodLogHistory}
              waterHistory={waterHistory}
            />
          </div>
        </div>

      </div>
    </div>
  );
}

// ─── Routines tab ────────────────────────────────────────────────────────────

const EXERCISE_TYPES_TAB = ['weight', 'bodyweight', 'cardio', 'duration'] as const;

const TRACKED_FIELD_OPTIONS_TAB = [
  { key: 'reps',     label: 'Reps' },
  { key: 'weight',   label: 'Weight (lbs)' },
  { key: 'duration', label: 'Duration (min:sec)' },
  { key: 'distance', label: 'Distance' },
] as const;

function defaultTrackedFieldsTab(exerciseType: string): string[] {
  switch (exerciseType) {
    case 'cardio':     return ['duration', 'distance'];
    case 'duration':   return ['duration'];
    case 'bodyweight': return ['reps'];
    default:           return ['reps', 'weight'];
  }
}

const CATEGORY_EMOJI_TAB: Record<string, string> = {
  chest: '🫁', back: '🦾', shoulders: '💪', arms: '💪',
  legs: '🦵', glutes: '🍑', core: '⚡', cardio: '🏃',
  olympic: '🥇', plyometrics: '🦘', stretching: '🧘',
};

function RoutineCardInTab({
  routine,
  onImageUpdated,
}: {
  routine: RoutineSummary;
  onImageUpdated: (id: number, url: string) => void;
}) {
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [starting, setStarting] = useState(false);

  function handleImageClick(e: React.MouseEvent) {
    e.stopPropagation();
    fileInputRef.current?.click();
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const { uploadUrl, key } = await routinesApi.getPhotoUploadUrl(routine.id, file.type);
      await fetch(uploadUrl, { method: 'PUT', body: file, headers: { 'Content-Type': file.type } });
      await routinesApi.update(routine.id, { coverImageKey: key });
      onImageUpdated(routine.id, URL.createObjectURL(file));
    } catch { /* silent */ } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  async function handleStart(e: React.MouseEvent) {
    e.stopPropagation();
    setStarting(true);
    try {
      const workout = await routinesApi.start(routine.id);
      navigate(`/workouts/${workout.id}`);
    } catch { setStarting(false); }
  }

  return (
    <div
      onClick={() => navigate(`/workouts/routines/${routine.id}`)}
      className="bg-dram-card rounded-xl overflow-hidden border border-dram-border hover:border-dram-accent/50 transition cursor-pointer group"
    >
      {/* Image */}
      <div className="aspect-square bg-dram-bg relative overflow-hidden">
        {routine.coverImageUrl ? (
          <img src={routine.coverImageUrl} alt={routine.name} className="w-full h-full object-cover group-hover:opacity-80 transition" />
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center gap-1 group-hover:bg-dram-border/20 transition">
            <span className="text-4xl font-bold text-dram-accent leading-none">{routine.exerciseCount}</span>
            <span className="text-xs text-gray-500 uppercase tracking-wide">exercise{routine.exerciseCount !== 1 ? 's' : ''}</span>
          </div>
        )}
        <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleFileChange} onClick={(e) => e.stopPropagation()} />
      </div>

      {/* Info */}
      <div className="p-3">
        <p className="font-semibold text-white text-sm leading-snug line-clamp-2">{routine.name}</p>
        <div className="flex items-center gap-2 mt-0.5">
          <p className="text-slate-400 text-sm">{routine.lastUsedDate ? `Last used ${new Date(routine.lastUsedDate + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}` : 'Never used'}</p>
          {routine.lastVolumeLbs != null && <p className="text-slate-400 text-sm">· {routine.lastVolumeLbs.toLocaleString()} lbs</p>}
          {routine.lastCaloriesBurned != null && <p className="text-slate-400 text-sm">· {routine.lastCaloriesBurned.toLocaleString()} kcal</p>}
        </div>
        <div className="flex items-center gap-2 mt-1.5">
          <span className="text-dram-accent text-sm font-medium">{routine.exerciseCount} exercise{routine.exerciseCount !== 1 ? 's' : ''}</span>
          {routine.notes && <span className="text-slate-400 text-sm line-clamp-1 flex-1">{routine.notes}</span>}
        </div>
        <div className="flex gap-2 mt-2">
          <button
            onClick={handleStart}
            disabled={starting}
            className="flex-1 bg-dram-accent hover:brightness-110 disabled:opacity-50 text-black text-xs font-semibold rounded-lg py-1.5 transition-colors"
          >
            {starting ? 'Starting…' : 'Start'}
          </button>
          <button
            onClick={handleImageClick}
            disabled={uploading}
            className="px-3 bg-dram-bg hover:bg-dram-border/40 disabled:opacity-50 text-slate-400 hover:text-white text-xs font-medium rounded-lg py-1.5 border border-dram-border transition-colors"
          >
            {uploading ? <Spinner size={3} /> : 'Edit'}
          </button>
        </div>
      </div>
    </div>
  );
}

export interface RoutinesTabHandle { openCreate: () => void; }

const RoutinesTab = forwardRef<RoutinesTabHandle>(function RoutinesTab(_, ref) {
  const navigate = useNavigate();
  const [routines, setRoutines] = useState<RoutineSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState('');
  const [newNotes, setNewNotes] = useState('');
  const [creating, setCreating] = useState(false);

  useImperativeHandle(ref, () => ({ openCreate: () => setShowCreate(true) }));

  useEffect(() => {
    routinesApi.getAll().then(setRoutines).catch(() => {}).finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!showCreate) return;
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') setShowCreate(false); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [showCreate]);

  function handleImageUpdated(id: number, previewUrl: string) {
    setRoutines((prev) => prev.map((r) => r.id === id ? { ...r, coverImageUrl: previewUrl } : r));
  }

  async function handleCreate() {
    if (!newName.trim()) return;
    setCreating(true);
    try {
      const routine = await routinesApi.create({ name: newName.trim(), notes: newNotes.trim() || undefined });
      navigate(`/workouts/routines/${routine.id}`);
    } catch { setCreating(false); }
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="flex-1 overflow-y-auto px-6 py-4">
        {loading ? (
          <div className="flex justify-center mt-16"><Spinner size={10} /></div>
        ) : routines.length === 0 ? (
          <div className="flex flex-col items-center mt-20 text-gray-600">
            <span className="text-5xl mb-3">📋</span>
            <p className="text-lg">No routines yet.</p>
            <button onClick={() => setShowCreate(true)} className="text-dram-accent hover:underline text-sm mt-1">Create your first routine</button>
          </div>
        ) : (
          <div className="grid gap-4 grid-cols-2 md:grid-cols-3 lg:grid-cols-5">
            {routines.map((r) => (
              <RoutineCardInTab key={r.id} routine={r} onImageUpdated={handleImageUpdated} />
            ))}
          </div>
        )}
      </div>

      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60" onClick={() => setShowCreate(false)}>
          <div className="bg-dram-card border border-dram-border rounded-t-2xl sm:rounded-2xl w-full sm:max-w-md mx-4 p-5 space-y-3" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold text-dram-accent">New Routine</h2>
              <button onClick={() => setShowCreate(false)} className="text-dram-accent/50 hover:text-dram-accent text-xl leading-none">×</button>
            </div>
            <input
              autoFocus type="text" placeholder="Routine name" value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleCreate(); }}
              className="w-full bg-dram-bg border border-dram-border rounded-lg px-3 py-2 text-sm text-dram-accent placeholder:text-dram-accent/30 focus:outline-none focus:border-dram-accent/50"
            />
            <textarea
              placeholder="Notes (optional)" value={newNotes} onChange={(e) => setNewNotes(e.target.value)} rows={2}
              className="w-full bg-dram-bg border border-dram-border rounded-lg px-3 py-2 text-sm text-dram-accent placeholder:text-dram-accent/30 focus:outline-none focus:border-dram-accent/50 resize-none"
            />
            <div className="flex gap-2 pt-1">
              <button onClick={() => setShowCreate(false)} className="flex-1 py-2 text-sm text-dram-accent/50 hover:text-dram-accent transition-colors">Cancel</button>
              <button
                onClick={handleCreate} disabled={creating || !newName.trim()}
                className="flex-1 bg-dram-accent hover:opacity-90 disabled:opacity-40 text-dram-bg text-sm font-medium rounded-lg py-2 transition-opacity"
              >
                {creating ? 'Creating…' : 'Create'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
});

// ─── Exercises tab ────────────────────────────────────────────────────────────

interface ExerciseFormState {
  name: string; category: string; customCategory: string; exerciseType: string; trackedFields: string[];
}
const EMPTY_EX_FORM: ExerciseFormState = { name: '', category: '', customCategory: '', exerciseType: 'weight', trackedFields: ['reps', 'weight'] };

function ExerciseCardInTab({ exercise }: { exercise: Exercise }) {
  const imgSrc = exercise.coverImageUrl ?? null;
  const emoji = CATEGORY_EMOJI_TAB[exercise.category.toLowerCase()] ?? '🏋️';
  return (
    <div className="bg-dram-card rounded-xl overflow-hidden border border-dram-border hover:border-dram-accent/50 transition group">
      <Link to={`/workouts/exercises/${exercise.id}`} className="block">
        <div className="aspect-square bg-dram-bg relative overflow-hidden">
          {imgSrc ? (
            <img src={imgSrc} alt={exercise.name} loading="lazy" className="w-full h-full object-cover group-hover:scale-105 transition duration-300" />
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <span className="text-4xl opacity-30">{emoji}</span>
            </div>
          )}
        </div>
      </Link>
      <div className="p-3">
        <Link to={`/workouts/exercises/${exercise.id}`} className="font-semibold text-white text-sm leading-snug line-clamp-2 hover:text-dram-accent transition-colors block">
          {exercise.name}
        </Link>
        <p className="text-dram-muted text-xs mt-0.5 capitalize">{exercise.category} · {exercise.exerciseType}</p>
        <div className="flex flex-wrap gap-1 mt-2">
          {exercise.musclesPrimary?.slice(0, 2).map((m) => (
            <span key={m} className="text-xs border border-dram-accent/40 text-dram-accent rounded-full px-2 py-0.5 capitalize">{m}</span>
          ))}
        </div>
      </div>
    </div>
  );
}

export interface ExercisesTabHandle { openCreate: () => void; }

const ExercisesTab = forwardRef<ExercisesTabHandle>(function ExercisesTab(_, ref) {
  const { defaultExerciseSort } = useSettingsStore();
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterCat, setFilterCat] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<ExerciseFormState>(EMPTY_EX_FORM);
  const [useCustomCat, setUseCustomCat] = useState(false);
  const [saving, setSaving] = useState(false);

  useImperativeHandle(ref, () => ({ openCreate: () => { setForm({ ...EMPTY_EX_FORM, category: '' }); setUseCustomCat(false); setShowForm(true); } }));

  function loadAll(params?: { search?: string; category?: string }) {
    return exercisesApi.getAll(params).then(setExercises);
  }

  useEffect(() => {
    Promise.all([exercisesApi.getAll(), exercisesApi.getCategories()])
      .then(([exs, cats]) => { setExercises(exs); setCategories(cats); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (loading) return;
    loadAll({ search: search || undefined, category: filterCat || undefined });
  }, [search, filterCat]);

  useEffect(() => {
    if (!showForm) return;
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') closeForm(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [showForm]);

  function openCreate() { setForm({ ...EMPTY_EX_FORM, category: categories[0] ?? '' }); setUseCustomCat(false); setShowForm(true); }
  function closeForm() { setShowForm(false); setForm(EMPTY_EX_FORM); setUseCustomCat(false); }

  async function handleSave() {
    const finalCategory = useCustomCat ? form.customCategory.trim() : form.category;
    if (!form.name.trim() || !finalCategory || !form.exerciseType) return;
    setSaving(true);
    try {
      const created = await exercisesApi.createCustom({ name: form.name.trim(), category: finalCategory, exerciseType: form.exerciseType });
      setExercises((prev) => [...prev, created]);
      if (!categories.includes(finalCategory)) setCategories((prev) => [...prev, finalCategory].sort());
      closeForm();
    } catch { /* keep form open */ } finally { setSaving(false); }
  }

  const filtered = exercises
    .filter((ex) => {
      const matchSearch = !search || ex.name.toLowerCase().includes(search.toLowerCase());
      const matchCat = !filterCat || ex.category === filterCat;
      return matchSearch && matchCat;
    })
    .sort((a, b) => defaultExerciseSort === 'name' ? a.name.localeCompare(b.name) : a.id - b.id);

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="flex-shrink-0 px-6 pt-4 pb-3 space-y-2">
        <input
          type="text" placeholder="🔍 Search exercises…" value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full bg-dram-card border border-dram-border rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-dram-accent"
        />
        <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-hide">
          <button
            onClick={() => setFilterCat('')}
            className={`whitespace-nowrap px-3 py-1.5 rounded-lg text-sm border transition ${!filterCat ? 'border-dram-accent text-dram-accent bg-dram-accent/10' : 'border-dram-border text-gray-400 hover:border-gray-600 hover:text-gray-200'}`}
          >All</button>
          {categories.map((cat) => (
            <button key={cat} onClick={() => setFilterCat(filterCat === cat ? '' : cat)}
              className={`whitespace-nowrap px-3 py-1.5 rounded-lg text-sm border transition ${filterCat === cat ? 'border-dram-accent text-dram-accent bg-dram-accent/10' : 'border-dram-border text-gray-400 hover:border-gray-600 hover:text-gray-200'}`}
            >{cat}</button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-6 pb-6">
        {loading ? (
          <div className="flex justify-center mt-16"><Spinner size={10} /></div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center mt-20 text-gray-600">
            <span className="text-5xl mb-3">🏋️</span>
            <p className="text-lg">No exercises found.</p>
          </div>
        ) : (
          <div className="grid gap-4 grid-cols-2 md:grid-cols-3 lg:grid-cols-5">
            {filtered.map((ex) => <ExerciseCardInTab key={ex.id} exercise={ex} />)}
          </div>
        )}
      </div>

      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={closeForm}>
          <div className="bg-dram-card border border-dram-border rounded-xl w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto p-6 space-y-5" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-base font-semibold text-dram-accent">New Exercise</h2>
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-dram-accent/50 uppercase tracking-wide">Name</label>
              <input autoFocus type="text" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="Exercise name"
                className="w-full bg-dram-bg border border-dram-border rounded-lg px-3 py-2 text-sm text-dram-accent placeholder:text-dram-accent/30 focus:outline-none focus:border-dram-accent/50" />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-dram-accent/50 uppercase tracking-wide">Category</label>
              {!useCustomCat && (
                <div className="flex flex-wrap gap-1.5">
                  {categories.map((cat) => (
                    <button key={cat} onClick={() => setForm((f) => ({ ...f, category: cat }))}
                      className={`text-xs px-3 py-1 rounded-full border transition-colors ${form.category === cat ? 'bg-dram-accent text-dram-bg border-dram-accent font-semibold' : 'text-dram-accent/60 border-dram-border hover:border-dram-accent/40'}`}
                    >{cat}</button>
                  ))}
                </div>
              )}
              {useCustomCat && (
                <input type="text" value={form.customCategory} onChange={(e) => setForm((f) => ({ ...f, customCategory: e.target.value }))} placeholder="New category name"
                  className="w-full bg-dram-bg border border-dram-border rounded-lg px-3 py-2 text-sm text-dram-accent placeholder:text-dram-accent/30 focus:outline-none focus:border-dram-accent/50" />
              )}
              <button onClick={() => setUseCustomCat((v) => !v)} className="text-xs text-dram-accent/50 hover:text-dram-accent transition-colors">
                {useCustomCat ? '← Pick existing' : '+ New category'}
              </button>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-dram-accent/50 uppercase tracking-wide">Type</label>
              <div className="flex flex-wrap gap-1.5">
                {EXERCISE_TYPES_TAB.map((t) => (
                  <button key={t} onClick={() => setForm((f) => ({ ...f, exerciseType: t, trackedFields: defaultTrackedFieldsTab(t) }))}
                    className={`text-xs px-3 py-1 rounded-full border transition-colors ${form.exerciseType === t ? 'bg-dram-accent text-dram-bg border-dram-accent font-semibold' : 'text-dram-accent/60 border-dram-border hover:border-dram-accent/40'}`}
                  >{t}</button>
                ))}
              </div>
            </div>
            <div className="space-y-2">
              <label className="text-xs font-semibold text-dram-accent/50 uppercase tracking-wide">Track Per Set</label>
              <div className="flex flex-wrap gap-2">
                {TRACKED_FIELD_OPTIONS_TAB.map(({ key, label }) => {
                  const checked = form.trackedFields.includes(key);
                  return (
                    <button key={key} type="button"
                      onClick={() => setForm((f) => ({ ...f, trackedFields: checked ? f.trackedFields.filter((x) => x !== key) : [...f.trackedFields, key] }))}
                      className={`text-xs px-3 py-1 rounded-full border transition-colors ${checked ? 'bg-dram-accent text-dram-bg border-dram-accent font-semibold' : 'text-dram-accent/60 border-dram-border hover:border-dram-accent/40'}`}
                    >{label}</button>
                  );
                })}
              </div>
              <p className="text-xs text-gray-500">Defaults set by type. Toggle to mix (e.g. stairs = Duration + Reps).</p>
            </div>
            <div className="flex justify-end gap-3 pt-1">
              <button onClick={closeForm} className="text-sm text-dram-accent/50 hover:text-dram-accent transition-colors">Cancel</button>
              <button onClick={handleSave} disabled={saving || !form.name.trim() || (!useCustomCat ? !form.category : !form.customCategory.trim())}
                className="text-sm bg-dram-accent hover:opacity-90 disabled:opacity-40 text-dram-bg px-4 py-1.5 rounded-lg transition-opacity font-medium">
                {saving ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
});

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
  const [routinesList, setRoutinesList] = useState<RoutineSummary[]>([]);
  const [starting, setStarting] = useState(false);
  const [startingRoutineId, setStartingRoutineId] = useState<number | null>(null);
  const [goalsOpen, setGoalsOpen] = useState(false);
  const [startPickerOpen, setStartPickerOpen] = useState(false);

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
      const [wh, fl, rl] = await Promise.all([
        waterApi.getHistory(start, end).catch(() => null),
        logApi.getHistory(30).catch(() => []),
        routinesApi.getAll().catch(() => []),
      ]);
      setWaterHistory(wh);
      setFoodLogHistory(fl as FoodLogHistoryDay[]);
      setRoutinesList(rl as RoutineSummary[]);
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
      <div className="flex-shrink-0 px-6 pt-5 pb-4 border-b border-dram-border flex items-center justify-between">
        <h1 className="text-xl font-semibold text-slate-200">Dashboard</h1>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setStartPickerOpen(true)}
            disabled={starting || startingRoutineId != null}
            className="bg-dram-accent hover:brightness-110 disabled:opacity-50 text-black font-semibold rounded-lg px-4 py-2 text-sm transition-colors"
          >
            {starting || startingRoutineId != null ? 'Starting…' : '+ Start Workout'}
          </button>
        </div>
      </div>

      {goalsOpen && (
        <GoalsModal
          exGoals={exGoals}
          measurementGoals={measurementGoals}
          onSaved={load}
          onClose={() => setGoalsOpen(false)}
        />
      )}

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
                  <div className="text-xs text-dram-muted">Start from scratch</div>
                </div>
              </button>
              {/* Routines */}
              {routinesList.length > 0 && (
                <div className="px-5 pt-3 pb-1">
                  <div className="text-xs font-semibold text-dram-muted uppercase tracking-wider mb-2">Routines</div>
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
                    <div className="text-xs text-dram-muted">{r.exerciseCount} exercise{r.exerciseCount !== 1 ? 's' : ''}{r.lastUsedDate ? ` · last used ${new Date(r.lastUsedDate + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}` : ''}</div>
                  </div>
                  {startingRoutineId === r.id && <span className="text-xs text-dram-muted">Starting…</span>}
                </button>
              ))}
              {routinesList.length === 0 && (
                <div className="px-5 py-3 text-xs text-dram-muted">No routines yet. Create one from the Workouts page.</div>
              )}
            </div>
            <div className="px-5 py-3 border-t border-dram-border">
              <button onClick={() => setStartPickerOpen(false)} className="w-full text-sm text-slate-400 hover:text-slate-200 py-1 transition-colors">Cancel</button>
            </div>
          </div>
        </div>
      )}

      <DashboardV2
        workouts={workouts}
        measurements={measurements}
        measurementGoals={measurementGoals}
        personalBests={personalBests}
        waterHistory={waterHistory}
        foodLogHistory={foodLogHistory}
        routinesList={routinesList}
        loading={loading || (v2Loading && !v2Loaded)}
        caloriesGoal={nutritionSummary?.nutrition.goals?.calories ?? null}
        proteinGoal={nutritionSummary?.nutrition.goals?.proteinG ?? null}
      />
    </div>
  );
}
