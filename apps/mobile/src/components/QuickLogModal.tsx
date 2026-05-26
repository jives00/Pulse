import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator, Alert, FlatList, KeyboardAvoidingView, Modal,
  Platform, ScrollView, StyleSheet, Text, TextInput,
  TouchableOpacity, View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  createWorkout, updateWorkout, deleteWorkout,
  addWorkoutExercise, addWorkoutSet, updateWorkoutSet, deleteWorkoutSet,
  getExercises, getExerciseHistory,
  type Exercise, type ExerciseSet, type WorkoutExercise, type ExerciseHistoryEntry,
} from '../api/client';
import { KG_TO_LBS } from '../../../../packages/api-client/src/index';
import { fontSize, type Colors } from '../theme';
import { useColors } from '../hooks/useColors';

// ── Conversions ──────────────────────────────────────────────────────────────

function lbsToKg(lbs: number) { return lbs / KG_TO_LBS; }
function kgToLbs(kg: number) { return kg * KG_TO_LBS; }

function secondsToMMSS(sec: number | null): string {
  if (sec == null) return '';
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function mmssToSeconds(val: string): number | null {
  const t = val.trim();
  if (!t) return null;
  const parts = t.split(':');
  if (parts.length === 2) {
    const m = parseInt(parts[0], 10);
    const s = parseInt(parts[1], 10);
    if (!isNaN(m) && !isNaN(s)) return m * 60 + s;
  }
  const n = parseInt(t, 10);
  return isNaN(n) ? null : n;
}

function metersToMi(meters: number | null): string {
  if (meters == null) return '';
  return (meters / 1609.344).toFixed(2);
}

function miToMeters(mi: string): number | null {
  const n = parseFloat(mi);
  return isNaN(n) ? null : Math.round(n * 1609.344);
}

// ── Set row ──────────────────────────────────────────────────────────────────

interface SetRowProps {
  index: number;
  set: ExerciseSet;
  trackedFields: string[];
  workoutId: number;
  weId: number;
  token: string;
  onDelete: (setId: number) => void;
  onSaved: (setId: number, updated: Partial<ExerciseSet>) => void;
  c: Colors;
}

function SetRow({ index, set, trackedFields, workoutId, weId, token, onDelete, onSaved, c }: SetRowProps) {
  const s = makeSetStyles(c);

  // Local display state
  const [weight, setWeight] = useState(set.weightKg != null ? String(Math.round(kgToLbs(set.weightKg) * 10) / 10) : '');
  const [reps, setReps] = useState(set.reps != null ? String(set.reps) : '');
  const [duration, setDuration] = useState(secondsToMMSS(set.durationSeconds ?? null));
  const [distance, setDistance] = useState(metersToMi(set.distanceMeters ?? null));
  const [steps, setSteps] = useState(set.steps != null ? String(set.steps) : '');

  async function save() {
    const data: Parameters<typeof updateWorkoutSet>[4] = {};
    if (trackedFields.includes('weight')) data.weightKg = weight ? lbsToKg(parseFloat(weight)) : null;
    if (trackedFields.includes('reps')) data.reps = reps ? parseInt(reps, 10) : null;
    if (trackedFields.includes('duration')) data.durationSeconds = duration ? mmssToSeconds(duration) : null;
    if (trackedFields.includes('distance')) data.distanceMeters = distance ? miToMeters(distance) : null;
    if (trackedFields.includes('steps')) data.steps = steps ? parseInt(steps, 10) : null;
    try {
      await updateWorkoutSet(token, workoutId, weId, set.id, data);
      onSaved(set.id, data as Partial<ExerciseSet>);
    } catch {
      // silently ignore — data remains in local state
    }
  }

  const showWeight = trackedFields.includes('weight');
  const showReps = trackedFields.includes('reps');
  const showDuration = trackedFields.includes('duration');
  const showDistance = trackedFields.includes('distance');
  const showSteps = trackedFields.includes('steps');

  return (
    <View style={s.row}>
      <Text style={s.index}>{index + 1}</Text>
      {showWeight && (
        <TextInput
          style={s.input}
          value={weight}
          onChangeText={setWeight}
          onEndEditing={save}
          keyboardType="decimal-pad"
          placeholder="lbs"
          placeholderTextColor={c.muted}
          returnKeyType="done"
        />
      )}
      {showReps && (
        <TextInput
          style={s.input}
          value={reps}
          onChangeText={setReps}
          onEndEditing={save}
          keyboardType="number-pad"
          placeholder="reps"
          placeholderTextColor={c.muted}
          returnKeyType="done"
        />
      )}
      {showDuration && (
        <TextInput
          style={s.input}
          value={duration}
          onChangeText={setDuration}
          onEndEditing={save}
          keyboardType="numbers-and-punctuation"
          placeholder="m:ss"
          placeholderTextColor={c.muted}
          returnKeyType="done"
        />
      )}
      {showDistance && (
        <TextInput
          style={s.input}
          value={distance}
          onChangeText={setDistance}
          onEndEditing={save}
          keyboardType="decimal-pad"
          placeholder="mi"
          placeholderTextColor={c.muted}
          returnKeyType="done"
        />
      )}
      {showSteps && (
        <TextInput
          style={s.input}
          value={steps}
          onChangeText={setSteps}
          onEndEditing={save}
          keyboardType="number-pad"
          placeholder="steps"
          placeholderTextColor={c.muted}
          returnKeyType="done"
        />
      )}
      <TouchableOpacity onPress={() => onDelete(set.id)} style={s.deleteBtn}>
        <Text style={s.deleteText}>×</Text>
      </TouchableOpacity>
    </View>
  );
}

// ── Column headers ───────────────────────────────────────────────────────────

function ColHeaders({ trackedFields, c }: { trackedFields: string[]; c: Colors }) {
  const s = makeSetStyles(c);
  return (
    <View style={s.row}>
      <Text style={[s.index, { color: c.muted }]}>#</Text>
      {trackedFields.includes('weight') && <Text style={[s.input, s.colHeader]}>lbs</Text>}
      {trackedFields.includes('reps') && <Text style={[s.input, s.colHeader]}>reps</Text>}
      {trackedFields.includes('duration') && <Text style={[s.input, s.colHeader]}>m:ss</Text>}
      {trackedFields.includes('distance') && <Text style={[s.input, s.colHeader]}>mi</Text>}
      {trackedFields.includes('steps') && <Text style={[s.input, s.colHeader]}>steps</Text>}
      <View style={{ width: 32 }} />
    </View>
  );
}

// ── Last session reference ───────────────────────────────────────────────────

function LastSession({ history, trackedFields, c }: { history: ExerciseHistoryEntry | null; trackedFields: string[]; c: Colors }) {
  const m = makeLoggerStyles(c);
  if (!history || history.sets.length === 0) return null;
  const preview = history.sets.slice(0, 4);
  const extra = history.sets.length - preview.length;
  return (
    <View style={m.lastSession}>
      <Text style={m.lastSessionLabel}>Last session</Text>
      {preview.map((set, i) => {
        const parts: string[] = [];
        if (trackedFields.includes('weight') && set.weightKg != null) parts.push(`${Math.round(kgToLbs(set.weightKg) * 10) / 10} lbs`);
        if (trackedFields.includes('reps') && set.reps != null) parts.push(`${set.reps} reps`);
        if (trackedFields.includes('duration') && set.durationSeconds != null) parts.push(secondsToMMSS(set.durationSeconds));
        if (trackedFields.includes('distance') && set.distanceMeters != null) parts.push(`${metersToMi(set.distanceMeters)} mi`);
        return (
          <Text key={i} style={m.lastSessionSet}>
            {i + 1}. {parts.join(' · ') || '—'}
          </Text>
        );
      })}
      {extra > 0 && <Text style={m.lastSessionSet}>+{extra} more</Text>}
    </View>
  );
}

// ── Logger step ──────────────────────────────────────────────────────────────

interface LoggerProps {
  token: string;
  exercise: Exercise;
  onBack: () => void;
  onFinish: () => void;
  c: Colors;
}

function SetLogger({ token, exercise, onBack, onFinish, c }: LoggerProps) {
  const m = makeLoggerStyles(c);
  const [sets, setSets] = useState<ExerciseSet[]>([]);
  const [workoutId, setWorkoutId] = useState<number | null>(null);
  const [weId, setWeId] = useState<number | null>(null);
  const [history, setHistory] = useState<ExerciseHistoryEntry | null>(null);
  const [loading, setLoading] = useState(true);
  const [finishing, setFinishing] = useState(false);
  const trackedFields = exercise.trackedFields ?? ['weight', 'reps'];
  const workoutIdRef = useRef<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function init() {
      try {
        const [workout, hist] = await Promise.all([
          createWorkout(token, { name: `Quick: ${exercise.name}` }),
          getExerciseHistory(token, exercise.id, { limit: 1 }).catch(() => []),
        ]);
        if (cancelled) {
          deleteWorkout(token, workout.id).catch(() => {});
          return;
        }
        workoutIdRef.current = workout.id;
        setWorkoutId(workout.id);
        if (hist.length > 0) setHistory(hist[0]);

        const we: WorkoutExercise = await addWorkoutExercise(token, workout.id, exercise.id);
        if (cancelled) {
          deleteWorkout(token, workout.id).catch(() => {});
          return;
        }
        setWeId(we.id);

        const initialSets = await Promise.all([
          addWorkoutSet(token, workout.id, we.id, {}),
          addWorkoutSet(token, workout.id, we.id, {}),
          addWorkoutSet(token, workout.id, we.id, {}),
        ]);
        if (cancelled) {
          deleteWorkout(token, workout.id).catch(() => {});
          return;
        }
        setSets(initialSets);
      } catch {
        if (!cancelled) Alert.alert('Error', 'Could not start quick log session.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    init();
    return () => { cancelled = true; };
  }, [token, exercise]);

  async function handleDiscard() {
    const wid = workoutIdRef.current;
    if (wid) deleteWorkout(token, wid).catch(() => {});
    onBack();
  }

  async function handleAddSet() {
    if (!workoutId || !weId) return;
    try {
      const set = await addWorkoutSet(token, workoutId, weId, {});
      setSets((prev) => [...prev, set]);
    } catch { /* ignore */ }
  }

  async function handleDeleteSet(setId: number) {
    if (!workoutId || !weId) return;
    try {
      await deleteWorkoutSet(token, workoutId, weId, setId);
      setSets((prev) => prev.filter((s) => s.id !== setId));
    } catch { /* ignore */ }
  }

  function handleSaved(setId: number, updated: Partial<ExerciseSet>) {
    setSets((prev) => prev.map((s) => s.id === setId ? { ...s, ...updated } : s));
  }

  async function handleFinish() {
    if (!workoutId || !weId) return;
    setFinishing(true);
    try {
      // Delete empty sets
      const emptySets = sets.filter((s) => {
        const hasWeight = s.weightKg != null;
        const hasReps = s.reps != null;
        const hasDuration = s.durationSeconds != null;
        const hasDistance = s.distanceMeters != null;
        const hasSteps = s.steps != null;
        return !hasWeight && !hasReps && !hasDuration && !hasDistance && !hasSteps;
      });
      await Promise.all(emptySets.map((s) => deleteWorkoutSet(token, workoutId, weId, s.id)));

      const remaining = sets.filter((s) => !emptySets.some((e) => e.id === s.id));
      if (remaining.length === 0) {
        // Nothing was entered — discard
        await deleteWorkout(token, workoutId).catch(() => {});
      } else {
        await updateWorkout(token, workoutId, { completed: true });
      }
      onFinish();
    } catch {
      Alert.alert('Error', 'Could not complete the session.');
    } finally {
      setFinishing(false);
    }
  }

  if (loading) {
    return (
      <View style={m.center}>
        <ActivityIndicator color={c.accent} />
      </View>
    );
  }

  const loggedCount = sets.filter((s) => s.weightKg != null || s.reps != null || s.durationSeconds != null || s.distanceMeters != null || s.steps != null).length;

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <View style={m.loggerHeader}>
        <TouchableOpacity onPress={() => {
          if (loggedCount > 0) {
            Alert.alert('Discard session?', 'No sets will be saved.', [
              { text: 'Cancel', style: 'cancel' },
              { text: 'Discard', style: 'destructive', onPress: handleDiscard },
            ]);
          } else {
            handleDiscard();
          }
        }}>
          <Text style={m.backBtn}>‹ Back</Text>
        </TouchableOpacity>
        <View style={{ flex: 1, marginLeft: 12 }}>
          <Text style={m.exName} numberOfLines={1}>{exercise.name}</Text>
          <Text style={m.exCategory}>{exercise.category}</Text>
        </View>
        <TouchableOpacity
          style={[m.finishBtn, finishing && { opacity: 0.5 }]}
          onPress={handleFinish}
          disabled={finishing}
        >
          <Text style={m.finishBtnText}>{finishing ? '…' : 'Finish'}</Text>
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={m.loggerBody}>
        <LastSession history={history} trackedFields={trackedFields} c={c} />

        <ColHeaders trackedFields={trackedFields} c={c} />

        {sets.map((set, i) => (
          <SetRow
            key={set.id}
            index={i}
            set={set}
            trackedFields={trackedFields}
            workoutId={workoutId!}
            weId={weId!}
            token={token}
            onDelete={handleDeleteSet}
            onSaved={handleSaved}
            c={c}
          />
        ))}

        <TouchableOpacity style={m.addSetBtn} onPress={handleAddSet}>
          <Text style={m.addSetText}>+ Add Set</Text>
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

// ── Exercise picker ──────────────────────────────────────────────────────────

interface PickerProps {
  token: string;
  onSelect: (ex: Exercise) => void;
  c: Colors;
}

function ExercisePicker({ token, onSelect, c }: PickerProps) {
  const p = makePickerStyles(c);
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getExercises(token, { search: search || undefined })
      .then(setExercises)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [token, search]);

  return (
    <View style={{ flex: 1 }}>
      <TextInput
        style={p.search}
        value={search}
        onChangeText={setSearch}
        placeholder="Search exercises…"
        placeholderTextColor={c.muted}
        autoFocus
        clearButtonMode="while-editing"
      />
      {loading ? (
        <ActivityIndicator style={{ marginTop: 40 }} color={c.accent} />
      ) : (
        <FlatList
          data={exercises}
          keyExtractor={(item) => String(item.id)}
          keyboardShouldPersistTaps="handled"
          renderItem={({ item }) => (
            <TouchableOpacity style={p.item} onPress={() => onSelect(item)}>
              <Text style={p.itemName}>{item.name}</Text>
              <Text style={p.itemMeta}>{item.category} · {item.exerciseType}</Text>
            </TouchableOpacity>
          )}
          ListEmptyComponent={
            <Text style={p.empty}>No exercises found.</Text>
          }
        />
      )}
    </View>
  );
}

// ── Root modal ───────────────────────────────────────────────────────────────

interface QuickLogModalProps {
  visible: boolean;
  token: string;
  onClose: () => void;
  onLogged: () => void;
}

export default function QuickLogModal({ visible, token, onClose, onLogged }: QuickLogModalProps) {
  const c = useColors();
  const m = makeRootStyles(c);
  const [step, setStep] = useState<'picker' | 'logger'>('picker');
  const [exercise, setExercise] = useState<Exercise | null>(null);

  function handleSelect(ex: Exercise) {
    setExercise(ex);
    setStep('logger');
  }

  function handleBack() {
    setExercise(null);
    setStep('picker');
  }

  function handleClose() {
    setExercise(null);
    setStep('picker');
    onClose();
  }

  function handleFinish() {
    setExercise(null);
    setStep('picker');
    onLogged();
  }

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={handleClose}
    >
      <SafeAreaView style={m.container}>
        <View style={m.header}>
          <Text style={m.title}>⚡ Quick Log</Text>
          <TouchableOpacity onPress={handleClose} style={m.closeBtn}>
            <Text style={m.closeText}>✕</Text>
          </TouchableOpacity>
        </View>

        {step === 'picker' && (
          <ExercisePicker token={token} onSelect={handleSelect} c={c} />
        )}
        {step === 'logger' && exercise && (
          <SetLogger
            token={token}
            exercise={exercise}
            onBack={handleBack}
            onFinish={handleFinish}
            c={c}
          />
        )}
      </SafeAreaView>
    </Modal>
  );
}

// ── Styles ───────────────────────────────────────────────────────────────────

function makeRootStyles(c: Colors) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: c.bg },
    header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: c.border },
    title: { flex: 1, fontSize: fontSize.base, fontWeight: '700', color: c.text },
    closeBtn: { padding: 4 },
    closeText: { fontSize: fontSize.base, color: c.muted },
  });
}

