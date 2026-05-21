import { useState, useEffect, useRef, useMemo } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import {
  routinesApi, workoutsApi, exercisesApi,
  type RoutineDetail, type RoutineExercise,
  type Exercise, type WorkoutSummary, type WorkoutDetail, type RoutineType,
  KG_TO_LBS, shortDate, formatDate,
  secondsToMMSS as _secondsToMMSS,
} from '@pulse/api-client';

const ROUTINE_TYPE_LABELS: Record<RoutineType, string> = {
  strength:        'Strength / Weight',
  bodyweight:      'Bodyweight',
  cardio_distance: 'Cardio — Distance (running, cycling)',
  cardio_duration: 'Cardio — Duration (elliptical, row)',
  steps:           'Steps / Stairs',
};

function kgToLbs(kg: number) { return Math.round(kg * KG_TO_LBS * 10) / 10; }
function fmtWeight(kg: number | null) {
  if (kg == null) return '';
  const lbs = kgToLbs(kg);
  return String(lbs % 1 === 0 ? lbs : lbs.toFixed(1));
}
function secondsToMMSS(sec: number | null): string {
  if (sec == null) return '';
  return _secondsToMMSS(sec);
}
function longDate(dateStr: string): string {
  return new Date(dateStr + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}
function dayOfWeek(dateStr: string): string {
  return new Date(dateStr + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long' });
}

// ─── Stats band ───────────────────────────────────────────────────────────────

function RoutineStatsBand({ workouts, routineType }: { workouts: WorkoutSummary[]; routineType: RoutineType }) {
  const rt = routineType ?? 'strength';

  let bestValue = 0;
  let bestWorkoutDate: string | null = null;
  for (const w of workouts) {
    let v = 0;
    switch (rt) {
      case 'steps':           v = w.totalSteps ?? 0; break;
      case 'cardio_distance': v = (w.totalDistanceMeters ?? 0) / 1609.34; break;
      case 'cardio_duration': v = (w.totalDurationSeconds ?? 0) / 60; break;
      default:                v = (w.totalVolumeKg ?? 0) * KG_TO_LBS; break;
    }
    if (v > bestValue) { bestValue = v; bestWorkoutDate = w.workoutDate; }
  }

  const lastDate = workouts[0]?.workoutDate ?? null;

  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 56);
  const cutoffStr = cutoff.toISOString().split('T')[0];
  const recentCount = workouts.filter((w) => w.workoutDate >= cutoffStr).length;
  const avgPerWeek = recentCount > 0 ? (recentCount / 8).toFixed(1) : '—';

  const bestLabel = { strength: 'Best Volume', bodyweight: 'Best Volume', cardio_distance: 'Best Distance', cardio_duration: 'Best Duration', steps: 'Best Steps' }[rt];
  const bestFormatted = (() => {
    if (bestValue === 0) return '—';
    switch (rt) {
      case 'steps':           return bestValue.toLocaleString() + ' steps';
      case 'cardio_distance': return bestValue.toFixed(1) + ' mi';
      case 'cardio_duration': return Math.round(bestValue) + ' min';
      default:                return Math.round(bestValue).toLocaleString() + ' lbs';
    }
  })();

  const tiles = [
    { label: 'Sessions', value: workouts.length > 0 ? String(workouts.length) : '0', sub: 'all time' },
    { label: bestLabel, value: bestFormatted, sub: bestWorkoutDate ? longDate(bestWorkoutDate) : undefined },
    { label: 'Last Performed', value: lastDate ? longDate(lastDate) : '—', sub: lastDate ? dayOfWeek(lastDate) : undefined },
    { label: 'Avg / Week', value: avgPerWeek === '—' ? '—' : `${avgPerWeek}×`, sub: 'last 8 weeks' },
  ];

  return (
    <section className="flex-shrink-0 px-9 py-5" style={{ borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
      <div className="flex items-center gap-3 mb-4">
        <div style={{ width: 14, height: 2, background: '#D4A843' }} />
        <h2 className="text-sm font-semibold uppercase tracking-wider text-white">Overview</h2>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {tiles.map((t, i) => (
          <div key={i} className="bg-dram-card border border-dram-border px-5 py-4">
            <div className="mb-2">
              <span className="text-sm font-semibold uppercase tracking-wider" style={{ color: '#D4A843' }}>{t.label}</span>
            </div>
            <div className="text-xl font-bold text-white">{t.value}</div>
            {t.sub && <div className="text-sm text-dram-muted mt-1">{t.sub}</div>}
          </div>
        ))}
      </div>
    </section>
  );
}

// ─── Chart tooltip ────────────────────────────────────────────────────────────

function RoutineChartTooltip({ active, payload, label, unit }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-dram-card border border-dram-border rounded-lg px-3 py-2 text-sm shadow-lg">
      <p className="font-medium mb-0.5 text-dram-muted">{longDate(String(label))}</p>
      <p className="text-white">
        {unit === 'lbs' || unit === 'steps'
          ? Number(payload[0]?.value).toLocaleString()
          : Number(payload[0]?.value).toFixed(1)
        } {unit}
      </p>
    </div>
  );
}

// ─── Progress section (chart + Now / vs 30d) ──────────────────────────────────

function ProgressSection({ chartData, routineType }: {
  chartData: { date: string; value: number }[];
  routineType: RoutineType;
}) {
  const rt = routineType ?? 'strength';
  const yUnit = { strength: 'lbs', bodyweight: 'lbs', cardio_distance: 'mi', cardio_duration: 'min', steps: 'steps' }[rt] ?? 'lbs';
  const chartLabel = { strength: 'Volume per session', bodyweight: 'Volume per session', cardio_distance: 'Distance per session (mi)', cardio_duration: 'Duration per session (min)', steps: 'Steps per session' }[rt] ?? '';

  const nowValue = chartData.length > 0 ? chartData[chartData.length - 1].value : null;

  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 30);
  const cutoffStr = cutoff.toISOString().split('T')[0];
  const ago30Entry = [...chartData].filter((p) => p.date <= cutoffStr).sort((a, b) => b.date.localeCompare(a.date))[0];
  const vs30Value = ago30Entry?.value ?? null;
  const delta = nowValue != null && vs30Value != null ? nowValue - vs30Value : null;
  const deltaPct = delta != null && vs30Value != null && vs30Value !== 0 ? (delta / vs30Value) * 100 : null;

  function fmtVal(v: number) {
    switch (rt) {
      case 'cardio_distance': return v.toFixed(1);
      case 'steps':           return Math.round(v).toLocaleString();
      default:                return Math.round(v).toLocaleString();
    }
  }

  return (
    <div className="bg-dram-card border border-dram-border p-4 space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div className="text-sm text-dram-muted">{chartLabel}</div>
        <div className="flex items-start gap-10 shrink-0">
          {nowValue != null && (
            <div className="text-left">
              <div className="text-sm text-dram-muted uppercase tracking-wide mb-0.5">Now</div>
              <div className="text-3xl font-bold text-white leading-none">
                {fmtVal(nowValue)}<span className="text-sm text-dram-muted ml-1 font-normal">{yUnit}</span>
              </div>
            </div>
          )}
          {vs30Value != null && delta != null && (
            <div className="text-left">
              <div className="text-sm text-dram-muted uppercase tracking-wide mb-0.5">vs 30 days ago</div>
              <div className={`text-3xl font-bold leading-none ${delta >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                {delta >= 0 ? '+' : ''}{fmtVal(delta)}<span className="text-sm font-normal opacity-70 ml-1">{yUnit}</span>
                {deltaPct != null && (
                  <span className="text-sm font-normal opacity-70 ml-1">({deltaPct >= 0 ? '+' : ''}{deltaPct.toFixed(1)}%)</span>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {chartData.length > 0 ? (
        <div className="pt-3">
          <ResponsiveContainer width="100%" height={160}>
            <BarChart data={chartData} margin={{ top: 4, right: 8, bottom: 0, left: 0 }} barCategoryGap="12%">
              <XAxis
                dataKey="date"
                tick={{ fontSize: 12, fill: 'rgb(var(--color-muted))' }}
                tickFormatter={shortDate}
                minTickGap={40}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                tick={{ fontSize: 12, fill: 'rgb(var(--color-muted))' }}
                tickFormatter={(v) => v >= 1000 ? `${Math.round(v / 1000)}k` : String(v)}
                axisLine={false}
                tickLine={false}
                width={38}
              />
              <Tooltip
                cursor={false}
                content={<RoutineChartTooltip unit={yUnit} />}
              />
              <Bar dataKey="value" fill="rgb(var(--color-accent))" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <div className="text-center text-sm text-dram-muted py-6">No data yet</div>
      )}
    </div>
  );
}

// ─── History section ──────────────────────────────────────────────────────────

function HistorySection({ workouts, routineType }: { workouts: WorkoutSummary[]; routineType: RoutineType }) {
  const [limit, setLimit] = useState(10);
  const navigate = useNavigate();
  const rt = routineType ?? 'strength';

  if (workouts.length === 0) {
    return <div className="text-center text-sm text-dram-muted py-8">No sessions yet</div>;
  }

  function sessionMetric(w: WorkoutSummary): string | null {
    switch (rt) {
      case 'steps':           return w.totalSteps ? `${w.totalSteps.toLocaleString()} steps` : null;
      case 'cardio_distance': return w.totalDistanceMeters ? `${(w.totalDistanceMeters / 1609.34).toFixed(1)} mi` : null;
      case 'cardio_duration': return w.totalDurationSeconds ? `${Math.round(w.totalDurationSeconds / 60)} min` : null;
      default:                return w.totalVolumeKg ? `${Math.round(w.totalVolumeKg * KG_TO_LBS).toLocaleString()} lbs` : null;
    }
  }

  // Column config per routine type
  const isStrength = rt === 'strength' || rt === 'bodyweight';
  const isCardioDistance = rt === 'cardio_distance';
  const isCardioDuration = rt === 'cardio_duration';
  const isSteps = rt === 'steps';

  return (
    <div className="space-y-3">
      {workouts.slice(0, limit).map((w) => {
        const metric = sessionMetric(w);
        return (
          <div key={w.id} className="bg-dram-card border border-dram-border overflow-hidden cursor-pointer hover:border-dram-accent/50 transition-colors" onClick={() => navigate(`/workouts/${w.id}`)}>
            {/* Session header */}
            <div className="px-3 py-2 border-b border-dram-border flex items-center justify-between">
              <div>
                <div className="text-base font-medium text-white">{formatDate(w.workoutDate)}</div>
                {w.name && w.name !== w.routineName && (
                  <div className="text-sm text-dram-muted">{w.name}</div>
                )}
              </div>
              {metric && <div className="text-sm font-semibold text-dram-accent shrink-0">{metric}</div>}
            </div>

            {/* Exercise table */}
            {w.exercises.length > 0 && (
              <div className="px-3 py-2">
                {/* Column headers */}
                <div className={`grid gap-3 text-xs text-dram-muted mb-1 ${
                  isStrength || isCardioDistance || isSteps ? 'grid-cols-[2fr_1fr_1fr_1fr]' : 'grid-cols-[2fr_1fr_1fr]'
                }`}>
                  <span>Exercise</span>
                  <span>Sets</span>
                  {isStrength && <><span>Max Weight</span><span>Avg Reps</span></>}
                  {isCardioDistance && <><span>Dist</span><span>Time</span></>}
                  {isCardioDuration && <span>Duration</span>}
                  {isSteps && <><span>Steps</span><span>Time</span></>}
                </div>

                {/* Exercise rows */}
                {w.exercises.map((ex, i) => (
                  <div key={i} className={`grid gap-3 text-sm py-0.5 ${
                    isStrength || isCardioDistance || isSteps ? 'grid-cols-[2fr_1fr_1fr_1fr]' : 'grid-cols-[2fr_1fr_1fr]'
                  }`}>
                    <span className="text-white truncate">{ex.name}</span>
                    <span className="text-dram-muted">{ex.setCount}</span>
                    {isStrength && (
                      <>
                        <span className="text-white">
                          {ex.maxWeightKg != null ? `${Math.round(ex.maxWeightKg * KG_TO_LBS)} lbs` : '—'}
                        </span>
                        <span className="text-white">
                          {ex.avgReps != null ? `${Math.round(ex.avgReps)}` : '—'}
                        </span>
                      </>
                    )}
                    {isCardioDistance && (
                      <>
                        <span className="text-white">
                          {ex.totalDistanceMeters != null ? `${(ex.totalDistanceMeters / 1609.34).toFixed(1)} mi` : '—'}
                        </span>
                        <span className="text-white">
                          {ex.totalDurationSeconds != null ? secondsToMMSS(ex.totalDurationSeconds) : '—'}
                        </span>
                      </>
                    )}
                    {isCardioDuration && (
                      <span className="text-white">
                        {ex.totalDurationSeconds != null ? secondsToMMSS(ex.totalDurationSeconds) : '—'}
                      </span>
                    )}
                    {isSteps && (
                      <>
                        <span className="text-white">
                          {ex.totalSteps != null ? ex.totalSteps.toLocaleString() : '—'}
                        </span>
                        <span className="text-white">
                          {ex.totalDurationSeconds != null ? secondsToMMSS(ex.totalDurationSeconds) : '—'}
                        </span>
                      </>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
      {workouts.length > limit && (
        <button
          onClick={() => setLimit((l) => l + 10)}
          className="w-full py-2 text-sm text-dram-accent hover:brightness-110 transition-colors"
        >
          Load more
        </button>
      )}
    </div>
  );
}

// ─── Exercises column ─────────────────────────────────────────────────────────

function ExercisesColumn({ routine, onRemove, onMove, onAdd, adding }: {
  routine: RoutineDetail;
  onRemove: (reId: number) => void;
  onMove: (reId: number, dir: 'up' | 'down') => void;
  onAdd: () => void;
  adding: boolean;
}) {
  return (
    <div className="space-y-3">
      {routine.exercises.map((re, idx) => (
        <div key={re.id} className="bg-dram-card border border-dram-border p-4">
          <div className="flex items-start justify-between mb-2">
            <div className="min-w-0">
              <Link
                to={`/workouts/exercises/${re.exercise.id}`}
                className="text-base font-medium text-dram-accent hover:brightness-110 transition-colors"
              >
                {re.exercise.name}
              </Link>
              <div className="text-sm text-dram-muted">{re.exercise.category}</div>
            </div>
            <div className="flex items-center gap-1 ml-2 shrink-0">
              <button
                onClick={() => onMove(re.id, 'up')}
                disabled={idx === 0}
                className="text-dram-muted hover:text-white disabled:opacity-20 transition-colors px-1 text-base leading-none"
              >↑</button>
              <button
                onClick={() => onMove(re.id, 'down')}
                disabled={idx === routine.exercises.length - 1}
                className="text-dram-muted hover:text-white disabled:opacity-20 transition-colors px-1 text-base leading-none"
              >↓</button>
              <button
                onClick={() => onRemove(re.id)}
                className="text-dram-muted hover:text-red-400 transition-colors text-base leading-none ml-1"
              >×</button>
            </div>
          </div>
          {re.lastPerformedSets && re.lastPerformedSets.length > 0 && (
            <div className="border border-dram-border px-3 py-2 text-sm text-dram-muted mt-1">
              <div className="mb-1 text-xs uppercase tracking-wide opacity-60">Last session</div>
              {re.lastPerformedSets.map((s) => (
                <div key={s.setNumber} className="py-0.5">
                  Set {s.setNumber}:
                  {s.weightKg != null && ` ${fmtWeight(s.weightKg)} lbs`}
                  {s.reps != null && ` × ${s.reps} reps`}
                  {s.durationSeconds != null && ` ${secondsToMMSS(s.durationSeconds)}`}
                  {s.distanceMeters != null && ` ${(s.distanceMeters / 1609.34).toFixed(1)} mi`}
                  {(s as any).steps != null && ` ${(s as any).steps} steps`}
                </div>
              ))}
            </div>
          )}
        </div>
      ))}
      <button
        onClick={onAdd}
        disabled={adding}
        className="w-full py-3 text-sm text-dram-accent hover:brightness-110 disabled:opacity-50 transition-colors border border-dashed border-dram-border"
      >
        {adding ? 'Adding…' : '+ Add Exercise'}
      </button>
    </div>
  );
}

// ─── Exercise picker modal ────────────────────────────────────────────────────

function ExercisePicker({ onSelect, onClose }: { onSelect: (ex: Exercise) => void; onClose: () => void }) {
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [category, setCategory] = useState('');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([exercisesApi.getAll(), exercisesApi.getCategories()])
      .then(([exs, cats]) => { setExercises(exs); setCategories(cats); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  const filtered = exercises.filter((e) => {
    const matchCat = !category || e.category === category;
    const matchSearch = !search || e.name.toLowerCase().includes(search.toLowerCase());
    return matchCat && matchSearch;
  });

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60" onClick={onClose}>
      <div
        className="bg-dram-card border border-dram-border rounded-t-2xl sm:rounded-2xl w-full sm:max-w-lg max-h-[80vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 pt-4 pb-2 shrink-0">
          <h2 className="text-base font-semibold text-white">Add Exercise</h2>
          <button onClick={onClose} className="text-dram-muted hover:text-white text-xl leading-none">×</button>
        </div>
        <div className="px-4 pb-2 space-y-2 shrink-0">
          <input
            autoFocus
            type="text"
            placeholder="Search…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-dram-bg border border-dram-border rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-dram-accent"
          />
          <div className="flex gap-1 overflow-x-auto pb-1">
            <button
              onClick={() => setCategory('')}
              className={`shrink-0 text-sm px-3 py-1 rounded-full transition-colors ${!category ? 'bg-dram-accent text-black font-semibold' : 'border border-dram-border text-dram-muted hover:text-white'}`}
            >All</button>
            {categories.map((c) => (
              <button
                key={c}
                onClick={() => setCategory(c === category ? '' : c)}
                className={`shrink-0 text-sm px-3 py-1 rounded-full transition-colors ${category === c ? 'bg-dram-accent text-black font-semibold' : 'border border-dram-border text-dram-muted hover:text-white'}`}
              >{c}</button>
            ))}
          </div>
        </div>
        <div className="overflow-y-auto flex-1 px-2 pb-2">
          {loading && <div className="text-center text-sm text-dram-muted py-6">Loading…</div>}
          {!loading && filtered.map((ex) => (
            <button
              key={ex.id}
              onClick={() => onSelect(ex)}
              className="w-full text-left px-3 py-2.5 rounded-lg hover:bg-dram-border/50 transition-colors"
            >
              <div className="text-base text-white">{ex.name}</div>
              <div className="text-sm text-dram-muted">{ex.category} · {ex.exerciseType}</div>
            </button>
          ))}
          {!loading && filtered.length === 0 && (
            <div className="text-center text-sm text-dram-muted py-6">No exercises found</div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function RoutineDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [routine, setRoutine] = useState<RoutineDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState(false);
  const [showPicker, setShowPicker] = useState(false);
  const [addingExercise, setAddingExercise] = useState(false);
  const [routineWorkouts, setRoutineWorkouts] = useState<WorkoutSummary[]>([]);
  const [activeWorkout, setActiveWorkout] = useState<WorkoutDetail | null>(null);

  const [editingName, setEditingName] = useState(false);
  const [name, setName] = useState('');
  const nameRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!id) return;
    const numId = Number(id);
    routinesApi.get(numId)
      .then((r) => { setRoutine(r); setName(r.name); })
      .catch(() => navigate('/workouts?tab=routines'))
      .finally(() => setLoading(false));

    workoutsApi.getAll({ limit: 50, routineId: numId })
      .then((workouts: WorkoutSummary[]) => setRoutineWorkouts(workouts))
      .catch(() => {});

    workoutsApi.getActive()
      .then((w) => setActiveWorkout(w))
      .catch(() => {});
  }, [id]);

  useEffect(() => { if (editingName) nameRef.current?.focus(); }, [editingName]);

  async function saveName() {
    if (!routine) return;
    setEditingName(false);
    const trimmed = name.trim();
    if (!trimmed || trimmed === routine.name) { setName(routine.name); return; }
    try {
      await routinesApi.update(routine.id, { name: trimmed });
      setRoutine((prev) => prev ? { ...prev, name: trimmed } : prev);
    } catch { setName(routine.name); }
  }

  async function saveRoutineType(rt: RoutineType) {
    if (!routine) return;
    try {
      await routinesApi.update(routine.id, { routineType: rt });
      setRoutine((prev) => prev ? { ...prev, routineType: rt } : prev);
    } catch { /* ignore */ }
  }

  async function handleStart() {
    if (!routine) return;
    setStarting(true);
    try {
      const workout = await routinesApi.start(routine.id);
      navigate(`/workouts/${workout.id}`);
    } catch { setStarting(false); }
  }

  async function handleSelectExercise(exercise: Exercise) {
    if (!routine) return;
    setShowPicker(false);
    setAddingExercise(true);
    try {
      const re = await routinesApi.addExercise(routine.id, exercise.id);
      setRoutine((prev) => prev ? { ...prev, exercises: [...prev.exercises, re] } : prev);
    } catch { /* ignore */ }
    finally { setAddingExercise(false); }
  }

  async function handleRemoveExercise(reId: number) {
    if (!routine) return;
    try {
      await routinesApi.removeExercise(routine.id, reId);
      setRoutine((prev) => prev ? { ...prev, exercises: prev.exercises.filter((e) => e.id !== reId) } : prev);
    } catch { /* ignore */ }
  }

  async function handleMoveExercise(reId: number, direction: 'up' | 'down') {
    if (!routine) return;
    const idx = routine.exercises.findIndex((e) => e.id === reId);
    if (idx < 0) return;
    const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= routine.exercises.length) return;
    const reordered = [...routine.exercises];
    [reordered[idx], reordered[swapIdx]] = [reordered[swapIdx], reordered[idx]];
    const withOrder = reordered.map((e, i) => ({ ...e, sortOrder: i }));
    setRoutine((prev) => prev ? { ...prev, exercises: withOrder } : prev);
    try {
      await routinesApi.reorderExercises(routine.id, withOrder.map((e) => ({ id: e.id, sortOrder: e.sortOrder })));
    } catch {
      setRoutine((prev) => prev ? { ...prev, exercises: routine.exercises } : prev);
    }
  }

  async function handleDelete() {
    if (!routine || !confirm('Delete this routine?')) return;
    try {
      await routinesApi.delete(routine.id);
      navigate('/workouts?tab=routines');
    } catch { /* ignore */ }
  }

  const chartData = useMemo(() => {
    if (!routine || !routineWorkouts.length) return [];
    const rt = routine.routineType ?? 'strength';
    return routineWorkouts
      .slice()
      .reverse()
      .map((w) => {
        let value = 0;
        switch (rt) {
          case 'steps':           value = w.totalSteps ?? 0; break;
          case 'cardio_distance': value = Math.round(((w.totalDistanceMeters ?? 0) / 1609.34) * 100) / 100; break;
          case 'cardio_duration': value = Math.round((w.totalDurationSeconds ?? 0) / 60); break;
          default:                value = Math.round((w.totalVolumeKg ?? 0) * KG_TO_LBS); break;
        }
        return { date: w.workoutDate, value };
      })
      .filter((d) => d.value > 0);
  }, [routine, routineWorkouts]);

  if (loading) return <div className="text-center text-sm text-dram-muted py-12">Loading…</div>;
  if (!routine) return null;

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="flex-shrink-0 px-6 pt-5 pb-4 border-b border-dram-border flex items-start gap-3">
        <button onClick={() => navigate(-1)} className="text-dram-muted hover:text-white transition-colors shrink-0 mt-1">←</button>

        <div className="flex-1 min-w-0">
          {editingName ? (
            <input
              ref={nameRef}
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onBlur={saveName}
              onKeyDown={(e) => {
                if (e.key === 'Enter') saveName();
                if (e.key === 'Escape') { setEditingName(false); setName(routine.name); }
              }}
              className="w-full bg-transparent text-xl font-semibold text-white focus:outline-none border-b border-dram-border"
            />
          ) : (
            <button
              onClick={() => setEditingName(true)}
              className="text-left text-xl font-semibold text-white hover:text-white transition-colors w-full truncate"
            >
              {routine.name}
            </button>
          )}

          <div className="flex items-center gap-2 mt-0.5">
            <select
              value={routine.routineType ?? 'strength'}
              onChange={(e) => saveRoutineType(e.target.value as RoutineType)}
              className="text-sm bg-transparent text-dram-muted border-none focus:outline-none cursor-pointer hover:text-white transition-colors"
            >
              {(Object.entries(ROUTINE_TYPE_LABELS) as [RoutineType, string][]).map(([val, label]) => (
                <option key={val} value={val}>{label}</option>
              ))}
            </select>
          </div>

          {routineWorkouts.length > 0 && (() => {
            const w = routineWorkouts[0];
            const rt = routine.routineType ?? 'strength';
            let primary: string | null = null;
            switch (rt) {
              case 'steps':           primary = w.totalSteps ? `${w.totalSteps.toLocaleString()} steps` : null; break;
              case 'cardio_distance': primary = w.totalDistanceMeters ? `${(w.totalDistanceMeters / 1609.34).toFixed(1)} mi` : null; break;
              case 'cardio_duration': primary = w.totalDurationSeconds ? `${Math.round(w.totalDurationSeconds / 60)} min` : null; break;
              default:                primary = w.totalVolumeKg ? `${Math.round(w.totalVolumeKg * KG_TO_LBS).toLocaleString()} lbs` : null; break;
            }
            if (!primary) return null;
            return (
              <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 mt-1.5 text-sm text-dram-muted">
                <span>Last session:</span>
                <span>{primary}</span>
              </div>
            );
          })()}
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={handleStart}
            disabled={starting || routine.exercises.length === 0}
            className="bg-dram-accent hover:brightness-110 disabled:opacity-50 text-black font-semibold rounded-lg px-4 py-2 text-sm transition-colors"
          >
            {starting ? 'Starting…' : 'Start Routine'}
          </button>
          <button
            onClick={handleDelete}
            className="border border-dram-border text-dram-muted hover:text-red-400 hover:border-red-900/40 rounded-lg px-3 py-2 text-sm transition-colors"
          >
            Delete
          </button>
        </div>
      </div>

      {/* Stats band */}
      <RoutineStatsBand workouts={routineWorkouts} routineType={routine.routineType ?? 'strength'} />

      {/* 3-column body */}
      <div className="flex-1 overflow-y-auto">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-0 h-full">

          {/* Left 2 columns — chart + history */}
          <div className="lg:col-span-2 p-6 space-y-6 lg:border-r lg:border-dram-border lg:overflow-y-auto">

            {/* Active workout banner */}
            {activeWorkout && (
              <div className="bg-dram-accent/10 border border-dram-accent/40 px-4 py-3 flex items-center gap-3">
                <span className="text-dram-accent text-lg">⏱</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-dram-accent truncate">
                    {activeWorkout.routineName ?? activeWorkout.name ?? 'Workout in progress'}
                  </p>
                  <p className="text-sm text-dram-muted mt-0.5">
                    {activeWorkout.exercises.length} exercise{activeWorkout.exercises.length !== 1 ? 's' : ''} logged
                  </p>
                </div>
                <button
                  onClick={() => navigate(`/workouts/${activeWorkout.id}`)}
                  className="bg-dram-accent text-black text-sm font-semibold px-4 py-2 rounded-lg hover:brightness-110 transition flex-shrink-0"
                >
                  Resume →
                </button>
              </div>
            )}

            {/* Progress chart */}
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <div style={{ width: 14, height: 2, background: '#D4A843' }} />
                <h2 className="text-sm font-semibold uppercase tracking-wider text-white">Progress</h2>
              </div>
              <ProgressSection chartData={chartData} routineType={routine.routineType ?? 'strength'} />
            </div>

            {/* Session history */}
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <div style={{ width: 14, height: 2, background: '#D4A843' }} />
                <h2 className="text-sm font-semibold uppercase tracking-wider text-white">History</h2>
              </div>
              <HistorySection workouts={routineWorkouts} routineType={routine.routineType ?? 'strength'} />
            </div>
          </div>

          {/* Right column — exercises */}
          <div className="p-6 space-y-4 lg:overflow-y-auto">
            <div className="flex items-center gap-3">
              <div style={{ width: 14, height: 2, background: '#D4A843' }} />
              <h2 className="text-sm font-semibold uppercase tracking-wider text-white">
                Exercises ({routine.exercises.length})
              </h2>
            </div>
            <ExercisesColumn
              routine={routine}
              onRemove={handleRemoveExercise}
              onMove={handleMoveExercise}
              onAdd={() => setShowPicker(true)}
              adding={addingExercise}
            />
          </div>
        </div>
      </div>

      {showPicker && <ExercisePicker onSelect={handleSelectExercise} onClose={() => setShowPicker(false)} />}
    </div>
  );
}
