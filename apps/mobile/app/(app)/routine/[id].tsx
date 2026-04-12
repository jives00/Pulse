import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator, Alert, FlatList, Keyboard, KeyboardAvoidingView, Modal,
  Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity,
  TouchableWithoutFeedback, View, useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import {
  getRoutine, updateRoutine, deleteRoutine, startRoutine,
  addRoutineExercise, removeRoutineExercise,
  addRoutineTemplateSet, updateRoutineTemplateSet, deleteRoutineTemplateSet,
  getWorkouts, getExercises, getExerciseCategories, createCustomExercise,
  type RoutineDetail, type RoutineExercise, type RoutineExerciseSet, type Exercise,
} from '../../../src/api/client';
import { useAuthStore } from '../../../src/store/auth';
import { fontSize, type Colors } from '../../../src/theme';
import { useColors } from '../../../src/hooks/useColors';
import FilterChip from '../../../src/components/FilterChip';

const KG_TO_LBS = 2.20462;

function lbsToKg(lbs: number) { return lbs / KG_TO_LBS; }
function kgToLbs(kg: number) { return kg * KG_TO_LBS; }
function fmtWeight(kg: number | null) {
  if (kg == null) return '';
  const lbs = kgToLbs(kg);
  return String(lbs % 1 === 0 ? Math.round(lbs) : lbs.toFixed(1));
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
function shortDate(dateStr: string) {
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-US', { month: 'numeric', day: 'numeric' });
}

// ── Volume line chart (pure RN, no SVG lib) ───────────────────────────────────

const CHART_H = 80;
const DOT_R = 3;

function VolumeLineChart({ data, c }: { data: { date: string; volumeLbs: number }[]; c: Colors }) {
  const { width } = useWindowDimensions();
  const chartWidth = width - 56; // 14 padding each side + 14 card padding each side
  if (data.length === 0) return null;

  const maxVal = Math.max(...data.map((d) => d.volumeLbs), 1);
  const pts = data.map((entry, i) => {
    const x = data.length > 1 ? (i / (data.length - 1)) * chartWidth : chartWidth / 2;
    const y = CHART_H - DOT_R - Math.max((entry.volumeLbs / maxVal) * (CHART_H - DOT_R * 2), 0);
    return { x, y, val: entry.volumeLbs, date: entry.date };
  });
  const lastPt = pts[pts.length - 1];

  return (
    <View>
      <View style={{ height: CHART_H, width: chartWidth, position: 'relative' }}>
        {/* Lines between dots */}
        {pts.map((pt, i) => {
          if (i === pts.length - 1) return null;
          const next = pts[i + 1];
          const dx = next.x - pt.x;
          const dy = next.y - pt.y;
          const len = Math.sqrt(dx * dx + dy * dy);
          const angle = Math.atan2(dy, dx) * (180 / Math.PI);
          return (
            <View
              key={data[i].date + '_line'}
              style={{
                position: 'absolute',
                left: pt.x,
                top: pt.y - 0.75,
                width: len,
                height: 1.5,
                backgroundColor: '#3b82f688',
                transformOrigin: 'left center',
                transform: [{ rotate: `${angle}deg` }],
              }}
            />
          );
        })}
        {/* Dots */}
        {pts.map((pt, i) => (
          <View
            key={data[i].date + '_dot'}
            style={{
              position: 'absolute',
              left: pt.x - DOT_R,
              top: pt.y - DOT_R,
              width: DOT_R * 2,
              height: DOT_R * 2,
              borderRadius: DOT_R,
              backgroundColor: i === pts.length - 1 ? '#3b82f6' : '#3b82f699',
            }}
          />
        ))}
      </View>
      {/* X-axis labels: first and last */}
      {data.length >= 2 && (
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 }}>
          <Text style={{ fontSize: 9, color: '#94a3b8' }}>{shortDate(data[0].date)}</Text>
          <Text style={{ fontSize: 9, color: '#94a3b8' }}>{shortDate(data[data.length - 1].date)}</Text>
        </View>
      )}
    </View>
  );
}

