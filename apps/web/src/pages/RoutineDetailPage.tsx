import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import {
  routinesApi, workoutsApi, exercisesApi,
  type RoutineDetail, type RoutineExercise, type RoutineExerciseSet,
  type Exercise, type WorkoutSummary,
} from '@pulse/api-client';

const KG_TO_LBS = 2.20462;

function kgToLbs(kg: number) { return Math.round(kg * KG_TO_LBS * 10) / 10; }
function lbsToKg(lbs: number) { return Math.round((lbs / KG_TO_LBS) * 1000) / 1000; }
function fmtWeight(kg: number | null) {
  if (kg == null) return '';
  const lbs = kgToLbs(kg);
  return String(lbs % 1 === 0 ? lbs : lbs.toFixed(1));
}
function shortDate(dateStr: string) {
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-US', { month: 'numeric', day: 'numeric' });
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

// ─── Template set row ─────────────────────────────────────────────────────────

function TemplateSetRow({
  set, routineId, reId, trackedFields, onUpdated, onDeleted,
}: {
  set: RoutineExerciseSet;
  routineId: number;
  reId: number;
  trackedFields: string[];
  onUpdated: (s: RoutineExerciseSet) => void;
  onDeleted: (id: number) => void;
}) {
  const showWeight   = trackedFields.includes('weight');
  const showReps     = trackedFields.includes('reps');
  const showDuration = trackedFields.includes('duration');
  const showDistance = trackedFields.includes('distance');

  const [reps, setReps]         = useState(String(set.reps ?? ''));
  const [weight, setWeight]     = useState(fmtWeight(set.weightKg));
  const [duration, setDuration] = useState(secondsToMMSS(set.durationSeconds));
  const [distance, setDistance] = useState(String(set.distanceMeters ?? ''));

  async function handleBlur() {
    const newReps       = showReps     && reps     !== '' ? Number(reps)     : null;
    const newWeightLbs  = showWeight   && weight   !== '' ? Number(weight)   : null;
    const newWeightKg   = newWeightLbs != null ? lbsToKg(newWeightLbs) : null;
    const newDuration   = showDuration ? mmssToSeconds(duration)             : null;
    const newDistance   = showDistance && distance !== '' ? Number(distance) : null;
    try {
      await routinesApi.updateTemplateSet(routineId, reId, set.id, {
        reps: newReps ?? undefined,
        weightKg: newWeightKg ?? undefined,
        durationSeconds: newDuration ?? undefined,
        distanceMeters: newDistance ?? undefined,
      });
      onUpdated({ ...set, reps: newReps, weightKg: newWeightKg, durationSeconds: newDuration, distanceMeters: newDistance });
    } catch {
      setReps(String(set.reps ?? ''));
      setWeight(fmtWeight(set.weightKg));
      setDuration(secondsToMMSS(set.durationSeconds));
      setDistance(String(set.distanceMeters ?? ''));
    }
  }

  async function handleDelete() {
    try {
      await routinesApi.deleteTemplateSet(routineId, reId, set.id);
      onDeleted(set.id);
    } catch { /* ignore */ }
  }

  const inputCls = 'w-full bg-slate-700 border border-slate-600 rounded px-2 py-1.5 text-sm text-slate-100 text-center focus:outline-none focus:border-blue-500';
  const fieldCount = [showWeight, showReps, showDuration, showDistance].filter(Boolean).length;
  const gridTemplateColumns = `2rem repeat(${fieldCount}, 1fr) 2rem`;

  return (
    <div className="grid gap-2 items-center py-1" style={{ gridTemplateColumns }}>
      <span className="text-sm text-slate-400 text-center">{set.setNumber}</span>
      {showWeight && (
        <input type="number" min="0" placeholder="lbs" value={weight}
          onChange={(e) => setWeight(e.target.value)} onBlur={handleBlur} className={inputCls} />
      )}
      {showReps && (
        <input type="number" min="0" placeholder="reps" value={reps}
          onChange={(e) => setReps(e.target.value)} onBlur={handleBlur} className={inputCls} />
      )}
      {showDuration && (
        <input type="text" placeholder="m:ss" value={duration}
          onChange={(e) => setDuration(e.target.value)} onBlur={handleBlur} className={inputCls} />
      )}
      {showDistance && (
        <input type="number" min="0" placeholder="dist" value={distance}
          onChange={(e) => setDistance(e.target.value)} onBlur={handleBlur} className={inputCls} />
      )}
      <button onClick={handleDelete} className="text-slate-600 hover:text-red-400 transition-colors text-base leading-none" title="Remove set">✕</button>
    </div>
  );
}

// ─── Routine exercise block ───────────────────────────────────────────────────

function RoutineExerciseBlock({
  re, routineId, onRemove, onSetsChanged,
}: {
  re: RoutineExercise;
  routineId: number;
  onRemove: (reId: number) => void;
  onSetsChanged: (reId: number, sets: RoutineExerciseSet[]) => void;
}) {
  const [sets, setSets] = useState<RoutineExerciseSet[]>(re.templateSets);
  const [adding, setAdding] = useState(false);

  function updateSets(next: RoutineExerciseSet[]) {
    setSets(next);
    onSetsChanged(re.id, next);
  }

  async function handleAddSet() {
    setAdding(true);
    try {
      const last = sets[sets.length - 1];
      const refSets = re.lastPerformedSets;
      // Use last performed sets as reference if no template sets yet
      const refLast = refSets ? refSets[refSets.length - 1] : null;
      const s = await routinesApi.addTemplateSet(routineId, re.id, {
        reps: last?.reps ?? refLast?.reps ?? undefined,
        weightKg: last?.weightKg ?? refLast?.weightKg ?? undefined,
        durationSeconds: last?.durationSeconds ?? refLast?.durationSeconds ?? undefined,
      });
      updateSets([...sets, s]);
    } catch { /* ignore */ }
    finally { setAdding(false); }
  }

  const showLastPerformed = sets.length === 0 && re.lastPerformedSets && re.lastPerformedSets.length > 0;
  const trackedFields = re.exercise.trackedFields ?? ['reps', 'weight'];
  const showWeightHeader = trackedFields.includes('weight');
  const showRepsHeader = trackedFields.includes('reps');
  const showDurationHeader = trackedFields.includes('duration');
  const showDistanceHeader = trackedFields.includes('distance');

  return (
    <div className="bg-slate-800 rounded-lg p-4">
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
        <button
          onClick={() => onRemove(re.id)}
          className="text-slate-600 hover:text-red-400 transition-colors text-sm ml-2 shrink-0"
        >
          Remove
        </button>
      </div>

      {/* Last performed reference (read-only when no template sets) */}
      {showLastPerformed && (
        <div className="mb-3 p-2 rounded bg-slate-750 border border-slate-700">
          <div className="text-sm text-slate-400 mb-1">Last session (reference)</div>
          {re.lastPerformedSets!.map((s) => (
            <div key={s.setNumber} className="text-sm text-slate-300 py-0.5">
              Set {s.setNumber}:
              {s.weightKg != null && ` ${fmtWeight(s.weightKg)} lbs`}
              {s.reps != null && ` × ${s.reps} reps`}
              {s.durationSeconds != null && ` ${secondsToMMSS(s.durationSeconds)}`}
              {s.distanceMeters != null && ` ${s.distanceMeters}m`}
            </div>
          ))}
        </div>
      )}

      {sets.length > 0 && (
        <div className="mb-2">
          {(() => {
            const fieldCount = [showWeightHeader, showRepsHeader, showDurationHeader, showDistanceHeader].filter(Boolean).length;
            const gridTemplateColumns = `2rem repeat(${fieldCount}, 1fr) 2rem`;
            return (
              <div className="grid gap-2 mb-1" style={{ gridTemplateColumns }}>
                <span />
                {showWeightHeader   && <span className="text-sm text-slate-400 text-center">lbs</span>}
                {showRepsHeader     && <span className="text-sm text-slate-400 text-center">reps</span>}
                {showDurationHeader && <span className="text-sm text-slate-400 text-center">time</span>}
                {showDistanceHeader && <span className="text-sm text-slate-400 text-center">dist</span>}
                <span />
              </div>
            );
          })()}
          {sets.map((s) => (
            <TemplateSetRow
              key={s.id}
              set={s}
              routineId={routineId}
              reId={re.id}
              trackedFields={trackedFields}
              onUpdated={(updated) => updateSets(sets.map((x) => x.id === updated.id ? updated : x))}
              onDeleted={(id) => updateSets(sets.filter((x) => x.id !== id))}
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
  const [volumeHistory, setVolumeHistory] = useState<{ date: string; volumeLbs: number }[]>([]);

  // Editable name
  const [editingName, setEditingName] = useState(false);
  const [name, setName] = useState('');
  const nameRef = useRef<HTMLInputElement>(null);

  // Editable notes
  const [editingNotes, setEditingNotes] = useState(false);
  const [notes, setNotes] = useState('');
  const notesRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!id) return;
    const numId = Number(id);
    routinesApi.get(numId)
      .then((r) => { setRoutine(r); setName(r.name); setNotes(r.notes ?? ''); })
      .catch(() => navigate('/workouts/routines'))
      .finally(() => setLoading(false));

    // Fetch volume history for this routine
    workoutsApi.getAll({ limit: 50, routineId: numId })
      .then((workouts: WorkoutSummary[]) => {
        const data = workouts
          .filter((w) => w.totalVolumeKg > 0)
          .map((w) => ({ date: w.workoutDate, volumeLbs: Math.round(w.totalVolumeKg * KG_TO_LBS) }))
          .reverse();
        setVolumeHistory(data);
      })
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

  function handleSetsChanged(reId: number, sets: RoutineExerciseSet[]) {
    setRoutine((prev) => prev ? {
      ...prev,
      exercises: prev.exercises.map((e) => e.id === reId ? { ...e, templateSets: sets } : e),
    } : prev);
  }

  async function handleDelete() {
    if (!routine || !confirm('Delete this routine?')) return;
    try {
      await routinesApi.delete(routine.id);
      navigate('/workouts/routines');
    } catch { /* ignore */ }
  }

  if (loading) return <div className="text-center text-sm text-slate-500 py-12">Loading…</div>;
  if (!routine) return null;

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 space-y-4">
      {/* Header */}
      <div className="flex items-start gap-3">
        <button onClick={() => navigate('/workouts/routines')} className="text-slate-500 hover:text-slate-300 transition-colors mt-0.5 shrink-0">←</button>
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
          <div className="text-sm text-slate-500">{routine.exercises.length} exercise{routine.exercises.length !== 1 ? 's' : ''}</div>
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
        <button
          onClick={handleDelete}
          className="text-slate-600 hover:text-red-400 transition-colors text-sm shrink-0 mt-1"
        >
          Delete
        </button>
      </div>

      {/* Start button */}
      <button
        onClick={handleStart}
        disabled={starting || routine.exercises.length === 0}
        className="w-full bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-medium rounded-lg py-3 transition-colors"
      >
        {starting ? 'Starting…' : 'Start Routine'}
      </button>

      {/* Volume history chart */}
      {volumeHistory.length > 0 && (
        <div className="bg-slate-800 rounded-lg p-3">
          <div className="text-xs text-slate-500 mb-2">Volume per session (lbs)</div>
          <ResponsiveContainer width="100%" height={120}>
            <BarChart data={volumeHistory} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
              <XAxis dataKey="date" tick={{ fontSize: 9, fill: '#94a3b8' }} tickFormatter={shortDate} minTickGap={30} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 9, fill: '#94a3b8' }} tickFormatter={(v) => `${Math.round(v / 1000)}k`} axisLine={false} tickLine={false} width={28} />
              <Tooltip
                contentStyle={{ background: '#1e293b', border: 'none', borderRadius: 8, fontSize: 12 }}
                labelFormatter={(l) => shortDate(String(l))}
                formatter={(v: number) => [`${v.toLocaleString()} lbs`, 'Volume']}
              />
              <Bar dataKey="volumeLbs" fill="#3b82f6" radius={[2, 2, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Exercise blocks */}
      {routine.exercises.map((re) => (
        <RoutineExerciseBlock
          key={re.id}
          re={re}
          routineId={routine.id}
          onRemove={handleRemoveExercise}
          onSetsChanged={handleSetsChanged}
        />
      ))}

      {/* Add exercise */}
      <button
        onClick={() => setShowPicker(true)}
        disabled={addingExercise}
        className="w-full py-3 text-sm text-blue-400 hover:text-blue-300 disabled:opacity-50 transition-colors border border-dashed border-slate-700 rounded-lg"
      >
        {addingExercise ? 'Adding…' : '+ Add Exercise'}
      </button>

      {showPicker && <ExercisePicker onSelect={handleSelectExercise} onClose={() => setShowPicker(false)} />}
    </div>
  );
}
