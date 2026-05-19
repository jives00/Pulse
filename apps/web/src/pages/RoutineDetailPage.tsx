import { useState, useEffect, useRef, useMemo } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import {
  routinesApi, workoutsApi, exercisesApi,
  type RoutineDetail, type RoutineExercise,
  type Exercise, type WorkoutSummary, type WorkoutDetail, type RoutineType,
  KG_TO_LBS, shortDate, secondsToMMSS as _secondsToMMSS,
} from '@pulse/api-client';

const ROUTINE_TYPE_LABELS: Record<RoutineType, string> = {
  strength:        'Strength / Weight',
  bodyweight:      'Bodyweight',
  cardio_distance: 'Cardio — Distance (running, cycling)',
  cardio_duration: 'Cardio — Duration (elliptical, row)',
  steps:           'Steps / Stairs',
};

function kgToLbs(kg: number) { return Math.round(kg * KG_TO_LBS * 10) / 10; }
function lbsToKg(lbs: number) { return Math.round((lbs / KG_TO_LBS) * 1000) / 1000; }
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

// ─── Routine exercise block ───────────────────────────────────────────────────

function RoutineExerciseBlock({
  re, onRemove, onMoveUp, onMoveDown,
}: {
  re: RoutineExercise;
  onRemove: (reId: number) => void;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
}) {
  return (
    <div className="bg-slate-800 p-4">
      <div className="flex items-start justify-between mb-3">
        <div>
          <Link
            to={`/workouts/exercises/${re.exercise.id}`}
            className="text-base font-medium text-blue-400 hover:text-blue-300 transition-colors"
          >
            {re.exercise.name}
          </Link>
          <div className="text-sm text-slate-300">{re.exercise.category}</div>
        </div>
        <div className="flex items-center gap-1 ml-2 shrink-0">
          <button onClick={onMoveUp} disabled={!onMoveUp} className="text-slate-600 hover:text-slate-300 disabled:opacity-20 transition-colors px-1 text-base leading-none" title="Move up">↑</button>
          <button onClick={onMoveDown} disabled={!onMoveDown} className="text-slate-600 hover:text-slate-300 disabled:opacity-20 transition-colors px-1 text-base leading-none" title="Move down">↓</button>
          <button onClick={() => onRemove(re.id)} className="text-slate-600 hover:text-red-400 transition-colors text-sm ml-1 shrink-0">Remove</button>
        </div>
      </div>
      {re.lastPerformedSets && re.lastPerformedSets.length > 0 && (
        <div className="p-2 rounded border border-slate-700 text-sm text-slate-400">
          <div className="mb-1 text-xs uppercase tracking-wide text-slate-500">Last session</div>
          {re.lastPerformedSets.map((s) => (
            <div key={s.setNumber} className="py-0.5 text-slate-300">
              Set {s.setNumber}:
              {s.weightKg != null && ` ${fmtWeight(s.weightKg)} lbs`}
              {s.reps != null && ` × ${s.reps} reps`}
              {s.durationSeconds != null && ` ${secondsToMMSS(s.durationSeconds)}`}
              {s.distanceMeters != null && ` ${s.distanceMeters}m`}
              {(s as any).steps != null && ` ${(s as any).steps} steps`}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Exercise picker modal (local copy) ──────────────────────────────────────

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
      <div className="bg-slate-800 rounded-t-2xl sm:rounded-2xl w-full sm:max-w-lg max-h-[80vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-4 pt-4 pb-2 shrink-0">
          <h2 className="text-base font-semibold text-slate-200">Add Exercise</h2>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-300 text-xl leading-none">×</button>
        </div>
        <div className="px-4 pb-2 space-y-2 shrink-0">
          <input autoFocus type="text" placeholder="Search…" value={search} onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-blue-500" />
          <div className="flex gap-1 overflow-x-auto pb-1 scrollbar-hide">
            <button onClick={() => setCategory('')}
              className={`shrink-0 text-sm px-3 py-1 rounded-full transition-colors ${!category ? 'bg-blue-600 text-white' : 'bg-slate-700 text-slate-400 hover:text-slate-200'}`}>All</button>
            {categories.map((c) => (
              <button key={c} onClick={() => setCategory(c === category ? '' : c)}
                className={`shrink-0 text-sm px-3 py-1 rounded-full transition-colors ${category === c ? 'bg-blue-600 text-white' : 'bg-slate-700 text-slate-400 hover:text-slate-200'}`}>{c}</button>
            ))}
          </div>
        </div>
        <div className="overflow-y-auto flex-1 px-2 pb-2">
          {loading && <div className="text-center text-sm text-slate-500 py-6">Loading…</div>}
          {!loading && filtered.map((ex) => (
            <button key={ex.id} onClick={() => onSelect(ex)} className="w-full text-left px-3 py-2.5 rounded-lg hover:bg-slate-700 transition-colors">
              <div className="text-base text-slate-200">{ex.name}</div>
              <div className="text-sm text-slate-500">{ex.category} · {ex.exerciseType}</div>
            </button>
          ))}
          {!loading && filtered.length === 0 && <div className="text-center text-sm text-slate-500 py-6">No exercises found</div>}
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

  // Editable name
  const [editingName, setEditingName] = useState(false);
  const [name, setName] = useState('');
  const nameRef = useRef<HTMLInputElement>(null);

  // Editable notes
  const [editingNotes, setEditingNotes] = useState(false);
  const [notes, setNotes] = useState('');
  const notesRef = useRef<HTMLTextAreaElement>(null);

  // Image upload
  const [uploadingImage, setUploadingImage] = useState(false);
  const imageInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!id) return;
    const numId = Number(id);
    routinesApi.get(numId)
      .then((r) => { setRoutine(r); setName(r.name); setNotes(r.notes ?? ''); })
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
  useEffect(() => { if (editingNotes) notesRef.current?.focus(); }, [editingNotes]);

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

  async function saveNotes() {
    if (!routine) return;
    setEditingNotes(false);
    const trimmed = notes.trim();
    if (trimmed === (routine.notes ?? '')) { setNotes(routine.notes ?? ''); return; }
    try {
      await routinesApi.update(routine.id, { notes: trimmed || undefined });
      setRoutine((prev) => prev ? { ...prev, notes: trimmed || null } : prev);
    } catch { setNotes(routine.notes ?? ''); }
  }

  async function handleImageUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !routine) return;
    setUploadingImage(true);
    try {
      const { uploadUrl, key } = await routinesApi.getPhotoUploadUrl(routine.id, file.type);
      await fetch(uploadUrl, { method: 'PUT', body: file, headers: { 'Content-Type': file.type } });
      await routinesApi.update(routine.id, { coverImageKey: key });
      setRoutine((prev) => prev ? { ...prev, coverImageUrl: URL.createObjectURL(file) } : prev);
    } catch { /* ignore */ } finally {
      setUploadingImage(false);
      if (imageInputRef.current) imageInputRef.current.value = '';
    }
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

  async function saveRoutineType(rt: RoutineType) {
    if (!routine) return;
    try {
      await routinesApi.update(routine.id, { routineType: rt });
      setRoutine((prev) => prev ? { ...prev, routineType: rt } : prev);
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

  const chartLabel = routine ? {
    strength:        'Volume per session (lbs)',
    bodyweight:      'Volume per session (lbs)',
    steps:           'Steps per session',
    cardio_distance: 'Distance per session (mi)',
    cardio_duration: 'Duration per session (min)',
  }[routine.routineType ?? 'strength'] : '';

  const chartFormatter = routine ? (v: number) => {
    switch (routine.routineType ?? 'strength') {
      case 'steps':           return [`${v.toLocaleString()} steps`, 'Steps'];
      case 'cardio_distance': return [`${v} mi`, 'Distance'];
      case 'cardio_duration': return [`${v} min`, 'Duration'];
      default:                return [`${v.toLocaleString()} lbs`, 'Volume'];
    }
  } : (v: number) => [`${v}`, ''];

  const lastSessionLabel: string | null = (() => {
    if (!routineWorkouts.length || !routine) return null;
    const w = routineWorkouts[0];
    const rt = routine.routineType ?? 'strength';
    switch (rt) {
      case 'steps':           return w.totalSteps ? `${w.totalSteps.toLocaleString()} steps` : null;
      case 'cardio_distance': return w.totalDistanceMeters ? `${((w.totalDistanceMeters) / 1609.34).toFixed(1)} mi` : null;
      case 'cardio_duration': return w.totalDurationSeconds ? `${Math.round(w.totalDurationSeconds / 60)} min` : null;
      default:                return w.totalVolumeKg ? `${Math.round(w.totalVolumeKg * KG_TO_LBS).toLocaleString()} lbs` : null;
    }
  })();

  if (loading) return <div className="text-center text-sm text-slate-500 py-12">Loading…</div>;
  if (!routine) return null;

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="flex-shrink-0 px-6 pt-5 pb-4 border-b border-dram-border flex items-start gap-3">
        <button onClick={() => navigate(-1)} className="text-slate-500 hover:text-slate-300 transition-colors shrink-0 mt-1">←</button>

        {/* Thumbnail */}
        <div
          className="shrink-0 h-28 w-28 bg-dram-bg border border-dram-border overflow-hidden cursor-pointer relative group"
          onClick={() => imageInputRef.current?.click()}
          title={routine.coverImageUrl ? 'Change photo' : 'Upload photo'}
        >
          {routine.coverImageUrl ? (
            <img src={routine.coverImageUrl} alt={routine.name} className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-slate-600 text-xs text-center leading-tight px-1">Add photo</div>
          )}
          <div className="absolute inset-0 bg-black/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
            <span className="text-white text-sm font-medium">{uploadingImage ? 'Uploading…' : routine.coverImageUrl ? 'Change photo' : 'Upload photo'}</span>
          </div>
          <input ref={imageInputRef} type="file" accept="image/*" className="hidden" onChange={handleImageUpload} />
        </div>

        <div className="flex-1 min-w-0">
          {editingName ? (
            <input
              ref={nameRef}
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onBlur={saveName}
              onKeyDown={(e) => { if (e.key === 'Enter') saveName(); if (e.key === 'Escape') { setEditingName(false); setName(routine.name); } }}
              className="w-full bg-transparent text-xl font-semibold text-slate-200 focus:outline-none border-b border-slate-600"
            />
          ) : (
            <button onClick={() => setEditingName(true)} className="text-left text-xl font-semibold text-slate-200 hover:text-white transition-colors w-full truncate">
              {routine.name}
            </button>
          )}
          <div className="flex items-center gap-2 mt-0.5">
            <select
              value={routine.routineType ?? 'strength'}
              onChange={(e) => saveRoutineType(e.target.value as RoutineType)}
              className="text-sm bg-transparent text-dram-muted border-none focus:outline-none cursor-pointer hover:text-slate-200 transition-colors"
            >
              {(Object.entries(ROUTINE_TYPE_LABELS) as [RoutineType, string][]).map(([val, label]) => (
                <option key={val} value={val}>{label}</option>
              ))}
            </select>
          </div>
          {/* Stats strip */}
          {(() => {
            const lastW = routineWorkouts[0] ?? null;
            const volLbs = lastW?.totalVolumeKg ? Math.round(lastW.totalVolumeKg * KG_TO_LBS).toLocaleString() : null;
            const cals   = lastW?.caloriesBurned ? lastW.caloriesBurned.toLocaleString() : null;
            return (
              <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 mt-1.5 text-sm text-slate-400">
                <span>Last session:</span>
                {volLbs && <span>{volLbs} lbs</span>}
                {cals   && <><span className="text-slate-600">·</span><span>{cals} kcal burned</span></>}
              </div>
            );
          })()}
          {editingNotes ? (
            <textarea
              ref={notesRef}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              onBlur={saveNotes}
              onKeyDown={(e) => { if (e.key === 'Escape') { setEditingNotes(false); setNotes(routine.notes ?? ''); } }}
              rows={3}
              placeholder="Add notes…"
              className="w-full mt-1 bg-transparent text-sm text-slate-300 focus:outline-none border-b border-slate-600 resize-none"
            />
          ) : (
            <button
              onClick={() => setEditingNotes(true)}
              className="text-left text-sm mt-1 w-full transition-colors"
            >
              {notes ? (
                <span className="text-slate-400 hover:text-slate-200">{notes}</span>
              ) : (
                <span className="text-slate-600 hover:text-slate-400 italic">Add notes…</span>
              )}
            </button>
          )}
        </div>

        {/* Action buttons */}
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
            className="border border-dram-border text-slate-300 hover:text-red-400 hover:border-red-900/40 rounded-lg px-3 py-2 text-sm shrink-0 transition-colors"
          >
            Delete
          </button>
        </div>
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto">
        <div className="px-6 py-5 space-y-4">

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

          {/* Session metric history chart */}
          {chartData.length > 0 && (
            <div className="bg-dram-card p-4">
              <div className="text-sm font-medium text-dram-muted mb-3">{chartLabel}</div>
              <ResponsiveContainer width="100%" height={160}>
                <BarChart data={chartData} margin={{ top: 4, right: 8, bottom: 0, left: 0 }} barCategoryGap="12%">
                  <XAxis dataKey="date" tick={{ fontSize: 12, fill: '#94a3b8' }} tickFormatter={shortDate} minTickGap={40} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 12, fill: '#94a3b8' }} tickFormatter={(v) => v >= 1000 ? `${Math.round(v / 1000)}k` : String(v)} axisLine={false} tickLine={false} width={38} />
                  <Tooltip
                    contentStyle={{ background: '#1e293b', border: 'none', borderRadius: 8, fontSize: 13, color: '#94a3b8' }}
                    labelStyle={{ color: '#94a3b8' }}
                    itemStyle={{ color: '#94a3b8' }}
                    labelFormatter={(l) => shortDate(String(l))}
                    formatter={chartFormatter as any}
                    cursor={{ fill: 'rgba(255,255,255,0.04)' }}
                  />
                  <Bar dataKey="value" radius={[3, 3, 0, 0]}>
                    {chartData.map((_, i) => (
                      <Cell key={i} fill={i === chartData.length - 1 ? '#3b82f6' : '#3b82f655'} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Exercise blocks + add button in same grid */}
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
            {routine.exercises.map((re, idx) => (
              <RoutineExerciseBlock
                key={re.id}
                re={re}
                onRemove={handleRemoveExercise}
                onMoveUp={idx > 0 ? () => handleMoveExercise(re.id, 'up') : undefined}
                onMoveDown={idx < routine.exercises.length - 1 ? () => handleMoveExercise(re.id, 'down') : undefined}
              />
            ))}
            <button
              onClick={() => setShowPicker(true)}
              disabled={addingExercise}
              className="py-3 text-sm text-blue-400 hover:text-blue-300 disabled:opacity-50 transition-colors border border-dashed border-slate-700 bg-slate-800/30"
            >
              {addingExercise ? 'Adding…' : '+ Add Exercise'}
            </button>
          </div>

          {showPicker && <ExercisePicker onSelect={handleSelectExercise} onClose={() => setShowPicker(false)} />}
        </div>
      </div>
    </div>
  );
}
