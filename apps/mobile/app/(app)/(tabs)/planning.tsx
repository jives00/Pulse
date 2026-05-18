import { useCallback, useState } from 'react';
import {
  ActivityIndicator, Alert, Modal, KeyboardAvoidingView, Platform,
  ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from 'expo-router';
import {
  getGoalsSummary, getExerciseGoals, saveExerciseGoals, saveNutritionGoals,
  getMeasurementGoals, setMeasurementGoal, deleteMeasurementGoal, getMeasurements,
  type GoalsSummary, type ExerciseGoals, type MeasurementGoal, type BodyMeasurement,
} from '../../../src/api/client';
import { computeGoalPace, type PaceStatus } from '../../../../../packages/api-client/src/index';
import { useAuthStore } from '../../../src/store/auth';
import { fontSize, type Colors } from '../../../src/theme';
import { useColors } from '../../../src/hooks/useColors';

// ─── Shared config ────────────────────────────────────────────────────────────

const GLASS_OZ = 8;

const METRIC_CONFIG: Record<string, { label: string; unit: string; dir: 'up' | 'down' }> = {
  weight:      { label: 'Weight',      unit: 'lbs', dir: 'down' },
  waist:       { label: 'Waist',       unit: 'in',  dir: 'down' },
  bicep:       { label: 'Bicep',       unit: 'in',  dir: 'up'   },
  chest:       { label: 'Chest',       unit: 'in',  dir: 'up'   },
  hips:        { label: 'Hips',        unit: 'in',  dir: 'down' },
  body_fat:    { label: 'Body Fat',    unit: '%',   dir: 'down' },
  muscle_mass: { label: 'Muscle Mass', unit: 'lbs', dir: 'up'   },
  water_pct:   { label: 'Water Mass',  unit: '%',   dir: 'up'   },
};

const ALL_METRICS = Object.keys(METRIC_CONFIG);

// ─── Helpers ─────────────────────────────────────────────────────────────────

function pct(actual: number, goal: number | null | undefined) {
  if (!goal) return 0;
  return Math.min(actual / goal, 1);
}

function ProgressBar({ value, total, color, c }: { value: number; total: number | null | undefined; color: string; c: Colors }) {
  const p = pct(value, total) * 100;
  return (
    <View style={{ height: 8, backgroundColor: c.border, borderRadius: 4, overflow: 'hidden' }}>
      <View style={{ height: 8, borderRadius: 4, width: `${p}%` as any, backgroundColor: color }} />
    </View>
  );
}

function PaceBadge({ status, c }: { status: PaceStatus; c: Colors }) {
  const cfg: Record<PaceStatus, { label: string; color: string }> = {
    done:   { label: '✓ Achieved', color: '#86AA80' },
    green:  { label: '↑ Ahead',    color: '#86AA80' },
    yellow: { label: '→ On track', color: '#D4A843' },
    red:    { label: '↓ Behind',   color: '#C5896E' },
  };
  const { label, color } = cfg[status];
  return (
    <View style={{ backgroundColor: `${color}22`, borderRadius: 99, paddingHorizontal: 8, paddingVertical: 2 }}>
      <Text style={{ color, fontSize: fontSize.xs, fontWeight: '600' }}>{label}</Text>
    </View>
  );
}

// ─── Nutrition modal ──────────────────────────────────────────────────────────

function NutritionEditModal({ token, current, onClose, onSaved }: {
  token: string;
  current: GoalsSummary['nutrition']['goals'];
  onClose: () => void;
  onSaved: () => void;
}) {
  const c = useColors();
  const s = makeStyles(c);
  const [calories, setCalories] = useState(String(current?.calories ?? ''));
  const [protein,  setProtein]  = useState(String(current?.proteinG ?? ''));
  const [carbs,    setCarbs]    = useState(String(current?.carbsG ?? ''));
  const [fat,      setFat]      = useState(String(current?.fatG ?? ''));
  const [water,    setWater]    = useState(current?.waterGoalOz != null ? String(Math.round(current.waterGoalOz / GLASS_OZ)) : '');
  const [saving,   setSaving]   = useState(false);

  async function handleSave() {
    if (!calories || !protein || !carbs || !fat) return;
    setSaving(true);
    try {
      await saveNutritionGoals(token, {
        calories: Number(calories), carbsG: Number(carbs),
        proteinG: Number(protein),  fatG: Number(fat),
        waterGoalOz: water !== '' ? Number(water) * GLASS_OZ : undefined,
      });
      onSaved();
      onClose();
    } catch { Alert.alert('Error', 'Could not save goals.'); }
    finally { setSaving(false); }
  }

  const fields: [string, string, (v: string) => void][] = [
    ['Calories (kcal)', calories, setCalories],
    ['Protein (g)',     protein,  setProtein],
    ['Carbs (g)',       carbs,    setCarbs],
    ['Fat (g)',         fat,      setFat],
    ['Water (glasses)', water,    setWater],
  ];

  return (
    <Modal transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <View style={s.modalOverlay}>
          <View style={[s.modalSheet, { backgroundColor: c.card, borderColor: c.border }]}>
            <View style={s.modalHeader}>
              <Text style={[s.modalTitle, { color: c.text }]}>Nutrition Targets</Text>
              <TouchableOpacity onPress={onClose}><Text style={{ color: c.muted, fontSize: 22 }}>×</Text></TouchableOpacity>
            </View>
            <ScrollView style={{ maxHeight: 340 }} keyboardShouldPersistTaps="handled">
              {fields.map(([label, val, setter]) => (
                <View key={label} style={s.field}>
                  <Text style={[s.fieldLabel, { color: c.muted }]}>{label}</Text>
                  <TextInput
                    style={[s.input, { color: c.text, borderColor: c.border, backgroundColor: c.bg }]}
                    value={val}
                    onChangeText={setter}
                    keyboardType="numeric"
                    placeholderTextColor={c.muted}
                  />
                </View>
              ))}
            </ScrollView>
            <View style={s.modalActions}>
              <TouchableOpacity onPress={onClose} style={s.cancelBtn}>
                <Text style={{ color: c.muted, fontSize: fontSize.sm }}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={handleSave}
                disabled={saving || !calories || !protein || !carbs || !fat}
                style={[s.saveBtn, { backgroundColor: c.accent, opacity: saving ? 0.5 : 1 }]}
              >
                <Text style={{ color: '#000', fontWeight: '700', fontSize: fontSize.sm }}>
                  {saving ? 'Saving…' : 'Save'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ─── Exercise modal ───────────────────────────────────────────────────────────

function ExerciseEditModal({ token, current, onClose, onSaved }: {
  token: string;
  current: ExerciseGoals | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const c = useColors();
  const s = makeStyles(c);
  const [workouts, setWorkouts] = useState(current?.workoutsPerWeek != null ? String(current.workoutsPerWeek) : '');
  const [minutes,  setMinutes]  = useState(current?.minutesPerWeek != null  ? String(current.minutesPerWeek)  : '');
  const [volume,   setVolume]   = useState(current?.volumeLbsPerWeek != null ? String(current.volumeLbsPerWeek) : '');
  const [saving,   setSaving]   = useState(false);

  async function handleSave() {
    setSaving(true);
    try {
      await saveExerciseGoals(token, {
        workoutsPerWeek: workouts !== '' ? Number(workouts) : null,
        minutesPerWeek:  minutes  !== '' ? Number(minutes)  : null,
        volumeLbsPerWeek: volume  !== '' ? Number(volume)   : null,
      });
      onSaved();
      onClose();
    } catch { Alert.alert('Error', 'Could not save goals.'); }
    finally { setSaving(false); }
  }

  return (
    <Modal transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <View style={s.modalOverlay}>
          <View style={[s.modalSheet, { backgroundColor: c.card, borderColor: c.border }]}>
            <View style={s.modalHeader}>
              <Text style={[s.modalTitle, { color: c.text }]}>Exercise Targets</Text>
              <TouchableOpacity onPress={onClose}><Text style={{ color: c.muted, fontSize: 22 }}>×</Text></TouchableOpacity>
            </View>
            <View style={s.field}>
              <Text style={[s.fieldLabel, { color: c.muted }]}>Workouts / week</Text>
              <TextInput
                style={[s.input, { color: c.text, borderColor: c.border, backgroundColor: c.bg }]}
                value={workouts} onChangeText={setWorkouts}
                keyboardType="numeric" placeholder="e.g. 4" placeholderTextColor={c.muted}
              />
            </View>
            <View style={s.field}>
              <Text style={[s.fieldLabel, { color: c.muted }]}>Minutes / week</Text>
              <TextInput
                style={[s.input, { color: c.text, borderColor: c.border, backgroundColor: c.bg }]}
                value={minutes} onChangeText={setMinutes}
                keyboardType="numeric" placeholder="e.g. 180" placeholderTextColor={c.muted}
              />
            </View>
            <View style={s.field}>
              <Text style={[s.fieldLabel, { color: c.muted }]}>Volume / week (lbs)</Text>
              <TextInput
                style={[s.input, { color: c.text, borderColor: c.border, backgroundColor: c.bg }]}
                value={volume} onChangeText={setVolume}
                keyboardType="numeric" placeholder="e.g. 10000" placeholderTextColor={c.muted}
              />
            </View>
            <View style={s.modalActions}>
              <TouchableOpacity onPress={onClose} style={s.cancelBtn}>
                <Text style={{ color: c.muted, fontSize: fontSize.sm }}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={handleSave}
                disabled={saving}
                style={[s.saveBtn, { backgroundColor: c.accent, opacity: saving ? 0.5 : 1 }]}
              >
                <Text style={{ color: '#000', fontWeight: '700', fontSize: fontSize.sm }}>
                  {saving ? 'Saving…' : 'Save'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ─── Measurement goal modal ───────────────────────────────────────────────────

function MeasurementGoalModal({ token, metric, current, onClose, onSaved }: {
  token: string;
  metric: string;
  current: MeasurementGoal | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const c = useColors();
  const s = makeStyles(c);
  const cfg = METRIC_CONFIG[metric];
  const [value,   setValue]   = useState(current ? String(current.targetValue) : '');
  const [saving,  setSaving]  = useState(false);
  const [deleting, setDeleting] = useState(false);

  async function handleSave() {
    if (!value) return;
    setSaving(true);
    try {
      await setMeasurementGoal(token, metric, {
        targetValue: Number(value),
        unit: cfg.unit,
        targetDate: current?.targetDate ?? null,
      });
      onSaved();
      onClose();
    } catch { Alert.alert('Error', 'Could not save goal.'); }
    finally { setSaving(false); }
  }

  async function handleDelete() {
    setDeleting(true);
    try {
      await deleteMeasurementGoal(token, metric);
      onSaved();
      onClose();
    } catch { Alert.alert('Error', 'Could not delete goal.'); }
    finally { setDeleting(false); }
  }

  return (
    <Modal transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <View style={s.modalOverlay}>
          <View style={[s.modalSheet, { backgroundColor: c.card, borderColor: c.border }]}>
            <View style={s.modalHeader}>
              <Text style={[s.modalTitle, { color: c.text }]}>{cfg.label} Goal</Text>
              <TouchableOpacity onPress={onClose}><Text style={{ color: c.muted, fontSize: 22 }}>×</Text></TouchableOpacity>
            </View>
            <View style={s.field}>
              <Text style={[s.fieldLabel, { color: c.muted }]}>Target ({cfg.unit})</Text>
              <TextInput
                style={[s.input, { color: c.text, borderColor: c.border, backgroundColor: c.bg }]}
                value={value} onChangeText={setValue}
                keyboardType="numeric" autoFocus
                placeholderTextColor={c.muted}
              />
            </View>
            <View style={s.modalActions}>
              {current && (
                <TouchableOpacity onPress={handleDelete} disabled={deleting} style={[s.cancelBtn, { flex: 0, paddingHorizontal: 12 }]}>
                  <Text style={{ color: '#C5896E', fontSize: fontSize.sm }}>{deleting ? '…' : 'Delete'}</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity onPress={onClose} style={s.cancelBtn}>
                <Text style={{ color: c.muted, fontSize: fontSize.sm }}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={handleSave}
                disabled={saving || !value}
                style={[s.saveBtn, { backgroundColor: c.accent, opacity: saving ? 0.5 : 1 }]}
              >
                <Text style={{ color: '#000', fontWeight: '700', fontSize: fontSize.sm }}>
                  {saving ? 'Saving…' : 'Save'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ─── Add goal picker modal ────────────────────────────────────────────────────

function AddGoalPickerModal({ available, onPick, onClose, c }: {
  available: string[];
  onPick: (metric: string) => void;
  onClose: () => void;
  c: Colors;
}) {
  const s = makeStyles(c);
  return (
    <Modal transparent animationType="slide" onRequestClose={onClose}>
      <View style={s.modalOverlay}>
        <View style={[s.modalSheet, { backgroundColor: c.card, borderColor: c.border }]}>
          <View style={s.modalHeader}>
            <Text style={[s.modalTitle, { color: c.text }]}>Add Goal</Text>
            <TouchableOpacity onPress={onClose}><Text style={{ color: c.muted, fontSize: 22 }}>×</Text></TouchableOpacity>
          </View>
          {available.map((m) => (
            <TouchableOpacity
              key={m}
              onPress={() => onPick(m)}
              style={[s.pickerRow, { borderColor: c.border }]}
            >
              <Text style={{ color: c.text, fontSize: fontSize.sm }}>{METRIC_CONFIG[m].label}</Text>
              <Text style={{ color: c.muted, fontSize: fontSize.sm }}>{METRIC_CONFIG[m].unit}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>
    </Modal>
  );
}

// ─── Main screen ──────────────────────────────────────────────────────────────

export default function PlanningScreen() {
  const token = useAuthStore((s) => s.token)!;
  const c = useColors();
  const s = makeStyles(c);

  const [summary,          setSummary]          = useState<GoalsSummary | null>(null);
  const [exGoals,          setExGoals]          = useState<ExerciseGoals | null>(null);
  const [measGoals,        setMeasGoals]        = useState<Record<string, MeasurementGoal>>({});
  const [measurements,     setMeasurements]     = useState<BodyMeasurement[]>([]);
  const [loading,          setLoading]          = useState(true);
  const [showNutEdit,      setShowNutEdit]      = useState(false);
  const [showExEdit,       setShowExEdit]       = useState(false);
  const [editingMeasMetric, setEditingMeasMetric] = useState<string | null>(null);
  const [showAddPicker,    setShowAddPicker]    = useState(false);

  async function load() {
    try {
      const [sum, eg, mg, ms] = await Promise.all([
        getGoalsSummary(token).catch(() => null),
        getExerciseGoals(token).catch(() => null),
        getMeasurementGoals(token).catch(() => ({})),
        getMeasurements(token).catch(() => []),
      ]);
      setSummary(sum);
      setExGoals(eg);
      setMeasGoals(mg as Record<string, MeasurementGoal>);
      setMeasurements(ms as BodyMeasurement[]);
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }

  useFocusEffect(useCallback(() => {
    let cancelled = false;
    setLoading(true);
    load().then(() => { if (cancelled) return; });
    return () => { cancelled = true; };
  }, [token]));  // eslint-disable-line react-hooks/exhaustive-deps

  const nut = summary?.nutrition;
  const wkt = summary?.workouts;
  const activeMetrics = ALL_METRICS.filter((m) => measGoals[m]);
  const availableMetrics = ALL_METRICS.filter((m) => !measGoals[m]);

  if (loading) {
    return (
      <SafeAreaView style={[s.container, { backgroundColor: c.bg }]}>
        <ActivityIndicator style={{ marginTop: 60 }} color={c.accent} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[s.container, { backgroundColor: c.bg }]}>
      <View style={[s.header, { borderBottomColor: c.border }]}>
        <Text style={[s.title, { color: c.text }]}>Planning</Text>
      </View>

      <ScrollView contentContainerStyle={s.content}>

        {/* ── Nutrition ── */}
        <View style={[s.card, { backgroundColor: c.card, borderColor: c.border }]}>
          <View style={s.cardHeader}>
            <Text style={[s.sectionTitle, { color: c.text }]}>Daily Nutrition Targets</Text>
            <TouchableOpacity onPress={() => setShowNutEdit(true)}>
              <Text style={{ color: c.accent, fontSize: fontSize.sm }}>Edit</Text>
            </TouchableOpacity>
          </View>
          {[
            { label: 'Calories',  actual: nut?.actual.calories ?? 0,  goal: nut?.goals?.calories,  unit: 'kcal', color: c.accent },
            { label: 'Protein',   actual: nut?.actual.proteinG ?? 0,  goal: nut?.goals?.proteinG,  unit: 'g',    color: '#60a5fa' },
            { label: 'Carbs',     actual: nut?.actual.carbsG ?? 0,    goal: nut?.goals?.carbsG,    unit: 'g',    color: '#34d399' },
            { label: 'Fat',       actual: nut?.actual.fatG ?? 0,      goal: nut?.goals?.fatG,      unit: 'g',    color: '#fb923c' },
          ].map(({ label, actual, goal, unit, color }) => (
            <View key={label} style={{ gap: 4 }}>
              <View style={s.row}>
                <Text style={[s.rowLabel, { color: c.text }]}>{label}</Text>
                <Text style={[s.rowValue, { color: c.muted }]}>
                  {Math.round(actual)} {unit}{goal ? ` / ${goal} ${unit}` : ''}
                </Text>
              </View>
              <ProgressBar value={actual} total={goal} color={color} c={c} />
            </View>
          ))}
        </View>

        {/* ── Exercise ── */}
        <View style={[s.card, { backgroundColor: c.card, borderColor: c.border }]}>
          <View style={s.cardHeader}>
            <Text style={[s.sectionTitle, { color: c.text }]}>Weekly Exercise Targets</Text>
            <TouchableOpacity onPress={() => setShowExEdit(true)}>
              <Text style={{ color: c.accent, fontSize: fontSize.sm }}>Edit</Text>
            </TouchableOpacity>
          </View>
          {[
            { label: 'Workouts this week', actual: wkt?.actual.workoutCount ?? 0, goal: wkt?.goals?.workoutsPerWeek, unit: '',    color: '#a78bfa' },
            { label: 'Minutes this week',  actual: wkt?.actual.totalMinutes ?? 0, goal: wkt?.goals?.minutesPerWeek,  unit: ' min', color: '#a78bfa' },
          ].map(({ label, actual, goal, unit, color }) => (
            <View key={label} style={{ gap: 4 }}>
              <View style={s.row}>
                <Text style={[s.rowLabel, { color: c.text }]}>{label}</Text>
                <Text style={[s.rowValue, { color: c.muted }]}>
                  {actual}{unit}{goal ? ` / ${goal}${unit}` : ''}
                </Text>
              </View>
              <ProgressBar value={actual} total={goal} color={color} c={c} />
            </View>
          ))}
          <View style={s.row}>
            <Text style={[s.rowLabel, { color: c.text }]}>Volume target</Text>
            <Text style={[s.rowValue, { color: c.muted }]}>
              {exGoals?.volumeLbsPerWeek != null ? `${exGoals.volumeLbsPerWeek} lbs / week` : '—'}
            </Text>
          </View>
        </View>

        {/* ── Body Measurement Goals ── */}
        <View style={[s.card, { backgroundColor: c.card, borderColor: c.border }]}>
          <View style={s.cardHeader}>
            <Text style={[s.sectionTitle, { color: c.text }]}>Body Measurement Goals</Text>
          </View>

          {activeMetrics.length === 0 && (
            <Text style={[s.emptyNote, { color: c.muted }]}>No goals set. Tap "+ Add goal" to start.</Text>
          )}

          {activeMetrics.map((metric, i) => {
            const cfg = METRIC_CONFIG[metric];
            const goal = measGoals[metric];
            const sorted = measurements
              .filter((m) => m.metric === metric)
              .sort((a, b) => b.measuredAt.localeCompare(a.measuredAt));
            const latest = sorted[0];
            const displayVal = latest
              ? (metric === 'weight' && latest.unit === 'kg'
                  ? (latest.value * 2.20462).toFixed(1)
                  : Number(latest.value).toFixed(1))
              : null;
            const { status } = computeGoalPace(measurements, metric, goal, cfg.dir);

            return (
              <TouchableOpacity
                key={metric}
                onPress={() => setEditingMeasMetric(metric)}
                style={[
                  s.measRow,
                  { borderTopColor: c.border },
                  i === 0 && { borderTopWidth: 0 },
                ]}
              >
                <View style={{ flex: 1, gap: 3 }}>
                  <View style={s.row}>
                    <Text style={[s.rowLabel, { color: c.text }]}>{cfg.label}</Text>
                    <PaceBadge status={status} c={c} />
                  </View>
                  <Text style={[s.rowValue, { color: c.muted }]}>
                    {displayVal != null ? `${displayVal} ${cfg.unit}` : 'No data'}
                    {' → '}{goal.targetValue} {cfg.unit}
                  </Text>
                </View>
                <Text style={{ color: c.muted, fontSize: 18, paddingLeft: 8 }}>›</Text>
              </TouchableOpacity>
            );
          })}

          {availableMetrics.length > 0 && (
            <TouchableOpacity
              onPress={() => setShowAddPicker(true)}
              style={[s.addBtn, { borderColor: c.accent }]}
            >
              <Text style={{ color: c.accent, fontSize: fontSize.sm, fontWeight: '600' }}>+ Add goal</Text>
            </TouchableOpacity>
          )}
        </View>

        <View style={{ height: 32 }} />
      </ScrollView>

      {/* Modals */}
      {showNutEdit && (
        <NutritionEditModal
          token={token}
          current={nut?.goals ?? null}
          onClose={() => setShowNutEdit(false)}
          onSaved={load}
        />
      )}

      {showExEdit && (
        <ExerciseEditModal
          token={token}
          current={exGoals}
          onClose={() => setShowExEdit(false)}
          onSaved={load}
        />
      )}

      {editingMeasMetric && (
        <MeasurementGoalModal
          token={token}
          metric={editingMeasMetric}
          current={measGoals[editingMeasMetric] ?? null}
          onClose={() => setEditingMeasMetric(null)}
          onSaved={load}
        />
      )}

      {showAddPicker && (
        <AddGoalPickerModal
          available={availableMetrics}
          c={c}
          onPick={(metric) => { setShowAddPicker(false); setEditingMeasMetric(metric); }}
          onClose={() => setShowAddPicker(false)}
        />
      )}
    </SafeAreaView>
  );
}

function makeStyles(c: Colors) {
  return StyleSheet.create({
    container:    { flex: 1, backgroundColor: c.bg },
    header:       { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 12, borderBottomWidth: 1 },
    title:        { fontSize: fontSize.xl, fontWeight: '700' },
    content:      { padding: 14, gap: 12 },
    card:         { borderRadius: 14, borderWidth: 1, padding: 16, gap: 12 },
    cardHeader:   { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    sectionTitle: { fontSize: fontSize.sm, fontWeight: '600' },
    row:          { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    rowLabel:     { fontSize: fontSize.sm, flex: 1 },
    rowValue:     { fontSize: fontSize.sm },
    measRow:      { flexDirection: 'row', alignItems: 'center', paddingTop: 10, borderTopWidth: StyleSheet.hairlineWidth },
    addBtn:       { marginTop: 8, borderWidth: 1, borderRadius: 8, paddingVertical: 10, alignItems: 'center' },
    emptyNote:    { fontSize: fontSize.sm, fontStyle: 'italic', textAlign: 'center', paddingVertical: 4 },
    // Modal
    modalOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.5)' },
    modalSheet:   { borderTopLeftRadius: 20, borderTopRightRadius: 20, borderWidth: 1, padding: 20, gap: 12 },
    modalHeader:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    modalTitle:   { fontSize: fontSize.lg, fontWeight: '700' },
    modalActions: { flexDirection: 'row', gap: 8, marginTop: 4 },
    cancelBtn:    { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 12 },
    saveBtn:      { flex: 2, alignItems: 'center', justifyContent: 'center', paddingVertical: 12, borderRadius: 10 },
    field:        { gap: 4 },
    fieldLabel:   { fontSize: fontSize.sm },
    input:        { borderWidth: 1, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, fontSize: fontSize.sm },
    pickerRow:    { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 14, borderTopWidth: StyleSheet.hairlineWidth },
  });
}
