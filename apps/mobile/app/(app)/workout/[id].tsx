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
  addWorkoutExercise, removeWorkoutExercise,
  addWorkoutSet, updateWorkoutSet, deleteWorkoutSet,
  getExercises, getExerciseCategories, createCustomExercise,
  type WorkoutDetail, type WorkoutExercise, type ExerciseSet, type Exercise,
} from '../../../src/api/client';
import { useAuthStore } from '../../../src/store/auth';
import { colors, fontSize } from '../../../src/theme';

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

export default function WorkoutDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const workoutId = Number(id);
  const token = useAuthStore((s) => s.token)!;
  const router = useRouter();

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

  // Set input state: { [weId]: { weight: string; reps: string } }
  const [setInputs, setSetInputs] = useState<Record<number, { weight: string; reps: string }>>({});

  const load = useCallback(async () => {
    try {
      const data = await getWorkout(token, workoutId);
      setWorkout(data);

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
    const inp = setInputs[we.id] ?? { weight: '', reps: '' };
    const weightLbs = parseFloat(inp.weight);
    const reps = parseInt(inp.reps, 10);
    const payload: { reps?: number; weightKg?: number } = {};
    if (!isNaN(reps) && reps > 0) payload.reps = reps;
    if (!isNaN(weightLbs) && weightLbs >= 0) payload.weightKg = parseFloat(lbsToKg(weightLbs).toFixed(4));
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
        <ActivityIndicator style={{ marginTop: 60 }} color={colors.accent} />
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
              {runningVolumeLbs >= 1000
                ? `${(runningVolumeLbs / 1000).toFixed(1)}k lbs`
                : `${Math.round(runningVolumeLbs)} lbs`}
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
          {workout?.exercises.map((we) => (
            <View key={we.id} style={s.exerciseBlock}>
              <TouchableOpacity
                style={s.exerciseHeader}
                onLongPress={() => handleRemoveExercise(we.id)}
              >
                <Text style={s.exerciseName}>{we.exercise.name}</Text>
                <Text style={s.exerciseCategory}>{we.exercise.category}</Text>
              </TouchableOpacity>

              {/* Set rows */}
              <View style={s.setHeader}>
                <Text style={[s.setCol, s.setColNum]}>#</Text>
                <Text style={[s.setCol, s.setColWeight]}>lbs</Text>
                <Text style={[s.setCol, s.setColReps]}>reps</Text>
                <View style={s.setColCheck} />
                <View style={s.setColDel} />
              </View>
              {we.sets.map((set) => (
                <View key={set.id} style={[s.setRow, set.completed && s.setRowDone]}>
                  <Text style={[s.setCol, s.setColNum, { color: colors.muted }]}>{set.setNumber}</Text>
                  <Text style={[s.setCol, s.setColWeight, set.completed && s.setTextDone]}>
                    {set.weightKg != null ? Math.round(kgToLbs(set.weightKg) * 10) / 10 : '—'}
                  </Text>
                  <Text style={[s.setCol, s.setColReps, set.completed && s.setTextDone]}>{set.reps ?? '—'}</Text>
                  <TouchableOpacity style={s.setColCheck} onPress={() => handleToggleSet(we, set)}>
                    <View style={[s.checkBox, set.completed && s.checkBoxDone]}>
                      {set.completed && <Text style={s.checkMark}>✓</Text>}
                    </View>
                  </TouchableOpacity>
                  <TouchableOpacity style={s.setColDel} onPress={() => handleDeleteSet(we, set)}>
                    <Text style={s.setDelText}>✕</Text>
                  </TouchableOpacity>
                </View>
              ))}

              {/* Add set input row */}
              <View style={s.addSetRow}>
                <View style={s.setColNum} />
                <TextInput
                  style={[s.setInput, s.setColWeight]}
                  placeholder="lbs"
                  placeholderTextColor={colors.muted}
                  keyboardType="decimal-pad"
                  value={setInputs[we.id]?.weight ?? ''}
                  onChangeText={(v) => setSetInputs((prev) => ({ ...prev, [we.id]: { ...prev[we.id], weight: v } }))}
                />
                <TextInput
                  style={[s.setInput, s.setColReps]}
                  placeholder="reps"
                  placeholderTextColor={colors.muted}
                  keyboardType="number-pad"
                  value={setInputs[we.id]?.reps ?? ''}
                  onChangeText={(v) => setSetInputs((prev) => ({ ...prev, [we.id]: { ...prev[we.id], reps: v } }))}
                />
                <TouchableOpacity style={[s.setColDel, s.addSetBtn]} onPress={() => handleAddSet(we)}>
                  <Text style={s.addSetBtnText}>+</Text>
                </TouchableOpacity>
              </View>
            </View>
          ))}

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
              <TextInput style={s.createInput} value={newExName} onChangeText={setNewExName} placeholder="e.g. Bulgarian Split Squat" placeholderTextColor={colors.muted} />
              <Text style={s.createLabel}>Category</Text>
              <TextInput style={s.createInput} value={newExCategory} onChangeText={setNewExCategory} placeholder="e.g. Legs" placeholderTextColor={colors.muted} />
              <Text style={s.createLabel}>Type</Text>
              <View style={s.typeRow}>
                {['weight', 'bodyweight', 'cardio', 'duration'].map((t) => (
                  <TouchableOpacity
                    key={t}
                    style={[s.typeBtn, newExType === t && s.typeBtnActive]}
                    onPress={() => setNewExType(t)}
                  >
                    <Text style={[s.typeBtnText, newExType === t && { color: colors.bg }]}>{t}</Text>
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
                  placeholderTextColor={colors.muted}
                  value={exSearch}
                  onChangeText={setExSearch}
                  autoFocus
                />
              </View>
              {/* Category chips */}
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.catScroll} contentContainerStyle={s.catScrollContent}>
                <TouchableOpacity style={[s.catChip, !exCategory && s.catChipActive]} onPress={() => setExCategory(null)}>
                  <Text style={[s.catChipText, !exCategory && { color: colors.bg }]}>All</Text>
                </TouchableOpacity>
                {categories.map((cat) => (
                  <TouchableOpacity key={cat} style={[s.catChip, exCategory === cat && s.catChipActive]} onPress={() => setExCategory(cat === exCategory ? null : cat)}>
                    <Text style={[s.catChipText, exCategory === cat && { color: colors.bg }]}>{cat}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
              {exLoading ? (
                <ActivityIndicator style={{ marginTop: 30 }} color={colors.accent} />
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

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.border },
  backBtn: { paddingHorizontal: 8, paddingVertical: 4 },
  backBtnText: { color: colors.accent, fontSize: fontSize.sm },
  timerWrap: { flex: 1, alignItems: 'center' },
  timer: { fontSize: fontSize.xl, fontWeight: '700', color: colors.text, fontVariant: ['tabular-nums'] },
  volumeLabel: { fontSize: fontSize.xs, color: colors.muted, marginTop: 1 },
  finishBtn: { backgroundColor: colors.accent, borderRadius: 8, paddingHorizontal: 14, paddingVertical: 7 },
  finishBtnBottom: { backgroundColor: colors.accent, borderRadius: 12, paddingVertical: 14, alignItems: 'center', marginTop: 4 },
  cancelSessionBtn: { alignItems: 'center', paddingVertical: 14 },
  cancelSessionText: { fontSize: fontSize.sm, color: colors.muted },
  finishBtnDisabled: { opacity: 0.5 },
  finishBtnText: { fontSize: fontSize.sm, fontWeight: '700', color: colors.bg },
  scroll: { flex: 1 },
  scrollContent: { padding: 14, gap: 12 },
  exerciseBlock: { backgroundColor: colors.card, borderRadius: 12, borderWidth: 1, borderColor: colors.border, overflow: 'hidden' },
  exerciseHeader: { padding: 14, flexDirection: 'row', alignItems: 'center', borderBottomWidth: 1, borderBottomColor: colors.border },
  exerciseName: { flex: 1, fontSize: fontSize.base, fontWeight: '600', color: colors.text },
  exerciseCategory: { fontSize: fontSize.xs, color: colors.muted },
  setHeader: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 6, backgroundColor: 'rgba(255,255,255,0.02)' },
  setRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 10, borderTopWidth: 1, borderTopColor: colors.border },
  addSetRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 8, borderTopWidth: 1, borderTopColor: colors.border, gap: 0 },
  setCol: { fontSize: fontSize.sm, color: colors.text, textAlign: 'center' },
  setColNum: { width: 28, textAlign: 'center', fontSize: fontSize.xs },
  setColWeight: { flex: 1, textAlign: 'center' },
  setColReps: { flex: 1, textAlign: 'center' },
  setColCheck: { width: 32, alignItems: 'center' },
  setColDel: { width: 32, alignItems: 'center' },
  setDelText: { color: colors.border, fontSize: 13 },
  setRowDone: { backgroundColor: 'rgba(52,211,153,0.06)' },
  setTextDone: { color: colors.muted },
  checkBox: { width: 20, height: 20, borderRadius: 4, borderWidth: 1.5, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  checkBoxDone: { backgroundColor: '#34d399', borderColor: '#34d399' },
  checkMark: { fontSize: 12, color: colors.bg, fontWeight: '700', lineHeight: 14 },
  setInput: { borderWidth: 1, borderColor: colors.border, borderRadius: 6, paddingHorizontal: 6, paddingVertical: 6, fontSize: fontSize.sm, color: colors.text, backgroundColor: colors.bg, textAlign: 'center', marginHorizontal: 2 },
  addSetBtn: { backgroundColor: colors.accent, borderRadius: 6, width: 28, height: 28, alignItems: 'center', justifyContent: 'center' },
  addSetBtnText: { color: colors.bg, fontWeight: '700', fontSize: 18, lineHeight: 20 },
  addExBtn: { borderWidth: 1, borderColor: colors.accent, borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
  addExBtnText: { fontSize: fontSize.sm, color: colors.accent, fontWeight: '600' },
  // Modal
  modal: { flex: 1, backgroundColor: colors.bg },
  modalHeader: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.border },
  modalTitle: { flex: 1, fontSize: fontSize.lg, fontWeight: '700', color: colors.text },
  modalClose: { fontSize: 20, color: colors.muted, paddingLeft: 12 },
  modalBody: { flex: 1, padding: 16 },
  exSearchBox: { borderBottomWidth: 1, borderBottomColor: colors.border, paddingHorizontal: 16 },
  exSearchInput: { paddingVertical: 14, fontSize: fontSize.base, color: colors.text },
  catScroll: { maxHeight: 48 },
  catScrollContent: { paddingHorizontal: 12, paddingVertical: 8, gap: 8, flexDirection: 'row' },
  catChip: { borderWidth: 1, borderColor: colors.border, borderRadius: 20, paddingHorizontal: 12, paddingVertical: 5 },
  catChipActive: { backgroundColor: colors.accent, borderColor: colors.accent },
  catChipText: { fontSize: fontSize.xs, color: colors.muted },
  exRow: { paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.border },
  exName: { fontSize: fontSize.sm, color: colors.text, fontWeight: '500' },
  exMeta: { fontSize: fontSize.xs, color: colors.muted, marginTop: 1 },
  createExLink: { paddingHorizontal: 16, paddingVertical: 16 },
  createExLinkText: { fontSize: fontSize.sm, color: colors.accent },
  createLabel: { fontSize: fontSize.xs, color: colors.muted, textTransform: 'uppercase', letterSpacing: 0.8, marginTop: 16, marginBottom: 6 },
  createInput: { borderWidth: 1, borderColor: colors.border, borderRadius: 8, paddingHorizontal: 14, paddingVertical: 10, fontSize: fontSize.base, color: colors.text, backgroundColor: colors.card },
  typeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4 },
  typeBtn: { borderWidth: 1, borderColor: colors.border, borderRadius: 8, paddingHorizontal: 14, paddingVertical: 8 },
  typeBtnActive: { backgroundColor: colors.accent, borderColor: colors.accent },
  typeBtnText: { fontSize: fontSize.sm, color: colors.muted },
  confirmBtn: { backgroundColor: colors.accent, borderRadius: 10, paddingVertical: 14, alignItems: 'center', marginTop: 24 },
  confirmBtnText: { fontSize: fontSize.base, fontWeight: '700', color: colors.bg },
  cancelLink: { paddingVertical: 14, alignItems: 'center' },
  cancelLinkText: { fontSize: fontSize.sm, color: colors.muted },
});
