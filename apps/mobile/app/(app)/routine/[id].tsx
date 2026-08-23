import { useCallback, useEffect, memo, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator, Alert, FlatList, Keyboard, KeyboardAvoidingView, Modal,
  Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity,
  TouchableWithoutFeedback, View, useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import {
  getRoutine, updateRoutine, deleteRoutine, startRoutine,
  addRoutineExercise, removeRoutineExercise, reorderRoutineExercises,
  getWorkouts, getExercises, getExerciseCategories, createCustomExercise,
  type RoutineDetail, type RoutineExercise, type Exercise,
  type WorkoutSummary,
} from '../../../src/api/client';
import { KG_TO_LBS, localDateStr, shortDate, secondsToMMSS as _secondsToMMSS, type RoutineType } from '../../../../../packages/api-client/src/index';
import { useAuthStore } from '../../../src/store/auth';
import { fontSize, type Colors } from '../../../src/theme';
import { useColors } from '../../../src/hooks/useColors';
import FilterChip from '../../../src/components/FilterChip';

const ROUTINE_TYPE_OPTIONS: { value: RoutineType; label: string }[] = [
  { value: 'strength',        label: 'Strength (lbs)' },
  { value: 'bodyweight',      label: 'Bodyweight' },
  { value: 'cardio_distance', label: 'Cardio — Distance' },
  { value: 'cardio_duration', label: 'Cardio — Duration' },
  { value: 'steps',           label: 'Steps' },
];

function lbsToKg(lbs: number) { return lbs / KG_TO_LBS; }
function kgToLbs(kg: number) { return kg * KG_TO_LBS; }
function fmtWeight(kg: number | null) {
  if (kg == null) return '';
  const lbs = kgToLbs(kg);
  return String(lbs % 1 === 0 ? Math.round(lbs) : lbs.toFixed(1));
}
function secondsToMMSS(sec: number | null): string {
  if (sec == null) return '';
  return _secondsToMMSS(sec);
}
function longDate(dateStr: string): string {
  return new Date(dateStr + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}
function dayOfWeek(dateStr: string): string {
  return new Date(dateStr + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long' });
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

// ── Volume bar chart (pure RN, no SVG lib) ────────────────────────────────────

const CHART_H = 80;
const BAR_GAP = 2;

function VolumeBarChart({ data, c }: { data: { date: string; volumeLbs: number }[]; c: Colors }) {
  const { width } = useWindowDimensions();
  const chartWidth = width - 56; // 14 padding each side + 14 card padding each side
  if (data.length === 0) return null;

  const maxVal = Math.max(...data.map((d) => d.volumeLbs), 1);
  const barWidth = Math.max(2, (chartWidth - BAR_GAP * (data.length - 1)) / data.length);

  return (
    <View>
      <View style={{ height: CHART_H, width: chartWidth, flexDirection: 'row', alignItems: 'flex-end', gap: BAR_GAP }}>
        {data.map((entry, i) => {
          const barH = Math.max(2, (entry.volumeLbs / maxVal) * CHART_H);
          const isLast = i === data.length - 1;
          return (
            <View
              key={entry.date}
              style={{
                width: barWidth,
                height: barH,
                backgroundColor: isLast ? c.accent : c.accent + '88',
                borderRadius: 2,
              }}
            />
          );
        })}
      </View>
      {data.length >= 2 && (
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 }}>
          <Text style={{ fontSize: 9, color: '#94a3b8' }}>{shortDate(data[0].date)}</Text>
          <Text style={{ fontSize: 9, color: '#94a3b8' }}>{shortDate(data[data.length - 1].date)}</Text>
        </View>
      )}
    </View>
  );
}

// ── Routine exercise block ────────────────────────────────────────────────────

const RoutineExerciseBlock = memo(function RoutineExerciseBlock({
  re, onRemove, onMoveUp, onMoveDown, c,
}: {
  re: RoutineExercise;
  onRemove: (reId: number) => void;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
  c: Colors;
}) {
  const router = useRouter();

  return (
    <View style={{ backgroundColor: c.card, borderRadius: 12, borderWidth: 1, borderColor: c.border, padding: 12, gap: 8 }}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <TouchableOpacity onPress={() => router.push(`/(app)/exercise/${re.exercise.id}`)}>
            <Text style={{ fontSize: fontSize.sm, fontWeight: '600', color: c.accent }} numberOfLines={2}>
              {re.exercise.name}
            </Text>
          </TouchableOpacity>
          <Text style={{ fontSize: fontSize.sm, color: c.muted, marginTop: 1 }}>{re.exercise.category}</Text>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingLeft: 8 }}>
          <TouchableOpacity onPress={onMoveUp} disabled={!onMoveUp} style={{ paddingHorizontal: 4, opacity: onMoveUp ? 1 : 0.2 }}>
            <Text style={{ fontSize: fontSize.base, color: c.muted }}>↑</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={onMoveDown} disabled={!onMoveDown} style={{ paddingHorizontal: 4, opacity: onMoveDown ? 1 : 0.2 }}>
            <Text style={{ fontSize: fontSize.base, color: c.muted }}>↓</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => onRemove(re.id)} style={{ paddingLeft: 4 }}>
            <Text style={{ fontSize: fontSize.sm, color: c.muted }}>Remove</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Last session reference — shown when history exists */}
      {re.lastPerformedSets && re.lastPerformedSets.length > 0 && (
        <View style={{ backgroundColor: c.bg, borderRadius: 8, borderWidth: 1, borderColor: c.border, padding: 8, gap: 4 }}>
          <Text style={{ fontSize: fontSize.sm, color: c.muted }}>Last session</Text>
          {re.lastPerformedSets.map((ls, i) => (
            <Text key={i} style={{ fontSize: fontSize.sm, color: c.text }}>
              Set {ls.setNumber}:
              {ls.weightKg != null && ` ${fmtWeight(ls.weightKg)} lbs`}
              {ls.reps != null && ` × ${ls.reps} reps`}
              {ls.durationSeconds != null && ` ${secondsToMMSS(ls.durationSeconds)}`}
              {ls.distanceMeters != null && ` ${ls.distanceMeters}m`}
              {(ls as any).steps != null && ` ${(ls as any).steps} steps`}
            </Text>
          ))}
        </View>
      )}
    </View>
  );
});

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
                <Text style={{ fontSize: fontSize.sm, color: c.muted, marginTop: 2 }}>{item.category} · {item.exerciseType}</Text>
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
  const [volumeHistory, setVolumeHistory] = useState<{ date: string; volumeLbs: number; workout: WorkoutSummary }[]>([]);
  const [showTypePicker, setShowTypePicker] = useState(false);

  const [editingName, setEditingName] = useState(false);
  const [name, setName] = useState('');
  const nameInputRef = useRef<TextInput>(null);

  const chartData = useMemo(() => {
    if (!routine || volumeHistory.length === 0) return [];
    const rt = routine.routineType ?? 'strength';
    return volumeHistory.map((h) => {
      let value = h.volumeLbs;
      if (rt === 'steps') value = (h.workout as any).totalSteps ?? 0;
      else if (rt === 'cardio_distance') value = Math.round(((h.workout as any).totalDistanceMeters ?? 0) / 1609.34 * 10) / 10;
      else if (rt === 'cardio_duration') value = Math.round(((h.workout as any).totalDurationSeconds ?? 0) / 60);
      return { date: h.date, volumeLbs: value };
    }).filter((d) => d.volumeLbs > 0);
  }, [routine, volumeHistory]);

  useEffect(() => {
    if (!id) return;
    getRoutine(token, routineId)
      .then((r) => { setRoutine(r); setName(r.name); })
      .catch(() => router.back())
      .finally(() => setLoading(false));

    getWorkouts(token, { limit: 50, routineId: routineId })
      .then((workouts) => {
        const data = workouts
          .map((w) => ({ date: w.workoutDate, volumeLbs: Math.round((w.totalVolumeKg ?? 0) * KG_TO_LBS), workout: w }))
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

  async function saveRoutineType(rt: RoutineType) {
    if (!routine) return;
    setShowTypePicker(false);
    try {
      await updateRoutine(token, routine.id, { routineType: rt });
      setRoutine((prev) => prev ? { ...prev, routineType: rt } : prev);
    } catch { /* ignore */ }
  }

  async function handleStart() {
    if (!routine) return;
    setStarting(true);
    try {
      const workout = await startRoutine(token, routine.id);
      router.push(`/(app)/(tabs)/workout/${workout.id}`);
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

  const handleRemoveExercise = useCallback((reId: number) => {
    setRoutine((prev) => {
      if (!prev) return prev;
      Alert.alert('Remove Exercise', 'Remove this exercise from the routine?', [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove', style: 'destructive', onPress: async () => {
            try {
              await removeRoutineExercise(token, prev.id, reId);
              setRoutine((r) => r ? { ...r, exercises: r.exercises.filter((e) => e.id !== reId) } : r);
            } catch { /* ignore */ }
          },
        },
      ]);
      return prev;
    });
  }, [token]);

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
      await reorderRoutineExercises(token, routine.id, withOrder.map((e) => ({ id: e.id, sortOrder: e.sortOrder })));
    } catch {
      setRoutine((prev) => prev ? { ...prev, exercises: routine.exercises } : prev);
    }
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
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 }}>
              <Text style={s.subtitle}>{routine.exercises.length} exercise{routine.exercises.length !== 1 ? 's' : ''}</Text>
              <Text style={{ fontSize: fontSize.sm, color: c.muted }}>·</Text>
              <TouchableOpacity onPress={() => setShowTypePicker(true)}>
                <Text style={{ fontSize: fontSize.sm, color: c.accent }}>
                  {ROUTINE_TYPE_OPTIONS.find((o) => o.value === routine.routineType)?.label ?? 'Strength (lbs)'}
                </Text>
              </TouchableOpacity>
            </View>
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

          {/* Overview */}
          {volumeHistory.length > 0 && (() => {
            const rt = routine.routineType ?? 'strength';
            const unitLabel = rt === 'steps' ? 'steps' : rt === 'cardio_distance' ? 'mi' : rt === 'cardio_duration' ? 'min' : 'lbs';
            const bestLabel = rt === 'cardio_distance' ? 'Best Distance' : rt === 'cardio_duration' ? 'Best Duration' : rt === 'steps' ? 'Best Steps' : 'Best Volume';

            let bestValue = 0;
            let bestDate: string | null = null;
            for (const d of chartData) {
              if (d.volumeLbs > bestValue) { bestValue = d.volumeLbs; bestDate = d.date; }
            }
            const bestFormatted = bestValue === 0 ? '—'
              : rt === 'steps' ? bestValue.toLocaleString() + ' steps'
              : rt === 'cardio_distance' ? bestValue.toFixed(1) + ' mi'
              : rt === 'cardio_duration' ? Math.round(bestValue) + ' min'
              : Math.round(bestValue).toLocaleString() + ' lbs';

            const lastDate = volumeHistory[volumeHistory.length - 1]?.date ?? null;
            const cutoff = new Date(); cutoff.setDate(cutoff.getDate() - 56);
            const recentCount = volumeHistory.filter((h) => h.date >= localDateStr(cutoff)).length;
            const avgPerWeek = recentCount > 0 ? (recentCount / 8).toFixed(1) + '×' : '—';

            const tiles = [
              { label: 'Sessions', value: String(volumeHistory.length), sub: 'all time' },
              { label: bestLabel, value: bestFormatted, sub: bestDate ? longDate(bestDate) : undefined },
              { label: 'Last Performed', value: lastDate ? longDate(lastDate) : '—', sub: lastDate ? dayOfWeek(lastDate) : undefined },
              { label: 'Avg / Week', value: avgPerWeek, sub: 'last 8 weeks' },
            ];

            return (
              <>
                <View style={s.sectionHeader}>
                  <View style={s.sectionLine} />
                  <Text style={s.sectionTitle}>Overview</Text>
                </View>
                <View style={s.overviewGrid}>
                  {tiles.map((tile) => (
                    <View key={tile.label} style={s.overviewTile}>
                      <Text style={s.overviewTileLabel}>{tile.label}</Text>
                      <Text style={s.overviewTileValue}>{tile.value}</Text>
                      {tile.sub && <Text style={s.overviewTileSub}>{tile.sub}</Text>}
                    </View>
                  ))}
                </View>
              </>
            );
          })()}

          {/* Progress */}
          {chartData.length > 0 && (() => {
            const rt = routine.routineType ?? 'strength';
            const unitLabel = rt === 'steps' ? 'steps' : rt === 'cardio_distance' ? 'mi' : rt === 'cardio_duration' ? 'min' : 'lbs';
            const nowValue = chartData[chartData.length - 1].volumeLbs;
            const cutoff30 = new Date(); cutoff30.setDate(cutoff30.getDate() - 30);
            const cutoff30Str = localDateStr(cutoff30);
            const ago30 = [...chartData].filter((d) => d.date <= cutoff30Str).sort((a, b) => b.date.localeCompare(a.date))[0];
            const delta = ago30 ? nowValue - ago30.volumeLbs : null;
            const deltaPct = delta != null && ago30 && ago30.volumeLbs !== 0 ? (delta / ago30.volumeLbs) * 100 : null;
            const fmtVal = (v: number) => rt === 'cardio_distance' ? v.toFixed(1) : Math.round(v).toLocaleString();

            return (
              <>
                <View style={s.sectionHeader}>
                  <View style={s.sectionLine} />
                  <Text style={s.sectionTitle}>Progress</Text>
                </View>
                <View style={s.card}>
                  <View style={{ flexDirection: 'row', gap: 24, marginBottom: 8 }}>
                    <View>
                      <Text style={s.statRowLabel}>Now</Text>
                      <Text style={s.statRowValue}>
                        {fmtVal(nowValue)}<Text style={s.statRowUnit}> {unitLabel}</Text>
                      </Text>
                    </View>
                    {delta != null && (
                      <View>
                        <Text style={s.statRowLabel}>vs 30 days ago</Text>
                        <Text style={[s.statRowValue, { color: delta >= 0 ? '#4ade80' : '#f87171' }]}>
                          {delta >= 0 ? '+' : ''}{fmtVal(delta)}<Text style={[s.statRowUnit, { color: delta >= 0 ? '#4ade80' : '#f87171' }]}> {unitLabel}</Text>
                          {deltaPct != null && (
                            <Text style={[s.statRowUnit, { color: delta >= 0 ? '#4ade80' : '#f87171' }]}>
                              {' '}({deltaPct >= 0 ? '+' : ''}{deltaPct.toFixed(1)}%)
                            </Text>
                          )}
                        </Text>
                      </View>
                    )}
                  </View>
                  <VolumeBarChart data={chartData} c={c} />
                </View>
              </>
            );
          })()}

          {/* Exercises */}
          <View style={s.sectionHeader}>
            <View style={s.sectionLine} />
            <Text style={s.sectionTitle}>Exercises ({routine.exercises.length})</Text>
          </View>

          {routine.exercises.map((re, idx) => (
            <RoutineExerciseBlock
              key={re.id}
              re={re}
              onRemove={handleRemoveExercise}
              onMoveUp={idx > 0 ? () => handleMoveExercise(re.id, 'up') : undefined}
              onMoveDown={idx < routine.exercises.length - 1 ? () => handleMoveExercise(re.id, 'down') : undefined}
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

      {/* Routine type picker modal */}
      <Modal visible={showTypePicker} transparent animationType="fade" onRequestClose={() => setShowTypePicker(false)}>
        <TouchableWithoutFeedback onPress={() => setShowTypePicker(false)}>
          <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', paddingHorizontal: 32 }}>
            <TouchableWithoutFeedback>
              <View style={{ backgroundColor: c.card, borderRadius: 16, borderWidth: 1, borderColor: c.border, overflow: 'hidden' }}>
                <Text style={{ fontSize: fontSize.sm, fontWeight: '700', color: c.text, padding: 16, borderBottomWidth: 1, borderBottomColor: c.border }}>
                  Routine Type
                </Text>
                {ROUTINE_TYPE_OPTIONS.map((opt) => (
                  <TouchableOpacity
                    key={opt.value}
                    style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: c.border + '44' }}
                    onPress={() => saveRoutineType(opt.value)}
                  >
                    <Text style={{ fontSize: fontSize.sm, color: routine?.routineType === opt.value ? c.accent : c.text }}>{opt.label}</Text>
                    {routine?.routineType === opt.value && <Text style={{ fontSize: fontSize.sm, color: c.accent }}>✓</Text>}
                  </TouchableOpacity>
                ))}
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>

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
    subtitle: { fontSize: fontSize.sm, color: c.muted, marginTop: 1 },
    deleteBtn: { borderWidth: 1, borderColor: c.border, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6 },
    deleteBtnText: { fontSize: fontSize.sm, color: c.muted },
    scroll: { padding: 14, gap: 12 },
    startBtn: { backgroundColor: c.accent, borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
    startBtnDisabled: { opacity: 0.5 },
    startBtnText: { fontSize: fontSize.base, fontWeight: '700', color: c.bg },
    card: { backgroundColor: c.card, borderRadius: 12, borderWidth: 1, borderColor: c.border, padding: 14, gap: 8 },
    cardTitle: { fontSize: fontSize.sm, fontWeight: '600', color: c.muted, textTransform: 'uppercase', letterSpacing: 0.5 },
    addExBtn: { borderWidth: 1, borderStyle: 'dashed', borderColor: c.border, borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
    addExBtnText: { fontSize: fontSize.sm, color: c.accent },
    sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 },
    sectionLine: { width: 14, height: 2, backgroundColor: c.accent },
    sectionTitle: { fontSize: fontSize.sm, fontWeight: '700', color: c.text, textTransform: 'uppercase', letterSpacing: 0.8 },
    overviewGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    overviewTile: { flex: 1, minWidth: '45%', backgroundColor: c.card, borderRadius: 12, borderWidth: 1, borderColor: c.border, padding: 12 },
    overviewTileLabel: { fontSize: fontSize.sm, fontWeight: '600', color: c.accent, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 },
    overviewTileValue: { fontSize: fontSize.lg, fontWeight: '700', color: c.text },
    overviewTileSub: { fontSize: fontSize.sm, color: c.muted, marginTop: 2 },
    statRowLabel: { fontSize: fontSize.sm, color: c.muted, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 2 },
    statRowValue: { fontSize: 22, fontWeight: '700', color: c.text },
    statRowUnit: { fontSize: fontSize.sm, fontWeight: '400', color: c.muted },
  });
}
