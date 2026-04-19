import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator, Alert, FlatList, Image, Modal, RefreshControl, ScrollView,
  StyleSheet, Text, TextInput, TouchableOpacity, View, useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import {
  getWorkouts, createWorkout, deleteWorkout, type WorkoutSummary,
  getExercises, getExerciseCategories, createCustomExercise, updateExercise, deleteExercise,
  type Exercise,
  getRoutines, createRoutine, deleteRoutine, startRoutine, type RoutineSummary,
  getExerciseGoals, type ExerciseGoals,
  getMeasurements, addMeasurement, getMeasurementGoals, type BodyMeasurement, type MeasurementGoal,
  getPersonalBests, type PersonalBests,
  getActiveWorkout, type WorkoutDetail,
} from '../../../src/api/client';
import { KG_TO_LBS, localDateStr, getWeekStart, formatDate as sharedFormatDate } from '../../../../../packages/api-client/src/index';
import { useAuthStore } from '../../../src/store/auth';
import { useSettingsStore, type ExerciseSortOption } from '../../../src/store/settings';
import { fontSize, type Colors } from '../../../src/theme';
import { useColors } from '../../../src/hooks/useColors';
import { useSwipeNav } from '../../../src/hooks/useSwipeNav';
import FilterChip from '../../../src/components/FilterChip';
const EXERCISE_TYPES = ['weight', 'bodyweight', 'cardio', 'duration'] as const;
const WORKOUT_TABS_ORDER = ['routines', 'exercises', 'log'] as const;


function fmtVolume(kg: number) {
  const lbs = Math.round(kg * KG_TO_LBS);
  return `${lbs.toLocaleString()} lbs`;
}

// ── Log tab ─────────────────────────────────────────────────────────────────

function LogTab() {
  const token = useAuthStore((s) => s.token)!;
  const router = useRouter();
  const c = useColors();
  const s = makeSStyles(c);
  const grid = makeGridStyles(c);
  const [workouts, setWorkouts] = useState<WorkoutSummary[]>([]);
  const [activeWorkout, setActiveWorkout] = useState<WorkoutDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [starting, setStarting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [data, active] = await Promise.all([
        getWorkouts(token, { limit: 30, offset: 0 }),
        getActiveWorkout(token).catch(() => null),
      ]);
      setWorkouts(data);
      setActiveWorkout(active);
    } catch {
      Alert.alert('Error', 'Could not load workouts.');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      const [data, active] = await Promise.all([
        getWorkouts(token, { limit: 30, offset: 0 }),
        getActiveWorkout(token).catch(() => null),
      ]);
      setWorkouts(data);
      setActiveWorkout(active);
    } catch { /* ignore */ }
    finally { setRefreshing(false); }
  }, [token]);

  async function handleDelete(id: number) {
    Alert.alert('Delete', 'Delete this workout?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive', onPress: async () => {
          try { await deleteWorkout(token, id); load(); }
          catch { Alert.alert('Error', 'Could not delete workout.'); }
        },
      },
    ]);
  }

  if (loading) return <ActivityIndicator style={{ marginTop: 40 }} color={c.accent} />;

  return (
    <FlatList
      data={workouts}
      keyExtractor={(item) => String(item.id)}
      contentContainerStyle={s.list}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={c.accent} />}
      ListHeaderComponent={activeWorkout ? (
        <TouchableOpacity
          style={s.resumeBanner}
          onPress={() => router.push(`/(app)/workout/${activeWorkout.id}`)}
        >
          <View style={{ flex: 1 }}>
            <Text style={s.resumeTitle}>Workout in progress</Text>
            <Text style={s.resumeSub}>
              {activeWorkout.name ?? 'Untitled'} · {activeWorkout.exercises.length} exercise{activeWorkout.exercises.length !== 1 ? 's' : ''}
            </Text>
          </View>
          <Text style={s.resumeArrow}>›</Text>
        </TouchableOpacity>
      ) : null}
      renderItem={({ item }) => (
        <TouchableOpacity
          style={s.card}
          onPress={() => router.push(`/(app)/workout/${item.id}`)}
          onLongPress={() => handleDelete(item.id)}
        >
          <View style={s.cardTop}>
            <Text style={s.cardDate}>{sharedFormatDate(item.workoutDate)}</Text>
            {item.durationMinutes != null && (
              <Text style={s.cardDuration}>{item.durationMinutes} min</Text>
            )}
          </View>
          {(item.name ?? item.routineName) && <Text style={s.cardName}>{item.name ?? item.routineName}</Text>}
          <Text style={s.cardStats}>
            {item.exerciseCount} exercise{item.exerciseCount !== 1 ? 's' : ''} · {item.setCount} set{item.setCount !== 1 ? 's' : ''}
            {item.totalVolumeKg > 0 ? ` · ${fmtVolume(item.totalVolumeKg)}` : ''}
          </Text>
          {item.exercises.length > 0 && (
            <Text style={s.cardExercises} numberOfLines={1}>
              {item.exercises.map((e) => e.name).join(', ')}
            </Text>
          )}
        </TouchableOpacity>
      )}
      ListEmptyComponent={
        <View style={s.empty}>
          <Text style={s.emptyText}>No workouts yet.</Text>
          <Text style={s.emptyHint}>Start a workout to see your history here.</Text>
        </View>
      }
    />
  );
}

// ── Routines tab ─────────────────────────────────────────────────────────────

const CATEGORY_EMOJI: Record<string, string> = {
  chest: '💪', back: '🏋️', legs: '🦵', shoulders: '🔝', arms: '💪',
  core: '🔥', cardio: '🏃', glutes: '🍑', default: '🏋️',
};

function categoryEmoji(cat: string) {
  return CATEGORY_EMOJI[cat.toLowerCase()] ?? CATEGORY_EMOJI.default;
}

