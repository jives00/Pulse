import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { workoutsApi, exercisesApi, type WorkoutDetail, type WorkoutExercise, type ExerciseSet, type Exercise } from '@pulse/api-client';

// ─── helpers ────────────────────────────────────────────────────────────────

const KG_TO_LBS = 2.20462;

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
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
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

function formatElapsed(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  const mm = String(m).padStart(2, '0');
  const ss = String(s).padStart(2, '0');
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
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

  const [reps, setReps]         = useState(String(set.reps ?? ''));
  const [weight, setWeight]     = useState(fmtWeight(set.weightKg));
  const [duration, setDuration] = useState(secondsToMMSS(set.durationSeconds));
  const [distance, setDistance] = useState(String(set.distanceMeters ?? ''));
  const [saving, setSaving]     = useState(false);

  async function handleBlur() {
    if (saving) return;
    const newReps        = trackReps     && reps     !== '' ? Number(reps)    : null;
    const newWeightLbs   = trackWeight   && weight   !== '' ? Number(weight)  : null;
    const newWeightKg    = newWeightLbs != null ? lbsToKg(newWeightLbs) : null;
    const newDurSeconds  = trackDuration ? mmssToSeconds(duration)             : null;
    const newDistMeters  = trackDistance && distance !== '' ? Number(distance) : null;

    const unchanged =
      newReps       === set.reps &&
      newWeightKg   === set.weightKg &&
      newDurSeconds === set.durationSeconds &&
      newDistMeters === set.distanceMeters;
    if (unchanged) return;

    setSaving(true);
    try {
      await workoutsApi.updateSet(workoutId, weId, set.id, {
        reps: newReps ?? undefined,
        weightKg: newWeightKg ?? undefined,
        durationSeconds: newDurSeconds ?? undefined,
        distanceMeters: newDistMeters ?? undefined,
        completed: set.completed,
      });
      onUpdated({ ...set, reps: newReps, weightKg: newWeightKg, durationSeconds: newDurSeconds, distanceMeters: newDistMeters });
    } catch {
      setReps(String(set.reps ?? ''));
      setWeight(fmtWeight(set.weightKg));
      setDuration(secondsToMMSS(set.durationSeconds));
      setDistance(String(set.distanceMeters ?? ''));
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

  const inputCls = 'w-full bg-slate-700 border border-slate-600 rounded px-2 py-1.5 text-sm text-slate-100 text-center focus:outline-none focus:border-blue-500';
  const rowCls = isActive && !set.completed ? 'opacity-60' : '';

  const fieldCount = [trackWeight, trackReps, trackDuration, trackDistance].filter(Boolean).length;
  const dataCols = `repeat(${fieldCount}, 1fr)`;
  const gridTemplateColumns = isActive
    ? `2rem ${dataCols} 2rem 2rem`
    : `2rem ${dataCols} 2rem`;

  return (
    <div className={`grid gap-2 items-center py-1 transition-opacity ${rowCls}`} style={{ gridTemplateColumns }}>
      <span className="text-sm text-slate-500 text-center">{set.setNumber}</span>
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
      {isActive && (
        <button
          onClick={handleToggleComplete}
          className={`w-7 h-7 rounded border-2 flex items-center justify-center transition-colors shrink-0 mx-auto ${
            set.completed
              ? 'bg-green-600 border-green-600 text-white'
              : 'border-slate-600 text-transparent hover:border-slate-400'
          }`}
          title={set.completed ? 'Mark incomplete' : 'Mark complete'}
        >
          ✓
        </button>
      )}
      <button
        onClick={handleDelete}
        className="text-slate-600 hover:text-red-400 transition-colors text-base leading-none"
        title="Remove set"
      >
        ✕
      </button>
    </div>
  );
}

// ─── Exercise block ──────────────────────────────────────────────────────────

function ExerciseBlock({
  we, workoutId, isActive, onRemove, onSetsChanged,
}: {
  we: WorkoutExercise;
  workoutId: number;
  isActive: boolean;
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

  const fieldCount = [trackWeight, trackReps, trackDuration, trackDistance].filter(Boolean).length;
  const dataCols = `repeat(${fieldCount}, 1fr)`;
  const gridTemplateColumns = isActive
    ? `2rem ${dataCols} 2rem 2rem`
    : `2rem ${dataCols} 2rem`;

  return (
    <div className="bg-slate-800 rounded-lg p-4">
      <div className="flex items-start justify-between mb-3">
        <div>
          <Link
            to={`/workouts/exercises/${we.exercise.id}`}
            className="text-base font-medium text-slate-200 hover:text-blue-400 transition-colors"
          >
            {we.exercise.name}
          </Link>
          <div className="text-sm text-slate-500">{we.exercise.category}</div>
        </div>
        <button
          onClick={() => onRemove(we.id)}
          className="text-slate-600 hover:text-red-400 transition-colors text-sm ml-2 shrink-0"
          title="Remove exercise"
        >
          Remove
        </button>
      </div>

      {sets.length > 0 && (
        <div className="mb-2">
          <div className="grid gap-2 mb-1" style={{ gridTemplateColumns }}>
            <span />
            {trackWeight   && <span className="text-sm text-slate-500 text-center">lbs</span>}
            {trackReps     && <span className="text-sm text-slate-500 text-center">reps</span>}
            {trackDuration && <span className="text-sm text-slate-500 text-center">time</span>}
            {trackDistance && <span className="text-sm text-slate-500 text-center">dist</span>}
            {isActive      && <span className="text-sm text-slate-500 text-center">✓</span>}
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
        className="w-full text-sm text-blue-400 hover:text-blue-300 disabled:opacity-50 transition-colors py-1.5 border border-dashed border-slate-700 rounded"
      >
        {adding ? 'Adding…' : '+ Add set'}
      </button>
    </div>
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
        className="bg-slate-800 rounded-t-2xl sm:rounded-2xl w-full sm:max-w-lg max-h-[80vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 pt-4 pb-2 shrink-0">
          <h2 className="text-base font-semibold text-slate-200">Add Exercise</h2>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-300 text-xl leading-none">×</button>
        </div>

        <div className="px-4 pb-2 space-y-2 shrink-0">
          <input
            autoFocus
            type="text"
            placeholder="Search…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-blue-500"
          />
          <div className="flex gap-1 overflow-x-auto pb-1 scrollbar-hide">
            <button
              onClick={() => setCategory('')}
              className={`shrink-0 text-sm px-3 py-1 rounded-full transition-colors ${!category ? 'bg-blue-600 text-white' : 'bg-slate-700 text-slate-400 hover:text-slate-200'}`}
            >
              All
            </button>
            {categories.map((c) => (
              <button
                key={c}
                onClick={() => setCategory(c === category ? '' : c)}
                className={`shrink-0 text-sm px-3 py-1 rounded-full transition-colors ${category === c ? 'bg-blue-600 text-white' : 'bg-slate-700 text-slate-400 hover:text-slate-200'}`}
              >
                {c}
              </button>
            ))}
          </div>
        </div>

        <div className="overflow-y-auto flex-1 px-2 pb-2">
          {loading && <div className="text-center text-sm text-slate-500 py-6">Loading…</div>}
          {!loading && filtered.map((ex) => (
            <button
              key={ex.id}
              onClick={() => onSelect(ex)}
              className="w-full text-left px-3 py-2.5 rounded-lg hover:bg-slate-700 transition-colors"
            >
              <div className="text-base text-slate-200">{ex.name}</div>
              <div className="text-sm text-slate-500">{ex.category} · {ex.exerciseType}</div>
            </button>
          ))}
          {!loading && filtered.length === 0 && (
            <div className="text-center text-sm text-slate-500 py-6">No exercises found</div>
          )}
        </div>

        <div className="px-4 pb-4 pt-2 border-t border-slate-700 shrink-0">
          {!showCreate ? (
            <button
              onClick={() => setShowCreate(true)}
              className="w-full text-sm text-blue-400 hover:text-blue-300 transition-colors py-2 border border-dashed border-slate-700 rounded-lg"
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
                className="w-full bg-slate-700 border border-slate-600 rounded px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-blue-500"
              />
              <input
                type="text"
                placeholder="Category (e.g. Chest, Legs)"
                value={newCat}
                onChange={(e) => setNewCat(e.target.value)}
                className="w-full bg-slate-700 border border-slate-600 rounded px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-blue-500"
              />
              <select
                value={newType}
                onChange={(e) => setNewType(e.target.value)}
                className="w-full bg-slate-700 border border-slate-600 rounded px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-blue-500"
              >
                <option value="weight">Weight</option>
                <option value="bodyweight">Bodyweight</option>
                <option value="cardio">Cardio</option>
                <option value="duration">Duration</option>
              </select>
              <div className="flex gap-2">
                <button
                  onClick={() => setShowCreate(false)}
                  className="flex-1 py-2 text-sm text-slate-400 hover:text-slate-200 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleCreate}
                  disabled={creating || !newName.trim() || !newCat.trim()}
                  className="flex-1 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-sm font-medium rounded-lg py-2 transition-colors"
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
    workoutsApi.get(Number(id))
      .then((w) => {
        setWorkout(w);
        setName(w.name ?? '');
        setDuration(w.durationMinutes != null ? String(w.durationMinutes) : '');
        if (w.startedAt) {
          setStartedAt(w.startedAt);
          const initialElapsed = Math.max(0, Math.floor((Date.now() - new Date(w.startedAt).getTime()) / 1000));
          setElapsedSeconds(initialElapsed);
          startInterval(initialElapsed);
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
      await workoutsApi.update(workout.id, { durationMinutes });
      setWorkout((prev) => prev ? { ...prev, durationMinutes, startedAt: null } : prev);
    } catch {
      // ignore
    }
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
    return <div className="text-center text-sm text-slate-500 py-12">Loading…</div>;
  }

  if (!workout) return null;

  const isActive = startedAt != null;
  const totalSets = workout.exercises.reduce((sum, e) => sum + e.sets.length, 0);
  const totalVolumeLbs = workout.exercises.reduce((sum, we) =>
    sum + we.sets.reduce((s2, set) => {
      if (set.completed && set.reps != null && set.weightKg != null) {
        return s2 + set.reps * kgToLbs(set.weightKg);
      }
      return s2;
    }, 0), 0);

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 space-y-4">
      {/* Header */}
      <div className="flex items-start gap-3">
        <button
          onClick={() => navigate('/workouts')}
          className="text-slate-500 hover:text-slate-300 transition-colors mt-0.5 shrink-0"
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
              className="w-full bg-transparent text-xl font-semibold text-slate-200 focus:outline-none border-b border-slate-600"
            />
          ) : (
            <button
              onClick={() => setEditingName(true)}
              className="text-left text-xl font-semibold text-slate-200 hover:text-white transition-colors w-full truncate"
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
                className="bg-slate-800 border border-blue-500 rounded px-2 py-0.5 text-sm text-slate-300 focus:outline-none"
              />
            ) : (
              <button
                onClick={() => { setDateInput(workout.workoutDate); setEditingDate(true); }}
                className="text-sm text-slate-500 hover:text-slate-300 transition-colors"
              >
                {new Date(workout.workoutDate + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}
              </button>
            )}
          </div>
          <div className="flex items-center gap-3 mt-1 flex-wrap">
            <span className="text-sm text-slate-500">
              {workout.exercises.length} exercise{workout.exercises.length !== 1 ? 's' : ''} · {totalSets} set{totalSets !== 1 ? 's' : ''}
            </span>
            {isActive ? (
              <>
                <span className="text-sm font-mono text-green-400">{formatElapsed(elapsedSeconds)}</span>
                {totalVolumeLbs > 0 && (
                  <span className="text-sm text-slate-400">{Math.round(totalVolumeLbs).toLocaleString()} lbs</span>
                )}
              </>
            ) : (
              <div className="flex items-center gap-1">
                <input
                  type="number"
                  min="0"
                  placeholder="min"
                  value={duration}
                  onChange={(e) => setDuration(e.target.value)}
                  onBlur={saveHeader}
                  className="w-14 bg-slate-800 border border-slate-700 rounded px-2 py-0.5 text-sm text-slate-300 text-center focus:outline-none focus:border-blue-500"
                />
                <span className="text-sm text-slate-500">min</span>
              </div>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0 mt-1">
          {isActive ? (
            <button
              onClick={handleFinish}
              className="text-sm bg-green-700 hover:bg-green-600 text-white px-3 py-1 rounded-lg transition-colors"
            >
              Finish
            </button>
          ) : (
            <button
              onClick={handleStartTimer}
              className="text-sm text-blue-400 hover:text-blue-300 transition-colors"
            >
              Start Timer
            </button>
          )}
          <button
            onClick={handleDelete}
            className="text-slate-600 hover:text-red-400 transition-colors text-sm"
            title="Delete workout"
          >
            Delete
          </button>
        </div>
      </div>

      {/* Exercises */}
      {workout.exercises.map((we) => (
        <ExerciseBlock
          key={we.id}
          we={we}
          workoutId={workout.id}
          isActive={isActive}
          onRemove={handleRemoveExercise}
          onSetsChanged={handleSetsChanged}
        />
      ))}

      {/* Add exercise button */}
      <button
        onClick={() => setShowPicker(true)}
        disabled={addingExercise}
        className="w-full py-3 text-sm text-blue-400 hover:text-blue-300 disabled:opacity-50 transition-colors border border-dashed border-slate-700 rounded-lg"
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
  );
}
