import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator, Alert, FlatList, Image, Modal, ScrollView,
  StyleSheet, Text, TextInput, TouchableOpacity, View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import {
  getExercise, getExerciseStats, getExerciseHistory, getExerciseCategories,
  updateExercise, deleteExercise,
  uploadExerciseCoverImageFromUrl, getExerciseCoverImageUploadUrl,
  uploadExerciseMediaFromUrl, getExerciseMediaUploadUrl,
  uploadExerciseMuscleImageFromUrl, getExerciseMuscleImageUploadUrl,
  type Exercise, type ExerciseStats, type ExerciseHistoryEntry,
} from '../../../src/api/client';
import * as ImagePicker from 'expo-image-picker';
import { useAuthStore } from '../../../src/store/auth';
import { colors, fontSize, type Colors } from '../../../src/theme';
import { useColors } from '../../../src/hooks/useColors';

const KG_TO_LBS = 2.20462;

function fmtLbs(kg: number | null) {
  if (kg == null) return '—';
  const lbs = Math.round(kg * KG_TO_LBS * 10) / 10;
  return `${lbs % 1 === 0 ? lbs : lbs.toFixed(1)} lbs`;
}

function shortDate(d: string) {
  return new Date(d + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function fmtDate(d: string) {
  return new Date(d + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

const METRICS = [
  { key: 'heaviest_weight', label: 'Heaviest Weight' },
  { key: 'one_rep_max',     label: 'Est. 1RM' },
  { key: 'best_set_volume', label: 'Best Set Vol' },
  { key: 'session_volume',  label: 'Session Vol' },
  { key: 'total_reps',      label: 'Total Reps' },
] as const;
type MetricKey = typeof METRICS[number]['key'];

// ── Summary tab ───────────────────────────────────────────────────────────────

function SummaryTab({ stats, metric, onMetricChange }: {
  stats: ExerciseStats;
  metric: MetricKey;
  onMetricChange: (m: MetricKey) => void;
}) {
  const c = useColors();
  const ts = makeTabStyles(c);
  const pb = stats.personalBests;
  return (
    <ScrollView contentContainerStyle={ts.scroll}>
      <View style={ts.pbGrid}>
        {[
          { label: 'Heaviest Weight', value: fmtLbs(pb.heaviestWeightKg), sub: pb.heaviestWeightReps != null ? `@ ${pb.heaviestWeightReps} reps` : undefined },
          { label: 'Est. 1 Rep Max', value: fmtLbs(pb.estimatedOneRepMaxKg) },
          { label: 'Best Set Volume', value: fmtLbs(pb.bestSetVolumeKg) },
          { label: 'Best Session Vol', value: fmtLbs(pb.bestSessionVolumeKg) },
        ].map((tile) => (
          <View key={tile.label} style={ts.pbTile}>
            <Text style={ts.pbLabel}>{tile.label}</Text>
            <Text style={ts.pbValue}>{tile.value}</Text>
            {tile.sub && <Text style={ts.pbSub}>{tile.sub}</Text>}
          </View>
        ))}
      </View>

      {stats.setRecords.length > 0 && (
        <View style={ts.section}>
          <Text style={ts.sectionTitle}>Set Records</Text>
          <View style={ts.tableHeader}>
            <Text style={ts.tableHeaderCell}>Reps</Text>
            <Text style={ts.tableHeaderCell}>Best Weight</Text>
          </View>
          {stats.setRecords.map((r) => (
            <View key={r.reps} style={ts.tableRow}>
              <Text style={ts.tableCell}>{r.reps}</Text>
              <Text style={[ts.tableCell, { color: c.text }]}>{fmtLbs(r.weightKg)}</Text>
            </View>
          ))}
        </View>
      )}

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12 }}>
        <View style={{ flexDirection: 'row', gap: 8, paddingHorizontal: 2 }}>
          {METRICS.map((m) => (
            <TouchableOpacity
              key={m.key}
              style={[ts.metricPill, metric === m.key && ts.metricPillActive]}
              onPress={() => onMetricChange(m.key)}
            >
              <Text style={[ts.metricText, metric === m.key && ts.metricTextActive]}>{m.label}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </ScrollView>

      {stats.progressSeries.length === 0 ? (
        <Text style={ts.empty}>No data yet</Text>
      ) : (
        <View style={ts.section}>
          <Text style={ts.sectionTitle}>{METRICS.find((m) => m.key === metric)?.label} over time</Text>
          {stats.progressSeries.slice(-12).map((p, i) => (
            <View key={i} style={ts.chartRow}>
              <Text style={ts.chartDate}>{shortDate(p.date)}</Text>
              <Text style={ts.chartValue}>
                {metric === 'total_reps' ? `${Math.round(p.value)} reps` : fmtLbs(p.value)}
              </Text>
            </View>
          ))}
        </View>
      )}
    </ScrollView>
  );
}

// ── History tab ───────────────────────────────────────────────────────────────

function HistoryTab({ exerciseId }: { exerciseId: number }) {
  const c = useColors();
  const ts = makeTabStyles(c);
  const token = useAuthStore((s) => s.token)!;
  const [entries, setEntries] = useState<ExerciseHistoryEntry[]>([]);
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(false);

  async function loadMore(off: number) {
    setLoading(true);
    try {
      const page = await getExerciseHistory(token, exerciseId, { limit: 20, offset: off });
      setEntries((prev) => off === 0 ? page : [...prev, ...page]);
      setHasMore(page.length === 20);
    } catch { /* ignore */ } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadMore(0); }, [exerciseId]);

  if (!loading && entries.length === 0) {
    return <Text style={ts.empty}>No history yet</Text>;
  }

  return (
    <FlatList
      data={entries}
      keyExtractor={(item, i) => `${item.workoutId}-${i}`}
      contentContainerStyle={ts.scroll}
      renderItem={({ item }) => (
        <View style={ts.section}>
          <Text style={ts.sectionTitle}>{fmtDate(item.workoutDate)}</Text>
          {item.workoutName && <Text style={ts.sectionSub}>{item.workoutName}</Text>}
          {item.sets.length > 0 ? (
            <>
              <View style={ts.tableHeader}>
                <Text style={ts.tableHeaderCell}>Set</Text>
                <Text style={ts.tableHeaderCell}>Weight</Text>
                <Text style={ts.tableHeaderCell}>Reps</Text>
              </View>
              {item.sets.map((set) => (
                <View key={set.setNumber} style={ts.tableRow}>
                  <Text style={ts.tableCell}>{set.setNumber}</Text>
                  <Text style={ts.tableCell}>
                    {set.weightKg != null ? fmtLbs(set.weightKg) : set.durationSeconds != null ? `${set.durationSeconds}s` : '—'}
                  </Text>
                  <Text style={ts.tableCell}>
                    {set.reps != null ? `${set.reps}` : set.distanceMeters != null ? `${set.distanceMeters}m` : '—'}
                  </Text>
                </View>
              ))}
            </>
          ) : (
            <Text style={ts.empty}>No sets recorded</Text>
          )}
        </View>
      )}
      ListFooterComponent={
        <>
          {loading && <ActivityIndicator color={c.accent} style={{ marginVertical: 16 }} />}
          {!loading && hasMore && (
            <TouchableOpacity onPress={() => { const next = offset + 20; setOffset(next); loadMore(next); }}>
              <Text style={ts.loadMore}>Load more</Text>
            </TouchableOpacity>
          )}
        </>
      }
    />
  );
}

// ── How To tab ────────────────────────────────────────────────────────────────

function HowToTab({ exercise }: { exercise: Exercise }) {
  const c = useColors();
  const ts = makeTabStyles(c);
  const primary = Array.isArray(exercise.musclesPrimary) ? exercise.musclesPrimary : [];
  const secondary = Array.isArray(exercise.musclesSecondary) ? exercise.musclesSecondary : [];

  return (
    <ScrollView contentContainerStyle={ts.scroll}>
      {exercise.mediaUrl && (
        <View style={ts.section}>
          <Text style={ts.sectionTitle}>Demo</Text>
          <Image source={{ uri: exercise.mediaUrl }} style={ts.mediaImage} resizeMode="contain" />
        </View>
      )}

      {(primary.length > 0 || secondary.length > 0) && (
        <View style={ts.section}>
          <Text style={ts.sectionTitle}>Muscle Groups</Text>
          {primary.length > 0 && (
            <>
              <Text style={ts.muscleLabel}>Primary</Text>
              <View style={ts.tagRow}>
                {primary.map((m) => <View key={m} style={ts.tagPrimary}><Text style={ts.tagPrimaryText}>{m}</Text></View>)}
              </View>
            </>
          )}
          {secondary.length > 0 && (
            <>
              <Text style={[ts.muscleLabel, { marginTop: 8 }]}>Secondary</Text>
              <View style={ts.tagRow}>
                {secondary.map((m) => <View key={m} style={ts.tagSecondary}><Text style={ts.tagSecondaryText}>{m}</Text></View>)}
              </View>
            </>
          )}
        </View>
      )}

      <View style={ts.section}>
        <Text style={ts.sectionTitle}>Instructions</Text>
        {exercise.instructions ? (
          <Text style={ts.instructions}>{exercise.instructions}</Text>
        ) : (
          <Text style={ts.empty}>No instructions available.</Text>
        )}
      </View>
    </ScrollView>
  );
}

// ── Edit modal ────────────────────────────────────────────────────────────────

const EXERCISE_TYPES = ['weight', 'bodyweight', 'cardio', 'duration'] as const;

function MuscleTagInput({ label, tags, onChange }: { label: string; tags: string[]; onChange: (v: string[]) => void }) {
  const c = useColors();
  const ed = makeEdStyles(c);
  const [input, setInput] = useState('');
  function commit(val: string) {
    const v = val.trim();
    if (v && !tags.includes(v)) onChange([...tags, v]);
    setInput('');
  }
  return (
    <View style={ed.field}>
      <Text style={ed.label}>{label}</Text>
      <View style={ed.tagRow}>
        {tags.map((t) => (
          <TouchableOpacity key={t} style={ed.tag} onPress={() => onChange(tags.filter((x) => x !== t))}>
            <Text style={ed.tagText}>{t} ×</Text>
          </TouchableOpacity>
        ))}
      </View>
      <TextInput
        style={ed.input}
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

function EditModal({ exercise, categories, onSaved, onClose }: {
  exercise: Exercise;
  categories: string[];
  onSaved: (updated: Exercise) => void;
  onClose: () => void;
}) {
  const c = useColors();
  const ed = makeEdStyles(c);
  const token = useAuthStore((s) => s.token)!;
  const [name, setName] = useState(exercise.name);
  const [category, setCategory] = useState(exercise.category);
  const [exerciseType, setExerciseType] = useState(exercise.exerciseType);
  const [musclesPrimary, setMusclesPrimary] = useState(exercise.musclesPrimary ?? []);
  const [musclesSecondary, setMusclesSecondary] = useState(exercise.musclesSecondary ?? []);
  const [instructions, setInstructions] = useState(exercise.instructions ?? '');
  // URL input fields (for upload; not sent directly on save)
  const [coverImageUrlInput, setCoverImageUrlInput] = useState('');
  const [mediaUrlInput, setMediaUrlInput] = useState('');
  const [muscleImageUrlInput, setMuscleImageUrlInput] = useState('');
  // Raw stored keys (S3 key or YouTube URL) — sent on save
  const [coverImageKey, setCoverImageKey] = useState(exercise.coverImageKey ?? exercise.coverImageUrl ?? '');
  const [mediaKey, setMediaKey] = useState(exercise.mediaKey ?? exercise.mediaUrl ?? '');
  const [muscleImageKey, setMuscleImageKey] = useState(exercise.muscleImageKey ?? exercise.muscleImageUrl ?? '');
  const [saving, setSaving] = useState(false);
  const [showNewCat, setShowNewCat] = useState(false);
  const [newCat, setNewCat] = useState('');
  const [uploadingField, setUploadingField] = useState<'cover' | 'media' | 'muscle' | null>(null);

  async function uploadFromUrl(field: 'cover' | 'media' | 'muscle') {
    const url = field === 'cover' ? coverImageUrlInput : field === 'media' ? mediaUrlInput : muscleImageUrlInput;
    if (!url.trim()) return;
    setUploadingField(field);
    try {
      let result: { key: string };
      if (field === 'cover') result = await uploadExerciseCoverImageFromUrl(token, exercise.id, url.trim());
      else if (field === 'media') result = await uploadExerciseMediaFromUrl(token, exercise.id, url.trim());
      else result = await uploadExerciseMuscleImageFromUrl(token, exercise.id, url.trim());
      if (field === 'cover') { setCoverImageKey(result.key); setCoverImageUrlInput(''); }
      else if (field === 'media') { setMediaKey(result.key); setMediaUrlInput(''); }
      else { setMuscleImageKey(result.key); setMuscleImageUrlInput(''); }
    } catch (err: any) {
      Alert.alert('Upload Failed', err?.message ?? 'Could not upload. Check the URL and try again.');
    } finally {
      setUploadingField(null);
    }
  }

  async function pickAndUpload(field: 'cover' | 'media' | 'muscle') {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) { Alert.alert('Permission required', 'Allow photo access to upload images.'); return; }
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.85 });
    if (result.canceled || !result.assets[0]) return;
    const asset = result.assets[0];
    const contentType = asset.mimeType ?? 'image/jpeg';
    setUploadingField(field);
    try {
      let uploadResult: { uploadUrl: string; key: string };
      if (field === 'cover') uploadResult = await getExerciseCoverImageUploadUrl(token, exercise.id, contentType);
      else if (field === 'media') uploadResult = await getExerciseMediaUploadUrl(token, exercise.id, contentType);
      else uploadResult = await getExerciseMuscleImageUploadUrl(token, exercise.id, contentType);
      const localRes = await fetch(asset.uri);
      const blob = await localRes.blob();
      await fetch(uploadResult.uploadUrl, { method: 'PUT', body: blob, headers: { 'Content-Type': contentType } });
      if (field === 'cover') setCoverImageKey(uploadResult.key);
      else if (field === 'media') setMediaKey(uploadResult.key);
      else setMuscleImageKey(uploadResult.key);
    } catch (err: any) {
      Alert.alert('Upload Failed', err?.message ?? 'Could not upload.');
    } finally {
      setUploadingField(null);
    }
  }

  async function handleSave() {
    const finalCategory = showNewCat ? newCat.trim() : category;
    if (!name.trim() || !finalCategory) { Alert.alert('Validation', 'Name and category are required.'); return; }
    setSaving(true);
    try {
      const updated = await updateExercise(token, exercise.id, {
        name: name.trim(), category: finalCategory, exerciseType,
        musclesPrimary, musclesSecondary,
        instructions: instructions.trim() || null,
        mediaUrl: mediaKey.trim() || null,
        coverImageUrl: coverImageKey.trim() || null,
        muscleImageUrl: muscleImageKey.trim() || null,
      });
      onSaved(updated);
    } catch (err: any) {
      Alert.alert('Error', err?.message ?? 'Could not save.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal visible animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <SafeAreaView style={ed.container}>
        <View style={ed.header}>
          <TouchableOpacity onPress={onClose}><Text style={ed.cancel}>Cancel</Text></TouchableOpacity>
          <Text style={ed.title}>Edit Exercise</Text>
          <TouchableOpacity onPress={handleSave} disabled={saving}>
            <Text style={[ed.save, saving && { opacity: 0.4 }]}>Save</Text>
          </TouchableOpacity>
        </View>
        <ScrollView style={ed.body} contentContainerStyle={{ gap: 20 }}>
          <View style={ed.field}>
            <Text style={ed.label}>Name</Text>
            <TextInput style={ed.input} value={name} onChangeText={setName} placeholderTextColor={c.muted} />
          </View>
          <View style={ed.field}>
            <Text style={ed.label}>Category</Text>
            {!showNewCat && (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 8 }}>
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  {categories.map((cat) => (
                    <TouchableOpacity key={cat} style={[ed.pill, category === cat && ed.pillActive]} onPress={() => setCategory(cat)}>
                      <Text style={[ed.pillText, category === cat && ed.pillTextActive]}>{cat}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </ScrollView>
            )}
            {showNewCat && (
              <TextInput style={ed.input} value={newCat} onChangeText={setNewCat} placeholder="New category" placeholderTextColor={c.muted} autoFocus />
            )}
            <TouchableOpacity onPress={() => setShowNewCat((v) => !v)}>
              <Text style={ed.toggleNew}>{showNewCat ? '← Pick existing' : '+ New category'}</Text>
            </TouchableOpacity>
          </View>
          <View style={ed.field}>
            <Text style={ed.label}>Type</Text>
            <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
              {EXERCISE_TYPES.map((t) => (
                <TouchableOpacity key={t} style={[ed.pill, exerciseType === t && ed.pillActive]} onPress={() => setExerciseType(t)}>
                  <Text style={[ed.pillText, exerciseType === t && ed.pillTextActive]}>{t}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
          <MuscleTagInput label="Primary Muscles" tags={musclesPrimary} onChange={setMusclesPrimary} />
          <MuscleTagInput label="Secondary Muscles" tags={musclesSecondary} onChange={setMusclesSecondary} />
          <View style={ed.field}>
            <Text style={ed.label}>Instructions</Text>
            <TextInput style={[ed.input, { height: 100, textAlignVertical: 'top' }]} value={instructions} onChangeText={setInstructions} multiline placeholderTextColor={c.muted} />
          </View>

          {/* Cover Image */}
          <View style={ed.field}>
            <Text style={ed.label}>Cover Image</Text>
            {!!coverImageKey && (
              <View style={ed.keyRow}>
                <Text style={ed.keyText} numberOfLines={1}>{coverImageKey}</Text>
                <TouchableOpacity onPress={() => setCoverImageKey('')}><Text style={ed.removeBtn}>Remove</Text></TouchableOpacity>
              </View>
            )}
            <View style={ed.uploadRow}>
              <TextInput
                style={[ed.input, { flex: 1 }]}
                value={coverImageUrlInput}
                onChangeText={setCoverImageUrlInput}
                placeholder="Paste image URL…"
                placeholderTextColor={c.muted}
                autoCapitalize="none"
                keyboardType="url"
              />
              <TouchableOpacity
                style={[ed.uploadBtn, (!coverImageUrlInput.trim() || uploadingField === 'cover') && { opacity: 0.4 }]}
                disabled={!coverImageUrlInput.trim() || uploadingField === 'cover'}
                onPress={() => uploadFromUrl('cover')}
              >
                <Text style={ed.uploadBtnText}>{uploadingField === 'cover' ? '…' : 'Upload'}</Text>
              </TouchableOpacity>
            </View>
            <TouchableOpacity style={ed.filePickerBtn} onPress={() => pickAndUpload('cover')} disabled={uploadingField === 'cover'}>
              <Text style={ed.filePickerText}>Pick from library</Text>
            </TouchableOpacity>
          </View>

          {/* How-To Media */}
          <View style={ed.field}>
            <Text style={ed.label}>How-To Media</Text>
            {!!mediaKey && (
              <View style={ed.keyRow}>
                <Text style={ed.keyText} numberOfLines={1}>{mediaKey}</Text>
                <TouchableOpacity onPress={() => setMediaKey('')}><Text style={ed.removeBtn}>Remove</Text></TouchableOpacity>
              </View>
            )}
            <View style={ed.uploadRow}>
              <TextInput
                style={[ed.input, { flex: 1 }]}
                value={mediaUrlInput}
                onChangeText={setMediaUrlInput}
                placeholder="YouTube, GIF, or image URL…"
                placeholderTextColor={c.muted}
                autoCapitalize="none"
                keyboardType="url"
              />
              <TouchableOpacity
                style={[ed.uploadBtn, (!mediaUrlInput.trim() || uploadingField === 'media') && { opacity: 0.4 }]}
                disabled={!mediaUrlInput.trim() || uploadingField === 'media'}
                onPress={() => uploadFromUrl('media')}
              >
                <Text style={ed.uploadBtnText}>{uploadingField === 'media' ? '…' : 'Upload'}</Text>
              </TouchableOpacity>
            </View>
            <TouchableOpacity style={ed.filePickerBtn} onPress={() => pickAndUpload('media')} disabled={uploadingField === 'media'}>
              <Text style={ed.filePickerText}>Pick from library</Text>
            </TouchableOpacity>
          </View>

          {/* Muscle Diagram */}
          <View style={ed.field}>
            <Text style={ed.label}>Muscle Diagram</Text>
            {!!muscleImageKey && (
              <View style={ed.keyRow}>
                <Text style={ed.keyText} numberOfLines={1}>{muscleImageKey}</Text>
                <TouchableOpacity onPress={() => setMuscleImageKey('')}><Text style={ed.removeBtn}>Remove</Text></TouchableOpacity>
              </View>
            )}
            <View style={ed.uploadRow}>
              <TextInput
                style={[ed.input, { flex: 1 }]}
                value={muscleImageUrlInput}
                onChangeText={setMuscleImageUrlInput}
                placeholder="Paste muscle diagram URL…"
                placeholderTextColor={c.muted}
                autoCapitalize="none"
                keyboardType="url"
              />
              <TouchableOpacity
                style={[ed.uploadBtn, (!muscleImageUrlInput.trim() || uploadingField === 'muscle') && { opacity: 0.4 }]}
                disabled={!muscleImageUrlInput.trim() || uploadingField === 'muscle'}
                onPress={() => uploadFromUrl('muscle')}
              >
                <Text style={ed.uploadBtnText}>{uploadingField === 'muscle' ? '…' : 'Upload'}</Text>
              </TouchableOpacity>
            </View>
            <TouchableOpacity style={ed.filePickerBtn} onPress={() => pickAndUpload('muscle')} disabled={uploadingField === 'muscle'}>
              <Text style={ed.filePickerText}>Pick from library</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

// ── Main screen ───────────────────────────────────────────────────────────────

type TabKey = 'summary' | 'history' | 'howto';

export default function ExerciseDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const token = useAuthStore((s) => s.token)!;
  const c = useColors();
  const s = makeStyles(c);
  const ts = makeTabStyles(c);

  const [exercise, setExercise] = useState<Exercise | null>(null);
  const [stats, setStats] = useState<ExerciseStats | null>(null);
  const [categories, setCategories] = useState<string[]>([]);
  const [tab, setTab] = useState<TabKey>('summary');
  const [metric, setMetric] = useState<MetricKey>('heaviest_weight');
  const [loading, setLoading] = useState(true);
  const [showEdit, setShowEdit] = useState(false);

  useEffect(() => {
    if (!id) return;
    const numId = Number(id);
    Promise.all([
      getExercise(token, numId),
      getExerciseStats(token, numId, 'heaviest_weight'),
      getExerciseCategories(token),
    ])
      .then(([ex, st, cats]) => { setExercise(ex); setStats(st); setCategories(cats); })
      .catch(() => router.back())
      .finally(() => setLoading(false));
  }, [id]);

  async function handleMetricChange(m: MetricKey) {
    setMetric(m);
    if (!id) return;
    try {
      const st = await getExerciseStats(token, Number(id), m);
      setStats(st);
    } catch { /* ignore */ }
  }

  function handleDelete() {
    if (!exercise) return;
    Alert.alert('Delete Exercise', `Delete "${exercise.name}"? This cannot be undone.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive', onPress: async () => {
          try { await deleteExercise(token, exercise.id); router.back(); }
          catch (err: any) { Alert.alert('Error', err?.message ?? 'Could not delete.'); }
        },
      },
    ]);
  }

  if (loading) return (
    <SafeAreaView style={s.container}>
      <ActivityIndicator style={{ marginTop: 40 }} color={c.accent} />
    </SafeAreaView>
  );

  if (!exercise) return null;

  return (
    <SafeAreaView style={s.container}>
      {/* Header */}
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()} style={s.backBtn}>
          <Text style={s.backText}>←</Text>
        </TouchableOpacity>
        <View style={s.headerTitle}>
          <Text style={s.title} numberOfLines={1}>{exercise.name}</Text>
          <Text style={s.subtitle}>{exercise.category} · {exercise.exerciseType}</Text>
        </View>
        <TouchableOpacity onPress={() => setShowEdit(true)} style={s.editBtn}>
          <Text style={s.editText}>Edit</Text>
        </TouchableOpacity>
        {exercise.isCustom && (
          <TouchableOpacity onPress={handleDelete} style={s.editBtn}>
            <Text style={[s.editText, { color: '#ef4444' }]}>Delete</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Tab bar */}
      <View style={s.tabBar}>
        {(['summary', 'history', 'howto'] as TabKey[]).map((t) => (
          <TouchableOpacity key={t} style={[s.tabBtn, tab === t && s.tabBtnActive]} onPress={() => setTab(t)}>
            <Text style={[s.tabLabel, tab === t && s.tabLabelActive]}>
              {t === 'summary' ? 'Summary' : t === 'history' ? 'History' : 'How To'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {tab === 'summary' && (
        stats
          ? <SummaryTab stats={stats} metric={metric} onMetricChange={handleMetricChange} />
          : <Text style={ts.empty}>No data yet</Text>
      )}
      {tab === 'history' && <HistoryTab exerciseId={Number(id)} />}
      {tab === 'howto' && <HowToTab exercise={exercise} />}

      {showEdit && (
        <EditModal
          exercise={exercise}
          categories={categories}
          onSaved={(updated) => { setExercise(updated); setShowEdit(false); }}
          onClose={() => setShowEdit(false)}
        />
      )}
    </SafeAreaView>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

function makeStyles(c: Colors) {
  return StyleSheet.create({
  container: { flex: 1, backgroundColor: c.bg },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: c.border, gap: 8 },
  backBtn: { paddingHorizontal: 4 },
  backText: { fontSize: fontSize.xl, color: c.muted },
  headerTitle: { flex: 1 },
  title: { fontSize: fontSize.base, fontWeight: '700', color: c.text },
  subtitle: { fontSize: fontSize.xs, color: c.muted, marginTop: 1 },
  editBtn: { paddingHorizontal: 4 },
  editText: { fontSize: fontSize.sm, color: c.accent, fontWeight: '600' },
  tabBar: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: c.border },
  tabBtn: { flex: 1, paddingVertical: 10, alignItems: 'center' },
  tabBtnActive: { borderBottomWidth: 2, borderBottomColor: c.accent },
  tabLabel: { fontSize: fontSize.sm, color: c.muted, fontWeight: '500' },
  tabLabelActive: { color: c.accent, fontWeight: '700' },
  });
}

function makeTabStyles(c: Colors) {
  return StyleSheet.create({
  scroll: { padding: 16, gap: 12 },
  empty: { textAlign: 'center', color: c.muted, fontSize: fontSize.sm, marginTop: 40 },
  pbGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  pbTile: { width: '47%', backgroundColor: c.card, borderRadius: 10, borderWidth: 1, borderColor: c.border, padding: 12 },
  pbLabel: { fontSize: fontSize.xs, color: c.muted, marginBottom: 4 },
  pbValue: { fontSize: fontSize.base, fontWeight: '600', color: c.text },
  pbSub: { fontSize: fontSize.xs, color: c.muted, marginTop: 2 },
  section: { backgroundColor: c.card, borderRadius: 10, borderWidth: 1, borderColor: c.border, padding: 12, gap: 4 },
  sectionTitle: { fontSize: fontSize.sm, fontWeight: '600', color: c.text, marginBottom: 4 },
  sectionSub: { fontSize: fontSize.xs, color: c.muted, marginBottom: 4 },
  tableHeader: { flexDirection: 'row', marginBottom: 4 },
  tableHeaderCell: { flex: 1, fontSize: fontSize.xs, color: c.muted },
  tableRow: { flexDirection: 'row', paddingVertical: 2 },
  tableCell: { flex: 1, fontSize: fontSize.sm, color: c.muted },
  metricPill: { borderRadius: 20, borderWidth: 1, borderColor: c.border, paddingHorizontal: 12, paddingVertical: 6 },
  metricPillActive: { backgroundColor: c.accent, borderColor: c.accent },
  metricText: { fontSize: fontSize.xs, color: c.muted },
  metricTextActive: { color: c.bg, fontWeight: '700' },
  chartRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 3 },
  chartDate: { fontSize: fontSize.xs, color: c.muted },
  chartValue: { fontSize: fontSize.xs, color: c.text, fontWeight: '500' },
  loadMore: { textAlign: 'center', color: c.accent, fontSize: fontSize.sm, paddingVertical: 12 },
  mediaImage: { width: '100%', height: 200, borderRadius: 8 },
  muscleLabel: { fontSize: fontSize.xs, color: c.muted, marginBottom: 4 },
  tagRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  tagPrimary: { backgroundColor: c.accent + '28', borderRadius: 12, paddingHorizontal: 10, paddingVertical: 4 },
  tagPrimaryText: { fontSize: fontSize.xs, color: c.accent },
  tagSecondary: { backgroundColor: c.card, borderRadius: 12, borderWidth: 1, borderColor: c.border, paddingHorizontal: 10, paddingVertical: 4 },
  tagSecondaryText: { fontSize: fontSize.xs, color: c.muted },
  instructions: { fontSize: fontSize.sm, color: c.text, lineHeight: 20 },
  });
}

function makeEdStyles(c: Colors) {
  return StyleSheet.create({
  container: { flex: 1, backgroundColor: c.bg },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: c.border },
  title: { fontSize: fontSize.base, fontWeight: '700', color: c.text },
  cancel: { fontSize: fontSize.base, color: c.muted },
  save: { fontSize: fontSize.base, color: c.accent, fontWeight: '700' },
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
  uploadRow: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  uploadBtn: { backgroundColor: c.accent, borderRadius: 8, paddingHorizontal: 14, paddingVertical: 10 },
  uploadBtnText: { fontSize: fontSize.sm, fontWeight: '700', color: c.bg },
  filePickerBtn: { marginTop: 6 },
  filePickerText: { fontSize: fontSize.sm, color: c.accent },
  keyRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
  keyText: { flex: 1, fontSize: fontSize.xs, color: c.muted },
  removeBtn: { fontSize: fontSize.xs, color: '#ef4444', fontWeight: '600' },
  });
}