function RoutinesTab({ onStarted, createVisible, onCreateClose }: { onStarted: (workoutId: number) => void; createVisible: boolean; onCreateClose: () => void; }) {
  const token = useAuthStore((s) => s.token)!;
  const router = useRouter();
  const c = useColors();
  const s = makeSStyles(c);
  const grid = makeGridStyles(c);
  const [routines, setRoutines] = useState<RoutineSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [starting, setStarting] = useState<number | null>(null);
  const [newName, setNewName] = useState('');
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getRoutines(token);
      setRoutines(data);
    } catch {
      Alert.alert('Error', 'Could not load routines.');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try { const data = await getRoutines(token); setRoutines(data); } catch { /* ignore */ }
    finally { setRefreshing(false); }
  }, [token]);

  async function handleStart(r: RoutineSummary) {
    setStarting(r.id);
    try {
      const w = await startRoutine(token, r.id);
      onStarted(w.id);
    } catch {
      Alert.alert('Error', 'Could not start routine.');
    } finally {
      setStarting(null);
    }
  }

  async function handleCreate() {
    if (!newName.trim()) return;
    setCreating(true);
    try {
      await createRoutine(token, { name: newName.trim() });
      setNewName('');
      onCreateClose();
      load();
    } catch {
      Alert.alert('Error', 'Could not create routine.');
    } finally {
      setCreating(false);
    }
  }

  function handleDelete(r: RoutineSummary) {
    Alert.alert('Delete', `Delete "${r.name}"?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive', onPress: async () => {
          try { await deleteRoutine(token, r.id); load(); }
          catch { Alert.alert('Error', 'Could not delete routine.'); }
        },
      },
    ]);
  }

  if (loading) return <ActivityIndicator style={{ marginTop: 40 }} color={c.accent} />;

  return (
    <View style={{ flex: 1 }}>
      <FlatList
        data={routines}
        keyExtractor={(item) => String(item.id)}
        numColumns={2}
        contentContainerStyle={grid.container}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={c.accent} />}
        renderItem={({ item }) => (
          <TouchableOpacity
            style={grid.card}
            onPress={() => router.push(`/(app)/routine/${item.id}`)}
            onLongPress={() => handleDelete(item)}
          >
            {item.coverImageUrl ? (
              <Image source={{ uri: item.coverImageUrl }} style={grid.photo} resizeMode="cover" />
            ) : (
              <View style={grid.placeholder}>
                <Text style={grid.placeholderIcon}>🏋️</Text>
              </View>
            )}
            <View style={grid.info}>
              <Text style={grid.name} numberOfLines={2}>{item.name}</Text>
              <Text style={grid.meta}>
                {item.exerciseCount} exercise{item.exerciseCount !== 1 ? 's' : ''}
              </Text>
              {item.lastVolumeLbs != null && (
                <Text style={grid.sub} numberOfLines={1}>{Math.round(item.lastVolumeLbs)} lbs last</Text>
              )}
              {starting === item.id && (
                <Text style={grid.starting}>Starting…</Text>
              )}
            </View>
          </TouchableOpacity>
        )}
        ListEmptyComponent={
          <View style={s.empty}>
            <Text style={s.emptyText}>No routines yet.</Text>
            <Text style={s.emptyHint}>Tap + New to create one.</Text>
          </View>
        }
      />

      <Modal visible={createVisible} animationType="fade" transparent onRequestClose={() => { onCreateClose(); setNewName(''); }}>
        <View style={grid.overlay}>
          <View style={grid.dialog}>
            <Text style={grid.dialogTitle}>New Routine</Text>
            <TextInput
              style={grid.dialogInput}
              value={newName}
              onChangeText={setNewName}
              placeholder="Routine name"
              placeholderTextColor={c.muted}
              autoFocus
            />
            <View style={grid.dialogBtns}>
              <TouchableOpacity onPress={() => { onCreateClose(); setNewName(''); }}>
                <Text style={grid.dialogCancel}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={handleCreate} disabled={creating}>
                <Text style={[grid.dialogSave, creating && { opacity: 0.4 }]}>Create</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

// ── Exercise form modal ──────────────────────────────────────────────────────

interface ExerciseFormProps {
  visible: boolean;
  exercise: Exercise | null; // null = create
  categories: string[];
  onClose: () => void;
  onSaved: () => void;
}

// simple chip-tag input for muscles
function MuscleTagInput({ label, tags, onChange }: { label: string; tags: string[]; onChange: (v: string[]) => void }) {
  const [input, setInput] = useState('');
  function commit(val: string) {
    const v = val.trim();
    if (v && !tags.includes(v)) onChange([...tags, v]);
    setInput('');
  }
  return (
    <View style={m.field}>
      <Text style={m.label}>{label}</Text>
      <View style={m.tagRow}>
        {tags.map((t) => (
          <TouchableOpacity key={t} style={m.tag} onPress={() => onChange(tags.filter((x) => x !== t))}>
            <Text style={m.tagText}>{t} ×</Text>
          </TouchableOpacity>
        ))}
      </View>
      <TextInput
        style={m.input}
        value={input}
        onChangeText={setInput}
        placeholder="Add muscle, press return…"
        placeholderTextColor={c.muted}
        returnKeyType="done"
        onSubmitEditing={() => commit(input)}
        onBlur={() => { if (input.trim()) commit(input); }}
      />
    </View>
  );
}

function ExerciseFormModal({ visible, exercise, categories, onClose, onSaved }: ExerciseFormProps) {
  const token = useAuthStore((s) => s.token)!;
  const c = useColors();
  const m = makeMStyles(c);
  const [name, setName] = useState('');
  const [category, setCategory] = useState('');
  const [exerciseType, setExerciseType] = useState<string>('weight');
  const [musclesPrimary, setMusclesPrimary] = useState<string[]>([]);
  const [musclesSecondary, setMusclesSecondary] = useState<string[]>([]);
  const [instructions, setInstructions] = useState('');
  const [mediaUrl, setMediaUrl] = useState('');
  const [coverImageUrl, setCoverImageUrl] = useState('');
  const [saving, setSaving] = useState(false);
  const [newCat, setNewCat] = useState('');
  const [showNewCat, setShowNewCat] = useState(false);

  useEffect(() => {
    if (visible) {
      setName(exercise?.name ?? '');
      setCategory(exercise?.category ?? (categories[0] ?? ''));
      setExerciseType(exercise?.exerciseType ?? 'weight');
      setMusclesPrimary(exercise?.musclesPrimary ?? []);
      setMusclesSecondary(exercise?.musclesSecondary ?? []);
      setInstructions(exercise?.instructions ?? '');
      setMediaUrl(exercise?.mediaUrl ?? '');
      setCoverImageUrl(exercise?.coverImageUrl ?? '');
      setNewCat('');
      setShowNewCat(false);
    }
  }, [visible, exercise, categories]);

  async function handleSave() {
    const finalCategory = showNewCat ? newCat.trim() : category;
    if (!name.trim()) { Alert.alert('Validation', 'Name is required.'); return; }
    if (!finalCategory) { Alert.alert('Validation', 'Category is required.'); return; }
    setSaving(true);
    try {
      if (exercise) {
        await updateExercise(token, exercise.id, {
          name: name.trim(), category: finalCategory, exerciseType,
          musclesPrimary, musclesSecondary,
          instructions: instructions.trim() || null,
          mediaUrl: mediaUrl.trim() || null,
          coverImageUrl: coverImageUrl.trim() || null,
        });
      } else {
        await createCustomExercise(token, { name: name.trim(), category: finalCategory, exerciseType });
      }
      onSaved();
      onClose();
    } catch (err: any) {
      Alert.alert('Error', err?.message ?? 'Could not save exercise.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <SafeAreaView style={m.container}>
        <View style={m.header}>
          <TouchableOpacity onPress={onClose}>
            <Text style={m.cancel}>Cancel</Text>
          </TouchableOpacity>
          <Text style={m.title}>{exercise ? 'Edit Exercise' : 'New Exercise'}</Text>
          <TouchableOpacity onPress={handleSave} disabled={saving}>
            <Text style={[m.save, saving && m.saveDim]}>Save</Text>
          </TouchableOpacity>
        </View>

        <ScrollView style={m.body} contentContainerStyle={{ gap: 20 }}>
          <View style={m.field}>
            <Text style={m.label}>Name</Text>
            <TextInput
              style={m.input}
              value={name}
              onChangeText={setName}
              placeholder="Exercise name"
              placeholderTextColor={c.muted}
            />
          </View>

          <View style={m.field}>
            <Text style={m.label}>Category</Text>
            {!showNewCat && (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 8 }}>
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  {categories.map((cat) => (
                    <TouchableOpacity
                      key={cat}
                      style={[m.pill, category === cat && m.pillActive]}
                      onPress={() => setCategory(cat)}
                    >
                      <Text style={[m.pillText, category === cat && m.pillTextActive]}>{cat}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </ScrollView>
            )}
            {showNewCat && (
              <TextInput
                style={m.input}
                value={newCat}
                onChangeText={setNewCat}
                placeholder="New category name"
                placeholderTextColor={c.muted}
                autoFocus
              />
            )}
            <TouchableOpacity onPress={() => setShowNewCat((v) => !v)}>
              <Text style={m.toggleNew}>{showNewCat ? '← Pick existing' : '+ New category'}</Text>
            </TouchableOpacity>
          </View>

          <View style={m.field}>
            <Text style={m.label}>Type</Text>
            <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
              {EXERCISE_TYPES.map((t) => (
                <TouchableOpacity
                  key={t}
                  style={[m.pill, exerciseType === t && m.pillActive]}
                  onPress={() => setExerciseType(t)}
                >
                  <Text style={[m.pillText, exerciseType === t && m.pillTextActive]}>{t}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          <MuscleTagInput label="Primary Muscles" tags={musclesPrimary} onChange={setMusclesPrimary} />
          <MuscleTagInput label="Secondary Muscles" tags={musclesSecondary} onChange={setMusclesSecondary} />

          <View style={m.field}>
            <Text style={m.label}>Instructions</Text>
            <TextInput
              style={[m.input, { height: 100, textAlignVertical: 'top' }]}
              value={instructions}
              onChangeText={setInstructions}
              placeholder="Step-by-step instructions…"
              placeholderTextColor={c.muted}
              multiline
            />
          </View>

          <View style={m.field}>
            <Text style={m.label}>Demo URL</Text>
            <TextInput
              style={m.input}
              value={mediaUrl}
              onChangeText={setMediaUrl}
              placeholder="YouTube link, GIF, or image URL"
              placeholderTextColor={c.muted}
              autoCapitalize="none"
              keyboardType="url"
            />
          </View>

          <View style={m.field}>
            <Text style={m.label}>Cover Image URL</Text>
            <TextInput
              style={m.input}
              value={coverImageUrl}
              onChangeText={setCoverImageUrl}
              placeholder="Static image URL (JPG, PNG, WebP…)"
              placeholderTextColor={c.muted}
              autoCapitalize="none"
              keyboardType="url"
            />
          </View>
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

// ── Exercise grid card ───────────────────────────────────────────────────────

function ExerciseGridCard({ item, onPress }: { item: Exercise; onPress: () => void }) {
  const c = useColors();
  const grid = makeGridStyles(c);
  const [imgError, setImgError] = useState(false);
  const showImage = !!item.coverImageUrl && !imgError;
  return (
    <TouchableOpacity style={grid.card} onPress={onPress}>
      {showImage ? (
        <Image
          source={{ uri: item.coverImageUrl! }}
          style={grid.photo}
          resizeMode="cover"
          onError={() => setImgError(true)}
        />
      ) : (
        <View style={grid.placeholder}>
          <Text style={grid.placeholderIcon}>{categoryEmoji(item.category)}</Text>
        </View>
      )}
      <View style={grid.info}>
        <Text style={grid.name} numberOfLines={2}>{item.name}</Text>
        <Text style={grid.meta}>{item.category}</Text>
        <Text style={grid.sub}>{item.exerciseType}</Text>
      </View>
    </TouchableOpacity>
  );
}

// ── Exercises tab ────────────────────────────────────────────────────────────

function ExercisesTab({ createVisible, onCreateClose }: { createVisible: boolean; onCreateClose: () => void }) {
  const token = useAuthStore((s) => s.token)!;
  const router = useRouter();
  const c = useColors();
  const s = makeSStyles(c);
  const e = makeEStyles(c);
  const grid = makeGridStyles(c);
  const { defaultExerciseSort } = useSettingsStore();
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const [filterCat, setFilterCat] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [exs, cats] = await Promise.all([
        getExercises(token, { search: search || undefined, category: filterCat || undefined }),
        getExerciseCategories(token),
      ]);
      setExercises(exs);
      setCategories(cats);
    } catch {
      Alert.alert('Error', 'Could not load exercises.');
    } finally {
      setLoading(false);
    }
  }, [token, search, filterCat]);

  useFocusEffect(useCallback(() => { load(); }, [load]));
  useEffect(() => { load(); }, [search, filterCat]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      const [exs, cats] = await Promise.all([
        getExercises(token, { search: search || undefined, category: filterCat || undefined }),
        getExerciseCategories(token),
      ]);
      setExercises(exs);
      setCategories(cats);
    } catch { /* ignore */ }
    finally { setRefreshing(false); }
  }, [token, search, filterCat]);

  const sortedExercises = [...exercises].sort((a, b) => {
    if (defaultExerciseSort === 'name') return a.name.localeCompare(b.name);
    return a.id - b.id; // created_at order (server returns in id order)
  });


  return (
    <View style={{ flex: 1 }}>
      <View style={e.searchRow}>
        <TextInput
          style={e.searchInput}
          value={search}
          onChangeText={setSearch}
          placeholder="Search exercises…"
          placeholderTextColor={c.muted}
          clearButtonMode="while-editing"
        />
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={e.catScroll} contentContainerStyle={e.catRow}>
        <FilterChip label="All" active={!filterCat} onPress={() => setFilterCat('')} />
        {categories.map((cat) => (
          <FilterChip key={cat} label={cat} active={filterCat === cat} onPress={() => setFilterCat(filterCat === cat ? '' : cat)} />
        ))}
      </ScrollView>

      {loading ? (
        <ActivityIndicator style={{ marginTop: 40 }} color={c.accent} />
      ) : (
        <FlatList
          data={sortedExercises}
          keyExtractor={(item) => String(item.id)}
          numColumns={2}
          style={{ flex: 1 }}
          contentContainerStyle={grid.container}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={c.accent} />}
          renderItem={({ item }) => (
            <ExerciseGridCard item={item} onPress={() => router.push(`/(app)/exercise/${item.id}`)} />
          )}
          ListEmptyComponent={
            <View style={s.empty}>
              <Text style={s.emptyText}>No exercises found.</Text>
            </View>
          }
        />
      )}

      {/* Create modal (triggered from header + New button) */}
      <ExerciseFormModal
        visible={createVisible}
        exercise={null}
        categories={categories}
        onClose={onCreateClose}
        onSaved={() => { onCreateClose(); load(); }}
      />
    </View>
  );
}

// ── Progress tab ─────────────────────────────────────────────────────────────

const METRIC_CONFIG: Record<string, { label: string; unit: string; icon: string; color: string; dir: 'up' | 'down' }> = {
  weight: { label: 'Weight', unit: 'lbs', icon: '⚖️', color: '#60a5fa', dir: 'down' },
  waist:  { label: 'Waist',  unit: 'in',  icon: '📏', color: '#fb923c', dir: 'down' },
  bicep:  { label: 'Bicep',  unit: 'in',  icon: '💪', color: '#818cf8', dir: 'up'   },
};


type WeekBucket = { weekStart: string; label: string; volumeLbs: number; workouts: number };

function buildWeeklyData(workouts: WorkoutSummary[]): WeekBucket[] {
  const now = new Date();
  const weeks: WeekBucket[] = [];
  for (let i = 12; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i * 7);
    const ws = getWeekStart(localDateStr(d));
    const weekDate = new Date(ws + 'T12:00:00');
    weeks.push({
      weekStart: ws,
      label: weekDate.toLocaleDateString('en-US', { month: 'numeric', day: 'numeric' }),
      volumeLbs: 0,
      workouts: 0,
    });
  }
  for (const w of workouts) {
    const ws = getWeekStart(w.workoutDate);
    const week = weeks.find((wk) => wk.weekStart === ws);
    if (week) {
      week.workouts++;
      week.volumeLbs += (w.totalVolumeKg ?? 0) * KG_TO_LBS;
    }
  }
  return weeks;
}

const CHART_H = 52;
const DOT_R = 3;

function WeeklyMiniChart({ data, dataKey, color, goal }: {
  data: WeekBucket[];
  dataKey: 'volumeLbs' | 'workouts';
  color: string;
  goal?: number | null;
}) {
  const { width: screenWidth } = useWindowDimensions();
  const chartWidth = screenWidth - 32 - 28;
  const maxVal = Math.max(...data.map((d) => d[dataKey] ?? 0), goal ?? 0, 1);
  if (data.length === 0) return <View style={{ height: CHART_H, width: chartWidth }} />;

  const pts = data.map((entry, i) => {
    const val = entry[dataKey] ?? 0;
    const x = (i / (data.length - 1)) * chartWidth;
    const y = CHART_H - DOT_R - Math.max((val / maxVal) * (CHART_H - DOT_R * 2), 0);
    return { x, y, val };
  });

  // Build SVG polyline points string
  const polyline = pts.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
  const lastPt = pts[pts.length - 1];

  return (
    <View style={{ height: CHART_H, width: chartWidth }}>
      {/* @ts-ignore — RN SVG not available; use manual absolute positioned views */}
      {pts.map((pt, i) => {
        if (i === pts.length - 1) return null;
        const next = pts[i + 1];
        const dx = next.x - pt.x;
        const dy = next.y - pt.y;
        const len = Math.sqrt(dx * dx + dy * dy);
        const angle = Math.atan2(dy, dx) * (180 / Math.PI);
        return (
          <View
            key={data[i].weekStart + '_line'}
            style={{
              position: 'absolute',
              left: pt.x,
              top: pt.y - 0.75,
              width: len,
              height: 1.5,
              backgroundColor: `${color}88`,
              transformOrigin: 'left center',
              transform: [{ rotate: `${angle}deg` }],
            }}
          />
        );
      })}
      {pts.map((pt, i) => (
        <View
          key={data[i].weekStart + '_dot'}
          style={{
            position: 'absolute',
            left: pt.x - DOT_R,
            top: pt.y - DOT_R,
            width: DOT_R * 2,
            height: DOT_R * 2,
            borderRadius: DOT_R,
            backgroundColor: i === pts.length - 1 ? color : `${color}99`,
          }}
        />
      ))}
    </View>
  );
}

function ProgressBar2({ label, actual, goal, unit, color }: { label: string; actual: number; goal: number | null; unit: string; color: string }) {
  const c = useColors();
  const p = makePStyles(c);
  const pct = goal ? Math.min(actual / goal, 1) : 0;
  return (
    <View style={{ gap: 4 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        <Text style={p.pbLabel}>{label}</Text>
        <Text style={p.pbValue}>{Math.round(actual)}{unit}{goal != null ? ` / ${goal}${unit}` : ''}</Text>
      </View>
      <View style={p.pbTrack}>
        <View style={[p.pbFill, { width: `${pct * 100}%` as any, backgroundColor: color }]} />
      </View>
    </View>
  );
}

function ProgressTab() {
  const token = useAuthStore((s) => s.token)!;
  const c = useColors();
  const p = makePStyles(c);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [workouts, setWorkouts] = useState<WorkoutSummary[]>([]);
  const [exGoals, setExGoals] = useState<ExerciseGoals | null>(null);
  const [measurements, setMeasurements] = useState<BodyMeasurement[]>([]);
  const [measGoals, setMeasGoals] = useState<Record<string, MeasurementGoal>>({});
  const [personalBests, setPersonalBests] = useState<PersonalBests | null>(null);

  // Log measurement form
  const [logMetric, setLogMetric] = useState<string | null>(null);
  const [logValue, setLogValue] = useState('');
  const [logSaving, setLogSaving] = useState(false);

  const loadData = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const [ws, eg, ms, mg, pb] = await Promise.all([
        getWorkouts(token, { limit: 200 }),
        getExerciseGoals(token).catch(() => null),
        getMeasurements(token).catch(() => []),
        getMeasurementGoals(token).catch(() => ({})),
        getPersonalBests(token).catch(() => null),
      ]);
      setWorkouts(ws);
      setExGoals(eg);
      setMeasurements(ms as BodyMeasurement[]);
      setMeasGoals(mg as Record<string, MeasurementGoal>);
      setPersonalBests(pb);
    } catch { /* ignore */ }
    finally { if (!silent) setLoading(false); }
  }, [token]);

  useFocusEffect(useCallback(() => { loadData(); }, [loadData]));

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadData(true).finally(() => setRefreshing(false));
  }, [loadData]);

  const weeklyData = buildWeeklyData(workouts);
  const weekVolumeLbs = Math.round(weeklyData[weeklyData.length - 1]?.volumeLbs ?? 0);
  const weekWorkouts = weeklyData[weeklyData.length - 1]?.workouts ?? 0;
  const volumeGoal = exGoals?.volumeLbsPerWeek ?? null;
  const workoutGoal = exGoals?.workoutsPerWeek ?? null;

  async function handleLogMeasurement() {
    if (!logMetric || !logValue.trim()) return;
    const cfg = METRIC_CONFIG[logMetric];
    if (!cfg) return;
    setLogSaving(true);
    try {
      const entry = await addMeasurement(token, {
        metric: logMetric, value: Number(logValue), unit: cfg.unit, measuredAt: localDateStr(),
      });
      setMeasurements((prev) => [entry, ...prev].sort((a, b) => b.measuredAt.localeCompare(a.measuredAt)));
      setLogMetric(null);
      setLogValue('');
    } catch { Alert.alert('Error', 'Could not save measurement.'); }
    finally { setLogSaving(false); }
  }

  if (loading) return <ActivityIndicator style={{ marginTop: 40 }} color={c.accent} />;

  return (
    <ScrollView contentContainerStyle={p.scroll} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={c.accent} />}>
      {/* ── This Week ── */}
      <View style={p.card}>
        <Text style={p.cardTitle}>🏋️  This Week</Text>
        <View style={{ gap: 10 }}>
          <ProgressBar2 label="Volume" actual={weekVolumeLbs} goal={volumeGoal} unit=" lbs" color="#a78bfa" />
          <ProgressBar2 label="Workouts" actual={weekWorkouts} goal={workoutGoal} unit="" color="#34d399" />
        </View>
      </View>

      {/* ── Volume / week chart ── */}
      <View style={p.card}>
        <View style={p.chartHeader}>
          <Text style={p.chartIcon}>📦</Text>
          <Text style={[p.chartLabel, { color: '#a78bfa' }]}>Volume / wk</Text>
          {volumeGoal != null && <Text style={p.chartGoal}>Goal: {volumeGoal >= 1000 ? `${(volumeGoal/1000).toFixed(0)}k` : volumeGoal} lbs</Text>}
        </View>
        <WeeklyMiniChart data={weeklyData} dataKey="volumeLbs" color="#a78bfa" goal={volumeGoal} />
      </View>

      {/* ── Body Measurements ── */}
      <View style={p.card}>
        <Text style={p.cardTitle}>Body Measurements</Text>
        {Object.entries(METRIC_CONFIG).map(([key, cfg]) => {
          const all = measurements.filter((m) => m.metric === key).sort((a, b) => b.measuredAt.localeCompare(a.measuredAt));
          const latest = all[0] ?? null;
          const goal = measGoals[key] ?? null;
          return (
            <View key={key} style={p.metricRow}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                <Text style={{ fontSize: 16 }}>{cfg.icon}</Text>
                <Text style={[p.metricLabel, { color: cfg.color }]}>{cfg.label}</Text>
                <Text style={p.metricUnit}>({cfg.unit})</Text>
              </View>
              <View style={{ flexDirection: 'row', gap: 20 }}>
                <View>
                  <Text style={p.metricSub}>Current</Text>
                  <Text style={p.metricVal}>{latest ? `${latest.value} ${cfg.unit}` : '—'}</Text>
                </View>
                {goal && (
                  <View>
                    <Text style={p.metricSub}>Goal</Text>
                    <Text style={p.metricVal}>{goal.targetValue} {cfg.unit}{goal.targetDate ? ` by ${new Date(goal.targetDate + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}` : ''}</Text>
                  </View>
                )}
              </View>
              <TouchableOpacity onPress={() => { setLogMetric(key); setLogValue(''); }} style={{ marginTop: 6 }}>
                <Text style={{ fontSize: fontSize.sm, color: c.accent }}>+ Log</Text>
              </TouchableOpacity>
              {logMetric === key && (
                <View style={p.logForm}>
                  <TextInput
                    style={p.logInput}
                    value={logValue}
                    onChangeText={setLogValue}
                    keyboardType="decimal-pad"
                    placeholder={`Value (${cfg.unit})`}
                    placeholderTextColor={c.muted}
                    autoFocus
                  />
                  <TouchableOpacity
                    style={p.logSaveBtn}
                    onPress={handleLogMeasurement}
                    disabled={logSaving || !logValue.trim()}
                  >
                    <Text style={p.logSaveBtnText}>{logSaving ? '…' : 'Save'}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => setLogMetric(null)}>
                    <Text style={{ fontSize: fontSize.sm, color: c.muted, paddingHorizontal: 8 }}>Cancel</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          );
        })}
      </View>

      {/* ── Personal Bests ── */}
      <View style={p.card}>
        <Text style={p.cardTitle}>Personal Bests</Text>
        {personalBests?.heaviestLift ? (
          <View style={p.recordRow}>
            <Text style={p.recordIcon}>🏋️</Text>
            <View style={{ flex: 1 }}>
              <Text style={p.recordLabel}>Heaviest lift</Text>
              <Text style={p.recordVal}>{Math.round(personalBests.heaviestLift.weightKg * KG_TO_LBS * 10) / 10} lbs</Text>
              <Text style={p.recordSub}>{personalBests.heaviestLift.exerciseName}</Text>
            </View>
          </View>
        ) : null}
        {personalBests?.bestSessionVolume ? (
          <View style={p.recordRow}>
            <Text style={p.recordIcon}>📈</Text>
            <View style={{ flex: 1 }}>
              <Text style={p.recordLabel}>Best session volume</Text>
              <Text style={p.recordVal}>{Math.round(personalBests.bestSessionVolume.volumeKg * KG_TO_LBS).toLocaleString()} lbs</Text>
              <Text style={p.recordSub}>{personalBests.bestSessionVolume.workoutDate}</Text>
            </View>
          </View>
        ) : null}
        {personalBests?.bestStairPace ? (
          <View style={p.recordRow}>
            <Text style={p.recordIcon}>🪜</Text>
            <View style={{ flex: 1 }}>
              <Text style={p.recordLabel}>Best stair pace</Text>
              <Text style={p.recordVal}>{personalBests.bestStairPace.secsPerStep.toFixed(1)}s/step · {personalBests.bestStairPace.steps} steps</Text>
              <Text style={p.recordSub}>{personalBests.bestStairPace.workoutDate}</Text>
            </View>
          </View>
        ) : null}
        {!personalBests?.heaviestLift && !personalBests?.bestSessionVolume && !personalBests?.bestStairPace && (
          <Text style={p.recordEmpty}>Complete some workouts to see records.</Text>
        )}
      </View>
    </ScrollView>
  );
}

function makePStyles(c: Colors) {
  return StyleSheet.create({
    scroll: { padding: 14, gap: 12 },
    card: { backgroundColor: c.card, borderRadius: 14, borderWidth: 1, borderColor: c.border, padding: 14, gap: 12 },
    cardTitle: { fontSize: fontSize.sm, fontWeight: '700', color: c.text, textTransform: 'uppercase', letterSpacing: 0.5 },
    chartHeader: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 8 },
    chartIcon: { fontSize: 12 },
    chartLabel: { fontSize: fontSize.xs, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5, flex: 1 },
    chartGoal: { fontSize: fontSize.xs, color: c.muted },
    pbLabel: { fontSize: fontSize.sm, color: c.text },
    pbValue: { fontSize: fontSize.xs, color: c.muted },
    pbTrack: { height: 6, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.08)', overflow: 'hidden' },
    pbFill: { height: '100%', borderRadius: 3 },
    metricRow: { borderTopWidth: 1, borderTopColor: c.border, paddingTop: 10 },
    metricLabel: { fontSize: fontSize.sm, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
    metricUnit: { fontSize: fontSize.xs, color: c.muted },
    metricSub: { fontSize: fontSize.xs, color: c.muted, marginBottom: 2 },
    metricVal: { fontSize: fontSize.base, fontWeight: '600', color: c.text },
    logForm: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8 },
    logInput: { flex: 1, backgroundColor: c.bg, borderRadius: 8, borderWidth: 1, borderColor: c.border, paddingHorizontal: 10, paddingVertical: 7, fontSize: fontSize.sm, color: c.text },
    logSaveBtn: { backgroundColor: c.accent, borderRadius: 8, paddingHorizontal: 14, paddingVertical: 7 },
    logSaveBtnText: { fontSize: fontSize.sm, fontWeight: '700', color: c.bg },
    recordRow: { flexDirection: 'row', gap: 10, alignItems: 'flex-start', borderTopWidth: 1, borderTopColor: c.border, paddingTop: 10 },
    recordIcon: { fontSize: 24, lineHeight: 28 },
    recordLabel: { fontSize: fontSize.xs, color: c.muted, textTransform: 'uppercase', letterSpacing: 0.5 },
    recordVal: { fontSize: fontSize.lg, fontWeight: '700', color: c.text },
    recordSub: { fontSize: fontSize.xs, color: c.muted, marginTop: 2 },
    recordEmpty: { fontSize: fontSize.sm, color: c.muted, textAlign: 'center', paddingVertical: 16 },
  });
}

// ── Root screen ──────────────────────────────────────────────────────────────

type Tab = 'log' | 'routines' | 'exercises';

export default function WorkoutsScreen() {
  const token = useAuthStore((s) => s.token)!;
  const router = useRouter();
  const c = useColors();
  const s = makeSStyles(c);
  const seg = makeSegStyles(c);
  const rp = makeRpStyles(c);
  const [tab, setTab] = useState<Tab>('routines');
  const swipe = useSwipeNav(3, WORKOUT_TABS_ORDER, tab, setTab);
  const [starting, setStarting] = useState(false);
  const [exCreateVisible, setExCreateVisible] = useState(false);
  const [routinesCreateVisible, setRoutinesCreateVisible] = useState(false);

  // Routine picker for + Start
  const [routinePickerVisible, setRoutinePickerVisible] = useState(false);
  const [pickerRoutines, setPickerRoutines] = useState<RoutineSummary[]>([]);
  const [pickerLoading, setPickerLoading] = useState(false);

  async function openRoutinePicker() {
    setRoutinePickerVisible(true);
    setPickerLoading(true);
    try {
      const data = await getRoutines(token);
      setPickerRoutines(data);
    } catch { /* ignore */ }
    finally { setPickerLoading(false); }
  }

  async function handleStartBlank() {
    setRoutinePickerVisible(false);
    setStarting(true);
    try {
      const w = await createWorkout(token);
      router.push(`/(app)/workout/${w.id}`);
    } catch {
      Alert.alert('Error', 'Could not start workout.');
    } finally {
      setStarting(false);
    }
  }

  async function handleStartRoutine(r: RoutineSummary) {
    setRoutinePickerVisible(false);
    setStarting(true);
    try {
      const w = await startRoutine(token, r.id);
      router.push(`/(app)/workout/${w.id}`);
    } catch {
      Alert.alert('Error', 'Could not start routine.');
    } finally {
      setStarting(false);
    }
  }

  function renderHeaderAction() {
    if (tab === 'routines') {
      return (
        <TouchableOpacity style={s.circlePlusBtn} onPress={() => setRoutinesCreateVisible(true)}>
          <Text style={s.circlesPlusBtnText}>+</Text>
        </TouchableOpacity>
      );
    }
    if (tab === 'exercises') {
      return (
        <TouchableOpacity style={s.circlePlusBtn} onPress={() => setExCreateVisible(true)}>
          <Text style={s.circlesPlusBtnText}>+</Text>
        </TouchableOpacity>
      );
    }
    return null;
  }

  return (
    <SafeAreaView style={s.container} {...swipe.panHandlers}>
      <View style={s.header}>
        <Text style={s.title}>Workouts</Text>
        {renderHeaderAction()}
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={seg.scroll} contentContainerStyle={seg.row}>
        {(['routines', 'exercises', 'log'] as Tab[]).map((t) => (
          <TouchableOpacity key={t} style={[seg.btn, tab === t && seg.btnActive]} onPress={() => setTab(t)}>
            <Text style={[seg.label, tab === t && seg.labelActive]}>
              {t === 'log' ? 'Log' : t === 'routines' ? 'Routines' : 'Exercises'}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {tab === 'log' && <LogTab />}
      {tab === 'routines' && (
        <RoutinesTab
          onStarted={(workoutId) => router.push(`/(app)/workout/${workoutId}`)}
          createVisible={routinesCreateVisible}
          onCreateClose={() => setRoutinesCreateVisible(false)}
        />
      )}
      {tab === 'exercises' && (
        <ExercisesTab
          createVisible={exCreateVisible}
          onCreateClose={() => setExCreateVisible(false)}
        />
      )}

      {/* Routine picker modal */}
      <Modal visible={routinePickerVisible} animationType="slide" transparent onRequestClose={() => setRoutinePickerVisible(false)}>
        <TouchableOpacity style={rp.overlay} activeOpacity={1} onPress={() => setRoutinePickerVisible(false)}>
          <TouchableOpacity style={rp.sheet} activeOpacity={1} onPress={() => {}}>

            <Text style={rp.title}>Start Workout</Text>
            {pickerLoading ? (
              <ActivityIndicator color={c.accent} style={{ marginVertical: 20 }} />
            ) : (
              <ScrollView style={rp.list} contentContainerStyle={{ gap: 8 }}>
                <TouchableOpacity style={rp.blankBtn} onPress={handleStartBlank}>
                  <Text style={rp.blankText}>Start blank workout</Text>
                </TouchableOpacity>
                {pickerRoutines.length > 0 && (
                  <Text style={rp.sectionLabel}>— or pick a routine —</Text>
                )}
                {pickerRoutines.map((r) => (
                  <TouchableOpacity key={r.id} style={rp.routineRow} onPress={() => handleStartRoutine(r)}>
                    <View style={{ flex: 1 }}>
                      <Text style={rp.routineName}>{r.name}</Text>
                      <Text style={rp.routineMeta}>{r.exerciseCount} exercise{r.exerciseCount !== 1 ? 's' : ''}</Text>
                    </View>
                    <Text style={rp.routineArrow}>›</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            )}
            <TouchableOpacity style={rp.cancelBtn} onPress={() => setRoutinePickerVisible(false)}>
              <Text style={rp.cancelText}>Cancel</Text>
            </TouchableOpacity>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
    </SafeAreaView>
  );
}

// ── Style factories ──────────────────────────────────────────────────────────

function makeSStyles(c: Colors) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: c.bg },
    header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingTop: 8, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: c.border },
    title: { flex: 1, fontSize: fontSize.xl, fontWeight: '700', color: c.text },
    startBtn: { backgroundColor: c.accent, borderRadius: 8, paddingHorizontal: 16, paddingVertical: 8 },
    startBtnDisabled: { opacity: 0.5 },
    startBtnText: { fontSize: fontSize.sm, fontWeight: '700', color: c.bg },
    circlePlusBtn: { backgroundColor: c.accent, width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
    circlesPlusBtnText: { color: c.bg, fontSize: fontSize.xl, fontWeight: 'bold', lineHeight: 28 },
    list: { padding: 14, gap: 10 },
    card: { backgroundColor: c.card, borderRadius: 12, borderWidth: 1, borderColor: c.border, padding: 14, gap: 4 },
    cardTop: { flexDirection: 'row', alignItems: 'center', marginBottom: 2 },
    cardDate: { flex: 1, fontSize: fontSize.xs, color: c.muted, textTransform: 'uppercase', letterSpacing: 0.5 },
    cardDuration: { fontSize: fontSize.xs, color: c.muted },
    cardName: { fontSize: fontSize.base, fontWeight: '600', color: c.text },
    cardStats: { fontSize: fontSize.sm, color: c.muted },
    cardExercises: { fontSize: fontSize.xs, color: c.border, marginTop: 2 },
    empty: { alignItems: 'center', marginTop: 60, gap: 6 },
    emptyText: { fontSize: fontSize.base, color: c.text },
    emptyHint: { fontSize: fontSize.sm, color: c.muted },
    resumeBanner: { flexDirection: 'row', alignItems: 'center', backgroundColor: c.accent + '22', borderWidth: 1, borderColor: c.accent, borderRadius: 12, padding: 14, marginBottom: 10 },
    resumeTitle: { fontSize: fontSize.sm, fontWeight: '700', color: c.accent },
    resumeSub: { fontSize: fontSize.xs, color: c.muted, marginTop: 2 },
    resumeArrow: { fontSize: 22, color: c.accent, marginLeft: 8 },
  });
}

function makeSegStyles(c: Colors) {
  return StyleSheet.create({
    scroll: { flexGrow: 0, flexShrink: 0, borderBottomWidth: 1, borderBottomColor: c.border },
    row: { flexDirection: 'row', alignItems: 'stretch' },
    btn: { paddingHorizontal: 16, paddingVertical: 10, alignItems: 'center', justifyContent: 'center' },
    btnActive: { borderBottomWidth: 2, borderBottomColor: c.accent },
    label: { fontSize: fontSize.sm, color: c.muted, fontWeight: '500' },
    labelActive: { color: c.accent, fontWeight: '700' },
  });
}

function makeEStyles(c: Colors) {
  return StyleSheet.create({
    searchRow: { paddingHorizontal: 14, paddingVertical: 10 },
    searchInput: { backgroundColor: c.card, borderRadius: 10, borderWidth: 1, borderColor: c.border, paddingHorizontal: 12, paddingVertical: 8, fontSize: fontSize.sm, color: c.text },
    catScroll: { flexGrow: 0 },
    catRow: { flexDirection: 'row', gap: 8, paddingHorizontal: 14, paddingVertical: 8, alignItems: 'center' },
    catPill: { borderRadius: 20, borderWidth: 1, borderColor: c.border, paddingHorizontal: 12, paddingVertical: 8 },
    catPillActive: { backgroundColor: c.accent, borderColor: c.accent },
    catText: { fontSize: fontSize.xs, color: c.muted },
    catTextActive: { color: c.bg, fontWeight: '700' },
  });
}

// Shared 2-col grid card styles (exercises + routines)
function makeGridStyles(c: Colors) {
  return StyleSheet.create({
    container: { padding: 4 },
    card: { flex: 1, margin: 4, borderRadius: 12, overflow: 'hidden', backgroundColor: c.card, borderWidth: 1, borderColor: c.border },
    photo: { width: '100%', height: 120 },
    placeholder: { width: '100%', height: 120, alignItems: 'center', justifyContent: 'center', backgroundColor: c.border },
    placeholderIcon: { fontSize: fontSize['3xl'] },
    info: { padding: 8 },
    name: { color: c.text, fontWeight: '600', fontSize: fontSize.xs, marginBottom: 4 },
    meta: { color: c.muted, fontSize: fontSize.xs },
    sub: { color: c.muted, fontSize: fontSize.xs, marginTop: 2 },
    starting: { color: c.accent, fontSize: fontSize.xs, marginTop: 2 },
    overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center' },
    dialog: { backgroundColor: c.card, borderRadius: 14, padding: 20, width: '80%', gap: 16 },
    dialogTitle: { fontSize: fontSize.base, fontWeight: '700', color: c.text },
    dialogInput: { backgroundColor: c.bg, borderRadius: 10, borderWidth: 1, borderColor: c.border, paddingHorizontal: 14, paddingVertical: 10, fontSize: fontSize.base, color: c.text },
    dialogBtns: { flexDirection: 'row', justifyContent: 'flex-end', gap: 20 },
    dialogCancel: { fontSize: fontSize.base, color: c.muted },
    dialogSave: { fontSize: fontSize.base, color: c.accent, fontWeight: '700' },
  });
}

function makeMStyles(c: Colors) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: c.bg },
    header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: c.border },
    title: { fontSize: fontSize.base, fontWeight: '700', color: c.text },
    cancel: { fontSize: fontSize.base, color: c.muted },
    save: { fontSize: fontSize.base, color: c.accent, fontWeight: '700' },
    saveDim: { opacity: 0.4 },
    body: { flex: 1, padding: 20 },
    field: { gap: 8 },
    label: { fontSize: fontSize.sm, fontWeight: '600', color: c.muted, textTransform: 'uppercase', letterSpacing: 0.5 },
    input: { backgroundColor: c.card, borderRadius: 10, borderWidth: 1, borderColor: c.border, paddingHorizontal: 14, paddingVertical: 10, fontSize: fontSize.base, color: c.text },
    pill: { borderRadius: 20, borderWidth: 1, borderColor: c.border, paddingHorizontal: 14, paddingVertical: 6 },
    pillActive: { backgroundColor: c.accent, borderColor: c.accent },
    pillText: { fontSize: fontSize.sm, color: c.muted },
    pillTextActive: { color: c.bg, fontWeight: '700' },
    toggleNew: { fontSize: fontSize.sm, color: c.accent, marginTop: 4 },
    tagRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 6 },
    tag: { backgroundColor: c.accent + '28', borderRadius: 12, paddingHorizontal: 10, paddingVertical: 4 },
    tagText: { fontSize: fontSize.xs, color: c.accent },
  });
}

function makeRpStyles(c: Colors) {
  return StyleSheet.create({
    overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'flex-end' },
    sheet: { backgroundColor: c.card, borderTopLeftRadius: 18, borderTopRightRadius: 18, paddingTop: 20, paddingHorizontal: 16, paddingBottom: 32, maxHeight: '70%' },
    title: { fontSize: fontSize.base, fontWeight: '700', color: c.text, marginBottom: 16 },
    list: { flexGrow: 0, maxHeight: 400 },
    blankBtn: { backgroundColor: c.accent, borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
    blankText: { color: c.bg, fontWeight: '700', fontSize: fontSize.base },
    sectionLabel: { textAlign: 'center', color: c.muted, fontSize: fontSize.xs, marginVertical: 4 },
    routineRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: c.bg, borderRadius: 12, borderWidth: 1, borderColor: c.border, paddingHorizontal: 14, paddingVertical: 12 },
    routineName: { fontSize: fontSize.sm, fontWeight: '600', color: c.text },
    routineMeta: { fontSize: fontSize.xs, color: c.muted, marginTop: 2 },
    routineArrow: { fontSize: 20, color: c.muted },
    cancelBtn: { marginTop: 12, alignItems: 'center', paddingVertical: 12 },
    cancelText: { fontSize: fontSize.sm, color: c.muted },
  });
}
