import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { workoutsApi, exercisesApi, routinesApi, measurementsApi, type WorkoutDetail, type WorkoutSummary, type WorkoutExercise, type ExerciseSet, type Exercise, KG_TO_LBS, secondsToMMSS as _secondsToMMSS, formatElapsed } from '@pulse/api-client';

// ─── helpers ────────────────────────────────────────────────────────────────

function longDate(dateStr: string): string {
  return new Date(dateStr + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function getYouTubeEmbedUrl(url: string): string | null {
  try {
    const u = new URL(url);
    if (u.hostname === 'youtu.be') return `https://www.youtube.com/embed${u.pathname}`;
    if (u.hostname.includes('youtube.com') && u.searchParams.get('v')) return `https://www.youtube.com/embed/${u.searchParams.get('v')}`;
  } catch { /* invalid URL */ }
  return null;
}

function MediaEmbed({ url }: { url: string }) {
  const embedUrl = getYouTubeEmbedUrl(url);
  if (embedUrl) {
    return (
      <div className="relative w-full" style={{ paddingBottom: '56.25%' }}>
        <iframe
          src={embedUrl}
          className="absolute inset-0 w-full h-full"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
        />
      </div>
    );
  }
  return <img src={url} alt="Exercise demo" className="w-full object-contain max-h-64" />;
}

function kgToLbs(kg: number): number {
  return Math.round(kg * KG_TO_LBS * 10) / 10;
}

function lbsToKg(lbs: number): number {
  return Math.round((lbs / KG_TO_LBS) * 1000) / 1000;
}

function fmtWeight(kg: number | null) {
  if (kg == null) return '';
  const lbs = kgToLbs(kg);
  return String(lbs % 1 === 0 ? lbs : lbs.toFixed(1));
}

function secondsToMMSS(sec: number | null): string {
  if (sec == null) return '';
  return _secondsToMMSS(sec);
}

function mmssToSeconds(val: string): number | null {
  const trimmed = val.trim();
  if (!trimmed) return null;
  const parts = trimmed.split(':');
  if (parts.length === 2) {
    const m = parseInt(parts[0], 10);
    const s = parseInt(parts[1], 10);
    if (!isNaN(m) && !isNaN(s)) return m * 60 + s;
  }
  const n = parseInt(trimmed, 10);
  return isNaN(n) ? null : n;
}

// ─── Set row ─────────────────────────────────────────────────────────────────

function SetRow({
  set, weId, workoutId, isActive, trackedFields, onUpdated, onDeleted,
}: {
  set: ExerciseSet;
  weId: number;
  workoutId: number;
  isActive: boolean;
  trackedFields: string[];
  onUpdated: (s: ExerciseSet) => void;
  onDeleted: (id: number) => void;
}) {
  const trackWeight   = trackedFields.includes('weight');
  const trackReps     = trackedFields.includes('reps');
  const trackDuration = trackedFields.includes('duration');
  const trackDistance = trackedFields.includes('distance');
  const trackSteps    = trackedFields.includes('steps');

  const [reps, setReps]         = useState(String(set.reps ?? ''));
  const [weight, setWeight]     = useState(fmtWeight(set.weightKg));
  const [duration, setDuration] = useState(secondsToMMSS(set.durationSeconds));
  const [distance, setDistance] = useState(String(set.distanceMeters ?? ''));
  const [steps, setSteps]       = useState(String((set as any).steps ?? ''));
  const [saving, setSaving]     = useState(false);

  async function handleBlur() {
    if (saving) return;
    const newReps        = trackReps     && reps     !== '' ? Number(reps)    : null;
    const newWeightLbs   = trackWeight   && weight   !== '' ? Number(weight)  : null;
    const newWeightKg    = newWeightLbs != null ? lbsToKg(newWeightLbs) : null;
    const newDurSeconds  = trackDuration ? mmssToSeconds(duration)             : null;
    const newDistMeters  = trackDistance && distance !== '' ? Number(distance) : null;
    const newSteps       = trackSteps    && steps    !== '' ? Number(steps)    : null;

    const unchanged =
      newReps       === set.reps &&
      newWeightKg   === set.weightKg &&
      newDurSeconds === set.durationSeconds &&
      newDistMeters === set.distanceMeters &&
      newSteps      === ((set as any).steps ?? null);
    if (unchanged) return;

    setSaving(true);
    try {
      await workoutsApi.updateSet(workoutId, weId, set.id, {
        reps: newReps,
        weightKg: newWeightKg,
        durationSeconds: newDurSeconds,
        distanceMeters: newDistMeters,
        steps: newSteps,
        completed: set.completed,
      });
      onUpdated({ ...set, reps: newReps, weightKg: newWeightKg, durationSeconds: newDurSeconds, distanceMeters: newDistMeters, steps: newSteps } as any);
    } catch {
      setReps(String(set.reps ?? ''));
      setWeight(fmtWeight(set.weightKg));
      setDuration(secondsToMMSS(set.durationSeconds));
      setDistance(String(set.distanceMeters ?? ''));
      setSteps(String((set as any).steps ?? ''));
    } finally {
      setSaving(false);
    }
  }

  async function handleToggleComplete() {
    const next = !set.completed;
    onUpdated({ ...set, completed: next });
    try {
      await workoutsApi.updateSet(workoutId, weId, set.id, { completed: next });
    } catch {
      onUpdated({ ...set, completed: !next });
    }
  }

  async function handleDelete() {
    try {
      await workoutsApi.deleteSet(workoutId, weId, set.id);
      onDeleted(set.id);
    } catch {
      // ignore
    }
  }

  const inputCls = 'w-full bg-dram-bg border border-dram-border rounded px-2 py-1.5 text-sm text-white text-center focus:outline-none focus:border-dram-accent';
  const rowCls = isActive && !set.completed ? 'opacity-60' : '';

  const fieldCount = [trackWeight, trackReps, trackDuration, trackDistance, trackSteps].filter(Boolean).length;
  const dataCols = `repeat(${fieldCount}, 1fr)`;
  const gridTemplateColumns = isActive
    ? `2rem ${dataCols} 2rem 2rem`
    : `2rem ${dataCols} 2rem`;

  return (
    <div className={`grid gap-2 items-center py-1 transition-opacity ${rowCls}`} style={{ gridTemplateColumns }}>
      <span className="text-sm text-dram-muted text-center">{set.setNumber}</span>
      {trackWeight && (
        <input type="number" min="0" placeholder="lbs" value={weight}
          onChange={(e) => setWeight(e.target.value)} onBlur={handleBlur} className={inputCls} />
      )}
      {trackReps && (
        <input type="number" min="0" placeholder="reps" value={reps}
          onChange={(e) => setReps(e.target.value)} onBlur={handleBlur} className={inputCls} />
      )}
      {trackDuration && (
        <input type="text" placeholder="m:ss" value={duration}
          onChange={(e) => setDuration(e.target.value)} onBlur={handleBlur} className={inputCls} />
      )}
      {trackDistance && (
        <input type="number" min="0" placeholder="dist" value={distance}
          onChange={(e) => setDistance(e.target.value)} onBlur={handleBlur} className={inputCls} />
      )}
      {trackSteps && (
        <input type="number" min="0" placeholder="steps" value={steps}
          onChange={(e) => setSteps(e.target.value)} onBlur={handleBlur} className={inputCls} />
      )}
      {isActive && (
        <button
          onClick={handleToggleComplete}
          className={`w-7 h-7 rounded border-2 flex items-center justify-center transition-colors shrink-0 mx-auto ${
            set.completed
              ? 'bg-green-600 border-green-600 text-white'
              : 'border-dram-border text-transparent hover:border-dram-muted'
          }`}
          title={set.completed ? 'Mark incomplete' : 'Mark complete'}
        >
          ✓
        </button>
      )}
      <button
        onClick={handleDelete}
        className="text-dram-muted hover:text-red-400 transition-colors text-base leading-none"
        title="Remove set"
      >
        ✕
      </button>
    </div>
  );
}

// ─── Exercise block ──────────────────────────────────────────────────────────

function ExerciseBlock({
  we, workoutId, isActive, lastSets, onRemove, onSetsChanged,
}: {
  we: WorkoutExercise;
  workoutId: number;
  isActive: boolean;
  lastSets: Array<{ setNumber: number; reps: number | null; weightKg: number | null; durationSeconds: number | null; steps: number | null }> | null;
  onRemove: (weId: number) => void;
  onSetsChanged: (weId: number, sets: ExerciseSet[]) => void;
}) {
  const [sets, setSets] = useState<ExerciseSet[]>(we.sets);
  const [adding, setAdding] = useState(false);

  function updateSets(next: ExerciseSet[]) {
    setSets(next);
    onSetsChanged(we.id, next);
  }

  async function handleAddSet() {
    setAdding(true);
    try {
      const last = sets[sets.length - 1];
      const s = await workoutsApi.addSet(workoutId, we.id, {
        reps: last?.reps ?? undefined,
        weightKg: last?.weightKg ?? undefined,
        durationSeconds: last?.durationSeconds ?? undefined,
        distanceMeters: last?.distanceMeters ?? undefined,
        steps: (last as any)?.steps ?? undefined,
      });
      updateSets([...sets, s]);
    } catch {
      // ignore
    } finally {
      setAdding(false);
    }
  }

  function handleUpdated(updated: ExerciseSet) {
    updateSets(sets.map((s) => (s.id === updated.id ? updated : s)));
  }

  function handleDeleted(id: number) {
    updateSets(sets.filter((s) => s.id !== id));
  }

  const tf = we.exercise.trackedFields ?? ['reps', 'weight'];
  const trackWeight   = tf.includes('weight');
  const trackReps     = tf.includes('reps');
  const trackDuration = tf.includes('duration');
  const trackDistance = tf.includes('distance');
  const trackSteps    = tf.includes('steps');

  const fieldCount = [trackWeight, trackReps, trackDuration, trackDistance, trackSteps].filter(Boolean).length;
  const dataCols = `repeat(${fieldCount}, 1fr)`;
  const gridTemplateColumns = isActive
    ? `2rem ${dataCols} 2rem 2rem`
    : `2rem ${dataCols} 2rem`;

  const lastLabel = (() => {
    if (!lastSets || lastSets.length === 0) return null;
    const s0 = lastSets[0];
    if (trackWeight && s0.weightKg != null) {
      const lbs = Math.round(s0.weightKg * KG_TO_LBS * 10) / 10;
      const repsStr = s0.reps != null ? ` × ${s0.reps} reps` : '';
      return `Last: ${lbs % 1 === 0 ? lbs : lbs.toFixed(1)} lbs${repsStr}`;
    }
    if (trackSteps && s0.steps != null) {
      const dur = s0.durationSeconds;
      const paceStr = dur ? ` (${Math.round(s0.steps / (dur / 60))} stairs/min)` : '';
      return `Last: ${s0.steps.toLocaleString()} steps${paceStr}`;
    }
    if (trackDuration && s0.durationSeconds != null) {
      const m = Math.floor(s0.durationSeconds / 60);
      const sec = s0.durationSeconds % 60;
      return `Last: ${m}:${String(sec).padStart(2, '0')}`;
    }
    return null;
  })();

  return (
    <div className="bg-dram-card border border-dram-border p-4">
      <div className="flex items-start justify-between mb-3">
        <div>
          <Link
            to={`/workouts/exercises/${we.exercise.id}`}
            className="text-base font-medium text-dram-accent hover:brightness-110 transition-colors"
          >
            {we.exercise.name}
          </Link>
          <div className="text-sm text-dram-muted">{we.exercise.category}</div>
          {lastLabel && <div className="text-sm text-dram-muted mt-0.5">{lastLabel}</div>}
        </div>
        <button
          onClick={() => onRemove(we.id)}
          className="text-dram-muted hover:text-red-400 transition-colors text-sm ml-2 shrink-0"
          title="Remove exercise"
        >
          Remove
        </button>
      </div>

      {sets.length > 0 && (
        <div className="mb-2">
          <div className="grid gap-2 mb-1" style={{ gridTemplateColumns }}>
            <span />
            {trackWeight   && <span className="text-sm text-dram-muted text-center">lbs</span>}
            {trackReps     && <span className="text-sm text-dram-muted text-center">reps</span>}
            {trackDuration && <span className="text-sm text-dram-muted text-center">time</span>}
            {trackDistance && <span className="text-sm text-dram-muted text-center">dist</span>}
            {trackSteps    && <span className="text-sm text-dram-muted text-center">steps</span>}
            {isActive      && <span className="text-sm text-dram-muted text-center">✓</span>}
            <span />
          </div>
          {sets.map((s) => (
            <SetRow
              key={s.id}
              set={s}
              weId={we.id}
              workoutId={workoutId}
              isActive={isActive}
              trackedFields={tf}
              onUpdated={handleUpdated}
              onDeleted={handleDeleted}
            />
          ))}
        </div>
      )}

      <button
        onClick={handleAddSet}
        disabled={adding}
        className="w-full text-sm text-dram-accent hover:brightness-110 disabled:opacity-50 transition-colors py-1.5 border border-dashed border-dram-border"
      >
        {adding ? 'Adding…' : '+ Add set'}
      </button>
    </div>
  );
}

// ─── Stats band ──────────────────────────────────────────────────────────────

function WorkoutStatsBand({
  workout, elapsedSeconds, isActive, totalVolumeLbs, routineHistory,
}: {
  workout: WorkoutDetail;
  elapsedSeconds: number;
  isActive: boolean;
  totalVolumeLbs: number;
  routineHistory: WorkoutSummary[];
}) {
  const prevSessions = routineHistory.filter((w) => w.id !== workout.id);
  const lastSession = prevSessions[0] ?? null;
  const bestSession = prevSessions.reduce<WorkoutSummary | null>((best, w) => {
    if (!best) return w;
    return (w.totalVolumeKg ?? 0) > (best.totalVolumeKg ?? 0) ? w : best;
  }, null);

  const lastVolumeLbs = lastSession ? Math.round((lastSession.totalVolumeKg ?? 0) * KG_TO_LBS) : null;
  const bestVolumeLbs = bestSession ? Math.round((bestSession.totalVolumeKg ?? 0) * KG_TO_LBS) : null;

  const timerValue = isActive
    ? formatElapsed(elapsedSeconds)
    : workout.durationMinutes ? `${workout.durationMinutes} min` : '—';
  const timerSub = isActive ? 'in progress' : (workout.durationMinutes ? 'duration' : undefined);

  const tiles = [
    { label: 'Timer',        value: timerValue, sub: timerSub },
    { label: 'Volume',       value: totalVolumeLbs > 0 ? `${Math.round(totalVolumeLbs).toLocaleString()} lbs` : '—', sub: 'this session' },
    { label: 'Last Session', value: lastVolumeLbs != null ? `${lastVolumeLbs.toLocaleString()} lbs` : '—', sub: lastSession ? longDate(lastSession.workoutDate) : undefined },
    { label: 'Best Session', value: bestVolumeLbs != null ? `${bestVolumeLbs.toLocaleString()} lbs` : '—', sub: bestSession ? longDate(bestSession.workoutDate) : undefined },
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
            <div className={`text-xl font-bold text-white ${i === 0 && isActive ? 'font-mono' : ''}`}>{t.value}</div>
            {t.sub && <div className="text-sm text-dram-muted mt-1">{t.sub}</div>}
          </div>
        ))}
      </div>
    </section>
  );
}

