import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator, Alert, Modal, KeyboardAvoidingView, Platform,
  ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from 'expo-router';
import {
  getGoalsSummary, getExerciseGoals, saveExerciseGoals, saveNutritionGoals,
  getMeasurementGoals, setMeasurementGoal, deleteMeasurementGoal, getMeasurements,
  getSchedules, getUpcomingSchedule, createSchedule, deleteSchedule,
  getProgramTemplates, importProgramTemplate, getRoutines,
  searchFoods, searchRecipes,
  getMealPlanWeek, addMealPlanFoodEntry, addMealPlanRecipeEntry,
  deleteMealPlanEntry, getMealPlanTemplates, saveMealPlanTemplate,
  applyMealPlanTemplate, deleteMealPlanTemplate,
  type GoalsSummary, type ExerciseGoals, type MeasurementGoal, type BodyMeasurement,
  type WorkoutSchedule, type UpcomingSession, type ProgramTemplate,
  type RecurrenceType, type RoutineSummary,
  type MealSlot, type MealPlanWeek, type MealPlanTemplate, type MealPlanEntry,
  type Food, type RecipeSearchResult,
} from '../../../src/api/client';
import { getWeekStart, localDateStr } from '../../../../../packages/api-client/src/index';
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

const DOW_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

// ─── Helpers ─────────────────────────────────────────────────────────────────

function pct(actual: number, goal: number | null | undefined) {
  if (!goal) return 0;
  return Math.min(actual / goal, 1);
}

function todayStr() {
  return new Date().toISOString().slice(0, 10);
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

// ─── Week strip ───────────────────────────────────────────────────────────────

function WeekStrip({ upcoming, c }: { upcoming: UpcomingSession[]; c: Colors }) {
  const today = todayStr();
  const jsToday = new Date(today + 'T00:00:00');
  const jsDow = jsToday.getDay(); // 0=Sun
  const mondayOffset = jsDow === 0 ? -6 : 1 - jsDow;
  const monday = new Date(jsToday);
  monday.setDate(jsToday.getDate() + mondayOffset);

  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    const dateStr = d.toISOString().slice(0, 10);
    const session = upcoming.find((u) => u.date === dateStr);
    return { dateStr, dayNum: d.getDate(), session, isToday: dateStr === today };
  });

  function dotColor(session?: UpcomingSession) {
    if (!session) return 'transparent';
    if (session.status === 'completed') return '#86AA80';
    if (session.status === 'skipped')  return '#C5896E';
    if (session.status === 'rest')     return c.muted;
    return c.accent;
  }

  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
      {days.map(({ dateStr, dayNum, session, isToday }, i) => (
        <View key={dateStr} style={{ alignItems: 'center', flex: 1, gap: 3 }}>
          <Text style={{ color: c.muted, fontSize: fontSize.xs }}>{DOW_LABELS[i].slice(0, 1)}</Text>
          <View style={[
            { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
            isToday && { backgroundColor: c.accent },
          ]}>
            <Text style={{ color: isToday ? '#000' : c.text, fontSize: fontSize.sm, fontWeight: isToday ? '700' : '400' }}>
              {dayNum}
            </Text>
          </View>
          <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: dotColor(session) }} />
          {session && !session.isRestDay && (
            <Text style={{ color: c.muted, fontSize: 9, textAlign: 'center' }} numberOfLines={1}>
              {session.routineName ?? session.dayLabel ?? ''}
            </Text>
          )}
        </View>
      ))}
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

// ─── Add schedule modal ───────────────────────────────────────────────────────