// ── Template set row ──────────────────────────────────────────────────────────

function TemplateSetRow({
  set, routineId, reId, trackedFields, onUpdated, onDeleted, c,
}: {
  set: RoutineExerciseSet;
  routineId: number;
  reId: number;
  trackedFields: string[];
  onUpdated: (s: RoutineExerciseSet) => void;
  onDeleted: (id: number) => void;
  c: Colors;
}) {
  const token = useAuthStore((s) => s.token)!;
  const showWeight   = trackedFields.includes('weight');
  const showReps     = trackedFields.includes('reps');
  const showDuration = trackedFields.includes('duration');
  const showDistance = trackedFields.includes('distance');

  const [reps, setReps]         = useState(String(set.reps ?? ''));
  const [weight, setWeight]     = useState(fmtWeight(set.weightKg));
  const [duration, setDuration] = useState(secondsToMMSS(set.durationSeconds));
  const [distance, setDistance] = useState(String(set.distanceMeters ?? ''));

  async function handleBlur() {
    Keyboard.dismiss();
    const newReps      = showReps     && reps     !== '' ? Number(reps)     : null;
    const newWeightLbs = showWeight   && weight   !== '' ? Number(weight)   : null;
    const newWeightKg  = newWeightLbs != null ? lbsToKg(newWeightLbs) : null;
    const newDuration  = showDuration ? mmssToSeconds(duration) : null;
    const newDistance  = showDistance && distance !== '' ? Number(distance) : null;
    try {
      await updateRoutineTemplateSet(token, routineId, reId, set.id, {
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
      await deleteRoutineTemplateSet(token, routineId, reId, set.id);
      onDeleted(set.id);
    } catch { /* ignore */ }
  }

  const fieldCount = [showWeight, showReps, showDuration, showDistance].filter(Boolean).length;
  const inputStyle = {
    flex: 1,
    backgroundColor: c.bg,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: c.border,
    paddingHorizontal: 6,
    paddingVertical: 6,
    fontSize: fontSize.sm,
    color: c.text,
    textAlign: 'center' as const,
    minWidth: 0,
  };

  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 4 }}>
      <Text style={{ fontSize: fontSize.xs, color: c.muted, width: 20, textAlign: 'center' }}>{set.setNumber}</Text>
      {showWeight && (
        <TextInput
          style={inputStyle}
          value={weight}
          onChangeText={setWeight}
          onBlur={handleBlur}
          placeholder="lbs"
          placeholderTextColor={c.muted}
          keyboardType="decimal-pad"
          returnKeyType="done"
          onSubmitEditing={handleBlur}
          blurOnSubmit
        />
      )}
      {showReps && (
        <TextInput
          style={inputStyle}
          value={reps}
          onChangeText={setReps}
          onBlur={handleBlur}
          placeholder="reps"
          placeholderTextColor={c.muted}
          keyboardType="number-pad"
          returnKeyType="done"
          onSubmitEditing={handleBlur}
          blurOnSubmit
        />
      )}
      {showDuration && (
        <TextInput
          style={inputStyle}
          value={duration}
          onChangeText={setDuration}
          onBlur={handleBlur}
          placeholder="m:ss"
          placeholderTextColor={c.muted}
          keyboardType="numbers-and-punctuation"
          returnKeyType="done"
          onSubmitEditing={handleBlur}
          blurOnSubmit
        />
      )}
      {showDistance && (
        <TextInput
          style={inputStyle}
          value={distance}
          onChangeText={setDistance}
          onBlur={handleBlur}
          placeholder="dist"
          placeholderTextColor={c.muted}
          keyboardType="decimal-pad"
          returnKeyType="done"
          onSubmitEditing={handleBlur}
          blurOnSubmit
        />
      )}
      <TouchableOpacity onPress={handleDelete} style={{ paddingHorizontal: 6 }}>
        <Text style={{ fontSize: fontSize.sm, color: c.muted }}>✕</Text>
      </TouchableOpacity>
    </View>
  );
}

// ── Routine exercise block ────────────────────────────────────────────────────

