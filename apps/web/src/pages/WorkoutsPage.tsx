import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { BarChart, Bar, XAxis, YAxis, Tooltip, Cell } from 'recharts';
import {
  workoutsApi, goalsApi, measurementsApi,
  type WorkoutSummary, type ExerciseGoals,
  type BodyMeasurement, type MeasurementGoal, type PersonalBests,
} from '@pulse/api-client';

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

// ─── Main page ────────────────────────────────────────────────────────────────

const TABS = [
  { key: 'week',    label: 'Week'    },
  { key: 'body',    label: 'Body'    },
  { key: 'records', label: 'Records' },
] as const;

type Tab = typeof TABS[number]['key'];

export default function WorkoutsPage() {
  const navigate = useNavigate();
  const [workouts, setWorkouts] = useState<WorkoutSummary[]>([]);
  const [exGoals, setExGoals] = useState<ExerciseGoals | null>(null);
  const [weekActual, setWeekActual] = useState({ workoutCount: 0, totalMinutes: 0 });
  const [measurements, setMeasurements] = useState<BodyMeasurement[]>([]);
  const [measurementGoals, setMeasurementGoals] = useState<Record<string, MeasurementGoal>>({});
  const [personalBests, setPersonalBests] = useState<PersonalBests | null>(null);
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState(false);
  const [goalsOpen, setGoalsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<Tab>('week');

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
      if (summary?.workouts.actual) {
        setWeekActual(summary.workouts.actual);
      }
      setMeasurements(ms as BodyMeasurement[]);
      setMeasurementGoals(mg as Record<string, MeasurementGoal>);
      setPersonalBests(pb);
    }).catch(() => {}).finally(() => setLoading(false));
  }

  useEffect(() => { load(); }, []);

  async function handleStart() {
    setStarting(true);
    try {
      const workout = await workoutsApi.create();
      navigate(`/workouts/${workout.id}`);
    } catch { setStarting(false); }
  }

  async function handleAddMeasurement(data: { metric: string; value: number; unit: string; measuredAt: string }) {
    const entry = await measurementsApi.add(data);
    setMeasurements((prev) => [entry, ...prev].sort((a, b) => b.measuredAt.localeCompare(a.measuredAt)));
  }

  async function handleUpdateMeasurement(id: number, data: { value: number; measuredAt: string }) {
    const updated = await measurementsApi.update(id, data);
    setMeasurements((prev) =>
      prev.map((m) => m.id === id ? updated : m).sort((a, b) => b.measuredAt.localeCompare(a.measuredAt))
    );
  }

  async function handleDeleteMeasurement(id: number) {
    await measurementsApi.delete(id);
    setMeasurements((prev) => prev.filter((m) => m.id !== id));
  }

  const weeklyData = buildWeeklyData(workouts);
  const weekStreak = computeDayStreak(workouts);

  const currentWeekStart = getWeekStart(localDateStr());
  const weekCalories = workouts
    .filter((w) => getWeekStart(w.workoutDate) === currentWeekStart)
    .reduce((sum, w) => {
      if (w.caloriesBurned != null) return sum + w.caloriesBurned;
      if (w.durationMinutes != null) return sum + Math.round(w.durationMinutes * 6);
      if (w.totalVolumeKg != null && w.totalVolumeKg > 0)
        return sum + Math.round(w.totalVolumeKg * 2.20462 * 0.1);
      return sum;
    }, 0);

  const weekVolumeLbs = Math.round(weeklyData[weeklyData.length - 1]?.volumeLbs ?? 0);
  const volumeGoal = exGoals?.volumeLbsPerWeek ?? null;
  const volumePct = volumeGoal ? weekVolumeLbs / volumeGoal : 0;
  const ringColor = volumePct >= 1 ? '#34d399' : volumePct >= 0.5 ? '#D4A843' : '#a78bfa';
  const workoutGoal = exGoals?.workoutsPerWeek ?? null;

  return (
    <div className="flex flex-col h-full overflow-hidden bg-dram-bg text-white">
      {/* Toolbar */}
      <div className="flex-shrink-0 px-6 pt-5 pb-4 border-b border-dram-border flex items-center justify-between">
        <h1 className="text-xl font-semibold text-slate-200">Progress</h1>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setGoalsOpen(true)}
            className="border border-dram-border text-slate-300 hover:text-white hover:border-slate-400 rounded-lg px-3 py-2 text-sm transition-colors"
          >
            Edit Goals
          </button>
          <button
            onClick={handleStart}
            disabled={starting}
            className="bg-dram-accent hover:brightness-110 disabled:opacity-50 text-black font-semibold rounded-lg px-4 py-2 text-sm transition-colors"
          >
            {starting ? 'Starting…' : '+ Start Workout'}
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

      {/* Tab bar */}
      <div className="flex-shrink-0 px-6 border-b border-dram-border flex gap-1">
        {TABS.map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setActiveTab(key)}
            className={`px-4 py-3 text-sm font-medium border-b-2 -mb-px transition-colors ${
              activeTab === key
                ? 'border-dram-accent text-dram-accent'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-y-auto p-6 space-y-4">
        {loading ? (
          <div className="text-center text-slate-400 py-8">Loading…</div>
        ) : activeTab === 'week' ? (
          <>
            {/* ── Weekly summary card ─────────────────────────────── */}
            <div className="bg-dram-card rounded-2xl overflow-hidden">
              <div className="h-[3px] bg-dram-accent rounded-t-2xl" />

              <div className="px-6 py-5">
                <div className="flex items-center gap-4">
                  <div className="relative shrink-0 mr-2">
                    <Ring pct={volumePct} color={ringColor} size={108} />
                    <div className="absolute inset-0 flex flex-col items-center justify-center text-center pointer-events-none">
                      {weekVolumeLbs > 0 ? (
                        <>
                          <span className="text-lg font-bold text-white leading-none">
                            {weekVolumeLbs >= 1000
                              ? `${(weekVolumeLbs / 1000).toFixed(1)}k`
                              : weekVolumeLbs}
                          </span>
                          <span className="text-[10px] text-slate-400 mt-0.5 leading-tight">
                            {volumeGoal ? `/ ${volumeGoal >= 1000 ? `${(volumeGoal / 1000).toFixed(0)}k` : volumeGoal}` : 'lbs'}<br />vol
                          </span>
                        </>
                      ) : (
                        <>
                          <span className="text-2xl font-bold text-white leading-none">—</span>
                          <span className="text-[10px] text-slate-400 mt-0.5 leading-tight">volume</span>
                        </>
                      )}
                    </div>
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-3">
                      <span className="text-2xl leading-none">🏋️</span>
                      <span className="text-base font-bold text-white">This Week</span>
                    </div>
                    <div className="space-y-3">
                      <ProgressBar label="Volume" actual={weekVolumeLbs} goal={volumeGoal} unit="lbs" color="#a78bfa" />
                      <ProgressBar
                        label="Workouts"
                        actual={weekActual.workoutCount}
                        goal={workoutGoal}
                        unit={workoutGoal === 1 ? 'workout' : 'workouts'}
                        color="#34d399"
                      />
                    </div>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-4 border-t border-dram-border">
                <StatTile
                  icon="🔥"
                  label="Calories Burned"
                  value={weekCalories > 0 ? weekCalories.toLocaleString() : '—'}
                  unit={weekCalories > 0 ? 'kcal' : ''}
                  color="#fb923c"
                />
                <StatTile
                  icon="🔁"
                  label="Streak"
                  value={weekStreak}
                  unit={weekStreak === 1 ? 'day' : 'days'}
                  color="#34d399"
                />
                <StatTile
                  icon="🏋️"
                  label="Best Lift"
                  value={personalBests?.heaviestLift
                    ? `${Math.round(personalBests.heaviestLift.weightKg * 2.20462 * 10) / 10}`
                    : '—'}
                  unit={personalBests?.heaviestLift ? 'lbs' : ''}
                  color="#818cf8"
                />
                <StatTile
                  icon="📈"
                  label="Best Volume"
                  value={personalBests?.bestSessionVolume
                    ? Math.round(personalBests.bestSessionVolume.volumeKg * 2.20462).toLocaleString()
                    : '—'}
                  unit={personalBests?.bestSessionVolume ? 'lbs' : ''}
                  color="#60a5fa"
                />
              </div>
            </div>

            {/* ── 13-week charts ──────────────────────────────────── */}
            <div className="flex gap-3">
              <WeeklyChart
                data={weeklyData}
                dataKey="volumeLbs"
                label="Volume / wk"
                icon="📦"
                color="#a78bfa"
                goal={volumeGoal}
                unit=" lbs"
              />
              <WeeklyChart
                data={weeklyData}
                dataKey="workouts"
                label="Workouts / wk"
                icon="🏋️"
                color="#34d399"
                goal={workoutGoal}
                unit=""
              />
            </div>
          </>
        ) : activeTab === 'body' ? (
          <BodyMeasurementsCard
            measurements={measurements}
            goals={measurementGoals}
            onAdd={handleAddMeasurement}
            onUpdate={handleUpdateMeasurement}
            onDelete={handleDeleteMeasurement}
          />
        ) : (
          <PersonalBestsCard bests={personalBests} />
        )}
      </div>
    </div>
  );
}
