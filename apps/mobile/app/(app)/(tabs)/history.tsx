import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  RefreshControl,
  SectionList,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSwipeNav } from '../../../src/hooks/useSwipeNav';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  getWorkouts, deleteWorkout, getFoodLogHistory, getMeasurements, addMeasurement, updateMeasurement, deleteMeasurement,
  type WorkoutSummary, type FoodLogHistoryDay, type FoodLogHistoryEntry, type BodyMeasurement,
} from '../../../src/api/client';
import { useAuthStore } from '../../../src/store/auth';
import { KG_TO_LBS } from '../../../../../packages/api-client/src/index';
import { fontSize, type Colors } from '../../../src/theme';
import { useColors } from '../../../src/hooks/useColors';

type Tab = 'workouts' | 'nutrition' | 'measurements';
type RangeKey = '30d' | '90d' | '1y' | 'all';

const HIST_TABS = ['workouts', 'nutrition', 'measurements'] as const;

const RANGES: { key: RangeKey; label: string; days: number | null }[] = [
  { key: '30d', label: '30d', days: 30 },
  { key: '90d', label: '90d', days: 90 },
  { key: '1y', label: '1y', days: 365 },
  { key: 'all', label: 'All', days: null },
];

const METRICS = [
  { key: 'weight', label: 'Weight', unit: 'lbs' },
  { key: 'waist', label: 'Waist', unit: 'in' },
  { key: 'bicep', label: 'Bicep', unit: 'in' },
];

const MEAL_ORDER = ['breakfast', 'lunch', 'dinner', 'snack'];

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

function rangeDates(days: number | null): { start?: string; end?: string } {
  if (days == null) return {};
  const end = new Date();
  const start = new Date();
  start.setDate(start.getDate() - days);
  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  return { start: fmt(start), end: fmt(end) };
}

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
function fmtMeasDate(dateStr: string): string {
  const parts = (dateStr ?? '').split('-');
  if (parts.length < 3) return dateStr ?? '';
  const m = parseInt(parts[1], 10) - 1;
  return `${MONTHS[m] ?? parts[1]} ${parseInt(parts[2], 10)}, ${parts[0]}`;
}