function RoutineExerciseBlock({
  re, routineId, onRemove, onSetsChanged, c,
}: {
  re: RoutineExercise;
  routineId: number;
  onRemove: (reId: number) => void;
  onSetsChanged: (reId: number, sets: RoutineExerciseSet[]) => void;
  c: Colors;
}) {
  const token = useAuthStore((s) => s.token)!;
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
      const refLast = refSets ? refSets[refSets.length - 1] : null;
      const s = await addRoutineTemplateSet(token, routineId, re.id, {
        reps: last?.reps ?? refLast?.reps ?? undefined,
        weightKg: last?.weightKg ?? refLast?.weightKg ?? undefined,
        durationSeconds: last?.durationSeconds ?? refLast?.durationSeconds ?? undefined,
      });
      updateSets([...sets, s]);
    } catch { /* ignore */ }
    finally { setAdding(false); }
  }

  const trackedFields = re.exercise.trackedFields
    ? re.exercise.trackedFields.split(',')
    : ['reps', 'weight'];
  const showWeightHeader   = trackedFields.includes('weight');
  const showRepsHeader     = trackedFields.includes('reps');
  const showDurationHeader = trackedFields.includes('duration');
  const showDistanceHeader = trackedFields.includes('distance');

  const showLastPerformed = sets.length === 0 && re.lastPerformedSets && re.lastPerformedSets.length > 0;

  return (
    <View style={{ backgroundColor: c.card, borderRadius: 12, borderWidth: 1, borderColor: c.border, padding: 12, gap: 8 }}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={{ fontSize: fontSize.sm, fontWeight: '600', color: c.text }} numberOfLines={2}>
            {re.exercise.name}
          </Text>
          <Text style={{ fontSize: fontSize.xs, color: c.muted, marginTop: 1 }}>{re.exercise.category}</Text>
        </View>
        <TouchableOpacity onPress={() => onRemove(re.id)} style={{ paddingLeft: 8 }}>
          <Text style={{ fontSize: fontSize.xs, color: c.muted }}>Remove</Text>
        </TouchableOpacity>
      </View>

      {/* Last performed reference */}
      {showLastPerformed && (
        <View style={{ backgroundColor: c.bg, borderRadius: 8, borderWidth: 1, borderColor: c.border, padding: 8 }}>
          <Text style={{ fontSize: fontSize.xs, color: c.muted, marginBottom: 4 }}>Last session (reference)</Text>
          {re.lastPerformedSets!.map((ls) => (
            <Text key={ls.setNumber} style={{ fontSize: fontSize.xs, color: c.text, paddingVertical: 1 }}>
              Set {ls.setNumber}:
              {ls.weightKg != null && ` ${fmtWeight(ls.weightKg)} lbs`}
              {ls.reps != null && ` × ${ls.reps} reps`}
              {ls.durationSeconds != null && ` ${secondsToMMSS(ls.durationSeconds)}`}
              {ls.distanceMeters != null && ` ${ls.distanceMeters}m`}
            </Text>
          ))}
        </View>
      )}

      {/* Column headers */}
      {sets.length > 0 && (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingBottom: 2 }}>
          <View style={{ width: 20 }} />
          {showWeightHeader   && <Text style={{ flex: 1, fontSize: fontSize.xs, color: c.muted, textAlign: 'center' }}>lbs</Text>}
          {showRepsHeader     && <Text style={{ flex: 1, fontSize: fontSize.xs, color: c.muted, textAlign: 'center' }}>reps</Text>}
          {showDurationHeader && <Text style={{ flex: 1, fontSize: fontSize.xs, color: c.muted, textAlign: 'center' }}>time</Text>}
          {showDistanceHeader && <Text style={{ flex: 1, fontSize: fontSize.xs, color: c.muted, textAlign: 'center' }}>dist</Text>}
          <View style={{ width: 28 }} />
        </View>
      )}

      {sets.map((s) => (
        <TemplateSetRow
          key={s.id}
          set={s}
          routineId={routineId}
          reId={re.id}
          trackedFields={trackedFields}
          onUpdated={(updated) => updateSets(sets.map((x) => x.id === updated.id ? updated : x))}
          onDeleted={(id) => updateSets(sets.filter((x) => x.id !== id))}
          c={c}
        />
      ))}

      <TouchableOpacity
        onPress={handleAddSet}
        disabled={adding}
        style={{ borderWidth: 1, borderStyle: 'dashed', borderColor: c.border, borderRadius: 8, paddingVertical: 10, alignItems: 'center', opacity: adding ? 0.5 : 1 }}
      >
        <Text style={{ fontSize: fontSize.sm, color: c.accent }}>{adding ? 'Adding…' : '+ Add set'}</Text>
      </TouchableOpacity>
    </View>
  );
}

