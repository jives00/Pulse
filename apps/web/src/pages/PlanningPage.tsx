import { useEffect, useState } from 'react';
import {
  goalsApi, measurementsApi,
  computeGoalPace,
  GLASS_OZ,
  type GoalsSummary, type ExerciseGoals, type MeasurementGoal, type BodyMeasurement, type PaceStatus,
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
    <div className="bg-dram-card border border-dram-border rounded-xl p-5 space-y-4">
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
    <div className="bg-dram-card border border-dram-border rounded-xl p-5 space-y-4">
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
    <div className="bg-dram-card border border-dram-border rounded-xl p-5">
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

// ─── Main page ────────────────────────────────────────────────────────────────

export default function PlanningPage() {
  const navigate = useNavigate();
  const [summary, setSummary] = useState<GoalsSummary | null>(null);
  const [exGoals, setExGoals] = useState<ExerciseGoals | null>(null);
  const [measurementGoals, setMeasurementGoals] = useState<Record<string, MeasurementGoal>>({});
  const [measurements, setMeasurements] = useState<BodyMeasurement[]>([]);
  const [loading, setLoading] = useState(true);

  async function load() {
    try {
      const [s, eg, mg, ms] = await Promise.all([
        goalsApi.getSummary().catch(() => null),
        goalsApi.getExercise().catch(() => null),
        measurementsApi.getGoals().catch(() => ({})),
        measurementsApi.getAll().catch(() => []),
      ]);
      setSummary(s);
      setExGoals(eg);
      setMeasurementGoals(mg as Record<string, MeasurementGoal>);
      setMeasurements(ms as BodyMeasurement[]);
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
        </div>
      )}
    </div>
  );
}