function fmtWorkoutDate(dateStr: string): string {
  return new Date(dateStr + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

function groupWorkoutsByDate(workouts: WorkoutSummary[]): { title: string; data: WorkoutSummary[] }[] {
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const fmtKey = (d: Date) => d.toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' });
  const todayKey = fmtKey(today);
  const yKey = fmtKey(yesterday);
  const groups = new Map<string, WorkoutSummary[]>();
  for (const w of workouts) {
    const d = new Date(w.workoutDate + 'T12:00:00');
    const key = fmtKey(d);
    const label = key === todayKey ? 'Today' : key === yKey ? 'Yesterday' : key;
    if (!groups.has(label)) groups.set(label, []);
    groups.get(label)!.push(w);
  }
  return Array.from(groups.entries()).map(([title, data]) => ({ title, data }));
}

function dayLabel(dateStr: string): string {
  const d = new Date(dateStr + 'T12:00:00');
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const fmt = (dt: Date) => dt.toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' });
  const k = fmt(d);
  if (k === fmt(today)) return 'Today';
  if (k === fmt(yesterday)) return 'Yesterday';
  return k;
}

function mealTotals(entries: FoodLogHistoryEntry[]) {
  return {
    cal: Math.round(entries.reduce((s, e) => s + e.calories, 0)),
    protein: Math.round(entries.reduce((s, e) => s + e.proteinG, 0) * 10) / 10,
    carbs: Math.round(entries.reduce((s, e) => s + e.carbsG, 0) * 10) / 10,
    fat: Math.round(entries.reduce((s, e) => s + e.fatG, 0) * 10) / 10,
  };
}

interface MeasModalState {
  entry: BodyMeasurement | null;
  metric: string;
  value: string;
  date: string;
  isNew: boolean;
}

export default function HistoryScreen() {
  const token = useAuthStore((s) => s.token)!;
  const router = useRouter();
  const c = useColors();
  const [activeTab, setActiveTab] = useState<Tab>('workouts');
  const [range, setRange] = useState<RangeKey>('30d');
  const dateParams = useMemo(() => rangeDates(RANGES.find((r) => r.key === range)?.days ?? null), [range]);

  // Workouts
  const [workouts, setWorkouts] = useState<WorkoutSummary[]>([]);
  const [workoutsLoading, setWorkoutsLoading] = useState(true);
  const [workoutsRefreshing, setWorkoutsRefreshing] = useState(false);
  const [deletingWorkoutId, setDeletingWorkoutId] = useState<number | null>(null);

  // Nutrition
  const [foodDays, setFoodDays] = useState<FoodLogHistoryDay[]>([]);
  const [nutritionLoading, setNutritionLoading] = useState(true);
  const [nutritionRefreshing, setNutritionRefreshing] = useState(false);
  const [foodDetail, setFoodDetail] = useState<FoodLogHistoryEntry | null>(null);

  // Measurements
  const [measurements, setMeasurements] = useState<BodyMeasurement[]>([]);
  const [measLoading, setMeasLoading] = useState(true);
  const [measRefreshing, setMeasRefreshing] = useState(false);
  const [metricFilter, setMetricFilter] = useState<string>('all');
  const [measModal, setMeasModal] = useState<MeasModalState | null>(null);
  const [measSaving, setMeasSaving] = useState(false);

  useEffect(() => {
    setWorkoutsLoading(true);
    setNutritionLoading(true);
    setMeasLoading(true);
    getWorkouts(token, { limit: 1000, ...dateParams }).then(setWorkouts).catch(() => {}).finally(() => setWorkoutsLoading(false));
    getFoodLogHistory(token, dateParams).then(setFoodDays).catch(() => {}).finally(() => setNutritionLoading(false));
    getMeasurements(token, dateParams).then(setMeasurements).catch(() => {}).finally(() => setMeasLoading(false));
  }, [token, dateParams]);

  const refreshWorkouts = useCallback(async () => {
    setWorkoutsRefreshing(true);
    await getWorkouts(token, { limit: 1000, ...dateParams }).then(setWorkouts).catch(() => {});
    setWorkoutsRefreshing(false);
  }, [token, dateParams]);

  const refreshNutrition = useCallback(async () => {
    setNutritionRefreshing(true);
    await getFoodLogHistory(token, dateParams).then(setFoodDays).catch(() => {});
    setNutritionRefreshing(false);
  }, [token, dateParams]);

  const refreshMeasurements = useCallback(async () => {
    setMeasRefreshing(true);
    await getMeasurements(token, dateParams).then(setMeasurements).catch(() => {});
    setMeasRefreshing(false);
  }, [token, dateParams]);

  function handleDeleteWorkout(id: number) {
    Alert.alert('Delete Workout', 'Delete this workout?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          setDeletingWorkoutId(id);
          await deleteWorkout(token, id).catch(() => {});
          setWorkouts((prev) => prev.filter((w) => w.id !== id));
          setDeletingWorkoutId(null);
        },
      },
    ]);
  }

  function openNewMeasurement(metric: string) {
    setMeasModal({ entry: null, metric, value: '', date: todayStr(), isNew: true });
  }

  function openEditMeasurement(entry: BodyMeasurement) {
    setMeasModal({ entry, metric: entry.metric, value: String(entry.value), date: entry.measuredAt, isNew: false });
  }

  async function saveMeasurement() {
    if (!measModal) return;
    const val = parseFloat(measModal.value);
    if (isNaN(val) || !measModal.date) { Alert.alert('Invalid input', 'Enter a valid value and date.'); return; }
    const unit = METRICS.find((m) => m.key === measModal.metric)?.unit ?? 'lbs';
    setMeasSaving(true);
    try {
      if (measModal.isNew) {
        const created = await addMeasurement(token, { metric: measModal.metric, value: val, unit, measuredAt: measModal.date });
        setMeasurements((prev) => [created, ...prev].sort((a, b) => b.measuredAt.localeCompare(a.measuredAt)));
      } else if (measModal.entry) {
        const updated = await updateMeasurement(token, measModal.entry.id, { value: val, measuredAt: measModal.date });
        setMeasurements((prev) => prev.map((m) => m.id === updated.id ? updated : m));
      }
      setMeasModal(null);
    } catch {
      Alert.alert('Error', 'Failed to save measurement.');
    } finally {
      setMeasSaving(false);
    }
  }

  function handleDeleteMeasurement(id: number) {
    Alert.alert('Delete Measurement', 'Delete this entry?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          await deleteMeasurement(token, id).catch(() => {});
          setMeasurements((prev) => prev.filter((m) => m.id !== id));
        },
      },
    ]);
  }

  const swipe = useSwipeNav(-1, HIST_TABS, activeTab, setActiveTab);

  const styles = makeStyles(c);
  const workoutGroups = groupWorkoutsByDate(workouts);
  const filteredMeasurements = measurements
    .filter((m) => metricFilter === 'all' || m.metric === metricFilter)
    .slice()
    .sort((a, b) => {
      const d = (b.measuredAt ?? '').localeCompare(a.measuredAt ?? '');
      return d !== 0 ? d : (a.metric ?? '').localeCompare(b.metric ?? '');
    });

  return (
    <SafeAreaView style={styles.container}>
      {/* Header + tabs */}
      <View style={styles.header}>
        <View style={styles.titleRow}>
          <Text style={styles.title}>History</Text>
          <View style={styles.rangeRow}>
            {RANGES.map(({ key, label }) => (
              <TouchableOpacity
                key={key}
                onPress={() => setRange(key)}
                style={[styles.rangeChip, range === key && styles.rangeChipActive]}
                hitSlop={{ top: 6, bottom: 6, left: 4, right: 4 }}
              >
                <Text style={[styles.rangeChipText, range === key && styles.rangeChipTextActive]}>{label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
        <View style={styles.tabRow}>
          {HIST_TABS.map((tab) => (
            <TouchableOpacity key={tab} onPress={() => setActiveTab(tab)} style={styles.tabBtn} hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}>
              <Text style={[styles.tabLabel, activeTab === tab && styles.tabLabelActive]}>
                {tab === 'measurements' ? 'Measurements' : tab.charAt(0).toUpperCase() + tab.slice(1)}
              </Text>
              <View style={[styles.tabUnderline, activeTab === tab && styles.tabUnderlineActive]} />
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* Swipe wrapper — panHandlers live here so swipe works regardless of which tab is active */}
      <View style={styles.tabPane} {...swipe.panHandlers}>

        {/* ── Workouts ───────────────────────────────────────────────── */}
        {activeTab === 'workouts' && (
          workoutsLoading ? (
            <ActivityIndicator color={c.accent} style={{ marginTop: 60 }} />
          ) : workouts.length === 0 ? (
            <View style={styles.empty}>
              <Text style={styles.emptyIcon}>🏋️</Text>
              <Text style={styles.emptyText}>No workouts yet</Text>
            </View>
          ) : (
            <SectionList
              sections={workoutGroups}
              keyExtractor={(item) => String(item.id)}
              contentContainerStyle={styles.list}
              refreshControl={<RefreshControl refreshing={workoutsRefreshing} onRefresh={refreshWorkouts} tintColor={c.accent} />}
              renderSectionHeader={({ section }) => (
                <Text style={styles.sectionHeader}>{section.title}</Text>
              )}
              renderItem={({ item: w }) => (
                <TouchableOpacity
                  style={[styles.card, { flexDirection: 'row', alignItems: 'flex-start', padding: 14, marginBottom: 8 }]}
                  onPress={() => router.push(`/(app)/workout/${w.id}` as any)}
                  activeOpacity={0.7}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={styles.cardTitle}>{w.name ?? w.routineName ?? fmtWorkoutDate(w.workoutDate)}</Text>
                    {(w.name ?? w.routineName) && (
                      <Text style={styles.cardSubtitle}>{fmtWorkoutDate(w.workoutDate)}</Text>
                    )}
                    <Text style={styles.cardMeta}>
                      {w.durationMinutes != null ? `${w.durationMinutes} min · ` : ''}
                      {Math.round((w.totalVolumeKg ?? 0) * KG_TO_LBS).toLocaleString()} lbs
                    </Text>
                    {w.exercises.length > 0 && (
                      <View style={{ marginTop: 6, gap: 2 }}>
                        {w.exercises.map((ex) => (
                          <View key={ex.name} style={{ flexDirection: 'row', alignItems: 'baseline', gap: 6 }}>
                            <Text style={styles.exName} numberOfLines={1}>{ex.name}</Text>
                            <Text style={styles.exMeta}>
                              {ex.setCount} {ex.setCount === 1 ? 'set' : 'sets'}
                              {ex.avgReps != null ? ` × ${ex.avgReps} reps` : ''}
                              {ex.maxWeightKg != null ? ` · ${Math.round(ex.maxWeightKg * KG_TO_LBS * 10) / 10} lbs` : ''}
                              {ex.totalDurationSeconds != null ? ` · ${Math.floor(ex.totalDurationSeconds / 60)}:${String(ex.totalDurationSeconds % 60).padStart(2, '0')}` : ''}
                            </Text>
                          </View>
                        ))}
                      </View>
                    )}
                  </View>
                  <TouchableOpacity
                    onPress={() => handleDeleteWorkout(w.id)}
                    disabled={deletingWorkoutId === w.id}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    style={{ paddingLeft: 8, opacity: deletingWorkoutId === w.id ? 0.4 : 1 }}
                  >
                    <Text style={{ fontSize: 22, color: c.muted, lineHeight: 24 }}>×</Text>
                  </TouchableOpacity>
                </TouchableOpacity>
              )}
            />
          )
        )}

        {/* ── Nutrition ──────────────────────────────────────────────── */}
        {activeTab === 'nutrition' && (
          nutritionLoading ? (
            <ActivityIndicator color={c.accent} style={{ marginTop: 60 }} />
          ) : foodDays.length === 0 ? (
            <View style={styles.empty}>
              <Text style={styles.emptyIcon}>🥗</Text>
              <Text style={styles.emptyText}>No nutrition logs in range</Text>
            </View>
          ) : (
            <FlatList
              data={foodDays}
              keyExtractor={(day) => day.date}
              contentContainerStyle={styles.list}
              refreshControl={<RefreshControl refreshing={nutritionRefreshing} onRefresh={refreshNutrition} tintColor={c.accent} />}
              initialNumToRender={6}
              windowSize={5}
              removeClippedSubviews
              renderItem={({ item: day }) => {
                const byMeal = day.entries.reduce<Record<string, FoodLogHistoryEntry[]>>((acc, e) => {
                  if (!acc[e.meal]) acc[e.meal] = [];
                  acc[e.meal].push(e);
                  return acc;
                }, {});
                const dayTotal = mealTotals(day.entries);
                return (
                  <View style={{ marginBottom: 20 }}>
                    <Text style={styles.sectionHeader}>{dayLabel(day.date)}</Text>
                    <View style={styles.card}>
                      <View style={styles.dayTotals}>
                        {[['Cal', String(dayTotal.cal)], ['Protein', `${dayTotal.protein}g`], ['Carbs', `${dayTotal.carbs}g`], ['Fat', `${dayTotal.fat}g`]].map(([label, val]) => (
                          <View key={label} style={{ flex: 1 }}>
                            <Text style={styles.dayTotalLabel}>{label}</Text>
                            <Text style={styles.dayTotalValue}>{val}</Text>
                          </View>
                        ))}
                      </View>
                      {MEAL_ORDER.filter((m) => byMeal[m]?.length).map((meal, mIdx, arr) => {
                        const totals = mealTotals(byMeal[meal]);
                        return (
                          <View key={meal} style={[styles.mealSection, mIdx < arr.length - 1 && { borderBottomWidth: 1, borderBottomColor: c.border }]}>
                            <View style={styles.mealHeader}>
                              <Text style={styles.mealName}>{meal.charAt(0).toUpperCase() + meal.slice(1)}</Text>
                              <Text style={styles.mealMeta}>{totals.cal} cal · {totals.protein}g P · {totals.carbs}g C · {totals.fat}g F</Text>
                            </View>
                            {byMeal[meal].map((e) => (
                              <TouchableOpacity key={e.id} style={styles.foodRow} onPress={() => setFoodDetail(e)}>
                                <View style={{ flex: 1, minWidth: 0 }}>
                                  <Text style={styles.foodName} numberOfLines={1}>{e.foodName}</Text>
                                  {e.brand && <Text style={styles.foodBrand} numberOfLines={1}>{e.brand}</Text>}
                                </View>
                                <Text style={styles.foodCal}>{e.calories} cal</Text>
                              </TouchableOpacity>
                            ))}
                          </View>
                        );
                      })}
                    </View>
                  </View>
                );
              }}
            />
          )
        )}

        {/* ── Measurements ───────────────────────────────────────────── */}
        {activeTab === 'measurements' && (
          measLoading ? (
            <ActivityIndicator color={c.accent} style={{ marginTop: 60 }} />
          ) : (
            <FlatList
              data={filteredMeasurements}
              keyExtractor={(entry) => String(entry.id)}
              contentContainerStyle={styles.list}
              refreshControl={<RefreshControl refreshing={measRefreshing} onRefresh={refreshMeasurements} tintColor={c.accent} />}
              initialNumToRender={20}
              windowSize={10}
              removeClippedSubviews
              ListHeaderComponent={
                <View>
                  <View style={styles.measControls}>
                    <View style={styles.metricFilterRow}>
                      <TouchableOpacity onPress={() => setMetricFilter('all')} style={[styles.metricChip, metricFilter === 'all' && styles.metricChipActive]}>
                        <Text style={[styles.metricChipText, metricFilter === 'all' && styles.metricChipTextActive]}>All</Text>
                      </TouchableOpacity>
                      {METRICS.map(({ key, label }) => (
                        <TouchableOpacity key={key} onPress={() => setMetricFilter(metricFilter === key ? 'all' : key)} style={[styles.metricChip, metricFilter === key && styles.metricChipActive]}>
                          <Text style={[styles.metricChipText, metricFilter === key && styles.metricChipTextActive]}>{label}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                    <View style={styles.addMeasRow}>
                      {METRICS.map(({ key, label }) => (
                        <TouchableOpacity key={key} onPress={() => openNewMeasurement(key)}>
                          <Text style={styles.addMeasBtn}>+ {label}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </View>
                  {filteredMeasurements.length > 0 && (
                    <View style={[styles.card, { borderBottomLeftRadius: 0, borderBottomRightRadius: 0, marginBottom: 0 }]}>
                      <View style={[styles.measRow, styles.measHeaderRow]}>
                        <Text style={[styles.measCell, styles.measHeader]}>Measurement</Text>
                        <Text style={[styles.measCell, styles.measHeader]}>Value</Text>
                        <Text style={[styles.measCell, styles.measHeader, { flex: 1.4 }]}>Date</Text>
                        <View style={{ width: 60 }} />
                      </View>
                    </View>
                  )}
                </View>
              }
              ListEmptyComponent={
                <View style={[styles.card, { padding: 24, alignItems: 'center' }]}>
                  <Text style={{ color: c.muted, fontSize: fontSize.sm }}>
                    {metricFilter === 'all' ? 'No measurements in range' : `No ${METRICS.find((m) => m.key === metricFilter)?.label ?? metricFilter} measurements in range`}
                  </Text>
                </View>
              }
              renderItem={({ item: entry, index }) => {
                const meta = METRICS.find((m) => m.key === entry.metric);
                const isLast = index === filteredMeasurements.length - 1;
                return (
                  <View style={[
                    styles.measRow,
                    { backgroundColor: c.card, borderLeftWidth: 1, borderRightWidth: 1, borderColor: c.border },
                    !isLast && { borderBottomWidth: 1, borderBottomColor: c.border },
                    isLast && { borderBottomWidth: 1, borderBottomLeftRadius: 14, borderBottomRightRadius: 14 },
                  ]}>
                    <Text style={[styles.measCell, { color: c.text }]}>{meta?.label ?? entry.metric}</Text>
                    <Text style={[styles.measCell, { color: c.text, fontWeight: '600' }]}>{entry.value} {meta?.unit ?? entry.unit}</Text>
                    <Text style={[styles.measCell, { flex: 1.4, color: c.muted, fontSize: fontSize.xs }]}>
                      {fmtMeasDate(entry.measuredAt)}
                    </Text>
                    <View style={{ width: 60, flexDirection: 'row', alignItems: 'center', gap: 2 }}>
                      <TouchableOpacity onPress={() => openEditMeasurement(entry)} hitSlop={{ top: 6, bottom: 6, left: 4, right: 4 }}>
                        <Text style={{ fontSize: 16, color: c.muted }}>✎</Text>
                      </TouchableOpacity>
                      <TouchableOpacity onPress={() => handleDeleteMeasurement(entry.id)} hitSlop={{ top: 6, bottom: 6, left: 4, right: 4 }}>
                        <Text style={{ fontSize: 20, color: c.muted, lineHeight: 22 }}>×</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                );
              }}
            />
          )
        )}

      </View>

      {/* Food detail modal */}
      <Modal visible={foodDetail !== null} transparent animationType="fade" onRequestClose={() => setFoodDetail(null)}>
        <View style={styles.overlay}>
          <View style={styles.detailModal}>
            <Text style={styles.detailName}>{foodDetail?.foodName}</Text>
            {foodDetail?.brand && <Text style={styles.detailBrand}>{foodDetail.brand}</Text>}
            <Text style={styles.detailServing}>{foodDetail?.quantity} × {foodDetail?.servingLabel}</Text>
            <View style={styles.detailMacros}>
              {[
                { label: 'Calories', val: String(foodDetail?.calories ?? 0) },
                { label: 'Protein', val: `${foodDetail?.proteinG ?? 0}g` },
                { label: 'Carbs', val: `${foodDetail?.carbsG ?? 0}g` },
                { label: 'Fat', val: `${foodDetail?.fatG ?? 0}g` },
              ].map(({ label, val }) => (
                <View key={label} style={styles.detailMacroCell}>
                  <Text style={styles.detailMacroLabel}>{label}</Text>
                  <Text style={styles.detailMacroValue}>{val}</Text>
                </View>
              ))}
            </View>
            <TouchableOpacity onPress={() => setFoodDetail(null)} style={{ alignSelf: 'flex-end' }}>
              <Text style={{ color: c.muted, fontSize: fontSize.sm, paddingVertical: 4, paddingHorizontal: 8 }}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Measurement add/edit modal */}
      <Modal visible={measModal !== null} transparent animationType="fade" onRequestClose={() => setMeasModal(null)}>
        <View style={styles.overlay}>
          <View style={styles.measModal}>
            <Text style={styles.measModalTitle}>
              {measModal?.isNew ? 'Add' : 'Edit'} {METRICS.find((m) => m.key === measModal?.metric)?.label}
            </Text>
            <View style={{ flexDirection: 'row', gap: 12 }}>
              <View style={{ flex: 1 }}>
                <Text style={styles.measModalLabel}>Value ({METRICS.find((m) => m.key === measModal?.metric)?.unit})</Text>
                <TextInput
                  style={styles.measModalInput}
                  value={measModal?.value ?? ''}
                  onChangeText={(v) => setMeasModal((prev) => prev ? { ...prev, value: v } : prev)}
                  keyboardType="decimal-pad"
                  autoFocus
                  placeholder="0.0"
                  placeholderTextColor={c.muted}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.measModalLabel}>Date (YYYY-MM-DD)</Text>
                <TextInput
                  style={styles.measModalInput}
                  value={measModal?.date ?? ''}
                  onChangeText={(v) => setMeasModal((prev) => prev ? { ...prev, date: v } : prev)}
                  keyboardType="numbers-and-punctuation"
                  placeholder="2026-01-01"
                  placeholderTextColor={c.muted}
                  returnKeyType="done"
                  onSubmitEditing={saveMeasurement}
                />
              </View>
            </View>
            <View style={styles.measModalButtons}>
              <TouchableOpacity onPress={() => setMeasModal(null)} style={styles.measCancelBtn}>
                <Text style={{ color: c.muted, fontSize: fontSize.sm }}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={saveMeasurement} disabled={measSaving} style={[styles.measSaveBtn, measSaving && { opacity: 0.5 }]}>
                <Text style={{ color: c.bg, fontWeight: '700', fontSize: fontSize.sm }}>{measSaving ? 'Saving…' : 'Save'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

function makeStyles(c: Colors) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: c.bg },
    tabPane: { flex: 1 },
    header: { paddingHorizontal: 16, paddingTop: 8, borderBottomWidth: 1, borderBottomColor: c.border },
    titleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingBottom: 8 },
    title: { fontSize: fontSize.xl, fontWeight: '700', color: c.text },
    rangeRow: { flexDirection: 'row' },
    rangeChip: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6, marginLeft: 4 },
    rangeChipActive: { backgroundColor: c.accent },
    rangeChipText: { fontSize: fontSize.xs, fontWeight: '600', color: c.muted },
    rangeChipTextActive: { color: c.bg },
    tabRow: { flexDirection: 'row', gap: 0 },
    tabBtn: { paddingRight: 20, paddingBottom: 0 },
    tabLabel: { fontSize: fontSize.sm, fontWeight: '500', color: c.muted, paddingBottom: 10 },
    tabLabelActive: { color: c.accent },
    tabUnderline: { height: 2, borderRadius: 1, backgroundColor: 'transparent', marginTop: -2 },
    tabUnderlineActive: { backgroundColor: c.accent },

    list: { padding: 16, paddingBottom: 32 },
    sectionHeader: { fontSize: fontSize.xs, color: c.muted, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 8, marginTop: 4 },
    card: { backgroundColor: c.card, borderRadius: 14, borderWidth: 1, borderColor: c.border, overflow: 'hidden', marginBottom: 4 },

    // Workout
    cardTitle: { fontSize: fontSize.base, fontWeight: '600', color: c.text },
    cardSubtitle: { fontSize: fontSize.xs, color: c.muted, marginTop: 1 },
    cardMeta: { fontSize: fontSize.xs, color: c.muted, marginTop: 2 },
    exName: { fontSize: fontSize.sm, color: c.text, flex: 1 },
    exMeta: { fontSize: fontSize.xs, color: c.muted },

    // Nutrition
    dayTotals: { flexDirection: 'row', paddingHorizontal: 14, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: c.border },
    dayTotalLabel: { fontSize: 10, color: c.muted, textTransform: 'uppercase', letterSpacing: 0.5 },
    dayTotalValue: { fontSize: fontSize.base, fontWeight: '600', color: c.text, marginTop: 1 },
    mealSection: { paddingHorizontal: 14, paddingTop: 10, paddingBottom: 8 },
    mealHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6 },
    mealName: { fontSize: fontSize.sm, fontWeight: '600', color: c.text },
    mealMeta: { fontSize: fontSize.xs, color: c.muted },
    foodRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', paddingVertical: 4 },
    foodName: { fontSize: fontSize.sm, color: c.text, flex: 1, minWidth: 0 },
    foodBrand: { fontSize: fontSize.xs, color: c.muted },
    foodCal: { fontSize: fontSize.xs, color: c.muted, paddingLeft: 8, flexShrink: 0 },

    // Measurements
    measControls: { marginBottom: 12 },
    metricFilterRow: { flexDirection: 'row', gap: 6, flexWrap: 'wrap', marginBottom: 10 },
    metricChip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, borderWidth: 1, borderColor: c.border },
    metricChipActive: { backgroundColor: c.accent, borderColor: c.accent },
    metricChipText: { fontSize: fontSize.xs, fontWeight: '600', color: c.muted },
    metricChipTextActive: { color: c.bg },
    addMeasRow: { flexDirection: 'row', gap: 16 },
    addMeasBtn: { fontSize: fontSize.sm, color: c.accent },
    measRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 12 },
    measHeaderRow: { borderBottomWidth: 1, borderBottomColor: c.border, paddingVertical: 8 },
    measCell: { flex: 1, fontSize: fontSize.sm, color: c.muted },
    measHeader: { fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.5, fontWeight: '600' },

    // Shared modals
    overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'center' },
    empty: { flex: 1, alignItems: 'center', justifyContent: 'center' },
    emptyIcon: { fontSize: 48, marginBottom: 12 },
    emptyText: { fontSize: fontSize.lg, color: c.muted },

    // Food detail modal
    detailModal: { backgroundColor: c.card, borderRadius: 14, padding: 20, width: '88%', borderWidth: 1, borderColor: c.border, gap: 4 },
    detailName: { fontSize: fontSize.base, fontWeight: '700', color: c.text },
    detailBrand: { fontSize: fontSize.sm, color: c.muted },
    detailServing: { fontSize: fontSize.sm, color: c.muted, marginBottom: 8 },
    detailMacros: { flexDirection: 'row', gap: 8, marginBottom: 12 },
    detailMacroCell: { flex: 1, backgroundColor: c.bg, borderRadius: 8, padding: 10, borderWidth: 1, borderColor: c.border },
    detailMacroLabel: { fontSize: 10, color: c.muted, textTransform: 'uppercase', letterSpacing: 0.5 },
    detailMacroValue: { fontSize: fontSize.base, fontWeight: '600', color: c.text, marginTop: 2 },

    // Measurement modal
    measModal: { backgroundColor: c.card, borderRadius: 14, padding: 20, width: '88%', borderWidth: 1, borderColor: c.border },
    measModalTitle: { fontSize: fontSize.base, fontWeight: '700', color: c.text, marginBottom: 14 },
    measModalLabel: { fontSize: fontSize.xs, color: c.muted, marginBottom: 6 },
    measModalInput: { backgroundColor: c.bg, borderWidth: 1, borderColor: c.border, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 9, fontSize: fontSize.sm, color: c.text },
    measModalButtons: { flexDirection: 'row', justifyContent: 'flex-end', gap: 10, marginTop: 16 },
    measCancelBtn: { paddingVertical: 8, paddingHorizontal: 14 },
    measSaveBtn: { backgroundColor: c.accent, paddingVertical: 8, paddingHorizontal: 18, borderRadius: 8 },
  });
}
