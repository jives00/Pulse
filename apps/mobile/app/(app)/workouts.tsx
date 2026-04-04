import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator, Alert, FlatList, Image, Modal, ScrollView,
  StyleSheet, Text, TextInput, TouchableOpacity, View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import {
  getWorkouts, createWorkout, deleteWorkout, type WorkoutSummary,
  getExercises, getExerciseCategories, createCustomExercise, updateExercise, deleteExercise,
  type Exercise,
  getRoutines, createRoutine, deleteRoutine, startRoutine, type RoutineSummary,
} from '../../src/api/client';
import { useAuthStore } from '../../src/store/auth';
import { colors, fontSize } from '../../src/theme';
import FilterChip from '../../src/components/FilterChip';

const KG_TO_LBS = 2.20462;
const EXERCISE_TYPES = ['weight', 'bodyweight', 'cardio', 'duration'] as const;

function fmtDate(dateStr: string) {
  const d = new Date(dateStr + 'T12:00:00');
  return d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
}

function fmtVolume(kg: number) {
  const lbs = kg * KG_TO_LBS;
  return lbs >= 1000 ? `${(lbs / 1000).toFixed(1)}k lbs` : `${Math.round(lbs)} lbs`;
}

// ── Log tab ─────────────────────────────────────────────────────────────────

