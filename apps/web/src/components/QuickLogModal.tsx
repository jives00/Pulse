import { useState, useEffect, useRef } from 'react';
import { exercisesApi, workoutsApi, type Exercise, type ExerciseSet, KG_TO_LBS, secondsToMMSS as _secondsToMMSS } from '@pulse/api-client';
import Spinner from './Spinner';
import { useEscapeKey } from '../hooks/useEscapeKey';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function lbsToKg(lbs: number) { return Math.round((lbs / KG_TO_LBS) * 1000) / 1000; }
function fmtWeight(kg: number | null) {
  if (kg == null) return '';
  const lbs = Math.round(kg * KG_TO_LBS * 10) / 10;
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

const MI_TO_M = 1609.344;
const FT_TO_M = 0.3048;
function fmtDistance(m: number): string {
  const miles = m / MI_TO_M;
  if (miles >= 0.1) return (Math.round(miles * 100) / 100) + ' mi';
  return Math.round(m / FT_TO_M) + ' ft';
}
function metersToMiInput(m: number | null): string {
  if (m == null) return '';
  return String(Math.round((m / MI_TO_M) * 100) / 100);
}
function miInputToMeters(val: string): number | null {
  const n = parseFloat(val.trim());
  if (isNaN(n) || n < 0) return null;
  return Math.round(n * MI_TO_M * 10) / 10;
}

// ─── Set row ─────────────────────────────────────────────────────────────────

function SetRow({
  set, index, workoutId, weId, trackedFields, onUpdated, onDeleted,
}: {
  set: ExerciseSet;
  index: number;
  workoutId: number;
  weId: number;
  trackedFields: string[];
  onUpdated: (s: ExerciseSet) => void;
  onDeleted: (id: number) => void;
}) {
  const trackWeight   = trackedFields.includes('weight');
  const trackReps     = trackedFields.includes('reps');
  const trackDuration = trackedFields.includes('duration');
  const trackDistance = trackedFields.includes('distance');
  const trackSteps    = trackedFields.includes('steps');

  const [reps,     setReps]     = useState(String(set.reps ?? ''));
  const [weight,   setWeight]   = useState(fmtWeight(set.weightKg));
  const [duration, setDuration] = useState(secondsToMMSS(set.durationSeconds));
  const [distance, setDistance] = useState(metersToMiInput(set.distanceMeters));
  const [steps,    setSteps]    = useState(String((set as any).steps ?? ''));
  const [saving,   setSaving]   = useState(false);

  async function handleBlur() {
    if (saving) return;
    const newReps   = trackReps     && reps     !== '' ? Number(reps)     : null;
    const newWtLbs  = trackWeight   && weight   !== '' ? Number(weight)   : null;
    const newWtKg   = newWtLbs != null ? lbsToKg(newWtLbs) : null;
    const newDurSec = trackDuration ? mmssToSeconds(duration) : null;
    const newDistM  = trackDistance ? miInputToMeters(distance) : null;
    const newSteps  = trackSteps    && steps    !== '' ? Number(steps)    : null;

    const unchanged =
      newReps   === set.reps &&
      newWtKg   === set.weightKg &&
      newDurSec === set.durationSeconds &&
      newDistM  === set.distanceMeters &&
      newSteps  === ((set as any).steps ?? null);
    if (unchanged) return;

    setSaving(true);
    try {
      await workoutsApi.updateSet(workoutId, weId, set.id, {
        reps: newReps, weightKg: newWtKg, durationSeconds: newDurSec, distanceMeters: newDistM, steps: newSteps,
      } as any);
      onUpdated({ ...set, reps: newReps, weightKg: newWtKg, durationSeconds: newDurSec, distanceMeters: newDistM, steps: newSteps } as any);
    } catch {
      setReps(String(set.reps ?? ''));
      setWeight(fmtWeight(set.weightKg));
      setDuration(secondsToMMSS(set.durationSeconds));
      setDistance(metersToMiInput(set.distanceMeters));
      setSteps(String((set as any).steps ?? ''));
    } finally {
      setSaving(false);
    }
  }

  const colFlags = [trackWeight, trackReps, trackDuration, trackDistance, trackSteps];
  const inputCls = 'w-full bg-dram-bg border border-dram-border rounded px-2 py-1.5 text-sm text-white text-center focus:outline-none focus:border-dram-accent';

  return (
    <div
      className={`grid gap-2 items-center ${saving ? 'opacity-60' : ''}`}
      style={{ gridTemplateColumns: `1.5rem ${colFlags.filter(Boolean).map(() => '1fr').join(' ')} 1.5rem` }}
    >
      <span className="text-slate-500 text-sm text-center">{index + 1}</span>
      {trackWeight   && <input type="number" min={0} step={2.5} placeholder="lbs"   value={weight}   onChange={(e) => setWeight(e.target.value)}   onBlur={handleBlur} className={inputCls} />}
      {trackReps     && <input type="number" min={0}            placeholder="reps"   value={reps}     onChange={(e) => setReps(e.target.value)}     onBlur={handleBlur} className={inputCls} />}
      {trackDuration && <input type="text"                      placeholder="m:ss"   value={duration} onChange={(e) => setDuration(e.target.value)} onBlur={handleBlur} className={inputCls} />}
      {trackDistance && <input type="number" min={0} step={0.01} placeholder="mi"   value={distance} onChange={(e) => setDistance(e.target.value)} onBlur={handleBlur} className={inputCls} />}
      {trackSteps    && <input type="number" min={0}            placeholder="steps"  value={steps}    onChange={(e) => setSteps(e.target.value)}    onBlur={handleBlur} className={inputCls} />}
      <button onClick={() => workoutsApi.deleteSet(workoutId, weId, set.id).then(() => onDeleted(set.id))}
        className="text-slate-600 hover:text-red-400 transition-colors text-center text-lg leading-none">×</button>
    </div>
  );
}

// ─── Step 1: Exercise picker ──────────────────────────────────────────────────

function ExercisePicker({ onSelect }: { onSelect: (ex: Exercise) => void }) {
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [loading, setLoading]     = useState(true);
  const [search, setSearch]       = useState('');
  const [highlighted, setHighlighted] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef  = useRef<HTMLDivElement>(null);

  useEffect(() => {
    exercisesApi.getAll().then(setExercises).catch(() => {}).finally(() => setLoading(false));
  }, []);

  useEffect(() => { inputRef.current?.focus(); }, []);
  useEffect(() => { setHighlighted(-1); }, [search]);

  const filtered = exercises.filter((ex) =>
    !search || ex.name.toLowerCase().includes(search.toLowerCase())
  );

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (filtered.length === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      const next = Math.min(highlighted + 1, filtered.length - 1);
      setHighlighted(next);
      (listRef.current?.children[next] as HTMLElement | undefined)?.scrollIntoView({ block: 'nearest' });
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      const prev = Math.max(highlighted - 1, 0);
      setHighlighted(prev);
      (listRef.current?.children[prev] as HTMLElement | undefined)?.scrollIntoView({ block: 'nearest' });
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (highlighted >= 0 && highlighted < filtered.length) {
        onSelect(filtered[highlighted]);
      } else if (filtered.length === 1) {
        onSelect(filtered[0]);
      }
    }
  }

  return (
    <div className="flex flex-col h-full">
      <p className="text-sm text-slate-400 mb-3">Choose an exercise to log sets against.</p>
      <input
        ref={inputRef}
        type="text"
        placeholder="🔍 Search exercises…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        onKeyDown={handleKeyDown}
        className="w-full bg-dram-bg border border-dram-border rounded-lg px-3 py-2 text-sm text-white placeholder:text-slate-600 focus:outline-none focus:border-dram-accent mb-3"
      />
      {loading ? (
        <div className="flex justify-center py-8"><Spinner size={8} /></div>
      ) : filtered.length === 0 ? (
        <p className="text-sm text-slate-500 text-center py-8">No exercises found</p>
      ) : (
        <div ref={listRef} className="flex-1 overflow-y-auto space-y-1">
          {filtered.map((ex, i) => (
            <button
              key={ex.id}
              onClick={() => onSelect(ex)}
              className={`w-full text-left px-3 py-2.5 rounded-lg transition-colors group ${
                i === highlighted ? 'bg-dram-border/40' : 'hover:bg-dram-border/40'
              }`}
            >
              <span className={`text-sm font-medium ${i === highlighted ? 'text-white' : 'text-slate-200 group-hover:text-white'}`}>
                {ex.name}
              </span>
              <span className="text-sm text-slate-500 ml-2 capitalize">{ex.category} · {ex.exerciseType}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Step 2: Set logger ───────────────────────────────────────────────────────

interface LogState {
  workoutId: number;
  weId: number;
  sets: ExerciseSet[];
}

function SetLogger({
  exercise,
  logState,
  lastSets,
  finishing,
  onSetsChange,
  onFinish,
  onBack,
}: {
  exercise: Exercise;
  logState: LogState;
  lastSets: ExerciseSet[];
  finishing: boolean;
  onSetsChange: (sets: ExerciseSet[]) => void;
  onFinish: () => void;
  onBack: () => void;
}) {
  const [addingSet, setAddingSet] = useState(false);
  const trackedFields = exercise.trackedFields?.length ? exercise.trackedFields : ['reps', 'weight'];

  const trackWeight   = trackedFields.includes('weight');
  const trackReps     = trackedFields.includes('reps');
  const trackDuration = trackedFields.includes('duration');
  const trackDistance = trackedFields.includes('distance');
  const trackSteps    = trackedFields.includes('steps');
  const colFlags = [trackWeight, trackReps, trackDuration, trackDistance, trackSteps];

  async function addSet() {
    setAddingSet(true);
    try {
      const s = await workoutsApi.addSet(logState.workoutId, logState.weId, {});
      onSetsChange([...logState.sets, s]);
    } catch { /* ignore */ } finally {
      setAddingSet(false);
    }
  }

  return (
    <div className="flex flex-col h-full">
      {/* Exercise name + back */}
      <div className="flex items-center gap-2 mb-1">
        <button onClick={onBack} className="text-slate-500 hover:text-slate-300 transition-colors text-sm">← Back</button>
      </div>
      <h3 className="text-base font-semibold text-white mb-1">{exercise.name}</h3>
      <p className="text-sm text-slate-500 capitalize mb-4">{exercise.category} · {exercise.exerciseType}</p>

      {/* Last session reference */}
      {lastSets.length > 0 && (
        <div className="bg-dram-bg border border-dram-border rounded-lg px-3 py-2 mb-4 text-sm text-slate-400">
          <span className="text-slate-500 mr-1">Last session:</span>
          {lastSets.slice(0, 4).map((s, i) => {
            const parts: string[] = [];
            if (s.weightKg != null) parts.push(fmtWeight(s.weightKg) + ' lbs');
            if (s.reps != null) parts.push(s.reps + ' reps');
            if ((s as any).steps != null) parts.push((s as any).steps + ' stairs');
            if (s.durationSeconds != null) parts.push(secondsToMMSS(s.durationSeconds));
            if (s.distanceMeters != null) parts.push(fmtDistance(s.distanceMeters));
            return <span key={i}>{i > 0 ? ' · ' : ''}{parts.join(' × ')}</span>;
          })}
          {lastSets.length > 4 && <span> +{lastSets.length - 4} more</span>}
        </div>
      )}

      {/* Column headers */}
      {logState.sets.length > 0 && (
        <div
          className="grid gap-2 text-sm text-slate-500 mb-1 px-0"
          style={{ gridTemplateColumns: `1.5rem ${colFlags.filter(Boolean).map(() => '1fr').join(' ')} 1.5rem` }}
        >
          <span />
          {trackWeight   && <span className="text-center">lbs</span>}
          {trackReps     && <span className="text-center">reps</span>}
          {trackDuration && <span className="text-center">m:ss</span>}
          {trackDistance && <span className="text-center">mi</span>}
          {trackSteps    && <span className="text-center">steps</span>}
          <span />
        </div>
      )}

      {/* Sets */}
      <div className="flex-1 overflow-y-auto space-y-2 mb-4">
        {logState.sets.map((s, i) => (
          <SetRow
            key={s.id}
            set={s}
            index={i}
            workoutId={logState.workoutId}
            weId={logState.weId}
            trackedFields={trackedFields}
            onUpdated={(updated) => onSetsChange(logState.sets.map((x) => x.id === updated.id ? updated : x))}
            onDeleted={(id) => onSetsChange(logState.sets.filter((x) => x.id !== id))}
          />
        ))}
        {logState.sets.length === 0 && (
          <p className="text-sm text-slate-600 text-center py-4">No sets yet — add your first set below</p>
        )}
      </div>

      {/* Actions */}
      <div className="flex gap-2">
        <button
          onClick={addSet}
          disabled={addingSet}
          className="flex-1 border border-dram-border text-slate-300 hover:border-slate-500 hover:text-white text-sm py-2 rounded-lg transition-colors disabled:opacity-40"
        >
          {addingSet ? '…' : '+ Add Set'}
        </button>
        <button
          onClick={onFinish}
          disabled={finishing}
          className="flex-1 bg-dram-accent hover:brightness-110 disabled:opacity-40 text-black text-sm font-semibold py-2 rounded-lg transition-colors"
        >
          {finishing ? 'Saving…' : 'Finish'}
        </button>
      </div>
    </div>
  );
}

// ─── Modal shell ──────────────────────────────────────────────────────────────

export default function QuickLogModal({ onClose }: { onClose: () => void }) {
  const [step, setStep] = useState<'pick' | 'log'>('pick');
  const [exercise, setExercise] = useState<Exercise | null>(null);
  const [logState, setLogState] = useState<LogState | null>(null);
  const [lastSets, setLastSets] = useState<ExerciseSet[]>([]);
  const [starting, setStarting] = useState(false);
  const [finishing, setFinishing] = useState(false);

  useEscapeKey(handleClose);

  async function handleSelectExercise(ex: Exercise) {
    setExercise(ex);
    setStarting(true);
    try {
      const [history, workout] = await Promise.all([
        exercisesApi.getHistory(ex.id, { limit: 1 }),
        workoutsApi.create({ name: `Quick: ${ex.name}` }),
      ]);
      const we = await workoutsApi.addExercise(workout.id, ex.id);
      const initialSets = await Promise.all([
        workoutsApi.addSet(workout.id, we.id, {}),
        workoutsApi.addSet(workout.id, we.id, {}),
        workoutsApi.addSet(workout.id, we.id, {}),
      ]);
      setLastSets((history[0]?.sets ?? []) as unknown as ExerciseSet[]);
      setLogState({ workoutId: workout.id, weId: we.id, sets: initialSets });
      setStep('log');
    } catch { /* ignore */ } finally {
      setStarting(false);
    }
  }

  async function handleFinish() {
    if (!logState) return;
    setFinishing(true);
    try {
      const emptySets = logState.sets.filter(
        (s) => s.reps === null && s.weightKg === null && s.durationSeconds === null && s.distanceMeters === null && (s as any).steps == null
      );
      await Promise.all(emptySets.map((s) => workoutsApi.deleteSet(logState.workoutId, logState.weId, s.id)));
      await workoutsApi.update(logState.workoutId, { completed: true });
      onClose();
    } catch { /* ignore */ } finally {
      setFinishing(false);
    }
  }

  async function handleBack() {
    if (logState) {
      try { await workoutsApi.delete(logState.workoutId); } catch { /* ignore */ }
      setLogState(null);
    }
    setExercise(null);
    setStep('pick');
  }

  async function handleClose() {
    if (logState && logState.sets.length > 0) {
      if (!window.confirm('Discard this session? All logged sets will be lost.')) return;
    }
    if (logState) {
      try { await workoutsApi.delete(logState.workoutId); } catch { /* ignore */ }
    }
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={handleClose}>
      <div
        className="bg-dram-card border border-dram-border rounded-xl w-full max-w-md mx-4 flex flex-col"
        style={{ maxHeight: '80vh' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal header */}
        <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b border-dram-border flex-shrink-0">
          <div>
            <h2 className="text-base font-semibold text-dram-accent">⚡ Quick Log</h2>
            {step === 'log' && exercise && (
              <p className="text-sm text-slate-500 mt-0.5">
                {logState?.sets.length ?? 0} set{(logState?.sets.length ?? 0) !== 1 ? 's' : ''} logged
              </p>
            )}
          </div>
          <button
            onClick={handleClose}
            className="text-slate-500 hover:text-slate-300 text-xl leading-none transition-colors"
          >×</button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-hidden px-5 py-4">
          {starting ? (
            <div className="flex justify-center py-8"><Spinner size={8} /></div>
          ) : step === 'pick' ? (
            <ExercisePicker onSelect={handleSelectExercise} />
          ) : exercise && logState ? (
            <SetLogger
              exercise={exercise}
              logState={logState}
              lastSets={lastSets}
              finishing={finishing}
              onSetsChange={(sets) => setLogState((l) => l ? { ...l, sets } : l)}
              onFinish={handleFinish}
              onBack={handleBack}
            />
          ) : null}
        </div>
      </div>
    </div>
  );
}
