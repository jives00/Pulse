import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator, Alert, KeyboardAvoidingView, Modal, Platform,
  RefreshControl, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  getGoalsSummary, saveNutritionGoals, saveWeeklyNutritionGoals,
  getExerciseGoals, saveExerciseGoals,
  getMeasurementGoals, setMeasurementGoal,
  getRoutines, getRoutineGoals, setRoutineGoal, deleteRoutineGoal,
  getUserGoals, createUserGoal, updateUserGoal, deleteUserGoal,
  getExercises,
  type GoalsSummary, type ExerciseGoals, type MeasurementGoal,
  type RoutineSummary, type RoutineGoal,
  type UserGoal, type UserGoalPayload, type GoalMetricType, type GoalSourceType,
  type Exercise,
} from '../../../src/api/client';
import { useAuthStore } from '../../../src/store/auth';
import { fontSize, type Colors } from '../../../src/theme';
import { useColors } from '../../../src/hooks/useColors';

// ─── Constants ────────────────────────────────────────────────────────────────

const COL_GOLD = "#D4A843";
const GLASS_OZ = 8;

const DISPLAYED_METRICS = [
  { key: 'weight',      label: 'Weight',      unit: 'lbs' },
  { key: 'waist',       label: 'Waist',       unit: 'in'  },
  { key: 'bicep',       label: 'Bicep',       unit: 'in'  },
  { key: 'chest',       label: 'Chest',       unit: 'in'  },
  { key: 'hips',        label: 'Hips',        unit: 'in'  },
  { key: 'body_fat',    label: 'Body Fat',    unit: '%'   },
  { key: 'muscle_mass', label: 'Muscle Mass', unit: 'lbs' },
  { key: 'water_pct',   label: 'Hydration',   unit: '%'   },
];

type MetricGroup = { label: string; metrics: GoalMetricType[] };
const METRIC_GROUPS: MetricGroup[] = [
  { label: 'Strength',  metrics: ['exercise_max_weight', 'exercise_max_reps', 'exercise_session_volume', 'exercise_weekly_volume', 'exercise_session_reps', 'exercise_weekly_reps'] },
  { label: 'Cardio',    metrics: ['exercise_session_distance', 'exercise_weekly_distance', 'exercise_session_duration', 'exercise_weekly_duration'] },
  { label: 'Steps',     metrics: ['exercise_session_steps', 'exercise_weekly_steps'] },
  { label: 'Frequency', metrics: ['exercise_weekly_sessions'] },
  { label: 'Pedometer', metrics: ['daily_steps_avg', 'weekly_steps_total'] },
  { label: 'Body',      metrics: ['body_measurement'] },
  { label: 'Nutrition', metrics: ['nutrition_daily_avg'] },
];

const METRIC_LABELS: Record<GoalMetricType, string> = {
  exercise_max_weight:       'Max weight (single lift)',
  exercise_max_reps:         'Max reps (single set)',
  exercise_session_volume:   'Session volume',
  exercise_weekly_volume:    'Weekly volume',
  exercise_session_reps:     'Session total reps',
  exercise_weekly_reps:      'Weekly total reps',
  exercise_session_steps:    'Session steps',
  exercise_weekly_steps:     'Weekly steps',
  exercise_session_distance: 'Session distance',
  exercise_weekly_distance:  'Weekly distance',
  exercise_session_duration: 'Session duration',
  exercise_weekly_duration:  'Weekly duration',
  exercise_weekly_sessions:  'Weekly sessions',
  daily_steps_avg:           'Daily steps average',
  weekly_steps_total:        'Weekly steps total',
  body_measurement:          'Body measurement',
  nutrition_daily_avg:       'Daily nutrition average',
};

const METRIC_DEFAULT_UNIT: Record<GoalMetricType, string> = {
  exercise_max_weight:       'lbs',
  exercise_max_reps:         'reps',
  exercise_session_volume:   'lbs',
  exercise_weekly_volume:    'lbs',
  exercise_session_reps:     'reps',
  exercise_weekly_reps:      'reps',
  exercise_session_steps:    'steps',
  exercise_weekly_steps:     'steps',
  exercise_session_distance: 'miles',
  exercise_weekly_distance:  'miles',
  exercise_session_duration: 'min',
  exercise_weekly_duration:  'min',
  exercise_weekly_sessions:  'sessions',
  daily_steps_avg:           'steps',
  weekly_steps_total:        'steps',
  body_measurement:          '',
  nutrition_daily_avg:       '',
};

const METRIC_REQUIRED_FIELD: Partial<Record<GoalMetricType, string>> = {
  exercise_max_weight:       'weight',
  exercise_session_volume:   'weight',
  exercise_weekly_volume:    'weight',
  exercise_max_reps:         'reps',
  exercise_session_reps:     'reps',
  exercise_weekly_reps:      'reps',
  exercise_session_steps:    'steps',
  exercise_weekly_steps:     'steps',
  exercise_session_distance: 'distance',
  exercise_weekly_distance:  'distance',
  exercise_session_duration: 'duration',
  exercise_weekly_duration:  'duration',
};