function LogTab() {
  const token = useAuthStore((s) => s.token)!;
  const router = useRouter();
  const [workouts, setWorkouts] = useState<WorkoutSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getWorkouts(token, { limit: 30, offset: 0 });
      setWorkouts(data);
    } catch {
      Alert.alert('Error', 'Could not load workouts.');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  async function handleStart() {
    setStarting(true);
    try {
      const w = await createWorkout(token);
      router.push(`/workout/${w.id}` as any);
    } catch {
      Alert.alert('Error', 'Could not start workout.');
    } finally {
      setStarting(false);
    }
  }

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

  if (loading) return <ActivityIndicator style={{ marginTop: 40 }} color={colors.accent} />;

  return (
    <FlatList
      data={workouts}
      keyExtractor={(item) => String(item.id)}
      contentContainerStyle={s.list}
      renderItem={({ item }) => (
        <TouchableOpacity
          style={s.card}
          onPress={() => router.push(`/workout/${item.id}` as any)}
          onLongPress={() => handleDelete(item.id)}
        >
          <View style={s.cardTop}>
            <Text style={s.cardDate}>{fmtDate(item.workoutDate)}</Text>
            {item.durationMinutes != null && (
              <Text style={s.cardDuration}>{item.durationMinutes} min</Text>
            )}
          </View>
          {item.name && <Text style={s.cardName}>{item.name}</Text>}
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
          <Text style={s.emptyHint}>Tap + Start to log your first workout.</Text>
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
  const [routines, setRoutines] = useState<RoutineSummary[]>([]);
  const [loading, setLoading] = useState(true);
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

  if (loading) return <ActivityIndicator style={{ marginTop: 40 }} color={colors.accent} />;

  return (
    <View style={{ flex: 1 }}>
      <FlatList
        data={routines}
        keyExtractor={(item) => String(item.id)}
        numColumns={2}
        contentContainerStyle={grid.container}
        renderItem={({ item }) => (
          <TouchableOpacity
            style={grid.card}
            onPress={() => handleStart(item)}
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
              placeholderTextColor={colors.muted}
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
        placeholderTextColor={colors.muted}
        returnKeyType="done"
        onSubmitEditing={() => commit(input)}
        onBlur={() => { if (input.trim()) commit(input); }}
      />
    </View>
  );
}

function ExerciseFormModal({ visible, exercise, categories, onClose, onSaved }: ExerciseFormProps) {
  const token = useAuthStore((s) => s.token)!;
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
              placeholderTextColor={colors.muted}
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
                placeholderTextColor={colors.muted}
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
              placeholderTextColor={colors.muted}
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
              placeholderTextColor={colors.muted}
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
              placeholderTextColor={colors.muted}
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
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
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


  return (
    <View style={{ flex: 1 }}>
      <View style={e.searchRow}>
        <TextInput
          style={e.searchInput}
          value={search}
          onChangeText={setSearch}
          placeholder="Search exercises…"
          placeholderTextColor={colors.muted}
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
        <ActivityIndicator style={{ marginTop: 40 }} color={colors.accent} />
      ) : (
        <FlatList
          data={exercises}
          keyExtractor={(item) => String(item.id)}
          numColumns={2}
          contentContainerStyle={grid.container}
          renderItem={({ item }) => (
            <ExerciseGridCard item={item} onPress={() => router.push(`/exercise/${item.id}` as any)} />
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

// ── Root screen ──────────────────────────────────────────────────────────────

type Tab = 'log' | 'routines' | 'exercises';

export default function WorkoutsScreen() {
  const token = useAuthStore((s) => s.token)!;
  const router = useRouter();
  const [tab, setTab] = useState<Tab>('log');
  const [starting, setStarting] = useState(false);
  const [exCreateVisible, setExCreateVisible] = useState(false);
  const [routinesCreateVisible, setRoutinesCreateVisible] = useState(false);

  async function handleStart() {
    setStarting(true);
    try {
      const w = await createWorkout(token);
      router.push(`/workout/${w.id}` as any);
    } catch {
      Alert.alert('Error', 'Could not start workout.');
    } finally {
      setStarting(false);
    }
  }

  function renderHeaderAction() {
    if (tab === 'log') {
      return (
        <TouchableOpacity style={[s.startBtn, starting && s.startBtnDisabled]} onPress={handleStart} disabled={starting}>
          <Text style={s.startBtnText}>{starting ? 'Starting…' : '+ Start'}</Text>
        </TouchableOpacity>
      );
    }
    if (tab === 'routines') {
      return (
        <TouchableOpacity style={s.startBtn} onPress={() => setRoutinesCreateVisible(true)}>
          <Text style={s.startBtnText}>+ New</Text>
        </TouchableOpacity>
      );
    }
    return (
      <TouchableOpacity style={s.startBtn} onPress={() => setExCreateVisible(true)}>
        <Text style={s.startBtnText}>+ New</Text>
      </TouchableOpacity>
    );
  }

  return (
    <SafeAreaView style={s.container}>
      <View style={s.header}>
        <Text style={s.title}>Workouts</Text>
        {renderHeaderAction()}
      </View>

      <View style={seg.row}>
        {(['log', 'routines', 'exercises'] as Tab[]).map((t) => (
          <TouchableOpacity key={t} style={[seg.btn, tab === t && seg.btnActive]} onPress={() => setTab(t)}>
            <Text style={[seg.label, tab === t && seg.labelActive]}>
              {t === 'log' ? 'Log' : t === 'routines' ? 'Routines' : 'Exercises'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {tab === 'log' && <LogTab />}
      {tab === 'routines' && (
        <RoutinesTab
          onStarted={(workoutId) => router.push(`/workout/${workoutId}` as any)}
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
    </SafeAreaView>
  );
}

// ── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingTop: 8, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: colors.border },
  title: { flex: 1, fontSize: fontSize.xl, fontWeight: '700', color: colors.text },
  startBtn: { backgroundColor: colors.accent, borderRadius: 8, paddingHorizontal: 16, paddingVertical: 8 },
  startBtnDisabled: { opacity: 0.5 },
  startBtnText: { fontSize: fontSize.sm, fontWeight: '700', color: colors.bg },
  list: { padding: 14, gap: 10 },
  card: { backgroundColor: colors.card, borderRadius: 12, borderWidth: 1, borderColor: colors.border, padding: 14, gap: 4 },
  cardTop: { flexDirection: 'row', alignItems: 'center', marginBottom: 2 },
  cardDate: { flex: 1, fontSize: fontSize.xs, color: colors.muted, textTransform: 'uppercase', letterSpacing: 0.5 },
  cardDuration: { fontSize: fontSize.xs, color: colors.muted },
  cardName: { fontSize: fontSize.base, fontWeight: '600', color: colors.text },
  cardStats: { fontSize: fontSize.sm, color: colors.muted },
  cardExercises: { fontSize: fontSize.xs, color: colors.border, marginTop: 2 },
  empty: { alignItems: 'center', marginTop: 60, gap: 6 },
  emptyText: { fontSize: fontSize.base, color: colors.text },
  emptyHint: { fontSize: fontSize.sm, color: colors.muted },
});

const seg = StyleSheet.create({
  row: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: colors.border },
  btn: { flex: 1, paddingVertical: 10, alignItems: 'center' },
  btnActive: { borderBottomWidth: 2, borderBottomColor: colors.accent },
  label: { fontSize: fontSize.sm, color: colors.muted, fontWeight: '500' },
  labelActive: { color: colors.accent, fontWeight: '700' },
});

const e = StyleSheet.create({
  searchRow: { paddingHorizontal: 14, paddingVertical: 10 },
  searchInput: { backgroundColor: colors.card, borderRadius: 10, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 12, paddingVertical: 8, fontSize: fontSize.sm, color: colors.text },
  catScroll: { flexShrink: 0 },
  catRow: { flexDirection: 'row', gap: 8, paddingHorizontal: 14, paddingVertical: 8 },
  catPill: { borderRadius: 20, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 12, paddingVertical: 8 },
  catPillActive: { backgroundColor: colors.accent, borderColor: colors.accent },
  catText: { fontSize: fontSize.xs, color: colors.muted },
  catTextActive: { color: colors.bg, fontWeight: '700' },
});

// Shared 2-col grid card styles (exercises + routines)
const grid = StyleSheet.create({
  container: { padding: 4 },
  card: { flex: 1, margin: 4, borderRadius: 12, overflow: 'hidden', backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border },
  photo: { width: '100%', height: 120 },
  placeholder: { width: '100%', height: 120, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.border },
  placeholderIcon: { fontSize: fontSize['3xl'] },
  info: { padding: 8 },
  name: { color: colors.text, fontWeight: '600', fontSize: fontSize.xs, marginBottom: 4 },
  meta: { color: colors.muted, fontSize: fontSize.xs },
  sub: { color: colors.muted, fontSize: fontSize.xs, marginTop: 2 },
  starting: { color: colors.accent, fontSize: fontSize.xs, marginTop: 2 },
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center' },
  dialog: { backgroundColor: colors.card, borderRadius: 14, padding: 20, width: '80%', gap: 16 },
  dialogTitle: { fontSize: fontSize.base, fontWeight: '700', color: colors.text },
  dialogInput: { backgroundColor: colors.bg, borderRadius: 10, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 14, paddingVertical: 10, fontSize: fontSize.base, color: colors.text },
  dialogBtns: { flexDirection: 'row', justifyContent: 'flex-end', gap: 20 },
  dialogCancel: { fontSize: fontSize.base, color: colors.muted },
  dialogSave: { fontSize: fontSize.base, color: colors.accent, fontWeight: '700' },
});

const m = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.border },
  title: { fontSize: fontSize.base, fontWeight: '700', color: colors.text },
  cancel: { fontSize: fontSize.base, color: colors.muted },
  save: { fontSize: fontSize.base, color: colors.accent, fontWeight: '700' },
  saveDim: { opacity: 0.4 },
  body: { flex: 1, padding: 20 },
  field: { gap: 8 },
  label: { fontSize: fontSize.sm, fontWeight: '600', color: colors.muted, textTransform: 'uppercase', letterSpacing: 0.5 },
  input: { backgroundColor: colors.card, borderRadius: 10, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 14, paddingVertical: 10, fontSize: fontSize.base, color: colors.text },
  pill: { borderRadius: 20, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 14, paddingVertical: 6 },
  pillActive: { backgroundColor: colors.accent, borderColor: colors.accent },
  pillText: { fontSize: fontSize.sm, color: colors.muted },
  pillTextActive: { color: colors.bg, fontWeight: '700' },
  toggleNew: { fontSize: fontSize.sm, color: colors.accent, marginTop: 4 },
  tagRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 6 },
  tag: { backgroundColor: colors.accent + '28', borderRadius: 12, paddingHorizontal: 10, paddingVertical: 4 },
  tagText: { fontSize: fontSize.xs, color: colors.accent },
});