function AddScheduleModal({ token, routinesList, onClose, onSaved, c }: {
  token: string;
  routinesList: RoutineSummary[];
  onClose: () => void;
  onSaved: () => void;
  c: Colors;
}) {
  const s = makeStyles(c);
  const [isRestDay,      setIsRestDay]      = useState(false);
  const [routineId,      setRoutineId]      = useState<number | null>(null);
  const [label,          setLabel]          = useState('');
  const [recType,        setRecType]        = useState<RecurrenceType>('days_of_week');
  const [dowDays,        setDowDays]        = useState<number[]>([]);
  const [xDaysInterval,  setXDaysInterval]  = useState('3');
  const [domType,        setDomType]        = useState<'specific_dates' | 'nth_weekday'>('specific_dates');
  const [domDates,       setDomDates]       = useState('1, 15');
  const [domN,           setDomN]           = useState('1');
  const [domWeekday,     setDomWeekday]     = useState('0');
  const [startDate,      setStartDate]      = useState(todayStr());
  const [endDate,        setEndDate]        = useState('');
  const [saving,         setSaving]         = useState(false);
  const [pickingRoutine, setPickingRoutine] = useState(false);

  function buildConfig() {
    if (recType === 'daily' || recType === 'every_other_day') return {};
    if (recType === 'days_of_week') return { days: dowDays };
    if (recType === 'every_x_days') return { interval: Number(xDaysInterval) || 3 };
    if (recType === 'day_of_month') {
      if (domType === 'specific_dates') {
        return {
          type: 'specific_dates',
          dates: domDates.split(',').map((d) => Number(d.trim())).filter((d) => d >= 1 && d <= 31),
        };
      }
      return { type: 'nth_weekday', n: Number(domN) || 1, weekday: Number(domWeekday) || 0 };
    }
    return {};
  }

  async function handleSave() {
    if (!isRestDay && routineId === null) return;
    setSaving(true);
    try {
      await createSchedule(token, {
        routineId: isRestDay ? null : routineId,
        label: label.trim() || undefined,
        isRestDay,
        recurrenceType: recType,
        recurrenceConfig: buildConfig(),
        startDate,
        endDate: endDate.trim() || null,
      });
      onSaved();
      onClose();
    } catch { Alert.alert('Error', 'Could not save schedule.'); }
    finally { setSaving(false); }
  }

  const selectedRoutine = routinesList.find((r) => r.id === routineId);
  const canSave = isRestDay || routineId !== null;

  if (pickingRoutine) {
    return (
      <Modal transparent animationType="slide" onRequestClose={() => setPickingRoutine(false)}>
        <View style={s.modalOverlay}>
          <View style={[s.modalSheet, { backgroundColor: c.card, borderColor: c.border, maxHeight: '80%' }]}>
            <View style={s.modalHeader}>
              <Text style={[s.modalTitle, { color: c.text }]}>Choose Routine</Text>
              <TouchableOpacity onPress={() => setPickingRoutine(false)}>
                <Text style={{ color: c.muted, fontSize: 22 }}>×</Text>
              </TouchableOpacity>
            </View>
            <ScrollView>
              {routinesList.map((r) => (
                <TouchableOpacity
                  key={r.id}
                  onPress={() => { setRoutineId(r.id); setPickingRoutine(false); }}
                  style={[s.pickerRow, { borderColor: c.border }, routineId === r.id && { backgroundColor: `${c.accent}22` }]}
                >
                  <Text style={{ color: c.text, fontSize: fontSize.sm }}>{r.name}</Text>
                  {routineId === r.id && <Text style={{ color: c.accent, fontSize: fontSize.sm }}>✓</Text>}
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>
    );
  }

  return (
    <Modal transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <View style={s.modalOverlay}>
          <View style={[s.modalSheet, { backgroundColor: c.card, borderColor: c.border }]}>
            <View style={s.modalHeader}>
              <Text style={[s.modalTitle, { color: c.text }]}>Add Schedule</Text>
              <TouchableOpacity onPress={onClose}><Text style={{ color: c.muted, fontSize: 22 }}>×</Text></TouchableOpacity>
            </View>
            <ScrollView style={{ maxHeight: 480 }} keyboardShouldPersistTaps="handled">

              {/* Rest day toggle */}
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 8 }}>
                <Text style={{ color: c.text, fontSize: fontSize.sm }}>Rest day</Text>
                <TouchableOpacity
                  onPress={() => setIsRestDay(!isRestDay)}
                  style={{
                    width: 48, height: 28, borderRadius: 14,
                    backgroundColor: isRestDay ? c.accent : c.border,
                    justifyContent: 'center', paddingHorizontal: 3,
                  }}
                >
                  <View style={{
                    width: 22, height: 22, borderRadius: 11, backgroundColor: '#fff',
                    alignSelf: isRestDay ? 'flex-end' : 'flex-start',
                  }} />
                </TouchableOpacity>
              </View>

              {/* Routine picker */}
              {!isRestDay && (
                <TouchableOpacity
                  onPress={() => setPickingRoutine(true)}
                  style={[s.input, { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, borderColor: c.border, backgroundColor: c.bg }]}
                >
                  <Text style={{ color: selectedRoutine ? c.text : c.muted, fontSize: fontSize.sm }}>
                    {selectedRoutine ? selectedRoutine.name : 'Select routine…'}
                  </Text>
                  <Text style={{ color: c.muted }}>›</Text>
                </TouchableOpacity>
              )}

              {/* Optional label */}
              <View style={[s.field, { marginBottom: 8 }]}>
                <Text style={[s.fieldLabel, { color: c.muted }]}>Label (optional)</Text>
                <TextInput
                  style={[s.input, { color: c.text, borderColor: c.border, backgroundColor: c.bg }]}
                  value={label} onChangeText={setLabel}
                  placeholder="e.g. Morning workout" placeholderTextColor={c.muted}
                />
              </View>

              {/* Recurrence type */}
              <Text style={[s.fieldLabel, { color: c.muted, marginBottom: 4 }]}>Repeats</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 8 }}>
                {(['daily', 'every_other_day', 'days_of_week', 'every_x_days', 'day_of_month'] as RecurrenceType[]).map((rt) => (
                  <TouchableOpacity
                    key={rt}
                    onPress={() => setRecType(rt)}
                    style={{
                      marginRight: 6, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8,
                      backgroundColor: recType === rt ? c.accent : c.border,
                    }}
                  >
                    <Text style={{ color: recType === rt ? '#000' : c.text, fontSize: fontSize.xs }}>
                      {rt === 'daily' ? 'Daily'
                        : rt === 'every_other_day' ? 'Every other'
                        : rt === 'days_of_week'    ? 'Days of week'
                        : rt === 'every_x_days'    ? 'Every X days'
                        :                            'Day of month'}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>

              {/* days_of_week config */}
              {recType === 'days_of_week' && (
                <View style={{ flexDirection: 'row', gap: 4, marginBottom: 8 }}>
                  {DOW_LABELS.map((lbl, i) => (
                    <TouchableOpacity
                      key={i}
                      onPress={() => setDowDays((prev) => prev.includes(i) ? prev.filter((d) => d !== i) : [...prev, i])}
                      style={{
                        flex: 1, paddingVertical: 8, borderRadius: 8, alignItems: 'center',
                        backgroundColor: dowDays.includes(i) ? c.accent : c.border,
                      }}
                    >
                      <Text style={{ color: dowDays.includes(i) ? '#000' : c.text, fontSize: fontSize.xs }}>
                        {lbl.slice(0, 1)}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )}

              {/* every_x_days config */}
              {recType === 'every_x_days' && (
                <View style={[s.field, { marginBottom: 8 }]}>
                  <Text style={[s.fieldLabel, { color: c.muted }]}>Interval (days)</Text>
                  <TextInput
                    style={[s.input, { color: c.text, borderColor: c.border, backgroundColor: c.bg }]}
                    value={xDaysInterval} onChangeText={setXDaysInterval}
                    keyboardType="numeric" placeholderTextColor={c.muted}
                  />
                </View>
              )}

              {/* day_of_month config */}
              {recType === 'day_of_month' && (
                <>
                  <View style={{ flexDirection: 'row', gap: 6, marginBottom: 8 }}>
                    {(['specific_dates', 'nth_weekday'] as const).map((dt) => (
                      <TouchableOpacity
                        key={dt}
                        onPress={() => setDomType(dt)}
                        style={{
                          flex: 1, paddingVertical: 8, borderRadius: 8, alignItems: 'center',
                          backgroundColor: domType === dt ? c.accent : c.border,
                        }}
                      >
                        <Text style={{ color: domType === dt ? '#000' : c.text, fontSize: fontSize.xs }}>
                          {dt === 'specific_dates' ? 'Specific dates' : 'Nth weekday'}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                  {domType === 'specific_dates' ? (
                    <View style={[s.field, { marginBottom: 8 }]}>
                      <Text style={[s.fieldLabel, { color: c.muted }]}>Dates (comma-separated, e.g. 1, 15)</Text>
                      <TextInput
                        style={[s.input, { color: c.text, borderColor: c.border, backgroundColor: c.bg }]}
                        value={domDates} onChangeText={setDomDates}
                        placeholderTextColor={c.muted}
                      />
                    </View>
                  ) : (
                    <View style={{ flexDirection: 'row', gap: 8, marginBottom: 8 }}>
                      <View style={[s.field, { flex: 1 }]}>
                        <Text style={[s.fieldLabel, { color: c.muted }]}>Which (1–4)</Text>
                        <TextInput
                          style={[s.input, { color: c.text, borderColor: c.border, backgroundColor: c.bg }]}
                          value={domN} onChangeText={setDomN}
                          keyboardType="numeric" placeholderTextColor={c.muted}
                        />
                      </View>
                      <View style={[s.field, { flex: 2 }]}>
                        <Text style={[s.fieldLabel, { color: c.muted }]}>Weekday (0=Mon … 6=Sun)</Text>
                        <TextInput
                          style={[s.input, { color: c.text, borderColor: c.border, backgroundColor: c.bg }]}
                          value={domWeekday} onChangeText={setDomWeekday}
                          keyboardType="numeric" placeholderTextColor={c.muted}
                        />
                      </View>
                    </View>
                  )}
                </>
              )}

              {/* Start date */}
              <View style={[s.field, { marginBottom: 8 }]}>
                <Text style={[s.fieldLabel, { color: c.muted }]}>Start date (YYYY-MM-DD)</Text>
                <TextInput
                  style={[s.input, { color: c.text, borderColor: c.border, backgroundColor: c.bg }]}
                  value={startDate} onChangeText={setStartDate}
                  placeholder="2025-01-01" placeholderTextColor={c.muted}
                />
              </View>

              {/* End date */}
              <View style={[s.field, { marginBottom: 8 }]}>
                <Text style={[s.fieldLabel, { color: c.muted }]}>End date (optional)</Text>
                <TextInput
                  style={[s.input, { color: c.text, borderColor: c.border, backgroundColor: c.bg }]}
                  value={endDate} onChangeText={setEndDate}
                  placeholder="Leave blank for ongoing" placeholderTextColor={c.muted}
                />
              </View>
            </ScrollView>

            <View style={s.modalActions}>
              <TouchableOpacity onPress={onClose} style={s.cancelBtn}>
                <Text style={{ color: c.muted, fontSize: fontSize.sm }}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={handleSave}
                disabled={saving || !canSave}
                style={[s.saveBtn, { backgroundColor: c.accent, opacity: (saving || !canSave) ? 0.5 : 1 }]}
              >
                <Text style={{ color: '#000', fontWeight: '700', fontSize: fontSize.sm }}>
                  {saving ? 'Saving…' : 'Add'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ─── Import program modal ─────────────────────────────────────────────────────

function ImportProgramModal({ token, templates, routinesList, onClose, onSaved, c }: {
  token: string;
  templates: ProgramTemplate[];
  routinesList: RoutineSummary[];
  onClose: () => void;
  onSaved: () => void;
  c: Colors;
}) {
  const s = makeStyles(c);
  const [selectedTemplate, setSelectedTemplate] = useState<ProgramTemplate | null>(null);
  const [slotMap,          setSlotMap]          = useState<Record<string, number | null>>({});
  const [startDate,        setStartDate]        = useState(todayStr());
  const [saving,           setSaving]           = useState(false);
  const [pickingSlot,      setPickingSlot]      = useState<string | null>(null);

  const slots = useMemo(() => {
    if (!selectedTemplate) return [];
    const seen = new Set<string>();
    selectedTemplate.days.forEach((d) => {
      if (!d.isRestDay && d.slotLabel) seen.add(d.slotLabel);
    });
    return Array.from(seen);
  }, [selectedTemplate]);

  async function handleImport() {
    if (!selectedTemplate) return;
    setSaving(true);
    try {
      await importProgramTemplate(token, selectedTemplate.id, { startDate, slotMap });
      onSaved();
      onClose();
    } catch { Alert.alert('Error', 'Could not import program.'); }
    finally { setSaving(false); }
  }

  if (pickingSlot !== null) {
    const slot = pickingSlot;
    return (
      <Modal transparent animationType="slide" onRequestClose={() => setPickingSlot(null)}>
        <View style={s.modalOverlay}>
          <View style={[s.modalSheet, { backgroundColor: c.card, borderColor: c.border, maxHeight: '80%' }]}>
            <View style={s.modalHeader}>
              <Text style={[s.modalTitle, { color: c.text }]}>{slot}</Text>
              <TouchableOpacity onPress={() => setPickingSlot(null)}>
                <Text style={{ color: c.muted, fontSize: 22 }}>×</Text>
              </TouchableOpacity>
            </View>
            <ScrollView>
              <TouchableOpacity
                onPress={() => { setSlotMap((prev) => ({ ...prev, [slot]: null })); setPickingSlot(null); }}
                style={[s.pickerRow, { borderColor: c.border }]}
              >
                <Text style={{ color: c.muted, fontSize: fontSize.sm }}>None (skip slot)</Text>
              </TouchableOpacity>
              {routinesList.map((r) => (
                <TouchableOpacity
                  key={r.id}
                  onPress={() => { setSlotMap((prev) => ({ ...prev, [slot]: r.id })); setPickingSlot(null); }}
                  style={[s.pickerRow, { borderColor: c.border }, slotMap[slot] === r.id && { backgroundColor: `${c.accent}22` }]}
                >
                  <Text style={{ color: c.text, fontSize: fontSize.sm }}>{r.name}</Text>
                  {slotMap[slot] === r.id && <Text style={{ color: c.accent, fontSize: fontSize.sm }}>✓</Text>}
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>
    );
  }

  return (
    <Modal transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <View style={s.modalOverlay}>
          <View style={[s.modalSheet, { backgroundColor: c.card, borderColor: c.border }]}>
            <View style={s.modalHeader}>
              <Text style={[s.modalTitle, { color: c.text }]}>Import Program</Text>
              <TouchableOpacity onPress={onClose}><Text style={{ color: c.muted, fontSize: 22 }}>×</Text></TouchableOpacity>
            </View>
            <ScrollView style={{ maxHeight: 420 }} keyboardShouldPersistTaps="handled">
              {!selectedTemplate ? (
                templates.map((t) => (
                  <TouchableOpacity
                    key={t.id}
                    onPress={() => setSelectedTemplate(t)}
                    style={[s.pickerRow, { borderColor: c.border }]}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: c.text, fontSize: fontSize.sm, fontWeight: '600' }}>{t.name}</Text>
                      {t.description && (
                        <Text style={{ color: c.muted, fontSize: fontSize.xs }}>{t.description}</Text>
                      )}
                    </View>
                    <Text style={{ color: c.muted, fontSize: fontSize.sm }}>{t.weeks}w ›</Text>
                  </TouchableOpacity>
                ))
              ) : (
                <>
                  <TouchableOpacity onPress={() => setSelectedTemplate(null)} style={{ marginBottom: 12 }}>
                    <Text style={{ color: c.accent, fontSize: fontSize.sm }}>← Change program</Text>
                  </TouchableOpacity>
                  <Text style={{ color: c.text, fontSize: fontSize.sm, fontWeight: '600', marginBottom: 8 }}>
                    {selectedTemplate.name}
                  </Text>
                  {slots.length > 0 && (
                    <>
                      <Text style={[s.fieldLabel, { color: c.muted, marginBottom: 4 }]}>Map slots to your routines:</Text>
                      {slots.map((slot) => {
                        const mappedId = slotMap[slot];
                        const mappedRoutine = routinesList.find((r) => r.id === mappedId);
                        return (
                          <TouchableOpacity
                            key={slot}
                            onPress={() => setPickingSlot(slot)}
                            style={[s.input, { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, borderColor: c.border, backgroundColor: c.bg }]}
                          >
                            <Text style={{ color: c.muted, fontSize: fontSize.sm }}>{slot}:</Text>
                            <Text style={{ color: mappedRoutine ? c.text : c.muted, fontSize: fontSize.sm }}>
                              {mappedRoutine ? mappedRoutine.name : 'Pick routine ›'}
                            </Text>
                          </TouchableOpacity>
                        );
                      })}
                    </>
                  )}
                  <View style={[s.field, { marginBottom: 8 }]}>
                    <Text style={[s.fieldLabel, { color: c.muted }]}>Start date (YYYY-MM-DD)</Text>
                    <TextInput
                      style={[s.input, { color: c.text, borderColor: c.border, backgroundColor: c.bg }]}
                      value={startDate} onChangeText={setStartDate}
                      placeholder="2025-01-01" placeholderTextColor={c.muted}
                    />
                  </View>
                </>
              )}
            </ScrollView>
            {selectedTemplate && (
              <View style={s.modalActions}>
                <TouchableOpacity onPress={onClose} style={s.cancelBtn}>
                  <Text style={{ color: c.muted, fontSize: fontSize.sm }}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={handleImport}
                  disabled={saving}
                  style={[s.saveBtn, { backgroundColor: c.accent, opacity: saving ? 0.5 : 1 }]}
                >
                  <Text style={{ color: '#000', fontWeight: '700', fontSize: fontSize.sm }}>
                    {saving ? 'Importing…' : 'Import'}
                  </Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ─── Meal Planning ────────────────────────────────────────────────────────────

const MEAL_ORDER: MealSlot[] = ['breakfast', 'lunch', 'dinner', 'snack'];
const MEAL_LABELS: Record<MealSlot, string> = { breakfast: 'Breakfast', lunch: 'Lunch', dinner: 'Dinner', snack: 'Snack' };

function MobileMealPlanPickerModal({ token, meal, date, c, onClose, onAdded }: {
  token: string;
  meal: MealSlot;
  date: string;
  c: Colors;
  onClose: () => void;
  onAdded: () => void;
}) {
  const s = makeStyles(c);
  const [tab, setTab] = useState<'food' | 'recipe'>('food');
  const [search, setSearch] = useState('');
  const [foodResults, setFoodResults] = useState<Food[]>([]);
  const [recipeResults, setRecipeResults] = useState<RecipeSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [selectedFood, setSelectedFood] = useState<Food | null>(null);
  const [selectedServingId, setSelectedServingId] = useState<number | null>(null);
  const [quantity, setQuantity] = useState('1');
  const [selectedRecipe, setSelectedRecipe] = useState<RecipeSearchResult | null>(null);
  const [recipeServings, setRecipeServings] = useState('1');
  const [adding, setAdding] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    if (!search.trim()) { setFoodResults([]); setRecipeResults([]); return; }
    timerRef.current = setTimeout(async () => {
      setSearching(true);
      try {
        if (tab === 'food') setFoodResults(await searchFoods(token, search));
        else setRecipeResults(await searchRecipes(token, search));
      } catch { /* ignore */ } finally { setSearching(false); }
    }, 400);
  }, [search, tab]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (selectedFood) {
      const def = selectedFood.servingSizes.find(s => s.isDefault) ?? selectedFood.servingSizes[0];
      setSelectedServingId(def?.id ?? null);
    }
  }, [selectedFood]);

  async function handleAdd() {
    setAdding(true);
    try {
      if (tab === 'food' && selectedFood && selectedServingId) {
        await addMealPlanFoodEntry(token, { planDate: date, meal, foodId: selectedFood.id, servingSizeId: selectedServingId, quantity: Number(quantity) || 1 });
      } else if (tab === 'recipe' && selectedRecipe) {
        await addMealPlanRecipeEntry(token, { planDate: date, meal, recipeId: selectedRecipe.id, recipeServings: Number(recipeServings) || 1 });
      }
      onAdded();
    } catch { Alert.alert('Error', 'Could not add item.'); }
    finally { setAdding(false); }
  }

  const previewCal = (() => {
    if (tab === 'food' && selectedFood && selectedServingId) {
      const ss = selectedFood.servingSizes.find(s => s.id === selectedServingId);
      if (!ss) return null;
      return Math.round(selectedFood.nutrition.calories * ss.grams * (Number(quantity) || 1) / 100);
    }
    if (tab === 'recipe' && selectedRecipe?.calories != null) {
      const f = (Number(recipeServings) || 1) / (selectedRecipe.servings ?? 1);
      return Math.round(Number(selectedRecipe.calories) * f);
    }
    return null;
  })();

  const canAdd = tab === 'food'
    ? !!(selectedFood && selectedServingId && Number(quantity) > 0)
    : !!(selectedRecipe && Number(recipeServings) > 0);

  return (
    <Modal transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <View style={s.modalOverlay}>
          <View style={[s.modalSheet, { backgroundColor: c.card, borderColor: c.border, maxHeight: '85%' }]}>
            <View style={s.modalHeader}>
              <Text style={[s.modalTitle, { color: c.text }]}>Add to {MEAL_LABELS[meal]}</Text>
              <TouchableOpacity onPress={onClose}><Text style={{ color: c.muted, fontSize: 22 }}>×</Text></TouchableOpacity>
            </View>

            {/* Tabs */}
            <View style={{ flexDirection: 'row', gap: 8 }}>
              {(['food', 'recipe'] as const).map(t => (
                <TouchableOpacity key={t} onPress={() => { setTab(t); setSearch(''); setSelectedFood(null); setSelectedRecipe(null); }}
                  style={{ paddingHorizontal: 14, paddingVertical: 6, borderRadius: 99,
                    backgroundColor: tab === t ? c.accent : c.bg,
                    borderWidth: 1, borderColor: tab === t ? c.accent : c.border }}>
                  <Text style={{ color: tab === t ? '#000' : c.muted, fontSize: fontSize.sm, fontWeight: '600' }}>
                    {t === 'food' ? 'Food' : 'Recipe'}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Search */}
            <TextInput
              style={[s.input, { color: c.text, borderColor: c.border, backgroundColor: c.bg }]}
              placeholder={tab === 'food' ? 'Search foods…' : 'Search recipes…'}
              placeholderTextColor={c.muted}
              value={search}
              onChangeText={v => { setSearch(v); setSelectedFood(null); setSelectedRecipe(null); }}
              autoFocus
            />

            {/* Results */}
            {!selectedFood && !selectedRecipe && (
              <ScrollView style={{ maxHeight: 220 }} keyboardShouldPersistTaps="handled">
                {searching && <Text style={{ color: c.muted, fontSize: fontSize.sm, textAlign: 'center', paddingVertical: 12 }}>Searching…</Text>}
                {!searching && !search.trim() && <Text style={{ color: c.muted, fontSize: fontSize.sm, textAlign: 'center', paddingVertical: 12 }}>Type to search</Text>}
                {tab === 'food' && !searching && foodResults.map(f => {
                  const def = f.servingSizes.find(s => s.isDefault) ?? f.servingSizes[0];
                  const cal = def ? Math.round(f.nutrition.calories * def.grams / 100) : null;
                  return (
                    <TouchableOpacity key={f.id} onPress={() => setSelectedFood(f)}
                      style={{ paddingVertical: 10, paddingHorizontal: 4, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                      <View style={{ flex: 1, marginRight: 8 }}>
                        <Text style={{ color: c.text, fontSize: fontSize.sm }} numberOfLines={1}>{f.name}</Text>
                        {f.brand && <Text style={{ color: c.muted, fontSize: fontSize.xs }} numberOfLines={1}>{f.brand}</Text>}
                      </View>
                      {cal != null && <Text style={{ color: c.muted, fontSize: fontSize.xs }}>{cal} kcal</Text>}
                    </TouchableOpacity>
                  );
                })}
                {tab === 'recipe' && !searching && recipeResults.map(r => (
                  <TouchableOpacity key={r.id} onPress={() => setSelectedRecipe(r)}
                    style={{ paddingVertical: 10, paddingHorizontal: 4, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Text style={{ color: c.text, fontSize: fontSize.sm, flex: 1, marginRight: 8 }} numberOfLines={1}>{r.name}</Text>
                    {r.calories != null && <Text style={{ color: c.muted, fontSize: fontSize.xs }}>{Math.round(Number(r.calories))} kcal</Text>}
                  </TouchableOpacity>
                ))}
              </ScrollView>
            )}

            {/* Food detail */}
            {selectedFood && (
              <View style={{ gap: 10 }}>
                <TouchableOpacity onPress={() => setSelectedFood(null)}>
                  <Text style={{ color: c.accent, fontSize: fontSize.sm }}>← Back</Text>
                </TouchableOpacity>
                <Text style={{ color: c.text, fontSize: fontSize.sm, fontWeight: '600' }} numberOfLines={1}>{selectedFood.name}</Text>
                <View style={{ flexDirection: 'row', gap: 10 }}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: c.muted, fontSize: fontSize.xs, marginBottom: 4 }}>Serving</Text>
                    {selectedFood.servingSizes.map(ss => (
                      <TouchableOpacity key={ss.id} onPress={() => setSelectedServingId(ss.id)}
                        style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 5 }}>
                        <View style={{ width: 16, height: 16, borderRadius: 8, borderWidth: 2,
                          borderColor: selectedServingId === ss.id ? c.accent : c.border,
                          backgroundColor: selectedServingId === ss.id ? c.accent : 'transparent' }} />
                        <Text style={{ color: c.text, fontSize: fontSize.sm }}>{ss.label} ({ss.grams}g)</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                  <View style={{ width: 70 }}>
                    <Text style={{ color: c.muted, fontSize: fontSize.xs, marginBottom: 4 }}>Qty</Text>
                    <TextInput style={[s.input, { color: c.text, borderColor: c.border, backgroundColor: c.bg }]}
                      value={quantity} onChangeText={setQuantity} keyboardType="decimal-pad" />
                  </View>
                </View>
                {previewCal != null && <Text style={{ color: c.muted, fontSize: fontSize.xs }}>{previewCal} kcal estimated</Text>}
              </View>
            )}

            {/* Recipe detail */}
            {selectedRecipe && (
              <View style={{ gap: 10 }}>
                <TouchableOpacity onPress={() => setSelectedRecipe(null)}>
                  <Text style={{ color: c.accent, fontSize: fontSize.sm }}>← Back</Text>
                </TouchableOpacity>
                <Text style={{ color: c.text, fontSize: fontSize.sm, fontWeight: '600' }} numberOfLines={1}>{selectedRecipe.name}</Text>
                <View>
                  <Text style={{ color: c.muted, fontSize: fontSize.xs, marginBottom: 4 }}>
                    Servings (recipe makes {selectedRecipe.servings ?? 1})
                  </Text>
                  <TextInput style={[s.input, { color: c.text, borderColor: c.border, backgroundColor: c.bg, width: 80 }]}
                    value={recipeServings} onChangeText={setRecipeServings} keyboardType="decimal-pad" />
                </View>
                {previewCal != null && <Text style={{ color: c.muted, fontSize: fontSize.xs }}>{previewCal} kcal estimated</Text>}
              </View>
            )}

            <View style={s.modalActions}>
              <TouchableOpacity onPress={onClose} style={s.cancelBtn}>
                <Text style={{ color: c.muted, fontSize: fontSize.sm }}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={handleAdd} disabled={!canAdd || adding}
                style={[s.saveBtn, { backgroundColor: c.accent, opacity: (!canAdd || adding) ? 0.4 : 1 }]}>
                <Text style={{ color: '#000', fontWeight: '700', fontSize: fontSize.sm }}>
                  {adding ? 'Adding…' : 'Add to plan'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ─── Main screen ──────────────────────────────────────────────────────────────

export default function PlanningScreen() {
  const token = useAuthStore((s) => s.token)!;
  const c = useColors();
  const s = makeStyles(c);

  const [summary,           setSummary]           = useState<GoalsSummary | null>(null);
  const [exGoals,           setExGoals]           = useState<ExerciseGoals | null>(null);
  const [measGoals,         setMeasGoals]         = useState<Record<string, MeasurementGoal>>({});
  const [measurements,      setMeasurements]      = useState<BodyMeasurement[]>([]);
  const [schedules,         setSchedules]         = useState<WorkoutSchedule[]>([]);
  const [upcoming,          setUpcoming]          = useState<UpcomingSession[]>([]);
  const [routinesList,      setRoutinesList]      = useState<RoutineSummary[]>([]);
  const [templates,         setTemplates]         = useState<ProgramTemplate[]>([]);
  const [loading,           setLoading]           = useState(true);
  const [showNutEdit,       setShowNutEdit]       = useState(false);
  const [showExEdit,        setShowExEdit]        = useState(false);
  const [editingMeasMetric, setEditingMeasMetric] = useState<string | null>(null);
  const [showAddPicker,     setShowAddPicker]     = useState(false);
  const [showAddSchedule,   setShowAddSchedule]   = useState(false);
  const [showImportProgram, setShowImportProgram] = useState(false);

  // Meal planning
  const today = localDateStr();
  const [mpWeekStart,  setMpWeekStart]  = useState(() => getWeekStart(today));
  const [mealPlan,     setMealPlan]     = useState<MealPlanWeek | null>(null);
  const [mpTemplates,  setMpTemplates]  = useState<MealPlanTemplate[]>([]);
  const [mpSelDate,    setMpSelDate]    = useState(today);
  const [mpLoading,    setMpLoading]    = useState(false);
  const [mpPicker,     setMpPicker]     = useState<{ meal: MealSlot; date: string } | null>(null);
  const [mpSaveOpen,   setMpSaveOpen]   = useState(false);
  const [mpTplName,    setMpTplName]    = useState('');
  const [mpApplyId,    setMpApplyId]    = useState<number | null>(null);

  async function load() {
    try {
      const [sum, eg, mg, ms, scheds, upc, routines, tmplts] = await Promise.all([
        getGoalsSummary(token).catch(() => null),
        getExerciseGoals(token).catch(() => null),
        getMeasurementGoals(token).catch(() => ({})),
        getMeasurements(token).catch(() => []),
        getSchedules(token).catch(() => []),
        getUpcomingSchedule(token, 14).catch(() => []),
        getRoutines(token).catch(() => []),
        getProgramTemplates(token).catch(() => []),
      ]);
      setSummary(sum);
      setExGoals(eg);
      setMeasGoals(mg as Record<string, MeasurementGoal>);
      setMeasurements(ms as BodyMeasurement[]);
      setSchedules(scheds as WorkoutSchedule[]);
      setUpcoming(upc as UpcomingSession[]);
      setRoutinesList(routines as RoutineSummary[]);
      setTemplates(tmplts as ProgramTemplate[]);
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }

  async function loadMealPlan(weekStart: string) {
    setMpLoading(true);
    try {
      const [plan, tmplts] = await Promise.all([
        getMealPlanWeek(token, weekStart).catch(() => null),
        getMealPlanTemplates(token).catch(() => []),
      ]);
      setMealPlan(plan);
      setMpTemplates(tmplts as MealPlanTemplate[]);
      if (plan) {
        const dates = plan.days.map(d => d.date);
        setMpSelDate(sel => dates.includes(sel) ? sel : dates[0]);
      }
    } finally { setMpLoading(false); }
  }

  useEffect(() => { loadMealPlan(mpWeekStart); }, [mpWeekStart]); // eslint-disable-line react-hooks/exhaustive-deps

  function mpShiftWeek(delta: number) {
    const d = new Date(mpWeekStart + 'T12:00:00');
    d.setDate(d.getDate() + delta * 7);
    const ns = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    setMpWeekStart(ns);
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

        {/* ── Workout Schedule ── */}
        <View style={[s.card, { backgroundColor: c.card, borderColor: c.border }]}>
          <View style={s.cardHeader}>
            <Text style={[s.sectionTitle, { color: c.text }]}>Workout Schedule</Text>
            <TouchableOpacity onPress={() => setShowImportProgram(true)}>
              <Text style={{ color: c.accent, fontSize: fontSize.sm }}>Import</Text>
            </TouchableOpacity>
          </View>

          <WeekStrip upcoming={upcoming} c={c} />

          {schedules.length === 0 && (
            <Text style={[s.emptyNote, { color: c.muted }]}>No schedule yet. Add one or import a program.</Text>
          )}

          {schedules.map((sch, i) => (
            <View
              key={sch.id}
              style={[s.measRow, { borderTopColor: c.border }, i === 0 && { borderTopWidth: 0 }]}
            >
              <View style={{ flex: 1, gap: 3 }}>
                <Text style={[s.rowLabel, { color: c.text }]}>
                  {sch.isRestDay ? 'Rest day' : (sch.routineName ?? sch.label ?? 'Workout')}
                </Text>
                <Text style={{ color: c.muted, fontSize: fontSize.xs }}>{sch.recurrenceDescription}</Text>
              </View>
              <TouchableOpacity
                onPress={() =>
                  Alert.alert('Remove schedule?', sch.isRestDay ? 'Rest day' : (sch.routineName ?? sch.label ?? 'Workout'), [
                    { text: 'Cancel', style: 'cancel' },
                    {
                      text: 'Remove', style: 'destructive',
                      onPress: async () => {
                        try { await deleteSchedule(token, sch.id); load(); }
                        catch { Alert.alert('Error', 'Could not remove schedule.'); }
                      },
                    },
                  ])
                }
              >
                <Text style={{ color: '#C5896E', fontSize: fontSize.sm, paddingLeft: 12 }}>✕</Text>
              </TouchableOpacity>
            </View>
          ))}

          <TouchableOpacity
            onPress={() => setShowAddSchedule(true)}
            style={[s.addBtn, { borderColor: c.accent }]}
          >
            <Text style={{ color: c.accent, fontSize: fontSize.sm, fontWeight: '600' }}>+ Add schedule</Text>
          </TouchableOpacity>
        </View>

        {/* ── Meal Planning ── */}
        <View style={[s.card, { backgroundColor: c.card, borderColor: c.border }]}>
          {/* Header with week nav */}
          <View style={s.cardHeader}>
            <Text style={[s.sectionTitle, { color: c.text }]}>Meal Planning</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <TouchableOpacity onPress={() => mpShiftWeek(-1)}>
                <Text style={{ color: c.muted, fontSize: 18, paddingHorizontal: 4 }}>‹</Text>
              </TouchableOpacity>
              <Text style={{ color: c.muted, fontSize: fontSize.xs }}>
                {mealPlan ? `${mealPlan.days[0].date.slice(5).replace('-', '/')} – ${mealPlan.days[6].date.slice(5).replace('-', '/')}` : '…'}
              </Text>
              <TouchableOpacity onPress={() => mpShiftWeek(1)}>
                <Text style={{ color: c.muted, fontSize: 18, paddingHorizontal: 4 }}>›</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Day strip */}
          <View style={{ flexDirection: 'row', gap: 4 }}>
            {(mealPlan?.days ?? []).map((day) => {
              const isSel = day.date === mpSelDate;
              const isToday = day.date === today;
              const hasMeals = Object.values(day.meals).some(m => m.length > 0);
              return (
                <TouchableOpacity key={day.date} onPress={() => setMpSelDate(day.date)}
                  style={{ flex: 1, alignItems: 'center', gap: 2, paddingVertical: 6, borderRadius: 10,
                    backgroundColor: isSel ? `${c.accent}22` : 'transparent',
                    borderWidth: isSel ? 1 : 0, borderColor: c.accent }}>
                  <Text style={{ color: isSel ? c.accent : c.muted, fontSize: fontSize.xs }}>{day.dayLabel.slice(0, 1)}</Text>
                  <Text style={{ color: isSel ? c.accent : isToday ? c.text : c.muted, fontSize: fontSize.sm, fontWeight: '600' }}>
                    {new Date(day.date + 'T12:00:00').getDate()}
                  </Text>
                  <View style={{ width: 5, height: 5, borderRadius: 2.5, backgroundColor: hasMeals ? c.accent : 'transparent' }} />
                </TouchableOpacity>
              );
            })}
          </View>

          {mpLoading ? (
            <ActivityIndicator color={c.accent} style={{ marginVertical: 12 }} />
          ) : mealPlan ? (() => {
            const selDay = mealPlan.days.find(d => d.date === mpSelDate);
            if (!selDay) return null;
            const hasAny = Object.values(selDay.meals).some(m => m.length > 0);
            return (
              <>
                {hasAny && (
                  <View style={{ flexDirection: 'row', gap: 12, flexWrap: 'wrap' }}>
                    <Text style={{ color: c.muted, fontSize: fontSize.xs }}>
                      <Text style={{ color: c.text, fontWeight: '600' }}>{Math.round(selDay.totals.calories)}</Text> kcal
                    </Text>
                    <Text style={{ color: c.muted, fontSize: fontSize.xs }}>
                      <Text style={{ color: c.text, fontWeight: '600' }}>{selDay.totals.proteinG.toFixed(0)}g</Text> protein
                    </Text>
                    <Text style={{ color: c.muted, fontSize: fontSize.xs }}>
                      <Text style={{ color: c.text, fontWeight: '600' }}>{selDay.totals.carbsG.toFixed(0)}g</Text> carbs
                    </Text>
                  </View>
                )}
                {MEAL_ORDER.map((meal) => {
                  const entries = selDay.meals[meal];
                  return (
                    <View key={meal}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                        <Text style={{ color: c.muted, fontSize: fontSize.xs, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                          {MEAL_LABELS[meal]}
                        </Text>
                        <TouchableOpacity onPress={() => setMpPicker({ meal, date: mpSelDate })}>
                          <Text style={{ color: c.accent, fontSize: fontSize.sm, fontWeight: '600' }}>+ Add</Text>
                        </TouchableOpacity>
                      </View>
                      {entries.length === 0 ? (
                        <Text style={{ color: c.muted, fontSize: fontSize.xs, fontStyle: 'italic' }}>Nothing planned</Text>
                      ) : (
                        entries.map((entry: MealPlanEntry) => (
                          <View key={entry.id} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 5,
                            borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.border }}>
                            <View style={{ flex: 1, marginRight: 8 }}>
                              <Text style={{ color: c.text, fontSize: fontSize.sm }} numberOfLines={1}>{entry.name}</Text>
                              <Text style={{ color: c.muted, fontSize: fontSize.xs }}>
                                {Math.round(entry.calories)} kcal · {entry.proteinG.toFixed(0)}g P · {entry.carbsG.toFixed(0)}g C
                              </Text>
                            </View>
                            <TouchableOpacity onPress={async () => {
                              await deleteMealPlanEntry(token, entry.id).catch(() => null);
                              loadMealPlan(mpWeekStart);
                            }}>
                              <Text style={{ color: c.muted, fontSize: 18 }}>×</Text>
                            </TouchableOpacity>
                          </View>
                        ))
                      )}
                    </View>
                  );
                })}
              </>
            );
          })() : null}

          {/* Template controls */}
          <View style={{ borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.border, paddingTop: 12, gap: 8 }}>
            <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
              <TouchableOpacity onPress={() => setMpSaveOpen(!mpSaveOpen)}
                style={{ paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, borderWidth: 1, borderColor: c.border }}>
                <Text style={{ color: c.muted, fontSize: fontSize.xs }}>Save as template</Text>
              </TouchableOpacity>
              {mpTemplates.length > 0 && (
                <TouchableOpacity onPress={() => {
                  Alert.alert('Apply template', 'Which template?',
                    mpTemplates.map(t => ({
                      text: t.name,
                      onPress: async () => {
                        await applyMealPlanTemplate(token, t.id, mpWeekStart).catch(() => null);
                        loadMealPlan(mpWeekStart);
                      },
                    })).concat([{ text: 'Cancel', onPress: async () => {} }])
                  );
                }}
                style={{ paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, borderWidth: 1, borderColor: c.accent }}>
                  <Text style={{ color: c.accent, fontSize: fontSize.xs, fontWeight: '600' }}>Apply template</Text>
                </TouchableOpacity>
              )}
            </View>

            {mpSaveOpen && (
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <TextInput
                  style={[{ flex: 1, borderWidth: 1, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8, fontSize: fontSize.sm },
                    { color: c.text, borderColor: c.border, backgroundColor: c.bg }]}
                  value={mpTplName} onChangeText={setMpTplName}
                  placeholder="Template name…" placeholderTextColor={c.muted}
                />
                <TouchableOpacity
                  onPress={async () => {
                    if (!mpTplName.trim()) return;
                    await saveMealPlanTemplate(token, mpTplName.trim(), mpWeekStart).catch(() => null);
                    setMpTplName(''); setMpSaveOpen(false);
                    setMpTemplates(await getMealPlanTemplates(token).catch(() => []));
                  }}
                  disabled={!mpTplName.trim()}
                  style={{ paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8,
                    backgroundColor: c.accent, opacity: mpTplName.trim() ? 1 : 0.4 }}>
                  <Text style={{ color: '#000', fontWeight: '700', fontSize: fontSize.sm }}>Save</Text>
                </TouchableOpacity>
              </View>
            )}

            {mpTemplates.length > 0 && (
              <View style={{ gap: 4 }}>
                {mpTemplates.map(t => (
                  <View key={t.id} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                    <Text style={{ color: c.muted, fontSize: fontSize.xs }}>{t.name}</Text>
                    <TouchableOpacity onPress={async () => {
                      await deleteMealPlanTemplate(token, t.id).catch(() => null);
                      setMpTemplates(await getMealPlanTemplates(token).catch(() => []));
                    }}>
                      <Text style={{ color: c.muted, fontSize: 16 }}>×</Text>
                    </TouchableOpacity>
                  </View>
                ))}
              </View>
            )}
          </View>
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

      {showAddSchedule && (
        <AddScheduleModal
          token={token}
          routinesList={routinesList}
          c={c}
          onClose={() => setShowAddSchedule(false)}
          onSaved={load}
        />
      )}

      {showImportProgram && (
        <ImportProgramModal
          token={token}
          templates={templates}
          routinesList={routinesList}
          c={c}
          onClose={() => setShowImportProgram(false)}
          onSaved={load}
        />
      )}

      {mpPicker && (
        <MobileMealPlanPickerModal
          token={token}
          meal={mpPicker.meal}
          date={mpPicker.date}
          c={c}
          onClose={() => setMpPicker(null)}
          onAdded={() => { setMpPicker(null); loadMealPlan(mpWeekStart); }}
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