// ─── Exercise picker modal ───────────────────────────────────────────────────

function ExercisePicker({
  onSelect, onClose,
}: {
  onSelect: (exercise: Exercise) => void;
  onClose: () => void;
}) {
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [category, setCategory] = useState('');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState('');
  const [newCat, setNewCat] = useState('');
  const [newType, setNewType] = useState('weight');
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    Promise.all([
      exercisesApi.getAll(),
      exercisesApi.getCategories(),
    ]).then(([exs, cats]) => {
      setExercises(exs);
      setCategories(cats);
    }).catch(() => {}).finally(() => setLoading(false));
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

  async function handleCreate() {
    if (!newName.trim() || !newCat.trim()) return;
    setCreating(true);
    try {
      const ex = await exercisesApi.createCustom({ name: newName.trim(), category: newCat.trim(), exerciseType: newType });
      onSelect(ex);
    } catch {
      setCreating(false);
    }
  }

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
          <div className="flex gap-1 overflow-x-auto pb-1 scrollbar-hide">
            <button
              onClick={() => setCategory('')}
              className={`shrink-0 text-sm px-3 py-1 rounded-full transition-colors ${!category ? 'bg-dram-accent text-black font-semibold' : 'border border-dram-border text-dram-muted hover:text-white'}`}
            >
              All
            </button>
            {categories.map((c) => (
              <button
                key={c}
                onClick={() => setCategory(c === category ? '' : c)}
                className={`shrink-0 text-sm px-3 py-1 rounded-full transition-colors ${category === c ? 'bg-dram-accent text-black font-semibold' : 'border border-dram-border text-dram-muted hover:text-white'}`}
              >
                {c}
              </button>
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

        <div className="px-4 pb-4 pt-2 border-t border-dram-border shrink-0">
          {!showCreate ? (
            <button
              onClick={() => setShowCreate(true)}
              className="w-full text-sm text-dram-accent hover:brightness-110 transition-colors py-2 border border-dashed border-dram-border"
            >
              + Create custom exercise
            </button>
          ) : (
            <div className="space-y-2">
              <input
                autoFocus
                type="text"
                placeholder="Exercise name"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                className="w-full bg-dram-bg border border-dram-border rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-dram-accent"
              />
              <input
                type="text"
                placeholder="Category (e.g. Chest, Legs)"
                value={newCat}
                onChange={(e) => setNewCat(e.target.value)}
                className="w-full bg-dram-bg border border-dram-border rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-dram-accent"
              />
              <select
                value={newType}
                onChange={(e) => setNewType(e.target.value)}
                className="w-full bg-dram-bg border border-dram-border rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-dram-accent"
              >
                <option value="weight">Weight</option>
                <option value="bodyweight">Bodyweight</option>
                <option value="cardio">Cardio</option>
                <option value="duration">Duration</option>
                <option value="resistance">Resistance</option>
              </select>
              <div className="flex gap-2">
                <button
                  onClick={() => setShowCreate(false)}
                  className="flex-1 py-2 text-sm text-dram-muted hover:text-white transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleCreate}
                  disabled={creating || !newName.trim() || !newCat.trim()}
                  className="flex-1 bg-dram-accent hover:brightness-110 disabled:opacity-50 text-black text-sm font-semibold rounded-lg py-2 transition-colors"
                >
                  {creating ? 'Creating…' : 'Create & Add'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Main page ───────────────────────────────────────────────────────────────

export default function WorkoutDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [workout, setWorkout] = useState<WorkoutDetail | null>(null);
  const [lastSetsByExercise, setLastSetsByExercise] = useState<Record<number, Array<{ setNumber: number; reps: number | null; weightKg: number | null; durationSeconds: number | null; steps: number | null }>>>({});
  const [routineHistory, setRoutineHistory] = useState<WorkoutSummary[]>([]);
  const [bodyWeightKg, setBodyWeightKg] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [showPicker, setShowPicker] = useState(false);
  const [addingExercise, setAddingExercise] = useState(false);

  // Header editing
  const [editingName, setEditingName] = useState(false);
  const [name, setName] = useState('');
  const [duration, setDuration] = useState('');
  const [editingDate, setEditingDate] = useState(false);
  const [dateInput, setDateInput] = useState('');
  const nameRef = useRef<HTMLInputElement>(null);

  // Timer
  const [startedAt, setStartedAt] = useState<string | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  function startInterval(initialElapsed: number) {
    if (intervalRef.current) clearInterval(intervalRef.current);
    const clientStart = Date.now();
    intervalRef.current = setInterval(() => {
      setElapsedSeconds(initialElapsed + Math.floor((Date.now() - clientStart) / 1000));
    }, 1000);
  }

  useEffect(() => {
    if (!id) return;
    Promise.all([
      workoutsApi.get(Number(id)),
      measurementsApi.getAll(),
    ])
      .then(([w, measurements]) => {
        setWorkout(w);
        setName(w.name ?? '');
        setDuration(w.durationMinutes != null ? String(w.durationMinutes) : '');

        // Get most recent body weight for bodyweight volume calculation
        const weightMeasurement = measurements
          .filter((m) => m.metric === 'weight')
          .sort((a, b) => new Date(b.measuredAt).getTime() - new Date(a.measuredAt).getTime())[0];
        if (weightMeasurement) {
          const kg = weightMeasurement.unit === 'lbs'
            ? weightMeasurement.value / 2.20462
            : weightMeasurement.value;
          setBodyWeightKg(kg);
        }

        if (w.startedAt && !w.completed) {
          setStartedAt(w.startedAt);
          const initialElapsed = Math.max(0, Math.floor((Date.now() - new Date(w.startedAt).getTime()) / 1000));
          setElapsedSeconds(initialElapsed);
          startInterval(initialElapsed);
        }
        if (w.routineId) {
          workoutsApi.getAll({ limit: 50, routineId: w.routineId })
            .then((history) => setRoutineHistory(history))
            .catch(() => {});
          if (!w.completed) {
            routinesApi.get(w.routineId).then((routine) => {
              const map: Record<number, Array<{ setNumber: number; reps: number | null; weightKg: number | null; durationSeconds: number | null; steps: number | null }>> = {};
              for (const re of routine.exercises) {
                if (re.lastPerformedSets && re.lastPerformedSets.length > 0) {
                  map[re.exercise.id] = re.lastPerformedSets;
                }
              }
              setLastSetsByExercise(map);
            }).catch(() => {});
          }
        }
      })
      .catch(() => navigate('/workouts'))
      .finally(() => setLoading(false));
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [id]);

  useEffect(() => {
    if (editingName) nameRef.current?.focus();
  }, [editingName]);

  async function handleStartTimer() {
    if (!workout) return;
    try {
      const { startedAt: sa } = await workoutsApi.startTimer(workout.id);
      setStartedAt(sa);
      setElapsedSeconds(0);
      startInterval(0);
    } catch {
      // ignore
    }
  }

  async function handleFinish() {
    if (!workout || !startedAt) return;
    const durationMinutes = Math.ceil(elapsedSeconds / 60);
    if (intervalRef.current) clearInterval(intervalRef.current);
    setStartedAt(null);
    setDuration(String(durationMinutes));
    try {
      await workoutsApi.update(workout.id, { durationMinutes, completed: true });
      setWorkout((prev) => prev ? { ...prev, durationMinutes, startedAt: null } : prev);
    } catch {
      // ignore
    }
    // Non-blocking: estimate calories burned in the background
    workoutsApi.estimateCalories(workout.id)
      .then(({ caloriesBurned }) => {
        setWorkout((prev) => prev ? { ...prev, caloriesBurned } : prev);
      })
      .catch(() => { /* non-fatal */ });
  }

  async function saveHeader() {
    if (!workout) return;
    setEditingName(false);
    const newName = name.trim() || null;
    const newDur = duration !== '' ? Number(duration) : null;
    if (newName === workout.name && newDur === workout.durationMinutes) return;
    try {
      await workoutsApi.update(workout.id, {
        name: newName ?? undefined,
        durationMinutes: newDur ?? undefined,
      });
      setWorkout((prev) => prev ? { ...prev, name: newName, durationMinutes: newDur } : prev);
    } catch {
      // ignore
    }
  }

  async function saveDate() {
    if (!workout) return;
    setEditingDate(false);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateInput) || dateInput === workout.workoutDate) return;
    try {
      await workoutsApi.update(workout.id, { workoutDate: dateInput });
      setWorkout((prev) => prev ? { ...prev, workoutDate: dateInput } : prev);
    } catch {
      // ignore
    }
  }

  async function handleSelectExercise(exercise: Exercise) {
    if (!workout) return;
    setShowPicker(false);
    setAddingExercise(true);
    try {
      const we = await workoutsApi.addExercise(workout.id, exercise.id);
      setWorkout((prev) => prev ? { ...prev, exercises: [...prev.exercises, we] } : prev);
    } catch {
      // ignore
    } finally {
      setAddingExercise(false);
    }
  }

  async function handleRemoveExercise(weId: number) {
    if (!workout) return;
    try {
      await workoutsApi.removeExercise(workout.id, weId);
      setWorkout((prev) => prev ? { ...prev, exercises: prev.exercises.filter((e) => e.id !== weId) } : prev);
    } catch {
      // ignore
    }
  }

  function handleSetsChanged(weId: number, sets: ExerciseSet[]) {
    setWorkout((prev) => prev ? {
      ...prev,
      exercises: prev.exercises.map((e) => e.id === weId ? { ...e, sets } : e),
    } : prev);
  }

  async function handleDelete() {
    if (!workout || !confirm('Delete this workout?')) return;
    try {
      await workoutsApi.delete(workout.id);
      navigate('/workouts');
    } catch {
      // ignore
    }
  }

  if (loading) {
    return <div className="text-center text-sm text-dram-muted py-12">Loading…</div>;
  }

  if (!workout) return null;

  const isActive = startedAt != null;
  const totalSets = workout.exercises.reduce((sum, e) => sum + e.sets.length, 0);
  const totalVolumeLbs = workout.exercises.reduce((sum, we) =>
    sum + we.sets.reduce((s2, set) => {
      if (!set.completed || set.reps == null) return s2;

      if (set.weightKg != null) {
        return s2 + set.reps * kgToLbs(set.weightKg);
      }

      if (we.exercise.exerciseType === 'bodyweight' && bodyWeightKg) {
        return s2 + set.reps * kgToLbs(bodyWeightKg);
      }

      return s2;
    }, 0), 0);

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="flex-shrink-0 px-6 pt-5 pb-4 border-b border-dram-border flex items-start gap-3">
        <button
          onClick={() => navigate(-1)}
          className="text-dram-muted hover:text-white transition-colors mt-0.5 shrink-0"
        >
          ←
        </button>
        <div className="flex-1 min-w-0">
          {editingName ? (
            <input
              ref={nameRef}
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onBlur={saveHeader}
              onKeyDown={(e) => { if (e.key === 'Enter') saveHeader(); if (e.key === 'Escape') { setEditingName(false); setName(workout.name ?? ''); } }}
              placeholder="Workout name (optional)"
              className="w-full bg-transparent text-xl font-semibold text-white focus:outline-none border-b border-dram-border"
            />
          ) : (
            <button
              onClick={() => setEditingName(true)}
              className="text-left text-xl font-semibold text-white hover:text-white transition-colors w-full truncate"
            >
              {workout.name ?? new Date(workout.workoutDate + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}
            </button>
          )}
          <div className="flex items-center gap-2 mt-0.5">
            {editingDate ? (
              <input
                type="date"
                value={dateInput}
                onChange={(e) => setDateInput(e.target.value)}
                onBlur={saveDate}
                onKeyDown={(e) => { if (e.key === 'Enter') saveDate(); if (e.key === 'Escape') setEditingDate(false); }}
                autoFocus
                className="bg-dram-bg border border-dram-accent rounded px-2 py-0.5 text-sm text-white focus:outline-none"
              />
            ) : (
              <button
                onClick={() => { setDateInput(workout.workoutDate); setEditingDate(true); }}
                className="text-sm text-dram-muted hover:text-white transition-colors"
              >
                {new Date(workout.workoutDate + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}
              </button>
            )}
          </div>
          <div className="flex items-center gap-3 mt-1 flex-wrap">
            <span className="text-sm text-dram-muted">
              {workout.exercises.length} exercise{workout.exercises.length !== 1 ? 's' : ''} · {totalSets} set{totalSets !== 1 ? 's' : ''}
            </span>
            {isActive ? (
              <>
                {totalVolumeLbs > 0 && (
                  <span className="text-sm text-dram-muted">{Math.round(totalVolumeLbs).toLocaleString()} lbs</span>
                )}
              </>
            ) : (
              <>
                {totalVolumeLbs > 0 && (
                  <>
                    <span className="text-dram-muted text-sm">·</span>
                    <span className="text-sm text-dram-muted">{Math.round(totalVolumeLbs).toLocaleString()} lbs</span>
                  </>
                )}
                <span className="text-dram-muted text-sm">·</span>
                <div className="flex items-center gap-1">
                  <input
                    type="number"
                    min="0"
                    placeholder="—"
                    value={duration}
                    onChange={(e) => setDuration(e.target.value)}
                    onBlur={saveHeader}
                    className="w-14 bg-dram-bg border border-dram-border rounded px-2 py-0.5 text-sm text-white text-center focus:outline-none focus:border-dram-accent"
                  />
                  <span className="text-sm text-dram-muted">min</span>
                </div>
                {workout.caloriesBurned != null && (
                  <>
                    <span className="text-dram-muted text-sm">·</span>
                    <span className="text-sm text-dram-muted">{workout.caloriesBurned.toLocaleString()} kcal</span>
                  </>
                )}
              </>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0 mt-1">
          {isActive ? (
            <button
              onClick={handleFinish}
              className="bg-dram-accent hover:brightness-110 text-black font-semibold rounded-lg px-4 py-2 text-sm transition-colors"
            >
              Finish
            </button>
          ) : (
            <button
              onClick={handleStartTimer}
              className="text-sm text-dram-accent hover:brightness-110 transition-colors"
            >
              Start Timer
            </button>
          )}
          <button
            onClick={handleDelete}
            className="border border-dram-border text-dram-muted hover:text-red-400 hover:border-red-900/40 rounded-lg px-3 py-1.5 text-sm transition-colors"
            title="Delete workout"
          >
            Delete
          </button>
        </div>
      </div>

      {/* Stats band */}
      <WorkoutStatsBand
        workout={workout}
        elapsedSeconds={elapsedSeconds}
        isActive={isActive}
        totalVolumeLbs={totalVolumeLbs}
        routineHistory={routineHistory}
      />

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto">
        <div className="px-9 py-5 space-y-4">

          {/* Exercises header */}
          <div className="flex items-center gap-3">
            <div style={{ width: 14, height: 2, background: '#D4A843' }} />
            <h2 className="text-sm font-semibold uppercase tracking-wider text-white">
              Exercises ({workout.exercises.length})
            </h2>
          </div>

      {/* Exercises */}
      {workout.exercises.map((we) => (
        <div key={we.id} className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <ExerciseBlock
            we={we}
            workoutId={workout.id}
            isActive={isActive}
            lastSets={lastSetsByExercise[we.exercise.id] ?? null}
            onRemove={handleRemoveExercise}
            onSetsChanged={handleSetsChanged}
          />
          <div className="bg-dram-card border border-dram-border p-4 flex items-center justify-center">
            {we.exercise.mediaUrl && (
              <div className="w-11/12">
                <MediaEmbed url={we.exercise.mediaUrl} />
              </div>
            )}
          </div>
          <div className="bg-dram-card border border-dram-border p-4 overflow-y-auto">
            {we.exercise.instructions ? (
              <>
                <div className="text-xs font-semibold uppercase tracking-wider text-dram-muted mb-3">Instructions</div>
                <p className="text-sm text-white whitespace-pre-line leading-relaxed">{we.exercise.instructions}</p>
              </>
            ) : (
              <div className="text-sm text-dram-muted">No instructions available</div>
            )}
          </div>
        </div>
      ))}

      {/* Add exercise button */}
      <button
        onClick={() => setShowPicker(true)}
        disabled={addingExercise}
        className="w-full py-3 text-sm text-dram-accent hover:brightness-110 disabled:opacity-50 transition-colors border border-dashed border-dram-border"
      >
        {addingExercise ? 'Adding…' : '+ Add Exercise'}
      </button>

      {showPicker && (
        <ExercisePicker
          onSelect={handleSelectExercise}
          onClose={() => setShowPicker(false)}
        />
      )}
        </div>
      </div>
    </div>
  );
}