const METRIC_SOURCE_TYPE: Record<GoalMetricType, GoalSourceType> = {
  exercise_max_weight:       'exercise',
  exercise_max_reps:         'exercise',
  exercise_session_volume:   'exercise',
  exercise_weekly_volume:    'exercise',
  exercise_session_reps:     'exercise',
  exercise_weekly_reps:      'exercise',
  exercise_session_steps:    'exercise',
  exercise_weekly_steps:     'exercise',
  exercise_session_distance: 'exercise',
  exercise_weekly_distance:  'exercise',
  exercise_session_duration: 'exercise',
  exercise_weekly_duration:  'exercise',
  exercise_weekly_sessions:  'exercise',
  daily_steps_avg:           'steps',
  weekly_steps_total:        'steps',
  body_measurement:          'measurement',
  nutrition_daily_avg:       'nutrition',
};

const MEASUREMENT_KEY_OPTIONS = [
  { key: 'weight',      label: 'Weight',      unit: 'lbs' },
  { key: 'waist',       label: 'Waist',       unit: 'in'  },
  { key: 'bicep',       label: 'Bicep',       unit: 'in'  },
  { key: 'chest',       label: 'Chest',       unit: 'in'  },
  { key: 'hips',        label: 'Hips',        unit: 'in'  },
  { key: 'body_fat',    label: 'Body Fat',    unit: '%'   },
  { key: 'muscle_mass', label: 'Muscle Mass', unit: 'lbs' },
  { key: 'water_pct',   label: 'Water Mass',  unit: '%'   },
];

const NUTRITION_KEY_OPTIONS = [
  { key: 'calories', label: 'Calories', unit: 'kcal'    },
  { key: 'protein',  label: 'Protein',  unit: 'g'       },
  { key: 'carbs',    label: 'Carbs',    unit: 'g'       },
  { key: 'fat',      label: 'Fat',      unit: 'g'       },
  { key: 'water',    label: 'Water',    unit: 'glasses' },
];

const CAN_PICK_ROUTINE: GoalMetricType[] = [
  'exercise_session_volume', 'exercise_weekly_volume', 'exercise_weekly_sessions',
];

// ─── UserGoalForm ─────────────────────────────────────────────────────────────