function makePickerStyles(c: Colors) {
  return StyleSheet.create({
    search: { marginHorizontal: 14, marginVertical: 10, backgroundColor: c.card, borderRadius: 10, borderWidth: 1, borderColor: c.border, paddingHorizontal: 12, paddingVertical: 10, fontSize: fontSize.sm, color: c.text },
    item: { paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: c.border },
    itemName: { fontSize: fontSize.sm, fontWeight: '600', color: c.text },
    itemMeta: { fontSize: fontSize.sm, color: c.muted, marginTop: 2 },
    empty: { textAlign: 'center', color: c.muted, marginTop: 40, fontSize: fontSize.sm },
  });
}

function makeLoggerStyles(c: Colors) {
  return StyleSheet.create({
    center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
    loggerHeader: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: c.border },
    backBtn: { fontSize: fontSize.base, color: c.accent },
    exName: { fontSize: fontSize.sm, fontWeight: '700', color: c.text },
    exCategory: { fontSize: fontSize.sm, color: c.muted },
    finishBtn: { backgroundColor: c.accent, borderRadius: 8, paddingHorizontal: 14, paddingVertical: 8 },
    finishBtnText: { fontSize: fontSize.sm, fontWeight: '700', color: c.bg },
    loggerBody: { padding: 14, gap: 6 },
    lastSession: { backgroundColor: c.card, borderRadius: 10, borderWidth: 1, borderColor: c.border, padding: 10, marginBottom: 8, gap: 4 },
    lastSessionLabel: { fontSize: fontSize.sm, fontWeight: '600', color: c.muted, textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 2 },
    lastSessionSet: { fontSize: fontSize.sm, color: c.text },
    addSetBtn: { marginTop: 8, alignItems: 'center', paddingVertical: 12, borderWidth: 1, borderColor: c.border, borderRadius: 10, borderStyle: 'dashed' },
    addSetText: { fontSize: fontSize.sm, color: c.accent, fontWeight: '600' },
  });
}

function makeSetStyles(c: Colors) {
  return StyleSheet.create({
    row: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    index: { width: 22, fontSize: fontSize.sm, fontWeight: '600', color: c.text, textAlign: 'center' },
    input: { flex: 1, backgroundColor: c.card, borderRadius: 8, borderWidth: 1, borderColor: c.border, paddingHorizontal: 8, paddingVertical: 8, fontSize: fontSize.sm, color: c.text, textAlign: 'center', minWidth: 52 },
    colHeader: { backgroundColor: 'transparent', borderColor: 'transparent', color: c.muted, paddingVertical: 2, fontSize: fontSize.sm },
    deleteBtn: { width: 32, alignItems: 'center', justifyContent: 'center' },
    deleteText: { fontSize: fontSize.lg, color: c.muted },
  });
}