// ── Exercise picker modal ─────────────────────────────────────────────────────

function ExercisePicker({ token, onSelect, onClose, c }: {
  token: string;
  onSelect: (ex: Exercise) => void;
  onClose: () => void;
  c: Colors;
}) {
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [category, setCategory] = useState('');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      getExercises(token, { search: search || undefined, category: category || undefined }),
      getExerciseCategories(token),
    ])
      .then(([exs, cats]) => { setExercises(exs); setCategories(cats); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [search, category]);

  const filtered = exercises;

  return (
    <Modal visible animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={{ flex: 1, backgroundColor: c.bg }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: c.border }}>
          <Text style={{ flex: 1, fontSize: fontSize.base, fontWeight: '700', color: c.text }}>Add Exercise</Text>
          <TouchableOpacity onPress={onClose}>
            <Text style={{ fontSize: fontSize.base, color: c.muted }}>Cancel</Text>
          </TouchableOpacity>
        </View>
        <View style={{ paddingHorizontal: 14, paddingVertical: 10 }}>
          <TextInput
            style={{ backgroundColor: c.card, borderRadius: 10, borderWidth: 1, borderColor: c.border, paddingHorizontal: 12, paddingVertical: 8, fontSize: fontSize.sm, color: c.text }}
            value={search}
            onChangeText={setSearch}
            placeholder="Search exercises…"
            placeholderTextColor={c.muted}
            clearButtonMode="while-editing"
          />
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0 }} contentContainerStyle={{ flexDirection: 'row', gap: 8, paddingHorizontal: 14, paddingVertical: 8 }}>
          <FilterChip label="All" active={!category} onPress={() => setCategory('')} />
          {categories.map((cat) => (
            <FilterChip key={cat} label={cat} active={category === cat} onPress={() => setCategory(category === cat ? '' : cat)} />
          ))}
        </ScrollView>
        {loading ? (
          <ActivityIndicator style={{ marginTop: 40 }} color={c.accent} />
        ) : (
          <FlatList
            data={filtered}
            keyExtractor={(item) => String(item.id)}
            contentContainerStyle={{ padding: 14, gap: 8 }}
            renderItem={({ item }) => (
              <TouchableOpacity
                style={{ backgroundColor: c.card, borderRadius: 10, borderWidth: 1, borderColor: c.border, paddingHorizontal: 14, paddingVertical: 12 }}
                onPress={() => onSelect(item)}
              >
                <Text style={{ fontSize: fontSize.sm, fontWeight: '600', color: c.text }}>{item.name}</Text>
                <Text style={{ fontSize: fontSize.xs, color: c.muted, marginTop: 2 }}>{item.category} · {item.exerciseType}</Text>
              </TouchableOpacity>
            )}
            ListEmptyComponent={<Text style={{ textAlign: 'center', color: c.muted, marginTop: 40, fontSize: fontSize.sm }}>No exercises found.</Text>}
          />
        )}
      </SafeAreaView>
    </Modal>
  );
}

// ── Main screen ───────────────────────────────────────────────────────────────

