import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator, Alert, FlatList, KeyboardAvoidingView, Modal,
  ScrollView, StyleSheet, Text, TextInput,
  TouchableOpacity, View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import {
  getWorkout, updateWorkout, deleteWorkout, startWorkoutTimer,
  addWorkoutExercise, removeWorkoutExercise, updateWorkoutExercise,
  addWorkoutSet, updateWorkoutSet, deleteWorkoutSet,
  getExercises, getExerciseCategories, createCustomExercise,
  type WorkoutDetail, type WorkoutExercise, type ExerciseSet, type Exercise,
} from '../../../src/api/client';
import { useAuthStore } from '../../../src/store/auth';
import { fontSize, type Colors } from '../../../src/theme';
import { useColors } from '../../../src/hooks/useColors';

const KG_TO_LBS = 2.20462;

function lbsToKg(lbs: number) { return lbs / KG_TO_LBS; }
function kgToLbs(kg: number) { return kg * KG_TO_LBS; }
function formatTimer(seconds: number) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${m}:${String(s).padStart(2, '0')}`;
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

function defaultTrackedFields(exerciseType: string): string[] {
  switch (exerciseType) {
    case 'cardio':     return ['duration', 'distance'];
    case 'duration':   return ['duration'];
    case 'bodyweight': return ['reps'];
    default:           return ['reps', 'weight'];
  }
}

export default function WorkoutDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const workoutId = Number(id);
  const token = useAuthStore((s) => s.token)!;
  const router = useRouter();
  const c = useColors();
  const s = makeStyles(c);

  const [workout, setWorkout] = useState<WorkoutDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [finishing, setFinishing] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startedAtRef = useRef<string | null>(null);

  // Exercise picker state
  const [showPicker, setShowPicker] = useState(false);
  const [exSearch, setExSearch] = useState('');
  const [exCategory, setExCategory] = useState<string | null>(null);
  const [allExercises, setAllExercises] = useState<Exercise[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [exLoading, setExLoading] = useState(false);
  const [showCreateEx, setShowCreateEx] = useState(false);
  const [newExName, setNewExName] = useState('');
  const [newExCategory, setNewExCategory] = useState('');
  const [newExType, setNewExType] = useState('weight');

  // Date editing
  const [editingDate, setEditingDate] = useState(false);
  const [dateInput, setDateInput] = useState('');

  // Set input state: { [weId]: { weight: string; reps: string; duration: string; distance: string } }
  const [setInputs, setSetInputs] = useState<Record<number, { weight: string; reps: string; duration: string; distance: string }>>({});

  // Per-exercise notes
  const [exerciseNotes, setExerciseNotes] = useState<Record<number, string>>({});

  // Inline set editing: { [setId]: { weight: string; reps: string; duration: string; distance: string } }
  const [setEdits, setSetEdits] = useState<Record<number, { weight: string; reps: string; duration: string; distance: string }>>({});

  const load = useCallback(async () => {
    try {
      const data = await getWorkout(token, workoutId);
      setWorkout(data);
      // Seed per-exercise notes from loaded data
      const notes: Record<number, string> = {};
      for (const we of data.exercises) {
        notes[we.id] = we.notes ?? '';
      }
      setExerciseNotes(notes);

      // Start timer via API (idempotent)
      let sa = data.startedAt;
      if (!sa) {
        try {
          const r = await startWorkoutTimer(token, workoutId);
          sa = r.startedAt;
        } catch { /* ignore */ }
      }
      startedAtRef.current = sa;
    } catch {
      Alert.alert('Error', 'Could not load workout.');
    } finally {
      setLoading(false);
    }
  }, [token, workoutId]);

  useEffect(() => {
    load();
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [load]);

  // Start clock tick once startedAt is known
  useEffect(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (!startedAtRef.current) return;
    const tick = () => {
      const diff = Math.floor((Date.now() - new Date(startedAtRef.current!).getTime()) / 1000);
      setElapsed(Math.max(0, diff));
    };
    tick();
    timerRef.current = setInterval(tick, 1000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [workout?.startedAt]);

  function handleCancel() {
    Alert.alert('Cancel Workout', 'This will delete the session. Are you sure?', [
      { text: 'Keep Going', style: 'cancel' },
      {
        text: 'Cancel Session', style: 'destructive', onPress: async () => {
          try {
            await deleteWorkout(token, workoutId);
            router.back();
          } catch {
            Alert.alert('Error', 'Could not cancel workout.');
          }
        },
      },
    ]);
  }

  async function handleFinish() {
    setFinishing(true);
    try {
      const durationMinutes = Math.ceil(elapsed / 60) || 1;
      await updateWorkout(token, workoutId, { durationMinutes, completed: true });
      router.back();
    } catch {
      Alert.alert('Error', 'Could not finish workout.');
    } finally {
      setFinishing(false);
    }
  }

  async function openExPicker() {
    setShowPicker(true);
    setExSearch('');
    setExCategory(null);
    setExLoading(true);
    try {
      const [exs, cats] = await Promise.all([
        getExercises(token),
        getExerciseCategories(token),
      ]);
      setAllExercises(exs);
      setCategories(cats);
    } catch { /* ignore */ }
    finally { setExLoading(false); }
  }

  async function handleAddExercise(exercise: Exercise) {
    setShowPicker(false);
    try {
      const we = await addWorkoutExercise(token, workoutId, exercise.id);
      setWorkout((prev) => prev ? {
        ...prev,
        exercises: [...prev.exercises, { ...we, exercise, sets: [] }],
      } : prev);
      setExerciseNotes((prev) => ({ ...prev, [we.id]: we.notes ?? '' }));
    } catch { Alert.alert('Error', 'Could not add exercise.'); }
  }

  async function handleCreateCustomEx() {
    if (!newExName.trim() || !newExCategory.trim()) return;
    try {
      const ex = await createCustomExercise(token, { name: newExName.trim(), category: newExCategory.trim(), exerciseType: newExType });
      setAllExercises((prev) => [...prev, ex]);
      setShowCreateEx(false);
      setNewExName(''); setNewExCategory(''); setNewExType('weight');
      handleAddExercise(ex);
    } catch { Alert.alert('Error', 'Could not create exercise.'); }
  }

  async function handleRemoveExercise(weId: number) {
    Alert.alert('Remove', 'Remove this exercise?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove', style: 'destructive', onPress: async () => {
          try {
            await removeWorkoutExercise(token, workoutId, weId);
            setWorkout((prev) => prev ? { ...prev, exercises: prev.exercises.filter((e) => e.id !== weId) } : prev);
          } catch { Alert.alert('Error', 'Could not remove exercise.'); }
        },
      },
    ]);
  }

  async function handleAddSet(we: WorkoutExercise) {
    const inp = setInputs[we.id] ?? { weight: '', reps: '', duration: '', distance: '' };
    const tf = we.exercise.trackedFields ?? defaultTrackedFields(we.exercise.exerciseType);
    const weightLbs = parseFloat(inp.weight);
    const reps = parseInt(inp.reps, 10);
    const durSeconds = mmssToSeconds(inp.duration ?? '');
    const distMeters = parseFloat(inp.distance ?? '');
    const payload: { reps?: number; weightKg?: number; durationSeconds?: number; distanceMeters?: number } = {};
    if (tf.includes('weight') && !isNaN(weightLbs) && weightLbs >= 0) payload.weightKg = parseFloat(lbsToKg(weightLbs).toFixed(4));
    if (tf.includes('reps') && !isNaN(reps) && reps > 0) payload.reps = reps;
    if (tf.includes('duration') && durSeconds != null) payload.durationSeconds = durSeconds;
    if (tf.includes('distance') && !isNaN(distMeters) && distMeters >= 0) payload.distanceMeters = distMeters;
    try {
      const set = await addWorkoutSet(token, workoutId, we.id, payload);
      setWorkout((prev) => prev ? {
        ...prev,
        exercises: prev.exercises.map((e) =>
          e.id === we.id ? { ...e, sets: [...e.sets, set] } : e
        ),
      } : prev);
    } catch { Alert.alert('Error', 'Could not add set.'); }
  }

  async function handleDeleteSet(we: WorkoutExercise, set: ExerciseSet) {
    try {
      await deleteWorkoutSet(token, workoutId, we.id, set.id);
      setWorkout((prev) => prev ? {
        ...prev,
        exercises: prev.exercises.map((e) =>
          e.id === we.id ? { ...e, sets: e.sets.filter((s) => s.id !== set.id) } : e
        ),
      } : prev);
    } catch { Alert.alert('Error', 'Could not delete set.'); }
  }

  function initSetEdit(set: ExerciseSet) {
    setSetEdits((prev) => ({
      ...prev,
      [set.id]: {
        weight: set.weightKg != null ? String(Math.round(kgToLbs(set.weightKg) * 10) / 10) : '',
        reps: set.reps != null ? String(set.reps) : '',
        duration: set.durationSeconds != null ? secondsToMMSS(set.durationSeconds) : '',
        distance: set.distanceMeters != null ? String(set.distanceMeters) : '',
      },
    }));
  }

  async function handleSaveSetEdit(we: WorkoutExercise, set: ExerciseSet) {
    const edit = setEdits[set.id];
    if (!edit) return;
    const tf = we.exercise.trackedFields ?? defaultTrackedFields(we.exercise.exerciseType);
    const weightLbs = parseFloat(edit.weight);
    const reps = parseInt(edit.reps, 10);
    const durSeconds = mmssToSeconds(edit.duration);
    const distMeters = parseFloat(edit.distance);
    const payload: { reps?: number | null; weightKg?: number | null; durationSeconds?: number | null; distanceMeters?: number | null } = {};
    if (tf.includes('weight')) payload.weightKg = !isNaN(weightLbs) && weightLbs >= 0 ? parseFloat(lbsToKg(weightLbs).toFixed(4)) : null;
    if (tf.includes('reps')) payload.reps = !isNaN(reps) && reps > 0 ? reps : null;
    if (tf.includes('duration')) payload.durationSeconds = durSeconds;
    if (tf.includes('distance')) payload.distanceMeters = !isNaN(distMeters) && distMeters >= 0 ? distMeters : null;
    try {
      await updateWorkoutSet(token, workoutId, we.id, set.id, { ...payload, completed: set.completed });
      setWorkout((prev) => prev ? {
        ...prev,
        exercises: prev.exercises.map((e) =>
          e.id === we.id ? {
            ...e,
            sets: e.sets.map((s) => s.id === set.id ? {
              ...s,
              weightKg: payload.weightKg ?? null,
              reps: payload.reps ?? null,
              durationSeconds: payload.durationSeconds ?? null,
              distanceMeters: payload.distanceMeters ?? null,
            } : s),
          } : e
        ),
      } : prev);
    } catch { /* ignore — revert handled by re-init on focus */ }
    setSetEdits((prev) => { const n = { ...prev }; delete n[set.id]; return n; });
  }

  async function handleSaveNotes(we: WorkoutExercise) {
    const notes = exerciseNotes[we.id] ?? '';
    const trimmed = notes.trim();
    const current = we.notes ?? '';
    if (trimmed === current) return;
    try {
      await updateWorkoutExercise(token, workoutId, we.id, { notes: trimmed || null });
      setWorkout((prev) => prev ? {
        ...prev,
        exercises: prev.exercises.map((e) => e.id === we.id ? { ...e, notes: trimmed || null } : e),
      } : prev);
    } catch { /* ignore — notes are non-critical */ }
  }

  async function handleToggleSet(we: WorkoutExercise, set: ExerciseSet) {
    const newCompleted = !set.completed;
    // Optimistic update
    setWorkout((prev) => prev ? {
      ...prev,
      exercises: prev.exercises.map((e) =>
        e.id === we.id ? { ...e, sets: e.sets.map((s) => s.id === set.id ? { ...s, completed: newCompleted } : s) } : e
      ),
    } : prev);
    try {
      await updateWorkoutSet(token, workoutId, we.id, set.id, { completed: newCompleted });
    } catch {
      // Revert on failure
      setWorkout((prev) => prev ? {
        ...prev,
        exercises: prev.exercises.map((e) =>
          e.id === we.id ? { ...e, sets: e.sets.map((s) => s.id === set.id ? { ...s, completed: set.completed } : s) } : e
        ),
      } : prev);
    }
  }

  // Running volume: sum of weight_lbs × reps for completed sets
  const runningVolumeLbs = workout?.exercises.reduce((total, we) => {
    return total + we.sets.reduce((sum, set) => {
      if (!set.completed || set.weightKg == null || set.reps == null) return sum;
      return sum + kgToLbs(set.weightKg) * set.reps;
    }, 0);
  }, 0) ?? 0;

  const filteredEx = allExercises.filter((e) => {
    const matchSearch = !exSearch || e.name.toLowerCase().includes(exSearch.toLowerCase());
    const matchCat = !exCategory || e.category === exCategory;
    return matchSearch && matchCat;
  });

  if (loading) {
    return (
      <SafeAreaView style={s.container}>
        <ActivityIndicator style={{ marginTop: 60 }} color={c.accent} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={s.container}>
      {/* Header */}
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()} style={s.backBtn}>
          <Text style={s.backBtnText}>‹ Back</Text>
        </TouchableOpacity>
        <View style={s.timerWrap}>
          <Text style={s.timer}>{formatTimer(elapsed)}</Text>
          {runningVolumeLbs > 0 && (
            <Text style={s.volumeLabel}>
              {Math.round(runningVolumeLbs).toLocaleString()} lbs
            </Text>
          )}
        </View>
        <TouchableOpacity
          style={[s.finishBtn, finishing && s.finishBtnDisabled]}
          onPress={handleFinish}
          disabled={finishing}
        >
          <Text style={s.finishBtnText}>{finishing ? '…' : 'Finish'}</Text>
        </TouchableOpacity>
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior="height">
        <ScrollView style={s.scroll} contentContainerStyle={s.scrollContent} keyboardShouldPersistTaps="handled">
          {/* Date row */}
          {editingDate ? (
            <View style={s.dateRow}>
              <TextInput
                style={s.dateInput}
                value={dateInput}
                onChangeText={setDateInput}
                placeholder="YYYY-MM-DD"
                placeholderTextColor={c.muted}
                autoFocus
                onBlur={() => {
                  setEditingDate(false);
                  if (/^\d{4}-\d{2}-\d{2}$/.test(dateInput) && workout && dateInput !== workout.workoutDate) {
                    updateWorkout(token, workoutId, { workoutDate: dateInput })
                      .then(() => setWorkout((prev) => prev ? { ...prev, workoutDate: dateInput } : prev))
                      .catch(() => Alert.alert('Error', 'Could not update date.'));
                  }
                }}
                onSubmitEditing={() => {
                  setEditingDate(false);
                  if (/^\d{4}-\d{2}-\d{2}$/.test(dateInput) && workout && dateInput !== workout.workoutDate) {
                    updateWorkout(token, workoutId, { workoutDate: dateInput })
                      .then(() => setWorkout((prev) => prev ? { ...prev, workoutDate: dateInput } : prev))
                      .catch(() => Alert.alert('Error', 'Could not update date.'));
                  }
                }}
              />
            </View>
          ) : (
            <TouchableOpacity style={s.dateRow} onPress={() => { setDateInput(workout?.workoutDate ?? ''); setEditingDate(true); }}>
              <Text style={s.dateText}>
                {workout ? new Date(workout.workoutDate + 'T12:00:00').toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }) : ''}
              </Text>
              <Text style={s.dateEdit}>Edit</Text>
            </TouchableOpacity>
          )}

          {workout?.exercises.map((we) => {
            const tf = we.exercise.trackedFields ?? defaultTrackedFields(we.exercise.exerciseType);
            const trackWeight   = tf.includes('weight');
            const trackReps     = tf.includes('reps');
            const trackDuration = tf.includes('duration');
            const trackDistance = tf.includes('distance');
            return (
            <View key={we.id} style={s.exerciseBlock}>
              <View style={s.exerciseHeader}>
                <TouchableOpacity style={{ flex: 1 }} onPress={() => router.push(`/(app)/exercise/${we.exercise.id}`)}>
                  <Text style={s.exerciseName}>{we.exercise.name}</Text>
                </TouchableOpacity>
                <Text style={s.exerciseCategory}>{we.exercise.category}</Text>
                <TouchableOpacity onLongPress={() => handleRemoveExercise(we.id)} onPress={() => handleRemoveExercise(we.id)} style={s.exerciseRemoveBtn}>
                  <Text style={s.exerciseRemoveText}>✕</Text>
                </TouchableOpacity>
              </View>

              {/* Notes */}
              <TextInput
                style={s.exerciseNotes}
                value={exerciseNotes[we.id] ?? ''}
                onChangeText={(v) => setExerciseNotes((prev) => ({ ...prev, [we.id]: v }))}
                onBlur={() => handleSaveNotes(we)}
                placeholder="Notes…"
                placeholderTextColor={c.muted}
                multiline
                scrollEnabled={false}
              />

              {/* Set header */}
              <View style={s.setHeader}>
                <Text style={[s.setCol, s.setColNum]}>#</Text>
                {trackWeight   && <Text style={[s.setCol, s.setColData]}>lbs</Text>}
                {trackReps     && <Text style={[s.setCol, s.setColData]}>reps</Text>}
                {trackDuration && <Text style={[s.setCol, s.setColData]}>time</Text>}
                {trackDistance && <Text style={[s.setCol, s.setColData]}>dist</Text>}
                <View style={s.setColCheck} />
                <View style={s.setColDel} />
              </View>

              {/* Set rows */}
              {we.sets.map((set) => {
                const editing = !!setEdits[set.id];
                const edit = setEdits[set.id];
                return (
                <View key={set.id} style={[s.setRow, set.completed && s.setRowDone]}>
                  <Text style={[s.setCol, s.setColNum, { color: c.muted }]}>{set.setNumber}</Text>
                  {trackWeight && (
                    editing ? (
                      <TextInput
                        style={[s.setInlineInput, s.setColData]}
                        value={edit.weight}
                        onChangeText={(v) => setSetEdits((prev) => ({ ...prev, [set.id]: { ...prev[set.id], weight: v } }))}
                        onBlur={() => handleSaveSetEdit(we, set)}
                        keyboardType="decimal-pad"
                        autoFocus
                        selectTextOnFocus
                      />
                    ) : (
                      <TouchableOpacity style={[s.setColData, s.setColDataTouch]} onPress={() => initSetEdit(set)}>
                        <Text style={[s.setCol, set.completed && s.setTextDone]}>
                          {set.weightKg != null ? Math.round(kgToLbs(set.weightKg) * 10) / 10 : '—'}
                        </Text>
                      </TouchableOpacity>
                    )
                  )}
                  {trackReps && (
                    editing ? (
                      <TextInput
                        style={[s.setInlineInput, s.setColData]}
                        value={edit?.reps ?? ''}
                        onChangeText={(v) => setSetEdits((prev) => ({ ...prev, [set.id]: { ...prev[set.id], reps: v } }))}
                        onBlur={() => handleSaveSetEdit(we, set)}
                        keyboardType="number-pad"
                        selectTextOnFocus
                      />
                    ) : (
                      <TouchableOpacity style={[s.setColData, s.setColDataTouch]} onPress={() => initSetEdit(set)}>
                        <Text style={[s.setCol, set.completed && s.setTextDone]}>{set.reps ?? '—'}</Text>
                      </TouchableOpacity>
                    )
                  )}
                  {trackDuration && (
                    editing ? (
                      <TextInput
                        style={[s.setInlineInput, s.setColData]}
                        value={edit?.duration ?? ''}
                        onChangeText={(v) => setSetEdits((prev) => ({ ...prev, [set.id]: { ...prev[set.id], duration: v } }))}
                        onBlur={() => handleSaveSetEdit(we, set)}
                        keyboardType="numbers-and-punctuation"
                        selectTextOnFocus
                      />
                    ) : (
                      <TouchableOpacity style={[s.setColData, s.setColDataTouch]} onPress={() => initSetEdit(set)}>
                        <Text style={[s.setCol, set.completed && s.setTextDone]}>
                          {set.durationSeconds != null ? secondsToMMSS(set.durationSeconds) : '—'}
                        </Text>
                      </TouchableOpacity>
                    )
                  )}
                  {trackDistance && (
                    editing ? (
                      <TextInput
                        style={[s.setInlineInput, s.setColData]}
                        value={edit?.distance ?? ''}
                        onChangeText={(v) => setSetEdits((prev) => ({ ...prev, [set.id]: { ...prev[set.id], distance: v } }))}
                        onBlur={() => handleSaveSetEdit(we, set)}
                        keyboardType="decimal-pad"
                        selectTextOnFocus
                      />
                    ) : (
                      <TouchableOpacity style={[s.setColData, s.setColDataTouch]} onPress={() => initSetEdit(set)}>
                        <Text style={[s.setCol, set.completed && s.setTextDone]}>
                          {set.distanceMeters != null ? set.distanceMeters : '—'}
                        </Text>
                      </TouchableOpacity>
                    )
                  )}
                  <TouchableOpacity style={s.setColCheck} onPress={() => handleToggleSet(we, set)}>
                    <View style={[s.checkBox, set.completed && s.checkBoxDone]}>
                      {set.completed && <Text style={s.checkMark}>✓</Text>}
                    </View>
                  </TouchableOpacity>
                  <TouchableOpacity style={s.setColDel} onPress={() => handleDeleteSet(we, set)}>
                    <Text style={s.setDelText}>✕</Text>
                  </TouchableOpacity>
                </View>
                );
              })}

              {/* Add set input row */}
              <View style={s.addSetRow}>
                <View style={s.setColNum} />
                {trackWeight && (
                  <TextInput
                    style={[s.setInput, s.setColData]}
                    placeholder="lbs"
                    placeholderTextColor={c.muted}
                    keyboardType="decimal-pad"
                    value={setInputs[we.id]?.weight ?? ''}
                    onChangeText={(v) => setSetInputs((prev) => ({ ...prev, [we.id]: { ...prev[we.id], weight: v, reps: prev[we.id]?.reps ?? '', duration: prev[we.id]?.duration ?? '', distance: prev[we.id]?.distance ?? '' } }))}
                  />
                )}
                {trackReps && (
                  <TextInput
                    style={[s.setInput, s.setColData]}
                    placeholder="reps"
                    placeholderTextColor={c.muted}
                    keyboardType="number-pad"
                    value={setInputs[we.id]?.reps ?? ''}
                    onChangeText={(v) => setSetInputs((prev) => ({ ...prev, [we.id]: { ...prev[we.id], reps: v, weight: prev[we.id]?.weight ?? '', duration: prev[we.id]?.duration ?? '', distance: prev[we.id]?.distance ?? '' } }))}
                  />
                )}
                {trackDuration && (
                  <TextInput
                    style={[s.setInput, s.setColData]}
                    placeholder="m:ss"
                    placeholderTextColor={c.muted}
                    keyboardType="numbers-and-punctuation"
                    value={setInputs[we.id]?.duration ?? ''}
                    onChangeText={(v) => setSetInputs((prev) => ({ ...prev, [we.id]: { ...prev[we.id], duration: v, weight: prev[we.id]?.weight ?? '', reps: prev[we.id]?.reps ?? '', distance: prev[we.id]?.distance ?? '' } }))}
                  />
                )}
                {trackDistance && (
                  <TextInput
                    style={[s.setInput, s.setColData]}
                    placeholder="dist"
                    placeholderTextColor={c.muted}
                    keyboardType="decimal-pad"
                    value={setInputs[we.id]?.distance ?? ''}
                    onChangeText={(v) => setSetInputs((prev) => ({ ...prev, [we.id]: { ...prev[we.id], distance: v, weight: prev[we.id]?.weight ?? '', reps: prev[we.id]?.reps ?? '', duration: prev[we.id]?.duration ?? '' } }))}
                  />
                )}
                <TouchableOpacity style={[s.setColDel, s.addSetBtn]} onPress={() => handleAddSet(we)}>
                  <Text style={s.addSetBtnText}>+</Text>
                </TouchableOpacity>
              </View>
            </View>
            );
          })}

          <TouchableOpacity style={s.addExBtn} onPress={openExPicker}>
            <Text style={s.addExBtnText}>+ Add Exercise</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[s.finishBtnBottom, finishing && s.finishBtnDisabled]}
            onPress={handleFinish}
            disabled={finishing}
          >
            <Text style={s.finishBtnText}>{finishing ? 'Finishing…' : 'Finish Workout'}</Text>
          </TouchableOpacity>

          <TouchableOpacity style={s.cancelSessionBtn} onPress={handleCancel}>
            <Text style={s.cancelSessionText}>Cancel Session</Text>
          </TouchableOpacity>

          <View style={{ height: 40 }} />
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Exercise picker modal */}
      <Modal visible={showPicker} animationType="slide" onRequestClose={() => setShowPicker(false)}>
        <SafeAreaView style={s.modal}>
          <View style={s.modalHeader}>
            <Text style={s.modalTitle}>Add Exercise</Text>
            <TouchableOpacity onPress={() => setShowPicker(false)}>
              <Text style={s.modalClose}>✕</Text>
            </TouchableOpacity>
          </View>

          {showCreateEx ? (
            <ScrollView style={s.modalBody} keyboardShouldPersistTaps="handled">
              <Text style={s.createLabel}>Exercise name</Text>
              <TextInput style={s.createInput} value={newExName} onChangeText={setNewExName} placeholder="e.g. Bulgarian Split Squat" placeholderTextColor={c.muted} />
              <Text style={s.createLabel}>Category</Text>
              <TextInput style={s.createInput} value={newExCategory} onChangeText={setNewExCategory} placeholder="e.g. Legs" placeholderTextColor={c.muted} />
              <Text style={s.createLabel}>Type</Text>
              <View style={s.typeRow}>
                {['weight', 'bodyweight', 'cardio', 'duration'].map((t) => (
                  <TouchableOpacity
                    key={t}
                    style={[s.typeBtn, newExType === t && s.typeBtnActive]}
                    onPress={() => setNewExType(t)}
                  >
                    <Text style={[s.typeBtnText, newExType === t && { color: c.bg }]}>{t}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              <TouchableOpacity style={s.confirmBtn} onPress={handleCreateCustomEx}>
                <Text style={s.confirmBtnText}>Create & Add</Text>
              </TouchableOpacity>
              <TouchableOpacity style={s.cancelLink} onPress={() => setShowCreateEx(false)}>
                <Text style={s.cancelLinkText}>Cancel</Text>
              </TouchableOpacity>
            </ScrollView>
          ) : (
            <>
              <View style={s.exSearchBox}>
                <TextInput
                  style={s.exSearchInput}
                  placeholder="Search exercises…"
                  placeholderTextColor={c.muted}
                  value={exSearch}
                  onChangeText={setExSearch}
                  autoFocus
                />
              </View>
              {/* Category chips */}
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.catScroll} contentContainerStyle={s.catScrollContent}>
                <TouchableOpacity style={[s.catChip, !exCategory && s.catChipActive]} onPress={() => setExCategory(null)}>
                  <Text style={[s.catChipText, !exCategory && { color: c.bg }]}>All</Text>
                </TouchableOpacity>
                {categories.map((cat) => (
                  <TouchableOpacity key={cat} style={[s.catChip, exCategory === cat && s.catChipActive]} onPress={() => setExCategory(cat === exCategory ? null : cat)}>
                    <Text style={[s.catChipText, exCategory === cat && { color: c.bg }]}>{cat}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
              {exLoading ? (
                <ActivityIndicator style={{ marginTop: 30 }} color={c.accent} />
              ) : (
                <FlatList
                  data={filteredEx}
                  keyExtractor={(item) => String(item.id)}
                  renderItem={({ item }) => (
                    <TouchableOpacity style={s.exRow} onPress={() => handleAddExercise(item)}>
                      <View>
                        <Text style={s.exName}>{item.name}</Text>
                        <Text style={s.exMeta}>{item.category} · {item.exerciseType}</Text>
                      </View>
                    </TouchableOpacity>
                  )}
                  ListFooterComponent={
                    <TouchableOpacity style={s.createExLink} onPress={() => setShowCreateEx(true)}>
                      <Text style={s.createExLinkText}>+ Create custom exercise</Text>
                    </TouchableOpacity>
                  }
                  keyboardShouldPersistTaps="handled"
                />
              )}
            </>
          )}
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

function makeStyles(c: Colors) {
  return StyleSheet.create({
  container: { flex: 1, backgroundColor: c.bg },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: c.border },
  backBtn: { paddingHorizontal: 8, paddingVertical: 4 },
  backBtnText: { color: c.accent, fontSize: fontSize.sm },
  timerWrap: { flex: 1, alignItems: 'center' },
  timer: { fontSize: fontSize.xl, fontWeight: '700', color: c.text, fontVariant: ['tabular-nums'] },
  volumeLabel: { fontSize: fontSize.xs, color: c.muted, marginTop: 1 },
  finishBtn: { backgroundColor: c.accent, borderRadius: 8, paddingHorizontal: 14, paddingVertical: 7 },
  finishBtnBottom: { backgroundColor: c.accent, borderRadius: 12, paddingVertical: 14, alignItems: 'center', marginTop: 4 },
  cancelSessionBtn: { alignItems: 'center', paddingVertical: 14 },
  cancelSessionText: { fontSize: fontSize.sm, color: c.muted },
  finishBtnDisabled: { opacity: 0.5 },
  finishBtnText: { fontSize: fontSize.sm, fontWeight: '700', color: c.bg },
  scroll: { flex: 1 },
  scrollContent: { padding: 14, gap: 12 },
  dateRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 4, paddingVertical: 4 },
  dateText: { fontSize: fontSize.sm, color: c.muted },
  dateEdit: { fontSize: fontSize.xs, color: c.accent },
  dateInput: { flex: 1, fontSize: fontSize.sm, color: c.text, backgroundColor: c.card, borderRadius: 8, borderWidth: 1, borderColor: c.accent, paddingHorizontal: 10, paddingVertical: 6 },
  exerciseBlock: { backgroundColor: c.card, borderRadius: 12, borderWidth: 1, borderColor: c.border, overflow: 'hidden' },
  exerciseHeader: { padding: 14, flexDirection: 'row', alignItems: 'center', borderBottomWidth: 1, borderBottomColor: c.border, gap: 8 },
  exerciseName: { fontSize: fontSize.base, fontWeight: '600', color: c.accent },
  exerciseCategory: { fontSize: fontSize.xs, color: c.muted },
  exerciseRemoveBtn: { paddingLeft: 4, paddingVertical: 4 },
  exerciseRemoveText: { color: c.border, fontSize: 13 },
  exerciseNotes: { paddingHorizontal: 14, paddingVertical: 8, fontSize: fontSize.xs, color: c.muted, borderBottomWidth: 1, borderBottomColor: c.border, minHeight: 32 },
  setHeader: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 6, backgroundColor: 'rgba(255,255,255,0.02)' },
  setRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 10, borderTopWidth: 1, borderTopColor: c.border },
  addSetRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 8, borderTopWidth: 1, borderTopColor: c.border, gap: 0 },
  setCol: { fontSize: fontSize.sm, color: c.text, textAlign: 'center' },
  setColNum: { width: 28, textAlign: 'center', fontSize: fontSize.xs },
  setColData: { flex: 1, textAlign: 'center' },
  setColWeight: { flex: 1, textAlign: 'center' },
  setColReps: { flex: 1, textAlign: 'center' },
  setColCheck: { width: 32, alignItems: 'center' },
  setColDel: { width: 32, alignItems: 'center' },
  setDelText: { color: c.border, fontSize: 13 },
  setRowDone: { backgroundColor: 'rgba(52,211,153,0.06)' },
  setTextDone: { color: c.muted },
  checkBox: { width: 20, height: 20, borderRadius: 4, borderWidth: 1.5, borderColor: c.border, alignItems: 'center', justifyContent: 'center' },
  checkBoxDone: { backgroundColor: '#34d399', borderColor: '#34d399' },
  checkMark: { fontSize: 12, color: c.bg, fontWeight: '700', lineHeight: 14 },
  setInput: { borderWidth: 1, borderColor: c.border, borderRadius: 6, paddingHorizontal: 6, paddingVertical: 6, fontSize: fontSize.sm, color: c.text, backgroundColor: c.bg, textAlign: 'center', marginHorizontal: 2 },
  setInlineInput: { borderWidth: 1, borderColor: c.accent, borderRadius: 6, paddingHorizontal: 4, paddingVertical: 4, fontSize: fontSize.sm, color: c.text, backgroundColor: c.bg, textAlign: 'center' },
  setColDataTouch: { alignItems: 'center', justifyContent: 'center', minHeight: 32 },
  addSetBtn: { backgroundColor: c.accent, borderRadius: 6, width: 28, height: 28, alignItems: 'center', justifyContent: 'center' },
  addSetBtnText: { color: c.bg, fontWeight: '700', fontSize: 18, lineHeight: 20 },
  addExBtn: { borderWidth: 1, borderColor: c.accent, borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
  addExBtnText: { fontSize: fontSize.sm, color: c.accent, fontWeight: '600' },
  // Modal
  modal: { flex: 1, backgroundColor: c.bg },
  modalHeader: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: c.border },
  modalTitle: { flex: 1, fontSize: fontSize.lg, fontWeight: '700', color: c.text },
  modalClose: { fontSize: 20, color: c.muted, paddingLeft: 12 },
  modalBody: { flex: 1, padding: 16 },
  exSearchBox: { borderBottomWidth: 1, borderBottomColor: c.border, paddingHorizontal: 16 },
  exSearchInput: { paddingVertical: 14, fontSize: fontSize.base, color: c.text },
  catScroll: { maxHeight: 48 },
  catScrollContent: { paddingHorizontal: 12, paddingVertical: 8, gap: 8, flexDirection: 'row' },
  catChip: { borderWidth: 1, borderColor: c.border, borderRadius: 20, paddingHorizontal: 12, paddingVertical: 5 },
  catChipActive: { backgroundColor: c.accent, borderColor: c.accent },
  catChipText: { fontSize: fontSize.xs, color: c.muted },
  exRow: { paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: c.border },
  exName: { fontSize: fontSize.sm, color: c.text, fontWeight: '500' },
  exMeta: { fontSize: fontSize.xs, color: c.muted, marginTop: 1 },
  createExLink: { paddingHorizontal: 16, paddingVertical: 16 },
  createExLinkText: { fontSize: fontSize.sm, color: c.accent },
  createLabel: { fontSize: fontSize.xs, color: c.muted, textTransform: 'uppercase', letterSpacing: 0.8, marginTop: 16, marginBottom: 6 },
  createInput: { borderWidth: 1, borderColor: c.border, borderRadius: 8, paddingHorizontal: 14, paddingVertical: 10, fontSize: fontSize.base, color: c.text, backgroundColor: c.card },
  typeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4 },
  typeBtn: { borderWidth: 1, borderColor: c.border, borderRadius: 8, paddingHorizontal: 14, paddingVertical: 8 },
  typeBtnActive: { backgroundColor: c.accent, borderColor: c.accent },
  typeBtnText: { fontSize: fontSize.sm, color: c.muted },
  confirmBtn: { backgroundColor: c.accent, borderRadius: 10, paddingVertical: 14, alignItems: 'center', marginTop: 24 },
  confirmBtnText: { fontSize: fontSize.base, fontWeight: '700', color: c.bg },
  cancelLink: { paddingVertical: 14, alignItems: 'center' },
  cancelLinkText: { fontSize: fontSize.sm, color: c.muted },
  });
}