function MetricPickerModal({ value, onChange, onClose, c }: {
  value: GoalMetricType;
  onChange: (m: GoalMetricType) => void;
  onClose: () => void;
  c: Colors;
}) {
  const s = makeStyles(c);
  return (
    <Modal transparent animationType="slide" onRequestClose={onClose}>
      <View style={s.overlay}>
        <View style={[s.sheet, { backgroundColor: c.card, borderColor: c.border, maxHeight: '75%' }]}>
          <View style={s.sheetHeader}>
            <Text style={[s.sheetTitle, { color: c.text }]}>Select Metric</Text>
            <TouchableOpacity onPress={onClose}><Text style={{ color: c.muted, fontSize: 22 }}>×</Text></TouchableOpacity>
          </View>
          <ScrollView>
            {METRIC_GROUPS.map((group) => (
              <View key={group.label}>
                <Text style={{ color: c.muted, fontSize: fontSize.xs, fontWeight: '700', textTransform: 'uppercase', paddingHorizontal: 16, paddingTop: 12, paddingBottom: 4 }}>
                  {group.label}
                </Text>
                {group.metrics.map((m) => (
                  <TouchableOpacity
                    key={m}
                    onPress={() => { onChange(m); onClose(); }}
                    style={[s.pickerRow, { borderColor: c.border }, m === value && { backgroundColor: `${c.accent}22` }]}
                  >
                    <Text style={{ color: c.text, fontSize: fontSize.sm }}>{METRIC_LABELS[m]}</Text>
                    {m === value && <Text style={{ color: c.accent, fontSize: fontSize.sm }}>✓</Text>}
                  </TouchableOpacity>
                ))}
              </View>
            ))}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

function ItemPickerModal<T extends { id: number; name: string }>({ title, items, selectedId, onSelect, onClose, c }: {
  title: string;
  items: T[];
  selectedId: number | '';
  onSelect: (id: number) => void;
  onClose: () => void;
  c: Colors;
}) {
  const s = makeStyles(c);
  return (
    <Modal transparent animationType="slide" onRequestClose={onClose}>
      <View style={s.overlay}>
        <View style={[s.sheet, { backgroundColor: c.card, borderColor: c.border, maxHeight: '70%' }]}>
          <View style={s.sheetHeader}>
            <Text style={[s.sheetTitle, { color: c.text }]}>{title}</Text>
            <TouchableOpacity onPress={onClose}><Text style={{ color: c.muted, fontSize: 22 }}>×</Text></TouchableOpacity>
          </View>
          <ScrollView>
            {items.map((item) => (
              <TouchableOpacity
                key={item.id}
                onPress={() => { onSelect(item.id); onClose(); }}
                style={[s.pickerRow, { borderColor: c.border }, item.id === selectedId && { backgroundColor: `${c.accent}22` }]}
              >
                <Text style={{ color: c.text, fontSize: fontSize.sm }}>{item.name}</Text>
                {item.id === selectedId && <Text style={{ color: c.accent, fontSize: fontSize.sm }}>✓</Text>}
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

function SimplePickerModal<T extends { key: string; label: string }>({ title, items, selectedKey, onSelect, onClose, c }: {
  title: string;
  items: T[];
  selectedKey: string;
  onSelect: (key: string, unit: string) => void;
  onClose: () => void;
  c: Colors;
}) {
  const s = makeStyles(c);
  return (
    <Modal transparent animationType="slide" onRequestClose={onClose}>
      <View style={s.overlay}>
        <View style={[s.sheet, { backgroundColor: c.card, borderColor: c.border }]}>
          <View style={s.sheetHeader}>
            <Text style={[s.sheetTitle, { color: c.text }]}>{title}</Text>
            <TouchableOpacity onPress={onClose}><Text style={{ color: c.muted, fontSize: 22 }}>×</Text></TouchableOpacity>
          </View>
          {(items as any[]).map((item) => (
            <TouchableOpacity
              key={item.key}
              onPress={() => { onSelect(item.key, item.unit ?? ''); onClose(); }}
              style={[s.pickerRow, { borderColor: c.border }, item.key === selectedKey && { backgroundColor: `${c.accent}22` }]}
            >
              <Text style={{ color: c.text, fontSize: fontSize.sm }}>{item.label}</Text>
              {item.key === selectedKey && <Text style={{ color: c.accent, fontSize: fontSize.sm }}>✓</Text>}
            </TouchableOpacity>
          ))}
        </View>
      </View>
    </Modal>
  );
}

function UserGoalForm({ initial, exercisesList, routinesList, onClose, onSaved }: {
  initial?: UserGoal;
  exercisesList: Exercise[];
  routinesList: RoutineSummary[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const c = useColors();
  const s = makeStyles(c);
  const token = useAuthStore((st) => st.token)!;

  const [name,        setName]        = useState(initial?.name        ?? '');
  const [metricType,  setMetricType]  = useState<GoalMetricType>(initial?.metricType ?? 'exercise_max_weight');
  const [sourceType,  setSourceType]  = useState<GoalSourceType>(initial?.sourceType ?? 'exercise');
  const [sourceId,    setSourceId]    = useState<number | ''>(initial?.sourceId ?? '');
  const [sourceKey,   setSourceKey]   = useState(initial?.sourceKey   ?? '');
  const [targetValue, setTargetValue] = useState(initial?.targetValue != null ? String(initial.targetValue) : '');
  const [unit,        setUnit]        = useState(initial?.unit        ?? 'lbs');
  const [targetDate,  setTargetDate]  = useState(initial?.targetDate  ?? '');
  const [saving,      setSaving]      = useState(false);

  const [showMetricPicker,   setShowMetricPicker]   = useState(false);
  const [showSourcePicker,   setShowSourcePicker]   = useState(false);
  const [showKeyPicker,      setShowKeyPicker]       = useState(false);

  function applyMetric(m: GoalMetricType) {
    setMetricType(m);
    const st = METRIC_SOURCE_TYPE[m];
    setSourceType(st);
    setSourceId('');
    setSourceKey('');
    const defUnit = METRIC_DEFAULT_UNIT[m];
    if (defUnit) setUnit(defUnit);
  }

  const requiredField   = METRIC_REQUIRED_FIELD[metricType];
  const canPickRoutine  = CAN_PICK_ROUTINE.includes(metricType);
  const compatibleExs   = requiredField
    ? exercisesList.filter((e) => e.trackedFields?.includes(requiredField))
    : exercisesList;

  const sourceItems = sourceType === 'routine' ? routinesList : compatibleExs as { id: number; name: string }[];
  const selectedSourceName = sourceItems.find((i) => i.id === sourceId)?.name ?? null;

  async function handleSave() {
    if (!name || !targetValue) return;
    setSaving(true);
    try {
      const payload: UserGoalPayload = {
        name,
        metricType,
        sourceType,
        sourceId:    sourceId !== '' ? Number(sourceId) : null,
        sourceKey:   sourceKey || null,
        targetValue: Number(targetValue),
        unit,
        targetDate:  targetDate || null,
      };
      if (initial) {
        await updateUserGoal(token, initial.id, payload);
      } else {
        await createUserGoal(token, payload);
      }
      onSaved();
    } catch { Alert.alert('Error', 'Could not save goal.'); }
    finally { setSaving(false); }
  }

  return (
    <Modal transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <View style={s.overlay}>
          <View style={[s.sheet, { backgroundColor: c.card, borderColor: c.border, maxHeight: '90%' }]}>
            <View style={s.sheetHeader}>
              <Text style={[s.sheetTitle, { color: c.text }]}>{initial ? 'Edit Goal' : 'Add Goal'}</Text>
              <TouchableOpacity onPress={onClose}><Text style={{ color: c.muted, fontSize: 22 }}>×</Text></TouchableOpacity>
            </View>
            <ScrollView keyboardShouldPersistTaps="handled" style={{ maxHeight: 520 }}>
              {/* Name */}
              <View style={s.field}>
                <Text style={s.fieldLabel}>Goal name</Text>
                <TextInput style={s.input} value={name} onChangeText={setName} placeholder="e.g. Deadlift 300 lbs" placeholderTextColor={c.muted} />
              </View>

              {/* Metric */}
              <View style={s.field}>
                <Text style={s.fieldLabel}>Metric</Text>
                <TouchableOpacity onPress={() => setShowMetricPicker(true)} style={[s.input, { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }]}>
                  <Text style={{ color: c.text, fontSize: fontSize.sm }}>{METRIC_LABELS[metricType]}</Text>
                  <Text style={{ color: c.muted }}>›</Text>
                </TouchableOpacity>
              </View>

              {/* Source type toggle (exercise vs routine) */}
              {canPickRoutine && (
                <View style={{ flexDirection: 'row', gap: 6, marginBottom: 8 }}>
                  {(['exercise', 'routine'] as GoalSourceType[]).map((t) => (
                    <TouchableOpacity
                      key={t}
                      onPress={() => { setSourceType(t); setSourceId(''); }}
                      style={[s.pill, sourceType === t && s.pillActive]}
                    >
                      <Text style={[s.pillText, sourceType === t && s.pillTextActive, { textTransform: 'capitalize' }]}>{t}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )}

              {/* Exercise / routine picker */}
              {(sourceType === 'exercise' || (canPickRoutine && sourceType === 'routine')) && (
                <View style={s.field}>
                  <Text style={s.fieldLabel}>{sourceType === 'routine' ? 'Routine' : 'Exercise'}</Text>
                  <TouchableOpacity onPress={() => setShowSourcePicker(true)} style={[s.input, { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }]}>
                    <Text style={{ color: selectedSourceName ? c.text : c.muted, fontSize: fontSize.sm }}>
                      {selectedSourceName ?? 'Select…'}
                    </Text>
                    <Text style={{ color: c.muted }}>›</Text>
                  </TouchableOpacity>
                </View>
              )}

              {/* Measurement key */}
              {sourceType === 'measurement' && (
                <View style={s.field}>
                  <Text style={s.fieldLabel}>Measurement</Text>
                  <TouchableOpacity onPress={() => setShowKeyPicker(true)} style={[s.input, { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }]}>
                    <Text style={{ color: sourceKey ? c.text : c.muted, fontSize: fontSize.sm }}>
                      {MEASUREMENT_KEY_OPTIONS.find((o) => o.key === sourceKey)?.label ?? 'Select…'}
                    </Text>
                    <Text style={{ color: c.muted }}>›</Text>
                  </TouchableOpacity>
                </View>
              )}

              {/* Nutrition key */}
              {sourceType === 'nutrition' && (
                <View style={s.field}>
                  <Text style={s.fieldLabel}>Nutrient</Text>
                  <TouchableOpacity onPress={() => setShowKeyPicker(true)} style={[s.input, { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }]}>
                    <Text style={{ color: sourceKey ? c.text : c.muted, fontSize: fontSize.sm }}>
                      {NUTRITION_KEY_OPTIONS.find((o) => o.key === sourceKey)?.label ?? 'Select…'}
                    </Text>
                    <Text style={{ color: c.muted }}>›</Text>
                  </TouchableOpacity>
                </View>
              )}

              {/* Target value + unit */}
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <View style={[s.field, { flex: 2 }]}>
                  <Text style={s.fieldLabel}>Target value</Text>
                  <TextInput style={s.input} value={targetValue} onChangeText={setTargetValue} keyboardType="numeric" placeholderTextColor={c.muted} />
                </View>
                <View style={[s.field, { flex: 1 }]}>
                  <Text style={s.fieldLabel}>Unit</Text>
                  <TextInput style={s.input} value={unit} onChangeText={setUnit} placeholderTextColor={c.muted} />
                </View>
              </View>

              {/* Target date */}
              <View style={s.field}>
                <Text style={s.fieldLabel}>Target date (optional, YYYY-MM-DD)</Text>
                <TextInput style={s.input} value={targetDate} onChangeText={setTargetDate} placeholder="e.g. 2026-12-31" placeholderTextColor={c.muted} keyboardType="numbers-and-punctuation" />
              </View>
            </ScrollView>

            <View style={s.actions}>
              <TouchableOpacity onPress={onClose} style={s.cancelBtn}>
                <Text style={{ color: c.muted, fontSize: fontSize.sm }}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={handleSave}
                disabled={saving || !name || !targetValue}
                style={[s.saveBtn, { backgroundColor: c.accent, opacity: (saving || !name || !targetValue) ? 0.4 : 1 }]}
              >
                <Text style={{ color: '#000', fontWeight: '700', fontSize: fontSize.sm }}>
                  {saving ? 'Saving…' : initial ? 'Save changes' : 'Add goal'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </KeyboardAvoidingView>

      {showMetricPicker && (
        <MetricPickerModal value={metricType} onChange={applyMetric} onClose={() => setShowMetricPicker(false)} c={c} />
      )}
      {showSourcePicker && (
        <ItemPickerModal
          title={sourceType === 'routine' ? 'Choose Routine' : 'Choose Exercise'}
          items={sourceItems}
          selectedId={sourceId}
          onSelect={(id) => setSourceId(id)}
          onClose={() => setShowSourcePicker(false)}
          c={c}
        />
      )}
      {showKeyPicker && sourceType === 'measurement' && (
        <SimplePickerModal
          title="Choose Measurement"
          items={MEASUREMENT_KEY_OPTIONS}
          selectedKey={sourceKey}
          onSelect={(key, unit) => { setSourceKey(key); setUnit(unit); }}
          onClose={() => setShowKeyPicker(false)}
          c={c}
        />
      )}
      {showKeyPicker && sourceType === 'nutrition' && (
        <SimplePickerModal
          title="Choose Nutrient"
          items={NUTRITION_KEY_OPTIONS}
          selectedKey={sourceKey}
          onSelect={(key, unit) => { setSourceKey(key); setUnit(unit); }}
          onClose={() => setShowKeyPicker(false)}
          c={c}
        />
      )}
    </Modal>
  );
}

// ─── UserGoalRows ─────────────────────────────────────────────────────────────

function UserGoalRows({ goals, onEdit, onDelete }: {
  goals: UserGoal[];
  onEdit: (g: UserGoal) => void;
  onDelete: (id: number) => void;
}) {
  const c = useColors();
  const s = makeStyles(c);
  if (!goals.length) return null;
  return (
    <View style={{ marginTop: 8, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.border }}>
      {goals.map((g) => {
        const dateStr = g.targetDate
          ? 'by ' + new Date(g.targetDate + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
          : null;
        return (
          <View key={g.id} style={[s.goalRow, { borderBottomColor: c.border }]}>
            <TouchableOpacity style={{ flex: 1 }} onPress={() => onEdit(g)}>
              <Text style={{ color: c.text, fontSize: fontSize.sm, fontWeight: '500' }}>{g.name}</Text>
              <Text style={{ color: c.muted, fontSize: fontSize.xs }}>
                {g.targetValue.toLocaleString()} {g.unit}
                {g.sourceName ? ` · ${g.sourceName}` : ''}
                {dateStr ? ` · ${dateStr}` : ''}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => onDelete(g.id)} style={{ paddingLeft: 12 }}>
              <Text style={{ color: c.muted, fontSize: fontSize.sm }}>✕</Text>
            </TouchableOpacity>
          </View>
        );
      })}
    </View>
  );
}

// ─── Main screen ──────────────────────────────────────────────────────────────

export function GoalsTabContent() {
  const c = useColors();
  const s = makeStyles(c);
  const token = useAuthStore((st) => st.token)!;
  const [refreshing, setRefreshing] = useState(false);
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await new Promise(resolve => setTimeout(resolve, 500));
    setRefreshing(false);
  }, []);

  const [loading, setLoading] = useState(true);
  const [saving,  setSaving]  = useState(false);
  const [msg,     setMsg]     = useState('');

  // Daily nutrition
  const [calories,     setCalories]     = useState('');
  const [carbsG,       setCarbsG]       = useState('');
  const [proteinG,     setProteinG]     = useState('');
  const [fatG,         setFatG]         = useState('');
  const [waterGlasses, setWaterGlasses] = useState('');

  // Weekly nutrition
  const [wkCalories, setWkCalories] = useState('');
  const [wkProteinG, setWkProteinG] = useState('');
  const [wkCarbsG,   setWkCarbsG]   = useState('');
  const [wkFatG,     setWkFatG]     = useState('');

  // Exercise
  const [workoutCount,  setWorkoutCount]  = useState('');
  const [minutesPerWeek, setMinutesPerWeek] = useState('');
  const [volume,         setVolume]         = useState('');

  // Per-routine goals
  const [routines,          setRoutines]          = useState<RoutineSummary[]>([]);
  const [routineGoalInputs, setRoutineGoalInputs] = useState<Record<number, string>>({});

  // Body measurement goals
  const [mGoals, setMGoals] = useState<Record<string, { value: string; date: string }>>(() => {
    const init: Record<string, { value: string; date: string }> = {};
    for (const m of DISPLAYED_METRICS) init[m.key] = { value: '', date: '' };
    return init;
  });

  // Custom user goals
  const [userGoals,    setUserGoals]    = useState<UserGoal[]>([]);
  const [allExercises, setAllExercises] = useState<Exercise[]>([]);
  const [editingGoal,  setEditingGoal]  = useState<UserGoal | null>(null);
  const [addingGoal,   setAddingGoal]   = useState(false);

  async function load() {
    setLoading(true);
    try {
      const [summary, ex, mGoalsData, rList, rGoals, uGoals, exs] = await Promise.all([
        getGoalsSummary(token).catch(() => null),
        getExerciseGoals(token).catch(() => ({ workoutsPerWeek: null, minutesPerWeek: null, volumeLbsPerWeek: null } as ExerciseGoals)),
        getMeasurementGoals(token).catch(() => ({})),
        getRoutines(token).catch(() => []),
        getRoutineGoals(token).catch(() => []),
        getUserGoals(token).catch(() => []),
        getExercises(token).catch(() => []),
      ]);

      const n = (summary as GoalsSummary | null)?.nutrition.goals;
      if (n) {
        setCalories(String(n.calories ?? ''));
        setCarbsG(String(n.carbsG ?? ''));
        setProteinG(String(n.proteinG ?? ''));
        setFatG(String(n.fatG ?? ''));
        setWaterGlasses(n.waterGoalOz != null ? String(Math.round(n.waterGoalOz / GLASS_OZ)) : '');
        setWkCalories(String(n.weeklyCalories ?? ''));
        setWkProteinG(String(n.weeklyProteinG ?? ''));
        setWkCarbsG(String(n.weeklyCarbsG ?? ''));
        setWkFatG(String(n.weeklyFatG ?? ''));
      }

      setWorkoutCount(String((ex as ExerciseGoals).workoutsPerWeek ?? ''));
      setMinutesPerWeek(String((ex as ExerciseGoals).minutesPerWeek ?? ''));
      setVolume(String((ex as ExerciseGoals).volumeLbsPerWeek ?? ''));

      setMGoals((prev) => {
        const updated = { ...prev };
        for (const { key } of DISPLAYED_METRICS) {
          const g = (mGoalsData as Record<string, MeasurementGoal>)[key];
          updated[key] = { value: g ? String(g.targetValue) : '', date: g?.targetDate ?? '' };
        }
        return updated;
      });

      setRoutines(rList as RoutineSummary[]);
      const goalsMap: Record<number, string> = {};
      for (const g of (rGoals as RoutineGoal[])) goalsMap[g.routineId] = String(g.targetPerWeek);
      setRoutineGoalInputs(goalsMap);

      setUserGoals(uGoals as UserGoal[]);
      setAllExercises(exs as Exercise[]);
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }

  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleSave() {
    setSaving(true);
    setMsg('');
    try {
      const tasks: Promise<any>[] = [];

      if (calories && carbsG && proteinG && fatG) {
        tasks.push(saveNutritionGoals(token, {
          calories: Number(calories), carbsG: Number(carbsG),
          proteinG: Number(proteinG), fatG: Number(fatG),
          waterGoalOz: waterGlasses !== '' ? Number(waterGlasses) * GLASS_OZ : undefined,
        }));
      }

      tasks.push(saveWeeklyNutritionGoals(token, {
        weeklyCalories: wkCalories !== '' ? Number(wkCalories) : null,
        weeklyProteinG: wkProteinG !== '' ? Number(wkProteinG) : null,
        weeklyCarbsG:   wkCarbsG   !== '' ? Number(wkCarbsG)   : null,
        weeklyFatG:     wkFatG     !== '' ? Number(wkFatG)     : null,
      }));

      tasks.push(saveExerciseGoals(token, {
        workoutsPerWeek:  workoutCount   !== '' ? Number(workoutCount)   : null,
        minutesPerWeek:   minutesPerWeek !== '' ? Number(minutesPerWeek) : null,
        volumeLbsPerWeek: volume         !== '' ? Number(volume)         : null,
      }));

      for (const { key, unit } of DISPLAYED_METRICS) {
        const { value, date } = mGoals[key];
        if (value) {
          tasks.push(setMeasurementGoal(token, key, { targetValue: Number(value), unit, targetDate: date || null }));
        }
      }

      for (const r of routines) {
        const val = routineGoalInputs[r.id];
        if (val && Number(val) > 0) {
          tasks.push(setRoutineGoal(token, r.id, Number(val)));
        } else if (val === '') {
          tasks.push(deleteRoutineGoal(token, r.id).catch(() => {}));
        }
      }

      await Promise.all(tasks);
      setMsg('Goals saved.');
      setTimeout(() => setMsg(''), 3000);
    } catch {
      setMsg('Failed to save goals.');
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteUserGoal(id: number) {
    Alert.alert('Remove goal?', 'This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove', style: 'destructive', onPress: async () => {
          try {
            await deleteUserGoal(token, id);
            setUserGoals((prev) => prev.filter((g) => g.id !== id));
          } catch { Alert.alert('Error', 'Could not remove goal.'); }
        },
      },
    ]);
  }

  async function onUserGoalSaved() {
    setAddingGoal(false);
    setEditingGoal(null);
    const uGoals = await getUserGoals(token).catch(() => []);
    setUserGoals(uGoals);
  }

  const bodyGoals      = userGoals.filter((g) => g.category === 'body');
  const nutritionGoals = userGoals.filter((g) => g.category === 'nutrition');
  const exerciseGoals  = userGoals.filter((g) => g.category === 'exercise');

  if (loading) {
    return <ActivityIndicator style={{ marginTop: 40 }} color={c.accent} />;
  }

  return (
    <>
    <ScrollView contentContainerStyle={s.content} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COL_GOLD} />}>

        {/* Daily nutrition */}
        <Text style={[s.sectionLabel, { color: c.muted }]}>Nutrition (daily)</Text>
        <View style={[s.card, { backgroundColor: c.card, borderColor: c.border }]}>
          <View style={s.twoCol}>
            {([
              ['Calories (kcal)', calories,     setCalories],
              ['Carbs (g)',       carbsG,        setCarbsG],
              ['Protein (g)',     proteinG,      setProteinG],
              ['Fat (g)',         fatG,          setFatG],
              ['Water (glasses)', waterGlasses,  setWaterGlasses],
            ] as [string, string, (v: string) => void][]).map(([label, val, setter]) => (
              <View key={label} style={s.twoColField}>
                <Text style={[s.fieldLabel, { color: c.muted }]}>{label}</Text>
                <TextInput style={[s.input, { color: c.text, borderColor: c.border, backgroundColor: c.bg }]} value={val} onChangeText={setter} keyboardType="numeric" placeholderTextColor={c.muted} />
              </View>
            ))}
          </View>
        </View>

        {/* Weekly nutrition */}
        <Text style={[s.sectionLabel, { color: c.muted }]}>Nutrition (weekly)</Text>
        <Text style={{ color: c.muted, fontSize: fontSize.xs, marginTop: -4, marginBottom: 8 }}>Leave blank to auto-calculate as daily × 7</Text>
        <View style={[s.card, { backgroundColor: c.card, borderColor: c.border }]}>
          <View style={s.twoCol}>
            {([
              ['Calories (kcal)', wkCalories, setWkCalories],
              ['Protein (g)',     wkProteinG, setWkProteinG],
              ['Carbs (g)',       wkCarbsG,   setWkCarbsG],
              ['Fat (g)',         wkFatG,     setWkFatG],
            ] as [string, string, (v: string) => void][]).map(([label, val, setter]) => (
              <View key={label} style={s.twoColField}>
                <Text style={[s.fieldLabel, { color: c.muted }]}>{label}</Text>
                <TextInput style={[s.input, { color: c.text, borderColor: c.border, backgroundColor: c.bg }]} value={val} onChangeText={setter} keyboardType="numeric" placeholderTextColor={c.muted} />
              </View>
            ))}
          </View>
        </View>

        {/* Exercise */}
        <Text style={[s.sectionLabel, { color: c.muted }]}>Workouts (per week)</Text>
        <View style={[s.card, { backgroundColor: c.card, borderColor: c.border }]}>
          <View style={s.twoCol}>
            <View style={s.twoColField}>
              <Text style={[s.fieldLabel, { color: c.muted }]}>Workouts</Text>
              <TextInput style={[s.input, { color: c.text, borderColor: c.border, backgroundColor: c.bg }]} value={workoutCount} onChangeText={setWorkoutCount} keyboardType="numeric" placeholderTextColor={c.muted} />
            </View>
            <View style={s.twoColField}>
              <Text style={[s.fieldLabel, { color: c.muted }]}>Minutes</Text>
              <TextInput style={[s.input, { color: c.text, borderColor: c.border, backgroundColor: c.bg }]} value={minutesPerWeek} onChangeText={setMinutesPerWeek} keyboardType="numeric" placeholder="e.g. 300" placeholderTextColor={c.muted} />
            </View>
            <View style={s.twoColField}>
              <Text style={[s.fieldLabel, { color: c.muted }]}>Volume (lbs)</Text>
              <TextInput style={[s.input, { color: c.text, borderColor: c.border, backgroundColor: c.bg }]} value={volume} onChangeText={setVolume} keyboardType="numeric" placeholder="e.g. 10000" placeholderTextColor={c.muted} />
            </View>
          </View>
        </View>

        {/* Per-routine goals */}
        {routines.length > 0 && (
          <>
            <Text style={[s.sectionLabel, { color: c.muted }]}>Per-Routine Goals (sessions/week)</Text>
            <View style={[s.card, { backgroundColor: c.card, borderColor: c.border }]}>
              <View style={s.twoCol}>
                {routines.map((r) => (
                  <View key={r.id} style={s.twoColField}>
                    <Text style={[s.fieldLabel, { color: c.muted }]} numberOfLines={1}>{r.name}</Text>
                    <TextInput
                      style={[s.input, { color: c.text, borderColor: c.border, backgroundColor: c.bg }]}
                      value={routineGoalInputs[r.id] ?? ''}
                      onChangeText={(v) => setRoutineGoalInputs((prev) => ({ ...prev, [r.id]: v }))}
                      keyboardType="numeric"
                      placeholder="e.g. 3"
                      placeholderTextColor={c.muted}
                    />
                  </View>
                ))}
              </View>
            </View>
          </>
        )}

        {/* Body measurements */}
        <Text style={[s.sectionLabel, { color: c.muted }]}>Body Measurements</Text>
        <View style={[s.card, { backgroundColor: c.card, borderColor: c.border }]}>
          {DISPLAYED_METRICS.map(({ key, label, unit }, i) => (
            <View key={key} style={[{ gap: 8 }, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.border, paddingTop: 10, marginTop: 2 }]}>
              <Text style={{ color: c.text, fontSize: fontSize.sm, fontWeight: '600' }}>
                {label} <Text style={{ fontWeight: '400', color: c.muted }}>({unit})</Text>
              </Text>
              <View style={s.twoCol}>
                <View style={s.twoColField}>
                  <Text style={[s.fieldLabel, { color: c.muted }]}>Target</Text>
                  <TextInput
                    style={[s.input, { color: c.text, borderColor: c.border, backgroundColor: c.bg }]}
                    value={mGoals[key].value}
                    onChangeText={(v) => setMGoals((prev) => ({ ...prev, [key]: { ...prev[key], value: v } }))}
                    keyboardType="decimal-pad"
                    placeholderTextColor={c.muted}
                  />
                </View>
                <View style={s.twoColField}>
                  <Text style={[s.fieldLabel, { color: c.muted }]}>By date (YYYY-MM-DD)</Text>
                  <TextInput
                    style={[s.input, { color: c.text, borderColor: c.border, backgroundColor: c.bg }]}
                    value={mGoals[key].date}
                    onChangeText={(v) => setMGoals((prev) => ({ ...prev, [key]: { ...prev[key], date: v } }))}
                    placeholder="2026-12-31"
                    placeholderTextColor={c.muted}
                    keyboardType="numbers-and-punctuation"
                  />
                </View>
              </View>
            </View>
          ))}
        </View>

        {/* Save button */}
        {msg ? (
          <Text style={{ color: msg.includes('saved') ? '#34d399' : '#ef4444', fontSize: fontSize.sm, marginTop: 4 }}>{msg}</Text>
        ) : null}
        <TouchableOpacity
          style={[s.saveBtn, { backgroundColor: c.accent, opacity: saving ? 0.5 : 1 }]}
          onPress={handleSave}
          disabled={saving}
        >
          <Text style={{ color: '#000', fontWeight: '700', fontSize: fontSize.sm }}>{saving ? 'Saving…' : 'Save Goals'}</Text>
        </TouchableOpacity>

        {/* Custom user goals */}
        <Text style={[s.sectionLabel, { color: c.muted }]}>Custom Goals</Text>
        <View style={[s.card, { backgroundColor: c.card, borderColor: c.border }]}>
          <TouchableOpacity onPress={() => setAddingGoal(true)} style={s.addBtn}>
            <Text style={{ color: c.accent, fontSize: fontSize.sm, fontWeight: '600' }}>+ Add goal</Text>
          </TouchableOpacity>

          {bodyGoals.length > 0 && (
            <View style={{ marginTop: 8 }}>
              <Text style={{ color: c.muted, fontSize: fontSize.xs, fontWeight: '700', textTransform: 'uppercase' }}>Body</Text>
              <UserGoalRows goals={bodyGoals} onEdit={setEditingGoal} onDelete={handleDeleteUserGoal} />
            </View>
          )}
          {nutritionGoals.length > 0 && (
            <View style={{ marginTop: 8 }}>
              <Text style={{ color: c.muted, fontSize: fontSize.xs, fontWeight: '700', textTransform: 'uppercase' }}>Nutrition</Text>
              <UserGoalRows goals={nutritionGoals} onEdit={setEditingGoal} onDelete={handleDeleteUserGoal} />
            </View>
          )}
          {exerciseGoals.length > 0 && (
            <View style={{ marginTop: 8 }}>
              <Text style={{ color: c.muted, fontSize: fontSize.xs, fontWeight: '700', textTransform: 'uppercase' }}>Exercise</Text>
              <UserGoalRows goals={exerciseGoals} onEdit={setEditingGoal} onDelete={handleDeleteUserGoal} />
            </View>
          )}
        </View>

        <View style={{ height: 32 }} />
      </ScrollView>

      {addingGoal && (
        <UserGoalForm
          exercisesList={allExercises}
          routinesList={routines}
          onClose={() => setAddingGoal(false)}
          onSaved={onUserGoalSaved}
        />
      )}
      {editingGoal && (
        <UserGoalForm
          initial={editingGoal}
          exercisesList={allExercises}
          routinesList={routines}
          onClose={() => setEditingGoal(null)}
          onSaved={onUserGoalSaved}
        />
      )}
    </>
  );
}

export default function GoalsScreen() {
  const c = useColors();
  const s = makeStyles(c);
  return (
    <SafeAreaView style={[s.container, { backgroundColor: c.bg }]}>
      <View style={[s.header, { borderBottomColor: c.border }]}>
        <Text style={[s.title, { color: c.text }]}>Goals</Text>
      </View>
      <GoalsTabContent />
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

function makeStyles(c: Colors) {
  return StyleSheet.create({
    container:    { flex: 1 },
    header:       { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 12, borderBottomWidth: 1 },
    title:        { fontSize: fontSize.xl, fontWeight: '700', color: c.text },
    content:      { padding: 14, gap: 8 },
    sectionLabel: { fontSize: fontSize.sm, textTransform: 'uppercase', letterSpacing: 0.8, marginTop: 8, marginBottom: 4 },
    card:         { borderRadius: 12, borderWidth: 1, padding: 14, gap: 10 },
    twoCol:       { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
    twoColField:  { flex: 1, minWidth: '40%', gap: 4 },
    field:        { gap: 4, marginBottom: 10 },
    fieldLabel:   { fontSize: fontSize.sm, color: c.muted },
    input:        { borderWidth: 1, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8, fontSize: fontSize.sm, color: c.text, backgroundColor: c.bg, borderColor: c.border },
    saveBtn:      { borderRadius: 8, paddingHorizontal: 18, paddingVertical: 12, alignItems: 'center', marginTop: 4 },
    addBtn:       { borderWidth: 1, borderRadius: 8, paddingVertical: 10, alignItems: 'center', borderColor: c.accent },
    goalRow:      { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, borderBottomWidth: StyleSheet.hairlineWidth },
    pill:         { borderRadius: 20, borderWidth: 1, borderColor: c.border, paddingHorizontal: 14, paddingVertical: 7 },
    pillActive:   { backgroundColor: c.accent, borderColor: c.accent },
    pillText:     { fontSize: fontSize.sm, color: c.muted },
    pillTextActive: { color: '#000', fontWeight: '700' },
    // Modal shared
    overlay:      { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.5)' },
    sheet:        { borderTopLeftRadius: 20, borderTopRightRadius: 20, borderWidth: 1, padding: 20, gap: 0 },
    sheetHeader:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
    sheetTitle:   { fontSize: fontSize.lg, fontWeight: '700' },
    pickerRow:    { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 14, paddingHorizontal: 16, borderTopWidth: StyleSheet.hairlineWidth },
    actions:      { flexDirection: 'row', gap: 8, marginTop: 12 },
    cancelBtn:    { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 12 },
  });
}