export default function RoutineDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const routineId = Number(id);
  const token = useAuthStore((s) => s.token)!;
  const router = useRouter();
  const c = useColors();
  const s = makeStyles(c);

  const [routine, setRoutine] = useState<RoutineDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState(false);
  const [showPicker, setShowPicker] = useState(false);
  const [addingExercise, setAddingExercise] = useState(false);
  const [volumeHistory, setVolumeHistory] = useState<{ date: string; volumeLbs: number }[]>([]);

  const [editingName, setEditingName] = useState(false);
  const [name, setName] = useState('');
  const nameInputRef = useRef<TextInput>(null);

  useEffect(() => {
    if (!id) return;
    getRoutine(token, routineId)
      .then((r) => { setRoutine(r); setName(r.name); })
      .catch(() => router.back())
      .finally(() => setLoading(false));

    getWorkouts(token, { limit: 50, routineId: routineId })
      .then((workouts) => {
        const data = workouts
          .filter((w) => (w.totalVolumeKg ?? 0) > 0)
          .map((w) => ({ date: w.workoutDate, volumeLbs: Math.round((w.totalVolumeKg ?? 0) * KG_TO_LBS) }))
          .reverse();
        setVolumeHistory(data);
      })
      .catch(() => {});
  }, [id]);

  useEffect(() => { if (editingName) nameInputRef.current?.focus(); }, [editingName]);

  async function saveName() {
    if (!routine) return;
    setEditingName(false);
    Keyboard.dismiss();
    const trimmed = name.trim();
    if (!trimmed || trimmed === routine.name) { setName(routine.name); return; }
    try {
      await updateRoutine(token, routine.id, { name: trimmed });
      setRoutine((prev) => prev ? { ...prev, name: trimmed } : prev);
    } catch { setName(routine.name); }
  }

  async function handleStart() {
    if (!routine) return;
    setStarting(true);
    try {
      const workout = await startRoutine(token, routine.id);
      router.push(`/(app)/workout/${workout.id}`);
    } catch { setStarting(false); }
  }

  async function handleSelectExercise(exercise: Exercise) {
    if (!routine) return;
    setShowPicker(false);
    setAddingExercise(true);
    try {
      const re = await addRoutineExercise(token, routine.id, exercise.id);
      setRoutine((prev) => prev ? { ...prev, exercises: [...prev.exercises, re] } : prev);
    } catch { /* ignore */ }
    finally { setAddingExercise(false); }
  }

  async function handleRemoveExercise(reId: number) {
    if (!routine) return;
    Alert.alert('Remove Exercise', 'Remove this exercise from the routine?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove', style: 'destructive', onPress: async () => {
          try {
            await removeRoutineExercise(token, routine.id, reId);
            setRoutine((prev) => prev ? { ...prev, exercises: prev.exercises.filter((e) => e.id !== reId) } : prev);
          } catch { /* ignore */ }
        },
      },
    ]);
  }

  function handleSetsChanged(reId: number, sets: RoutineExerciseSet[]) {
    setRoutine((prev) => prev ? {
      ...prev,
      exercises: prev.exercises.map((e) => e.id === reId ? { ...e, templateSets: sets } : e),
    } : prev);
  }

  async function handleDelete() {
    if (!routine) return;
    Alert.alert('Delete Routine', `Delete "${routine.name}"?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive', onPress: async () => {
          try { await deleteRoutine(token, routine.id); router.back(); }
          catch { Alert.alert('Error', 'Could not delete routine.'); }
        },
      },
    ]);
  }

  if (loading) return <ActivityIndicator style={{ marginTop: 60 }} color={c.accent} />;
  if (!routine) return null;

  return (
    <SafeAreaView style={s.container} edges={['top']}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        {/* Header */}
        <View style={s.header}>
          <TouchableOpacity onPress={() => router.back()} style={s.backBtn}>
            <Text style={s.backBtnText}>‹</Text>
          </TouchableOpacity>
          <View style={{ flex: 1, minWidth: 0 }}>
            {editingName ? (
              <TextInput
                ref={nameInputRef}
                style={s.nameInput}
                value={name}
                onChangeText={setName}
                onBlur={saveName}
                onSubmitEditing={saveName}
                returnKeyType="done"
                blurOnSubmit
              />
            ) : (
              <TouchableOpacity onPress={() => setEditingName(true)}>
                <Text style={s.title} numberOfLines={1}>{routine.name}</Text>
              </TouchableOpacity>
            )}
            <Text style={s.subtitle}>{routine.exercises.length} exercise{routine.exercises.length !== 1 ? 's' : ''}</Text>
          </View>
          <TouchableOpacity onPress={handleDelete} style={s.deleteBtn}>
            <Text style={s.deleteBtnText}>Delete</Text>
          </TouchableOpacity>
        </View>

        {/* Content */}
        <ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled">
          {/* Start button */}
          <TouchableOpacity
            style={[s.startBtn, (starting || routine.exercises.length === 0) && s.startBtnDisabled]}
            onPress={handleStart}
            disabled={starting || routine.exercises.length === 0}
          >
            <Text style={s.startBtnText}>{starting ? 'Starting…' : 'Start Routine'}</Text>
          </TouchableOpacity>

          {/* Volume history chart */}
          {volumeHistory.length > 0 && (
            <View style={s.card}>
              <Text style={s.cardTitle}>Volume per session (lbs)</Text>
              <VolumeLineChart data={volumeHistory} c={c} />
              {volumeHistory.length > 0 && (
                <Text style={{ fontSize: fontSize.xs, color: c.muted, textAlign: 'right', marginTop: 2 }}>
                  Latest: {volumeHistory[volumeHistory.length - 1].volumeLbs.toLocaleString()} lbs
                </Text>
              )}
            </View>
          )}

          {/* Exercise blocks */}
          {routine.exercises.map((re) => (
            <RoutineExerciseBlock
              key={re.id}
              re={re}
              routineId={routine.id}
              onRemove={handleRemoveExercise}
              onSetsChanged={handleSetsChanged}
              c={c}
            />
          ))}

          {/* Add exercise */}
          <TouchableOpacity
            style={[s.addExBtn, addingExercise && { opacity: 0.5 }]}
            onPress={() => setShowPicker(true)}
            disabled={addingExercise}
          >
            <Text style={s.addExBtnText}>{addingExercise ? 'Adding…' : '+ Add Exercise'}</Text>
          </TouchableOpacity>

          <View style={{ height: 32 }} />
        </ScrollView>
      </KeyboardAvoidingView>

      {showPicker && (
        <ExercisePicker
          token={token}
          onSelect={handleSelectExercise}
          onClose={() => setShowPicker(false)}
          c={c}
        />
      )}
    </SafeAreaView>
  );
}

function makeStyles(c: Colors) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: c.bg },
    header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: c.border, gap: 10 },
    backBtn: { paddingRight: 4 },
    backBtnText: { fontSize: 28, color: c.text, lineHeight: 32 },
    title: { fontSize: fontSize.lg, fontWeight: '700', color: c.text },
    nameInput: { fontSize: fontSize.lg, fontWeight: '700', color: c.text, borderBottomWidth: 1, borderBottomColor: c.accent, paddingVertical: 2 },
    subtitle: { fontSize: fontSize.xs, color: c.muted, marginTop: 1 },
    deleteBtn: { borderWidth: 1, borderColor: c.border, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6 },
    deleteBtnText: { fontSize: fontSize.xs, color: c.muted },
    scroll: { padding: 14, gap: 12 },
    startBtn: { backgroundColor: c.accent, borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
    startBtnDisabled: { opacity: 0.5 },
    startBtnText: { fontSize: fontSize.base, fontWeight: '700', color: c.bg },
    card: { backgroundColor: c.card, borderRadius: 12, borderWidth: 1, borderColor: c.border, padding: 14, gap: 8 },
    cardTitle: { fontSize: fontSize.xs, fontWeight: '600', color: c.muted, textTransform: 'uppercase', letterSpacing: 0.5 },
    addExBtn: { borderWidth: 1, borderStyle: 'dashed', borderColor: c.border, borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
    addExBtnText: { fontSize: fontSize.sm, color: c.accent },
  });
}
