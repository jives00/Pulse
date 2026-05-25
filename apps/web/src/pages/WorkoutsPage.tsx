import { useState, useEffect, useRef, useImperativeHandle, forwardRef } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import QuickLogModal from '../components/QuickLogModal';
import {
  workoutsApi, routinesApi, exercisesApi, stepsApi,
  type WorkoutSummary, type WorkoutDetail,
  type RoutineSummary, type Exercise,
  KG_TO_LBS, secondsToMMSS,
} from '@pulse/api-client';
import Spinner from '../components/Spinner';
import { useSettingsStore } from '../store/settings';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function localDateStr(d: Date = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

// ─── Routines tab ────────────────────────────────────────────────────────────

const EXERCISE_TYPES_TAB = ['weight', 'bodyweight', 'cardio', 'duration', 'resistance'] as const;

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

function RoutineCardInTab({ routine }: { routine: RoutineSummary }) {
  const navigate = useNavigate();

  return (
    <div
      onClick={() => navigate(`/workouts/routines/${routine.id}`)}
      className="bg-dram-card overflow-hidden border border-dram-border hover:border-dram-accent/50 transition cursor-pointer group"
    >
      {/* Image */}
      <div className="aspect-square bg-dram-bg relative overflow-hidden">
        {routine.coverImageUrl ? (
          <img src={routine.coverImageUrl} alt={routine.name} className="w-full h-full object-cover group-hover:opacity-80 transition" />
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center gap-1 group-hover:bg-dram-border/20 transition">
            <span className="text-4xl font-bold text-dram-accent leading-none">{routine.exerciseCount}</span>
            <span className="text-sm text-gray-500 uppercase tracking-wide">exercise{routine.exerciseCount !== 1 ? 's' : ''}</span>
          </div>
        )}
      </div>

      {/* Info */}
      <div className="p-3">
        <p className="font-semibold text-white text-sm leading-snug line-clamp-2">{routine.name}</p>
        <p className="text-slate-400 text-sm mt-0.5">
          {routine.lastUsedDate
            ? `Last used ${new Date(routine.lastUsedDate + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`
            : 'Never used'}
        </p>
      </div>
    </div>
  );
}

export interface RoutinesTabHandle { openCreate: () => void; }

const STEPS_GOAL = 10_000;

const RoutinesTab = forwardRef<RoutinesTabHandle>(function RoutinesTab(_, ref) {
  const navigate = useNavigate();
  const [routines, setRoutines] = useState<RoutineSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeWorkout, setActiveWorkout] = useState<WorkoutDetail | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState('');
  const [newNotes, setNewNotes] = useState('');
  const [creating, setCreating] = useState(false);

  useImperativeHandle(ref, () => ({ openCreate: () => setShowCreate(true) }));

  useEffect(() => {
    Promise.all([
      routinesApi.getAll(),
      workoutsApi.getActive().catch(() => null),
    ]).then(([rs, active]) => {
      setRoutines(rs);
      setActiveWorkout(active);
    }).catch(() => {}).finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!showCreate) return;
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') setShowCreate(false); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [showCreate]);


  async function handleCreate() {
    if (!newName.trim()) return;
    setCreating(true);
    try {
      const routine = await routinesApi.create({ name: newName.trim(), notes: newNotes.trim() || undefined });
      navigate(`/workouts/routines/${routine.id}`);
    } catch { setCreating(false); }
  }

  return (
    <>
      {activeWorkout && (
        <div className="mx-9 mt-2 bg-dram-accent/10 border border-dram-accent/40 px-4 py-3 flex items-center gap-3">
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

      <div className="px-9 py-4">
        {loading ? (
          <div className="flex justify-center mt-8"><Spinner size={10} /></div>
        ) : routines.length === 0 ? (
          <div className="flex flex-col items-center mt-12 text-gray-600">
            <span className="text-5xl mb-3">📋</span>
            <p className="text-lg">No routines yet.</p>
            <button onClick={() => setShowCreate(true)} className="text-dram-accent hover:underline text-sm mt-1">Create your first routine</button>
          </div>
        ) : (
          <div className="grid gap-4 grid-cols-2 md:grid-cols-3 lg:grid-cols-6">
            {[...routines]
              .sort((a, b) => {
                // Sort by next scheduled occurrence first, then routines without schedule at the end
                const aHasNext = a.nextOccurrenceDate != null;
                const bHasNext = b.nextOccurrenceDate != null;
                if (aHasNext && !bHasNext) return -1;
                if (!aHasNext && bHasNext) return 1;
                if (aHasNext && bHasNext) {
                  return a.nextOccurrenceDate!.localeCompare(b.nextOccurrenceDate!);
                }
                return 0;
              })
              .map((r) => {
                return <RoutineCardInTab key={r.id} routine={r} />;
              })}
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
    </>
  );
});

// ─── Exercises section ────────────────────────────────────────────────────────

interface ExerciseFormState {
  name: string; category: string; customCategory: string; exerciseType: string; trackedFields: string[];
}
const EMPTY_EX_FORM: ExerciseFormState = { name: '', category: '', customCategory: '', exerciseType: 'weight', trackedFields: ['reps', 'weight'] };

function ExerciseCardInTab({ exercise }: { exercise: Exercise }) {
  const imgSrc = exercise.coverImageUrl ?? null;
  const emoji = CATEGORY_EMOJI_TAB[exercise.category.toLowerCase()] ?? '🏋️';
  return (
    <div className="bg-dram-card overflow-hidden border border-dram-border hover:border-dram-accent/50 transition group">
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
        <p className="text-dram-muted text-sm mt-0.5 capitalize">{exercise.category} · {exercise.exerciseType}</p>
        <div className="flex flex-wrap gap-1 mt-2">
          {exercise.musclesPrimary?.slice(0, 2).map((m) => (
            <span key={m} className="text-sm border border-dram-accent/40 text-dram-accent rounded-full px-2 py-0.5 capitalize">{m}</span>
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
    <>
      <div className="px-9 pt-3 pb-3 flex items-center gap-3">
        <input
          type="text" placeholder="🔍 Search exercises…" value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-64 shrink-0 bg-dram-card border border-dram-border rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-dram-accent"
        />
        <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-hide flex-1">
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

      <div className="px-9 pb-6">
        {loading ? (
          <div className="flex justify-center mt-8"><Spinner size={10} /></div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center mt-12 text-gray-600">
            <span className="text-5xl mb-3">🏋️</span>
            <p className="text-lg">No exercises found.</p>
          </div>
        ) : (
          <div className="grid gap-4 grid-cols-2 md:grid-cols-3 lg:grid-cols-6">
            {filtered.map((ex) => <ExerciseCardInTab key={ex.id} exercise={ex} />)}
          </div>
        )}
      </div>

      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={closeForm}>
          <div className="bg-dram-card border border-dram-border rounded-xl w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto p-6 space-y-5" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-base font-semibold text-dram-accent">New Exercise</h2>
            <div className="space-y-1.5">
              <label className="text-sm font-semibold text-dram-accent/50 uppercase tracking-wide">Name</label>
              <input autoFocus type="text" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="Exercise name"
                className="w-full bg-dram-bg border border-dram-border rounded-lg px-3 py-2 text-sm text-dram-accent placeholder:text-dram-accent/30 focus:outline-none focus:border-dram-accent/50" />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-semibold text-dram-accent/50 uppercase tracking-wide">Category</label>
              {!useCustomCat && (
                <div className="flex flex-wrap gap-1.5">
                  {categories.map((cat) => (
                    <button key={cat} onClick={() => setForm((f) => ({ ...f, category: cat }))}
                      className={`text-sm px-3 py-1 rounded-full border transition-colors ${form.category === cat ? 'bg-dram-accent text-dram-bg border-dram-accent font-semibold' : 'text-dram-accent/60 border-dram-border hover:border-dram-accent/40'}`}
                    >{cat}</button>
                  ))}
                </div>
              )}
              {useCustomCat && (
                <input type="text" value={form.customCategory} onChange={(e) => setForm((f) => ({ ...f, customCategory: e.target.value }))} placeholder="New category name"
                  className="w-full bg-dram-bg border border-dram-border rounded-lg px-3 py-2 text-sm text-dram-accent placeholder:text-dram-accent/30 focus:outline-none focus:border-dram-accent/50" />
              )}
              <button onClick={() => setUseCustomCat((v) => !v)} className="text-sm text-dram-accent/50 hover:text-dram-accent transition-colors">
                {useCustomCat ? '← Pick existing' : '+ New category'}
              </button>
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-semibold text-dram-accent/50 uppercase tracking-wide">Type</label>
              <div className="flex flex-wrap gap-1.5">
                {EXERCISE_TYPES_TAB.map((t) => (
                  <button key={t} onClick={() => setForm((f) => ({ ...f, exerciseType: t, trackedFields: defaultTrackedFieldsTab(t) }))}
                    className={`text-sm px-3 py-1 rounded-full border transition-colors ${form.exerciseType === t ? 'bg-dram-accent text-dram-bg border-dram-accent font-semibold' : 'text-dram-accent/60 border-dram-border hover:border-dram-accent/40'}`}
                  >{t}</button>
                ))}
              </div>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-semibold text-dram-accent/50 uppercase tracking-wide">Track Per Set</label>
              <div className="flex flex-wrap gap-2">
                {TRACKED_FIELD_OPTIONS_TAB.map(({ key, label }) => {
                  const checked = form.trackedFields.includes(key);
                  return (
                    <button key={key} type="button"
                      onClick={() => setForm((f) => ({ ...f, trackedFields: checked ? f.trackedFields.filter((x) => x !== key) : [...f.trackedFields, key] }))}
                      className={`text-sm px-3 py-1 rounded-full border transition-colors ${checked ? 'bg-dram-accent text-dram-bg border-dram-accent font-semibold' : 'text-dram-accent/60 border-dram-border hover:border-dram-accent/40'}`}
                    >{label}</button>
                  );
                })}
              </div>
              <p className="text-sm text-gray-500">Defaults set by type. Toggle to mix (e.g. stairs = Duration + Reps).</p>
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
    </>
  );
});

// ─── Hero banner ─────────────────────────────────────────────────────────────

const ACCENT = '#D4A843';

const MI_TO_M = 1609.344;

function fmtDistanceMi(meters: number): string {
  const miles = meters / MI_TO_M;
  return miles >= 0.1 ? `${miles.toFixed(2)} mi` : `${Math.round(meters / 0.3048)} ft`;
}

function fmtPaceMiPerMin(distanceMeters: number, durationSeconds: number): string | null {
  if (distanceMeters <= 0 || durationSeconds <= 0) return null;
  const secPerMile = (durationSeconds / (distanceMeters / MI_TO_M));
  const m = Math.floor(secPerMile / 60);
  const s = Math.round(secPerMile % 60);
  return `${m}:${String(s).padStart(2, '0')}/mi`;
}

interface WeekStats { count: number; calsBurned: number; volumeLbs: number }

function WorkoutHeroBanner() {
  const today = localDateStr();
  const [todayWorkouts, setTodayWorkouts] = useState<WorkoutSummary[]>([]);
  const [week7, setWeek7] = useState<WeekStats | null>(null);
  const [prev7, setPrev7] = useState<WeekStats | null>(null);
  const [steps, setSteps] = useState<number | null>(null);
  const [stepsInput, setStepsInput] = useState('');
  const [savingSteps, setSavingSteps] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      workoutsApi.getAll({ limit: 100 }),
      stepsApi.getDay(today).catch(() => null),
    ]).then(([workouts, stepsDay]) => {
      const dayOffset = (n: number) => {
        const d = new Date(today + 'T12:00:00');
        d.setDate(d.getDate() - n);
        return localDateStr(d);
      };
      const sevenDaysAgo    = dayOffset(6);
      const fourteenDaysAgo = dayOffset(13);

      const summarize = (list: WorkoutSummary[]): WeekStats => ({
        count: list.length,
        calsBurned: list.reduce((s, w) => s + (w.caloriesBurned ?? 0), 0),
        volumeLbs: list.reduce((s, w) => s + (w.totalVolumeKg ?? 0) * KG_TO_LBS, 0),
      });

      setTodayWorkouts(workouts.filter((w) => w.workoutDate === today));
      setWeek7(summarize(workouts.filter((w) => w.workoutDate >= sevenDaysAgo)));
      setPrev7(summarize(workouts.filter((w) => w.workoutDate >= fourteenDaysAgo && w.workoutDate < sevenDaysAgo)));
      setSteps(stepsDay?.steps ?? null);
    }).catch(() => {}).finally(() => setLoading(false));
  }, []);

  async function handleSaveSteps() {
    const n = parseInt(stepsInput, 10);
    if (isNaN(n) || n < 0) return;
    setSavingSteps(true);
    try {
      const result = await stepsApi.log(today, n);
      setSteps(result.steps ?? n);
      setStepsInput('');
    } finally {
      setSavingSteps(false);
    }
  }

  if (loading) return null;

  const primaryWorkout = todayWorkouts[0] ?? null;
  const todayMinutes = todayWorkouts.reduce((s, w) => s + (w.durationMinutes ?? 0), 0);
  const todayCals = todayWorkouts.reduce((s, w) => s + (w.caloriesBurned ?? 0), 0);

  const stepsCount = steps ?? 0;
  const stepsPct = Math.min(stepsCount / STEPS_GOAL, 1);

  return (
    <section style={{ padding: '20px 36px 16px', borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
      {/* Band header */}
      <div className="flex items-center gap-3 mb-4">
        <div style={{ width: 14, height: 2, background: ACCENT }} />
        <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-300">Stats</h2>
      </div>

      {/* Stat tiles */}
      <div className="grid grid-cols-3 gap-3">
        {/* Today's workout */}
        <div className="bg-dram-card border border-dram-border px-5 py-4">
          <div className="flex items-center gap-1.5 mb-2">
            <span className="text-sm font-semibold uppercase tracking-wider" style={{ color: ACCENT }}>Today</span>
          </div>
          {todayWorkouts.length > 0 ? (
            <div>
              {/* Routine name header — only when there IS a named routine */}
              {primaryWorkout?.routineName && (
                <div className="flex items-center gap-3 mb-2">
                  <p className="text-base font-bold text-white leading-snug truncate flex-1 min-w-0">
                    {primaryWorkout.routineName}
                  </p>
                  <div className="flex items-center gap-2 shrink-0 text-sm text-slate-300">
                    {todayMinutes > 0 && <span>{todayMinutes} min</span>}
                    {todayCals > 0 && <span>{todayCals.toLocaleString()} kcal</span>}
                  </div>
                </div>
              )}
              {/* All exercises from all today's workouts, flat */}
              <div className="space-y-0.5">
                {todayWorkouts.flatMap((w, wi) =>
                  w.exercises.map((ex, ei) => {
                    const wCals = w.caloriesBurned ?? 0;

                    if (ex.totalSteps != null) {
                      const pace = ex.totalSteps && ex.totalDurationSeconds && ex.totalDurationSeconds > 0
                        ? Math.round(ex.totalSteps / (ex.totalDurationSeconds / 60))
                        : null;
                      return (
                        <div key={`${wi}-${ei}`} className="flex items-center justify-between text-sm">
                          <span className="text-slate-400 truncate shrink-0 mr-2">{ex.name}</span>
                          <div className="flex items-center gap-2 text-slate-300 flex-wrap justify-end">
                            <span>{ex.totalSteps.toLocaleString()} stairs</span>
                            {ex.totalDurationSeconds != null && <span>{secondsToMMSS(ex.totalDurationSeconds)}</span>}
                            {wCals > 0 && <span>{wCals.toLocaleString()} kcal</span>}
                            {pace != null && <span>{pace} stairs/min</span>}
                          </div>
                        </div>
                      );
                    }

                    if (ex.totalDistanceMeters != null) {
                      const pace = fmtPaceMiPerMin(ex.totalDistanceMeters, ex.totalDurationSeconds ?? 0);
                      return (
                        <div key={`${wi}-${ei}`} className="flex items-center justify-between text-sm">
                          <span className="text-slate-400 truncate shrink-0 mr-2">{ex.name}</span>
                          <div className="flex items-center gap-2 text-slate-300 flex-wrap justify-end">
                            {ex.totalDurationSeconds != null && <span>{secondsToMMSS(ex.totalDurationSeconds)}</span>}
                            <span>{fmtDistanceMi(ex.totalDistanceMeters)}</span>
                            {wCals > 0 && <span>{wCals.toLocaleString()} kcal</span>}
                            {pace != null && <span>{pace}</span>}
                          </div>
                        </div>
                      );
                    }

                    return (
                      <div key={`${wi}-${ei}`} className="flex items-center justify-between text-sm">
                        <span className="text-slate-400 truncate">{ex.name}</span>
                        <span className="text-slate-600 shrink-0 ml-2">{ex.setCount} set{ex.setCount !== 1 ? 's' : ''}</span>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          ) : (
            <p className="text-sm text-slate-500 mt-1">No workout yet today</p>
          )}
        </div>

        {/* Last 7 days */}
        {(() => {
          const trendPct = (week7 && prev7 && prev7.volumeLbs > 0)
            ? Math.round(((week7.volumeLbs - prev7.volumeLbs) / prev7.volumeLbs) * 100)
            : null;
          const trendUp = trendPct !== null ? trendPct >= 0 : null;
          return (
            <div className="bg-dram-card border border-dram-border px-5 py-4">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-1.5">
                  <span className="text-sm font-semibold uppercase tracking-wider" style={{ color: ACCENT }}>Last 7 Days</span>
                </div>
                {trendPct !== null && (
                  <span className={`text-sm font-bold ${trendUp ? 'text-emerald-400' : 'text-red-400'}`}>
                    {trendUp ? '↑' : '↓'} {Math.abs(trendPct)}%
                  </span>
                )}
              </div>
              {week7 && week7.count > 0 ? (
                <>
                  <div className="flex items-center gap-3 flex-wrap">
                    <div className="flex items-baseline gap-1">
                      <span className="text-xl font-bold text-white">{week7.count}</span>
                      <span className="text-sm text-slate-400">session{week7.count !== 1 ? 's' : ''}</span>
                    </div>
                    {week7.calsBurned > 0 && (
                      <div className="flex items-baseline gap-1">
                        <span className="text-xl font-bold text-white">{week7.calsBurned.toLocaleString()}</span>
                        <span className="text-sm text-slate-400">calories burned</span>
                      </div>
                    )}
                    {week7.volumeLbs > 0 && (
                      <div className="flex items-baseline gap-1">
                        <span className="text-xl font-bold text-white">{Math.round(week7.volumeLbs).toLocaleString()}</span>
                        <span className="text-sm text-slate-400">volume</span>
                      </div>
                    )}
                  </div>
                  {prev7 && prev7.count > 0 && (
                    <div className="mt-2 pt-2 border-t border-dram-border/60">
                      <div className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1">Previous Week</div>
                      <div className="text-sm text-slate-500 flex items-center gap-2 flex-wrap">
                        <span><span className="font-bold text-slate-300">{prev7.count}</span> session{prev7.count !== 1 ? 's' : ''}</span>
                        {prev7.calsBurned > 0 && <span>· <span className="font-bold text-slate-300">{prev7.calsBurned.toLocaleString()}</span> calories burned</span>}
                        {prev7.volumeLbs > 0 && <span>· <span className="font-bold text-slate-300">{Math.round(prev7.volumeLbs).toLocaleString()}</span> volume</span>}
                      </div>
                    </div>
                  )}
                </>
              ) : (
                <p className="text-sm text-slate-500 mt-1">No workouts this week</p>
              )}
            </div>
          );
        })()}

        {/* Steps */}
        <div className="bg-dram-card border border-dram-border px-5 py-4">
          <div className="flex items-center gap-1.5 mb-2">
            <span className="text-sm font-semibold uppercase tracking-wider" style={{ color: ACCENT }}>Steps</span>
          </div>
          <div className="flex items-baseline gap-1 mb-2">
            <span className="text-xl font-bold text-white">{stepsCount.toLocaleString()}</span>
            <span className="text-sm text-dram-muted">/ {STEPS_GOAL.toLocaleString()}</span>
          </div>
          <div className="h-1.5 overflow-hidden bg-dram-border mb-2">
            <div className="h-full bg-dram-accent transition-all duration-500" style={{ width: `${stepsPct * 100}%` }} />
          </div>
          <div className="flex items-center gap-2">
            <input
              type="number"
              min={0}
              max={200000}
              placeholder={stepsCount >= STEPS_GOAL ? 'Goal reached!' : `${(STEPS_GOAL - stepsCount).toLocaleString()} left`}
              value={stepsInput}
              onChange={(e) => setStepsInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSaveSteps()}
              className="flex-1 min-w-0 bg-dram-bg border border-dram-border rounded px-2 py-1 text-sm text-white placeholder:text-dram-muted focus:outline-none focus:border-dram-accent"
            />
            <button
              onClick={handleSaveSteps}
              disabled={savingSteps || !stepsInput}
              className="bg-dram-accent hover:brightness-110 disabled:opacity-40 text-black text-sm font-semibold px-3 py-1 rounded transition-colors"
            >
              {savingSteps ? '…' : 'Log'}
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function WorkoutsPage() {
  const routinesTabRef = useRef<RoutinesTabHandle>(null);
  const exercisesTabRef = useRef<ExercisesTabHandle>(null);
  const [showQuickLog, setShowQuickLog] = useState(false);

  return (
    <div className="flex flex-col h-full overflow-hidden bg-dram-bg text-white">
      {/* Page header */}
      <div className="flex-shrink-0 px-6 pt-5 pb-3 border-b border-dram-border flex items-center justify-between">
        <h1 className="text-xl font-semibold text-slate-200">Workouts</h1>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowQuickLog(true)}
            className="border border-dram-accent text-dram-accent font-semibold px-4 py-2 rounded-lg text-sm hover:bg-dram-accent/10 transition"
          >
            Quick Log
          </button>
          <button
            onClick={() => routinesTabRef.current?.openCreate()}
            className="bg-dram-accent text-black font-semibold px-4 py-2 rounded-lg text-sm hover:brightness-110 transition"
          >
            + New Routine
          </button>
          <button
            onClick={() => exercisesTabRef.current?.openCreate()}
            className="bg-dram-accent text-black font-semibold px-4 py-2 rounded-lg text-sm hover:brightness-110 transition"
          >
            + New Exercise
          </button>
        </div>
      </div>

      {/* Scrollable body */}
      <div className="flex-1 overflow-y-auto">
        {/* Hero banner */}
        <WorkoutHeroBanner />

        {/* Routines section */}
        <div className="px-9 pt-6 pb-2 flex items-center gap-3">
          <div style={{ width: 14, height: 2, background: ACCENT }} />
          <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-300">Routines</h2>
        </div>
        <RoutinesTab ref={routinesTabRef} />

        {/* Exercises section */}
        <div className="px-9 pt-8 pb-2 flex items-center gap-3 border-t border-dram-border mt-4">
          <div style={{ width: 14, height: 2, background: ACCENT }} />
          <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-300">Exercises</h2>
        </div>
        <ExercisesTab ref={exercisesTabRef} />

        <div className="pb-16" />
      </div>

      {showQuickLog && <QuickLogModal onClose={() => setShowQuickLog(false)} />}
    </div>
  );
}

