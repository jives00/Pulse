import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator, Alert, Modal, KeyboardAvoidingView, Platform,
  ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View,
} from 'react-native';
import {
  getSchedules, getUpcomingSchedule, createSchedule, updateSchedule, deleteSchedule,
  getRoutines, getExercises,
  searchFoods, searchRecipes,
  getGoalCheckpoints, createGoalCheckpoint, updateGoalCheckpoint, deleteGoalCheckpoint,
  getMealSchedules, getMealScheduleUpcoming, createMealSchedule, updateMealSchedule, deleteMealSchedule,
  getNutritionSchedules, getNutritionScheduleUpcoming, createNutritionSchedule, updateNutritionSchedule, deleteNutritionSchedule,
  getDailyNutritionOverrides, upsertDailyNutritionOverride, deleteDailyNutritionOverride,
  type WorkoutSchedule, type UpcomingSession, type RecurrenceType,
  type RoutineSummary, type Exercise, type GoalCheckpoint,
  type MealSchedule, type MealScheduleEvent, type MealRecurrenceType, type MealSlot,
  type NutritionSchedule, type NutritionScheduleEvent, type DailyNutritionOverride,
  type Food, type RecipeSearchResult,
} from '../api/client';
import { localDateStr } from '../../../../packages/api-client/src/index';
import { useAuthStore } from '../store/auth';
import { fontSize, type Colors } from '../theme';
import { useColors } from '../hooks/useColors';

// ─── Constants ────────────────────────────────────────────────────────────────

const GLASS_OZ = 8;
const DOW_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const MEAL_ORDER: MealSlot[] = ['breakfast', 'lunch', 'dinner', 'snack'];
const MEAL_LABELS: Record<MealSlot, string> = { breakfast: 'Breakfast', lunch: 'Lunch', dinner: 'Dinner', snack: 'Snack' };

const METRIC_CONFIG: Record<string, { label: string; unit: string }> = {
  weight:      { label: 'Weight',      unit: 'lbs' },
  waist:       { label: 'Waist',       unit: 'in'  },
  bicep:       { label: 'Bicep',       unit: 'in'  },
  chest:       { label: 'Chest',       unit: 'in'  },
  hips:        { label: 'Hips',        unit: 'in'  },
  body_fat:    { label: 'Body Fat',    unit: '%'   },
  muscle_mass: { label: 'Muscle Mass', unit: 'lbs' },
  water_pct:   { label: 'Water Mass',  unit: '%'   },
};
const ALL_METRICS = Object.keys(METRIC_CONFIG);

const REC_OPTS_MEAL: { value: MealRecurrenceType; label: string }[] = [
  { value: 'once',            label: 'Once'         },
  { value: 'daily',           label: 'Daily'        },
  { value: 'every_other_day', label: 'Every other'  },
  { value: 'days_of_week',    label: 'Days of week' },
  { value: 'every_x_days',    label: 'Every X days' },
  { value: 'day_of_month',    label: 'Day of month' },
];

const REC_OPTS_WORKOUT: { value: AnyRec; label: string }[] = [
  { value: 'once',            label: 'Once'         },
  { value: 'daily',           label: 'Daily'        },
  { value: 'every_other_day', label: 'Every other'  },
  { value: 'days_of_week',    label: 'Days of week' },
  { value: 'every_x_days',    label: 'Every X days' },
  { value: 'day_of_month',    label: 'Day of month' },
  { value: 'custom_cycle',    label: 'Custom cycle' },
];

function todayStr() { return new Date().toISOString().slice(0, 10); }
function addDays(dateStr: string, n: number): string {
  const d = new Date(dateStr + 'T12:00:00');
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}
function fmtDate(dateStr: string): string {
  return new Date(dateStr + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });
}
function dayOfWeekIndex(dateStr: string): number {
  const dow = new Date(dateStr + 'T12:00:00').getDay(); // 0=Sun
  return dow === 0 ? 6 : dow - 1; // convert to 0=Mon
}

// ─── Recurrence helpers ────────────────────────────────────────────────────────

type AnyRec = RecurrenceType | MealRecurrenceType;

interface RecState {
  recType: AnyRec; setRecType: (v: AnyRec) => void;
  dowDays: number[]; setDowDays: (fn: (p: number[]) => number[]) => void;
  xInterval: string; setXInterval: (v: string) => void;
  domType: 'specific_dates' | 'nth_weekday'; setDomType: (v: 'specific_dates' | 'nth_weekday') => void;
  domDates: string; setDomDates: (v: string) => void;
  domN: string; setDomN: (v: string) => void;
  domWeekday: string; setDomWeekday: (v: string) => void;
  startDate: string; setStartDate: (v: string) => void;
  endDate: string; setEndDate: (v: string) => void;
}

function buildRecConfig(r: RecState | (RecState & { cycleItems?: { type: 'exercise' | 'routine'; id: number }[]; restFrequency?: string; alwaysRestWeekends?: boolean })) {
  const { recType: rt, dowDays, xInterval, domType, domDates, domN, domWeekday } = r;
  if (rt === 'once' || rt === 'daily' || rt === 'every_other_day') return {};
  if (rt === 'days_of_week') return { days: dowDays };
  if (rt === 'every_x_days') return { interval: Number(xInterval) || 3 };
  if (rt === 'day_of_month') {
    if (domType === 'specific_dates') return { type: 'specific_dates', dates: domDates.split(',').map(d => Number(d.trim())).filter(d => d >= 1 && d <= 31) };
    return { type: 'nth_weekday', n: Number(domN) || 1, weekday: Number(domWeekday) || 0 };
  }
  if (rt === 'custom_cycle') {
    const cycleItems = (r as any).cycleItems || [];
    const cycleDays = (r as any).cycleDays || [];
    const restFrequency = Number((r as any).restFrequency) || 1;
    const alwaysRestWeekends = (r as any).alwaysRestWeekends !== false;
    return { items: cycleItems, days: cycleDays, restFrequency, alwaysRestWeekends };
  }
  return {};
}

function parseRecConfig(rt: AnyRec, cfg: any): {
  recType: AnyRec; dowDays: number[]; xInterval: string;
  domType: 'specific_dates' | 'nth_weekday'; domDates: string; domN: string; domWeekday: string;
} {
  const out = { recType: rt, dowDays: [] as number[], xInterval: '3', domType: 'specific_dates' as 'specific_dates' | 'nth_weekday', domDates: '1, 15', domN: '1', domWeekday: '0' };
  if (rt === 'days_of_week') out.dowDays = cfg?.days ?? [];
  if (rt === 'every_x_days') out.xInterval = String(cfg?.interval ?? 3);
  if (rt === 'day_of_month') {
    if (cfg?.type === 'nth_weekday') { out.domType = 'nth_weekday'; out.domN = String(cfg?.n ?? 1); out.domWeekday = String(cfg?.weekday ?? 0); }
    else { out.domDates = (cfg?.dates ?? []).join(', '); }
  }
  return out;
}

function RecurrenceForm({ r, c, s, opts }: { r: RecState; c: Colors; s: ReturnType<typeof makeStyles>; opts: { value: AnyRec; label: string }[] }) {
  return (
    <>
      <Text style={[s.fieldLabel, { color: c.muted, marginBottom: 4 }]}>Repeats</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 8 }}>
        {opts.map(({ value, label }) => (
          <TouchableOpacity key={value} onPress={() => r.setRecType(value)}
            style={{ marginRight: 6, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, backgroundColor: r.recType === value ? c.accent : c.border }}>
            <Text style={{ color: r.recType === value ? '#000' : c.text, fontSize: fontSize.xs }}>{label}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {r.recType !== 'once' && (
        <>
          {r.recType === 'days_of_week' && (
            <View style={{ flexDirection: 'row', gap: 4, marginBottom: 8 }}>
              {DOW_LABELS.map((lbl, i) => (
                <TouchableOpacity key={i} onPress={() => r.setDowDays(prev => prev.includes(i) ? prev.filter(d => d !== i) : [...prev, i])}
                  style={{ flex: 1, paddingVertical: 8, borderRadius: 8, alignItems: 'center', backgroundColor: r.dowDays.includes(i) ? c.accent : c.border }}>
                  <Text style={{ color: r.dowDays.includes(i) ? '#000' : c.text, fontSize: fontSize.xs }}>{lbl.slice(0, 1)}</Text>
                </TouchableOpacity>
              ))}
            </View>
          )}
          {r.recType === 'every_x_days' && (
            <TextInput style={[s.input, { color: c.text, borderColor: c.border, backgroundColor: c.bg, marginBottom: 8 }]}
              value={r.xInterval} onChangeText={r.setXInterval} keyboardType="numeric" placeholder="Interval (days)" placeholderTextColor={c.muted} />
          )}
          {r.recType === 'day_of_month' && (
            <>
              <View style={{ flexDirection: 'row', gap: 6, marginBottom: 8 }}>
                {(['specific_dates', 'nth_weekday'] as const).map(dt => (
                  <TouchableOpacity key={dt} onPress={() => r.setDomType(dt)}
                    style={{ flex: 1, paddingVertical: 8, borderRadius: 8, alignItems: 'center', backgroundColor: r.domType === dt ? c.accent : c.border }}>
                    <Text style={{ color: r.domType === dt ? '#000' : c.text, fontSize: fontSize.xs }}>{dt === 'specific_dates' ? 'Dates' : 'Nth weekday'}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              {r.domType === 'specific_dates' ? (
                <TextInput style={[s.input, { color: c.text, borderColor: c.border, backgroundColor: c.bg, marginBottom: 8 }]}
                  value={r.domDates} onChangeText={r.setDomDates} placeholder="e.g. 1, 15" placeholderTextColor={c.muted} />
              ) : (
                <View style={{ flexDirection: 'row', gap: 8, marginBottom: 8 }}>
                  <TextInput style={[s.input, { flex: 1, color: c.text, borderColor: c.border, backgroundColor: c.bg }]}
                    value={r.domN} onChangeText={r.setDomN} keyboardType="numeric" placeholder="Which (1-4)" placeholderTextColor={c.muted} />
                  <TextInput style={[s.input, { flex: 1, color: c.text, borderColor: c.border, backgroundColor: c.bg }]}
                    value={r.domWeekday} onChangeText={r.setDomWeekday} keyboardType="numeric" placeholder="0=Mon…6=Sun" placeholderTextColor={c.muted} />
                </View>
              )}
            </>
          )}
          {r.recType === 'custom_cycle' && (
            <View style={{ marginBottom: 8 }}>
              <Text style={[s.fieldLabel, { color: c.muted, marginBottom: 4 }]}>Exercise rotation</Text>
              <Text style={{ color: c.muted, fontSize: fontSize.xs, marginBottom: 4 }}>(Set in edit modal)</Text>
            </View>
          )}
          <View style={{ flexDirection: 'row', gap: 8, marginBottom: 8 }}>
            <TextInput style={[s.input, { flex: 1, color: c.text, borderColor: c.border, backgroundColor: c.bg }]}
              value={r.startDate} onChangeText={r.setStartDate} placeholder="Start (YYYY-MM-DD)" placeholderTextColor={c.muted} />
            <TextInput style={[s.input, { flex: 1, color: c.text, borderColor: c.border, backgroundColor: c.bg }]}
              value={r.endDate} onChangeText={r.setEndDate} placeholder="End (optional)" placeholderTextColor={c.muted} />
          </View>
        </>
      )}
      {r.recType === 'once' && (
        <TextInput style={[s.input, { color: c.text, borderColor: c.border, backgroundColor: c.bg, marginBottom: 8 }]}
          value={r.startDate} onChangeText={r.setStartDate} placeholder="Date (YYYY-MM-DD)" placeholderTextColor={c.muted} />
      )}
    </>
  );
}

// ─── WorkoutTabContent ─────────────────────────────────────────────────────────

function WorkoutTabContent({ date, token, routinesList, exercisesList, workoutSchedules, sessions, c, s, onSaved }: {
  date: string; token: string; routinesList: RoutineSummary[]; exercisesList: Exercise[];
  workoutSchedules: WorkoutSchedule[]; sessions: UpcomingSession[];
  c: Colors; s: ReturnType<typeof makeStyles>; onSaved: () => void;
}) {
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [type, setType] = useState<'routine' | 'exercise' | 'rest'>('routine');
  const [routineId, setRoutineId] = useState<number | null>(null);
  const [exerciseId, setExerciseId] = useState<number | null>(null);
  const [showRoutinePicker, setShowRoutinePicker] = useState(false);
  const [showExPicker, setShowExPicker] = useState(false);
  const [exSearch, setExSearch] = useState('');
  const [label, setLabel] = useState('');
  const [recType, setRecType] = useState<AnyRec>('once');
  const [dowDays, setDowDays] = useState<number[]>([]);
  const [xInterval, setXInterval] = useState('3');
  const [domType, setDomType] = useState<'specific_dates' | 'nth_weekday'>('specific_dates');
  const [domDates, setDomDates] = useState('1, 15');
  const [domN, setDomN] = useState('1');
  const [domWeekday, setDomWeekday] = useState('0');
  const [startDate, setStartDate] = useState(date);
  const [endDate, setEndDate] = useState('');
  const [saving, setSaving] = useState(false);

  // Custom cycle state
  const [cycleItems, setCycleItems] = useState<{ type: 'exercise' | 'routine'; id: number }[]>([]);
  const [cycleItemType, setCycleItemType] = useState<'exercise' | 'routine'>('exercise');
  const [cycleDays, setCycleDays] = useState<number[]>([0, 1, 2, 4]); // Mon, Tue, Wed, Fri
  const [restFrequency, setRestFrequency] = useState('3');
  const [alwaysRestWeekends, setAlwaysRestWeekends] = useState(false);
  const [showCycleEditor, setShowCycleEditor] = useState(false);
  const [showCycleItemPicker, setShowCycleItemPicker] = useState(false);

  const recState: RecState & { cycleItems?: { type: 'exercise' | 'routine'; id: number }[]; cycleDays?: number[]; restFrequency?: string; alwaysRestWeekends?: boolean } = {
    recType, setRecType, dowDays, setDowDays, xInterval, setXInterval,
    domType, setDomType, domDates, setDomDates, domN, setDomN, domWeekday, setDomWeekday,
    startDate, setStartDate, endDate, setEndDate,
    cycleItems, cycleDays, restFrequency, alwaysRestWeekends
  };

  const isRest = type === 'rest';
  const isCustomCycle = recType === 'custom_cycle';
  const canSave = isRest || isCustomCycle || (type === 'routine' ? routineId !== null : exerciseId !== null);
  const showForm = adding || editingId !== null;

  function startEdit(sch: WorkoutSchedule) {
    setEditingId(sch.id);
    setAdding(false);
    setType(sch.isRestDay ? 'rest' : sch.routineId ? 'routine' : 'exercise');
    setRoutineId(sch.routineId ?? null);
    setExerciseId(sch.exerciseId ?? null);
    setLabel(sch.label ?? '');
    const p = parseRecConfig(sch.recurrenceType, sch.recurrenceConfig);
    setRecType(p.recType); setDowDays(p.dowDays); setXInterval(p.xInterval);
    setDomType(p.domType); setDomDates(p.domDates); setDomN(p.domN); setDomWeekday(p.domWeekday);
    setStartDate(sch.startDate); setEndDate(sch.endDate ?? '');
    if (sch.recurrenceType === 'custom_cycle') {
      setCycleItems(sch.recurrenceConfig?.items ?? []);
      setCycleDays(sch.recurrenceConfig?.days ?? [0,1,2,4]);
      setRestFrequency(String(sch.recurrenceConfig?.restFrequency ?? 3));
      setAlwaysRestWeekends(sch.recurrenceConfig?.alwaysRestWeekends !== false);
    }
    setShowRoutinePicker(false); setShowExPicker(false);
  }

  async function handleSave() {
    if (!canSave) return;
    if (isCustomCycle && cycleItems.length === 0) {
      Alert.alert('Error', 'Please add at least one item to the cycle.');
      return;
    }
    setSaving(true);
    try {
      const once = recType === 'once';
      const apiRecType: RecurrenceType = once ? 'days_of_week' : recType as RecurrenceType;
      const config = once
        ? { days: [dayOfWeekIndex(startDate)] }
        : buildRecConfig(recState);

      const payload = {
        routineId:  isRest ? null : (type === 'routine' ? routineId : null),
        exerciseId: isRest ? null : (type === 'exercise' ? exerciseId : null),
        label: label.trim() || undefined,
        isRestDay: isRest,
        recurrenceType: apiRecType,
        recurrenceConfig: config,
        startDate,
        endDate: once ? startDate : (endDate.trim() || null),
      };

      if (editingId !== null) {
        await updateSchedule(token, editingId, payload);
      } else {
        await createSchedule(token, payload);
      }
      onSaved(); setAdding(false); setEditingId(null);
    } catch { Alert.alert('Error', 'Could not save schedule.'); } finally { setSaving(false); }
  }

  const filteredEx = exSearch.trim()
    ? exercisesList.filter(e => e.name.toLowerCase().includes(exSearch.toLowerCase()))
    : exercisesList.slice(0, 30);

  const selectedRoutine = routinesList.find(r => r.id === routineId);
  const selectedEx = exercisesList.find(e => e.id === exerciseId);

  return (
    <View style={{ gap: 8 }}>
      {sessions.length === 0 && !adding && (
        <Text style={[s.emptyNote, { color: c.muted }]}>No workout scheduled for this day.</Text>
      )}
      {sessions.map(ev => {
        const sch = workoutSchedules.find(w => w.id === ev.scheduleId);
        return (
          <View key={ev.scheduleId} style={[s.listRow, { borderTopColor: c.border }]}>
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={{ color: c.text, fontSize: fontSize.sm }}>
                {ev.isRestDay ? 'Rest day' : (ev.exerciseName ?? ev.routineName ?? 'Workout')}
              </Text>
              {sch && <Text style={{ color: c.muted, fontSize: fontSize.xs }}>{sch.recurrenceDescription}</Text>}
            </View>
            {sch && (
              <>
                <TouchableOpacity onPress={() => startEdit(sch)} style={{ paddingLeft: 12 }}>
                  <Text style={{ color: c.accent, fontSize: fontSize.sm }}>Edit</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => Alert.alert('Remove schedule?', '', [
                  { text: 'Cancel', style: 'cancel' },
                  { text: 'Remove', style: 'destructive', onPress: async () => {
                    try { await deleteSchedule(token, sch.id); onSaved(); } catch { Alert.alert('Error'); }
                  }},
                ])}><Text style={{ color: '#C5896E', fontSize: fontSize.sm, paddingLeft: 12 }}>✕</Text></TouchableOpacity>
              </>
            )}
          </View>
        );
      })}

      {showForm ? (
        <View style={{ gap: 8, paddingTop: 12, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.border }}>
          {editingId !== null && (
            <Text style={{ color: c.muted, fontSize: fontSize.xs, fontStyle: 'italic' }}>Editing schedule</Text>
          )}
          {/* Type selector */}
          <View style={{ flexDirection: 'row', gap: 6 }}>
            {(['routine', 'exercise', 'rest'] as const).map(t => (
              <TouchableOpacity key={t} onPress={() => { setType(t); setRoutineId(null); setExerciseId(null); setShowRoutinePicker(false); setShowExPicker(false); }}
                style={{ flex: 1, paddingVertical: 8, borderRadius: 8, alignItems: 'center', backgroundColor: type === t ? c.accent : c.border }}>
                <Text style={{ color: type === t ? '#000' : c.text, fontSize: fontSize.xs, fontWeight: '600' }}>
                  {t === 'rest' ? 'Rest day' : t === 'routine' ? 'Routine' : 'Exercise'}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Routine picker */}
          {type === 'routine' && (
            <>
              <TouchableOpacity onPress={() => setShowRoutinePicker(!showRoutinePicker)}
                style={[s.input, { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderColor: c.border, backgroundColor: c.bg }]}>
                <Text style={{ color: selectedRoutine ? c.text : c.muted, fontSize: fontSize.sm }}>
                  {selectedRoutine ? selectedRoutine.name : 'Select routine…'}
                </Text>
                <Text style={{ color: c.muted }}>{showRoutinePicker ? '▲' : '▼'}</Text>
              </TouchableOpacity>
              {showRoutinePicker && (
                <View style={{ borderWidth: 1, borderColor: c.border, borderRadius: 8, maxHeight: 160 }}>
                  <ScrollView keyboardShouldPersistTaps="handled">
                    {routinesList.map(r => (
                      <TouchableOpacity key={r.id} onPress={() => { setRoutineId(r.id); setShowRoutinePicker(false); }}
                        style={[s.pickerRow, { borderColor: c.border, paddingHorizontal: 12 }, routineId === r.id && { backgroundColor: `${c.accent}22` }]}>
                        <Text style={{ color: c.text, fontSize: fontSize.sm }}>{r.name}</Text>
                        {routineId === r.id && <Text style={{ color: c.accent }}>✓</Text>}
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                </View>
              )}
            </>
          )}

          {/* Exercise picker */}
          {type === 'exercise' && (
            <>
              <TouchableOpacity onPress={() => setShowExPicker(!showExPicker)}
                style={[s.input, { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderColor: c.border, backgroundColor: c.bg }]}>
                <Text style={{ color: selectedEx ? c.text : c.muted, fontSize: fontSize.sm }}>
                  {selectedEx ? selectedEx.name : 'Select exercise…'}
                </Text>
                <Text style={{ color: c.muted }}>{showExPicker ? '▲' : '▼'}</Text>
              </TouchableOpacity>
              {showExPicker && (
                <View style={{ borderWidth: 1, borderColor: c.border, borderRadius: 8, maxHeight: 200 }}>
                  <TextInput style={[s.input, { color: c.text, borderColor: 'transparent', backgroundColor: c.bg, borderBottomWidth: 1, borderBottomColor: c.border, borderRadius: 0 }]}
                    value={exSearch} onChangeText={setExSearch} placeholder="Search exercises…" placeholderTextColor={c.muted} />
                  <ScrollView keyboardShouldPersistTaps="handled" style={{ maxHeight: 150 }}>
                    {filteredEx.map(ex => (
                      <TouchableOpacity key={ex.id} onPress={() => { setExerciseId(ex.id); setShowExPicker(false); setExSearch(''); }}
                        style={[s.pickerRow, { borderColor: c.border, paddingHorizontal: 12 }, exerciseId === ex.id && { backgroundColor: `${c.accent}22` }]}>
                        <View style={{ flex: 1 }}>
                          <Text style={{ color: c.text, fontSize: fontSize.sm }}>{ex.name}</Text>
                          <Text style={{ color: c.muted, fontSize: fontSize.xs }}>{ex.category}</Text>
                        </View>
                        {exerciseId === ex.id && <Text style={{ color: c.accent }}>✓</Text>}
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                </View>
              )}
            </>
          )}

          <TextInput style={[s.input, { color: c.text, borderColor: c.border, backgroundColor: c.bg }]}
            value={label} onChangeText={setLabel} placeholder="Label (optional, e.g. Morning run)" placeholderTextColor={c.muted} />

          <RecurrenceForm r={recState} c={c} s={s} opts={REC_OPTS_WORKOUT} />

          {recType === 'custom_cycle' && (
            <View style={{ gap: 8, paddingTop: 8, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.border }}>
              <TouchableOpacity onPress={() => setShowCycleEditor(!showCycleEditor)}
                style={[s.input, { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderColor: c.border, backgroundColor: c.bg }]}>
                <Text style={{ color: cycleItems.length > 0 ? c.text : c.muted, fontSize: fontSize.sm }}>
                  {cycleItems.length > 0 ? `${cycleItems.length} items` : 'Configure cycle…'}
                </Text>
                <Text style={{ color: c.muted }}>{showCycleEditor ? '▲' : '▼'}</Text>
              </TouchableOpacity>

              {showCycleEditor && (
                <View style={{ gap: 8 }}>
                  <View>
                    <Text style={[s.fieldLabel, { color: c.muted, marginBottom: 4 }]}>Rotation items</Text>
                    {cycleItems.map((item, idx) => {
                      const name = item.type === 'exercise'
                        ? exercisesList.find(e => e.id === item.id)?.name
                        : routinesList.find(r => r.id === item.id)?.name;
                      return (
                        <View key={idx} style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 8, paddingVertical: 6, backgroundColor: `${c.accent}15`, marginBottom: 4, borderRadius: 6 }}>
                          <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                            <Text style={{ color: c.muted, fontSize: fontSize.xs }}>{item.type === 'routine' ? 'R' : 'E'}</Text>
                            <Text style={{ color: c.text, fontSize: fontSize.sm }}>{idx + 1}. {name}</Text>
                          </View>
                          <TouchableOpacity onPress={() => setCycleItems(cycleItems.filter((_, i) => i !== idx))}>
                            <Text style={{ color: '#C5896E', fontSize: fontSize.sm, paddingHorizontal: 4 }}>✕</Text>
                          </TouchableOpacity>
                        </View>
                      );
                    })}

                    <View style={{ flexDirection: 'row', gap: 6, marginBottom: 8 }}>
                      {(['exercise', 'routine'] as const).map(t => (
                        <TouchableOpacity key={t} onPress={() => setCycleItemType(t)}
                          style={{ flex: 1, paddingVertical: 8, borderRadius: 6, alignItems: 'center', backgroundColor: cycleItemType === t ? c.accent : c.border }}>
                          <Text style={{ color: cycleItemType === t ? '#000' : c.text, fontSize: fontSize.xs, fontWeight: '600' }}>
                            {t === 'routine' ? 'Routine' : 'Exercise'}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>

                    {cycleItemType === 'exercise' ? (
                      <>
                        <TouchableOpacity onPress={() => setShowCycleItemPicker(!showCycleItemPicker)}
                          style={[s.input, { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderColor: c.border, backgroundColor: c.bg, marginBottom: 8 }]}>
                          <Text style={{ color: c.muted, fontSize: fontSize.sm }}>+ Add exercise…</Text>
                          <Text style={{ color: c.muted }}>{showCycleItemPicker ? '▲' : '▼'}</Text>
                        </TouchableOpacity>
                        {showCycleItemPicker && (
                          <View style={{ borderWidth: 1, borderColor: c.border, borderRadius: 6, marginBottom: 8, maxHeight: 200 }}>
                            <ScrollView>
                              {exercisesList.map(ex => (
                                <TouchableOpacity key={ex.id}
                                  disabled={cycleItems.some(item => item.type === 'exercise' && item.id === ex.id)}
                                  onPress={() => { setCycleItems([...cycleItems, { type: 'exercise', id: ex.id }]); setShowCycleItemPicker(false); }}
                                  style={[s.pickerRow, { borderColor: c.border, paddingHorizontal: 12, opacity: cycleItems.some(item => item.type === 'exercise' && item.id === ex.id) ? 0.5 : 1 }]}>
                                  <Text style={{ color: cycleItems.some(item => item.type === 'exercise' && item.id === ex.id) ? c.muted : c.text, fontSize: fontSize.sm }}>{ex.name}</Text>
                                  {cycleItems.some(item => item.type === 'exercise' && item.id === ex.id) && <Text style={{ color: c.accent }}>✓</Text>}
                                </TouchableOpacity>
                              ))}
                            </ScrollView>
                          </View>
                        )}
                      </>
                    ) : (
                      <>
                        <TouchableOpacity onPress={() => setShowCycleItemPicker(!showCycleItemPicker)}
                          style={[s.input, { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderColor: c.border, backgroundColor: c.bg, marginBottom: 8 }]}>
                          <Text style={{ color: c.muted, fontSize: fontSize.sm }}>+ Add routine…</Text>
                          <Text style={{ color: c.muted }}>{showCycleItemPicker ? '▲' : '▼'}</Text>
                        </TouchableOpacity>
                        {showCycleItemPicker && (
                          <View style={{ borderWidth: 1, borderColor: c.border, borderRadius: 6, marginBottom: 8, maxHeight: 200 }}>
                            <ScrollView>
                              {routinesList.map(r => (
                                <TouchableOpacity key={r.id}
                                  disabled={cycleItems.some(item => item.type === 'routine' && item.id === r.id)}
                                  onPress={() => { setCycleItems([...cycleItems, { type: 'routine', id: r.id }]); setShowCycleItemPicker(false); }}
                                  style={[s.pickerRow, { borderColor: c.border, paddingHorizontal: 12, opacity: cycleItems.some(item => item.type === 'routine' && item.id === r.id) ? 0.5 : 1 }]}>
                                  <Text style={{ color: cycleItems.some(item => item.type === 'routine' && item.id === r.id) ? c.muted : c.text, fontSize: fontSize.sm }}>{r.name}</Text>
                                  {cycleItems.some(item => item.type === 'routine' && item.id === r.id) && <Text style={{ color: c.accent }}>✓</Text>}
                                </TouchableOpacity>
                              ))}
                            </ScrollView>
                          </View>
                        )}
                      </>
                    )}
                  </View>

                  <View>
                    <Text style={[s.fieldLabel, { color: c.muted, marginBottom: 6 }]}>Workout days</Text>
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 4 }}>
                      {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((day, idx) => (
                        <TouchableOpacity key={idx} onPress={() => setCycleDays(cycleDays.includes(idx) ? cycleDays.filter(d => d !== idx) : [...cycleDays, idx])}
                          style={{ paddingHorizontal: 10, paddingVertical: 6, borderRadius: 6, backgroundColor: cycleDays.includes(idx) ? c.accent : c.border }}>
                          <Text style={{ color: cycleDays.includes(idx) ? '#000' : c.text, fontSize: fontSize.xs, fontWeight: '600' }}>{day}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </View>

                  <View style={{ gap: 6 }}>
                    <View>
                      <Text style={[s.fieldLabel, { color: c.muted, marginBottom: 4 }]}>Rest after N items</Text>
                      <TextInput style={[s.input, { color: c.text, borderColor: c.border, backgroundColor: c.bg }]}
                        value={restFrequency} onChangeText={setRestFrequency} keyboardType="numeric" placeholder="e.g. 3" placeholderTextColor={c.muted} />
                    </View>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <TouchableOpacity onPress={() => setAlwaysRestWeekends(!alwaysRestWeekends)}
                        style={{ width: 20, height: 20, borderRadius: 4, borderWidth: 2, borderColor: c.border, justifyContent: 'center', alignItems: 'center', backgroundColor: alwaysRestWeekends ? c.accent : 'transparent' }}>
                        {alwaysRestWeekends && <Text style={{ color: '#000', fontSize: fontSize.xs, fontWeight: '700' }}>✓</Text>}
                      </TouchableOpacity>
                      <Text style={{ color: c.text, fontSize: fontSize.sm }}>Always rest weekends</Text>
                    </View>
                  </View>
                </View>
              )}
            </View>
          )}

          <View style={s.actions}>
            <TouchableOpacity onPress={() => { setAdding(false); setEditingId(null); }} style={s.cancelBtn}>
              <Text style={{ color: c.muted, fontSize: fontSize.sm }}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={handleSave} disabled={saving || !canSave}
              style={[s.saveBtn, { backgroundColor: c.accent, opacity: (saving || !canSave) ? 0.5 : 1 }]}>
              <Text style={{ color: '#000', fontWeight: '700', fontSize: fontSize.sm }}>{saving ? 'Saving…' : editingId !== null ? 'Save' : 'Add'}</Text>
            </TouchableOpacity>
          </View>
        </View>
      ) : (
        <TouchableOpacity onPress={() => setAdding(true)} style={[s.addBtn, { borderColor: c.accent }]}>
          <Text style={{ color: c.accent, fontSize: fontSize.sm, fontWeight: '600' }}>+ Add workout</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

// ─── MealTabContent ────────────────────────────────────────────────────────────

function MealTabContent({ date, token, mealSchedules, events, c, s, onSaved }: {
  date: string; token: string; mealSchedules: MealSchedule[]; events: MealScheduleEvent[];
  c: Colors; s: ReturnType<typeof makeStyles>; onSaved: () => void;
}) {
  const [step, setStep] = useState<'list' | 'pick' | 'configure'>('list');
  const [editingId, setEditingId] = useState<number | null>(null);
  const [foodTab, setFoodTab] = useState<'food' | 'recipe' | 'custom'>('food');
  const [search, setSearch] = useState('');
  const [foodResults, setFoodResults] = useState<Food[]>([]);
  const [recipeResults, setRecipeResults] = useState<RecipeSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [selectedFood, setSelectedFood] = useState<Food | null>(null);
  const [selectedServingId, setSelectedServingId] = useState<number | null>(null);
  const [quantity, setQuantity] = useState('1');
  const [selectedRecipe, setSelectedRecipe] = useState<RecipeSearchResult | null>(null);
  const [recipeServings, setRecipeServings] = useState('1');
  const [customLabel, setCustomLabel] = useState('');
  const [mealSlot, setMealSlot] = useState<MealSlot | ''>('');
  const [calories, setCalories] = useState('');
  const [protein, setProtein] = useState('');
  const [carbs, setCarbs] = useState('');
  const [fat, setFat] = useState('');
  const [recType, setRecType] = useState<AnyRec>('once');
  const [dowDays, setDowDays] = useState<number[]>([]);
  const [xInterval, setXInterval] = useState('3');
  const [domType, setDomType] = useState<'specific_dates' | 'nth_weekday'>('specific_dates');
  const [domDates, setDomDates] = useState('1, 15');
  const [domN, setDomN] = useState('1');
  const [domWeekday, setDomWeekday] = useState('0');
  const [startDate, setStartDate] = useState(date);
  const [endDate, setEndDate] = useState('');
  const [saving, setSaving] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const recState: RecState = { recType, setRecType, dowDays, setDowDays, xInterval, setXInterval,
    domType, setDomType, domDates, setDomDates, domN, setDomN, domWeekday, setDomWeekday,
    startDate, setStartDate, endDate, setEndDate };

  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    if (!search.trim()) { setFoodResults([]); setRecipeResults([]); return; }
    timerRef.current = setTimeout(async () => {
      setSearching(true);
      try {
        if (foodTab === 'food') setFoodResults(await searchFoods(token, search));
        else setRecipeResults(await searchRecipes(token, search));
      } catch { /* ignore */ } finally { setSearching(false); }
    }, 400);
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [search, foodTab]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (selectedFood) {
      const def = selectedFood.servingSizes.find(ss => ss.isDefault) ?? selectedFood.servingSizes[0];
      setSelectedServingId(def?.id ?? null);
      if (def) computeFoodMacros(selectedFood, def.id, '1');
    }
  }, [selectedFood]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (selectedFood && selectedServingId) computeFoodMacros(selectedFood, selectedServingId, quantity);
  }, [quantity, selectedServingId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (selectedRecipe && recipeServings) {
      const totalServings = selectedRecipe.servings || 1;
      const factor = Number(recipeServings) / totalServings;
      setCalories(String(Math.round(Number(selectedRecipe.calories ?? 0) * factor * 100) / 100));
      setProtein(String(Math.round(Number(selectedRecipe.protein_g ?? 0) * factor * 100) / 100));
      setCarbs(String(Math.round(Number(selectedRecipe.carbs_g ?? 0) * factor * 100) / 100));
      setFat(String(Math.round(Number(selectedRecipe.fat_g ?? 0) * factor * 100) / 100));
    }
  }, [selectedRecipe, recipeServings]); // eslint-disable-line react-hooks/exhaustive-deps

  function computeFoodMacros(food: Food, servingId: number, qty: string) {
    const ss = food.servingSizes.find(s => s.id === servingId);
    if (!ss) return;
    const factor = (ss.grams * (Number(qty) || 1)) / 100;
    setCalories(String(Math.round(food.nutrition.calories * factor * 100) / 100));
    setProtein(String(Math.round(food.nutrition.protein * factor * 100) / 100));
    setCarbs(String(Math.round(food.nutrition.carbs * factor * 100) / 100));
    setFat(String(Math.round(food.nutrition.fat * factor * 100) / 100));
  }

  function startEdit(ev: MealScheduleEvent, sch: MealSchedule) {
    setEditingId(sch.id);
    setMealSlot((sch.mealSlot as MealSlot | '') ?? '');
    setCalories(ev.calories != null ? String(ev.calories) : '');
    setProtein(ev.proteinG != null ? String(ev.proteinG) : '');
    setCarbs(ev.carbsG != null ? String(ev.carbsG) : '');
    setFat(ev.fatG != null ? String(ev.fatG) : '');
    const p = parseRecConfig(sch.recurrenceType, sch.recurrenceConfig);
    setRecType(p.recType); setDowDays(p.dowDays); setXInterval(p.xInterval);
    setDomType(p.domType); setDomDates(p.domDates); setDomN(p.domN); setDomWeekday(p.domWeekday);
    setStartDate(sch.startDate); setEndDate(sch.endDate ?? '');
    setStep('configure');
  }

  async function handleSave() {
    setSaving(true);
    try {
      if (editingId !== null) {
        await updateMealSchedule(token, editingId, {
          mealSlot: mealSlot || null,
          recurrenceType: recType as MealRecurrenceType,
          recurrenceConfig: buildRecConfig(recState),
          startDate,
          endDate: recType === 'once' ? startDate : (endDate.trim() || null),
        });
      } else {
        const foodId = foodTab === 'food' ? selectedFood?.id ?? null : null;
        const srvId = foodTab === 'food' ? selectedServingId : null;
        const qty = foodTab === 'food' ? Number(quantity) || 1 : null;
        const recipeId = foodTab === 'recipe' ? selectedRecipe?.id ?? null : null;
        const recipeSrv = foodTab === 'recipe' ? Number(recipeServings) || 1 : null;
        const labelText = foodTab === 'custom' ? customLabel.trim() : (selectedFood?.name || selectedRecipe?.name || customLabel.trim());

        await createMealSchedule(token, {
          mealSlot: mealSlot || null,
          label: labelText,
          foodId, servingSizeId: srvId, quantity: qty,
          recipeId, recipeServings: recipeSrv,
          calories: calories !== '' ? Number(calories) : null,
          proteinG: protein !== '' ? Number(protein) : null,
          carbsG:   carbs  !== '' ? Number(carbs)  : null,
          fatG:     fat    !== '' ? Number(fat)    : null,
          recurrenceType: recType as MealRecurrenceType,
          recurrenceConfig: buildRecConfig(recState),
          startDate,
          endDate: recType === 'once' ? startDate : (endDate.trim() || null),
        });
      }
      onSaved(); setStep('list'); setEditingId(null);
    } catch { Alert.alert('Error', 'Could not save meal event.'); } finally { setSaving(false); }
  }

  if (step === 'list') {
    return (
      <View style={{ gap: 8 }}>
        {events.length === 0 && (
          <Text style={[s.emptyNote, { color: c.muted }]}>No meal events scheduled for this day.</Text>
        )}
        {events.map(ev => {
          const sch = mealSchedules.find(m => m.id === ev.scheduleId);
          return (
            <View key={`${ev.scheduleId}-${ev.date}`} style={[s.listRow, { borderTopColor: c.border }]}>
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={{ color: c.text, fontSize: fontSize.sm }}>{ev.label}</Text>
                {ev.mealSlot && <Text style={{ color: c.muted, fontSize: fontSize.xs, textTransform: 'capitalize' }}>{ev.mealSlot}</Text>}
                {ev.calories != null && (
                  <View>
                    <Text style={{ color: c.muted, fontSize: fontSize.xs }}>{Math.round(ev.calories)} kcal</Text>
                    <Text style={{ color: c.muted, fontSize: fontSize.xs }}>{(ev.proteinG ?? 0).toFixed(0)}g protein</Text>
                    <Text style={{ color: c.muted, fontSize: fontSize.xs }}>{(ev.carbsG ?? 0).toFixed(0)}g carbs</Text>
                    <Text style={{ color: c.muted, fontSize: fontSize.xs }}>{(ev.fatG ?? 0).toFixed(0)}g fat</Text>
                  </View>
                )}
                {sch && <Text style={{ color: c.muted, fontSize: fontSize.xs }}>{sch.recurrenceDescription}</Text>}
              </View>
              {sch && (
                <>
                  <TouchableOpacity onPress={() => startEdit(ev, sch)} style={{ paddingLeft: 12 }}>
                    <Text style={{ color: c.accent, fontSize: fontSize.sm }}>Edit</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => Alert.alert('Remove meal event?', ev.label, [
                    { text: 'Cancel', style: 'cancel' },
                    { text: 'Remove', style: 'destructive', onPress: async () => {
                      try { await deleteMealSchedule(token, sch.id); onSaved(); } catch { Alert.alert('Error'); }
                    }},
                  ])}><Text style={{ color: '#C5896E', fontSize: fontSize.sm, paddingLeft: 12 }}>✕</Text></TouchableOpacity>
                </>
              )}
            </View>
          );
        })}
        <TouchableOpacity onPress={() => setStep('pick')} style={[s.addBtn, { borderColor: c.accent }]}>
          <Text style={{ color: c.accent, fontSize: fontSize.sm, fontWeight: '600' }}>+ Add meal event</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (step === 'pick') {
    return (
      <View style={{ gap: 8 }}>
        <TouchableOpacity onPress={() => setStep('list')}><Text style={{ color: c.accent, fontSize: fontSize.sm }}>← Back</Text></TouchableOpacity>
        <View style={{ flexDirection: 'row', gap: 6 }}>
          {(['food', 'recipe', 'custom'] as const).map(t => (
            <TouchableOpacity key={t} onPress={() => { setFoodTab(t); setSearch(''); setSelectedFood(null); setSelectedRecipe(null); }}
              style={{ flex: 1, paddingVertical: 8, borderRadius: 8, alignItems: 'center', backgroundColor: foodTab === t ? c.accent : c.border }}>
              <Text style={{ color: foodTab === t ? '#000' : c.text, fontSize: fontSize.xs, fontWeight: '600' }}>
                {t === 'food' ? 'Food' : t === 'recipe' ? 'Recipe' : 'Custom'}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {foodTab !== 'custom' ? (
          <>
            <TextInput style={[s.input, { color: c.text, borderColor: c.border, backgroundColor: c.bg }]}
              value={search} onChangeText={v => { setSearch(v); setSelectedFood(null); setSelectedRecipe(null); }}
              placeholder={foodTab === 'food' ? 'Search foods…' : 'Search recipes…'} placeholderTextColor={c.muted} autoFocus />

            {!selectedFood && !selectedRecipe && (
              <ScrollView style={{ maxHeight: 200 }} keyboardShouldPersistTaps="handled">
                {searching && <Text style={{ color: c.muted, fontSize: fontSize.sm, textAlign: 'center', paddingVertical: 8 }}>Searching…</Text>}
                {!searching && !search.trim() && <Text style={{ color: c.muted, fontSize: fontSize.sm, textAlign: 'center', paddingVertical: 8 }}>Type to search</Text>}
                {foodTab === 'food' && !searching && foodResults.map(f => {
                  const def = f.servingSizes.find(ss => ss.isDefault) ?? f.servingSizes[0];
                  const cal = def ? Math.round(f.nutrition.calories * def.grams / 100) : null;
                  return (
                    <TouchableOpacity key={f.id} onPress={() => setSelectedFood(f)}
                      style={{ paddingVertical: 10, paddingHorizontal: 4, flexDirection: 'row', justifyContent: 'space-between' }}>
                      <View style={{ flex: 1, marginRight: 8 }}>
                        <Text style={{ color: c.text, fontSize: fontSize.sm }} numberOfLines={1}>{f.name}</Text>
                        {f.brand && <Text style={{ color: c.muted, fontSize: fontSize.xs }} numberOfLines={1}>{f.brand}</Text>}
                      </View>
                      {cal != null && <Text style={{ color: c.muted, fontSize: fontSize.xs }}>{cal} kcal</Text>}
                    </TouchableOpacity>
                  );
                })}
                {foodTab === 'recipe' && !searching && recipeResults.map(r => (
                  <TouchableOpacity key={r.id} onPress={() => setSelectedRecipe(r)}
                    style={{ paddingVertical: 10, paddingHorizontal: 4, flexDirection: 'row', justifyContent: 'space-between' }}>
                    <Text style={{ color: c.text, fontSize: fontSize.sm, flex: 1, marginRight: 8 }} numberOfLines={1}>{r.name}</Text>
                    {r.calories != null && <Text style={{ color: c.muted, fontSize: fontSize.xs }}>{Math.round(Number(r.calories))} kcal</Text>}
                  </TouchableOpacity>
                ))}
              </ScrollView>
            )}

            {selectedFood && (
              <View style={{ gap: 8 }}>
                <TouchableOpacity onPress={() => setSelectedFood(null)}><Text style={{ color: c.accent, fontSize: fontSize.sm }}>← Back</Text></TouchableOpacity>
                <Text style={{ color: c.text, fontSize: fontSize.sm, fontWeight: '600' }} numberOfLines={1}>{selectedFood.name}</Text>
                <Text style={[s.fieldLabel, { color: c.muted }]}>Serving</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                  {selectedFood.servingSizes.map(ss => (
                    <TouchableOpacity key={ss.id} onPress={() => setSelectedServingId(ss.id)}
                      style={{ marginRight: 6, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, backgroundColor: selectedServingId === ss.id ? c.accent : c.border }}>
                      <Text style={{ color: selectedServingId === ss.id ? '#000' : c.text, fontSize: fontSize.xs }}>{ss.label} ({ss.grams}g)</Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
                <TextInput style={[s.input, { color: c.text, borderColor: c.border, backgroundColor: c.bg, width: 100 }]}
                  value={quantity} onChangeText={setQuantity} keyboardType="decimal-pad" placeholder="Qty" placeholderTextColor={c.muted} />
                <TouchableOpacity onPress={() => setStep('configure')}
                  style={[s.saveBtn, { backgroundColor: c.accent, flex: 0, paddingHorizontal: 24 }]}>
                  <Text style={{ color: '#000', fontWeight: '700', fontSize: fontSize.sm }}>Next</Text>
                </TouchableOpacity>
              </View>
            )}

            {selectedRecipe && (
              <View style={{ gap: 8 }}>
                <TouchableOpacity onPress={() => setSelectedRecipe(null)}><Text style={{ color: c.accent, fontSize: fontSize.sm }}>← Back</Text></TouchableOpacity>
                <Text style={{ color: c.text, fontSize: fontSize.sm, fontWeight: '600' }} numberOfLines={1}>{selectedRecipe.name}</Text>
                <Text style={[s.fieldLabel, { color: c.muted }]}>Servings (recipe makes {selectedRecipe.servings ?? 1})</Text>
                <TextInput style={[s.input, { color: c.text, borderColor: c.border, backgroundColor: c.bg, width: 100 }]}
                  value={recipeServings} onChangeText={setRecipeServings} keyboardType="decimal-pad" placeholderTextColor={c.muted} />
                <TouchableOpacity onPress={() => setStep('configure')}
                  style={[s.saveBtn, { backgroundColor: c.accent, flex: 0, paddingHorizontal: 24 }]}>
                  <Text style={{ color: '#000', fontWeight: '700', fontSize: fontSize.sm }}>Next</Text>
                </TouchableOpacity>
              </View>
            )}
          </>
        ) : (
          <View style={{ gap: 8 }}>
            <TextInput style={[s.input, { color: c.text, borderColor: c.border, backgroundColor: c.bg }]}
              value={customLabel} onChangeText={setCustomLabel} placeholder="e.g. Cheat meal, Fasting" placeholderTextColor={c.muted} autoFocus />
            <TouchableOpacity onPress={() => setStep('configure')} disabled={!customLabel.trim()}
              style={[s.saveBtn, { backgroundColor: c.accent, flex: 0, paddingHorizontal: 24, opacity: customLabel.trim() ? 1 : 0.4 }]}>
              <Text style={{ color: '#000', fontWeight: '700', fontSize: fontSize.sm }}>Next</Text>
            </TouchableOpacity>
          </View>
        )}

        <TouchableOpacity onPress={() => setStep('list')} style={s.cancelBtn}>
          <Text style={{ color: c.muted, fontSize: fontSize.sm }}>Cancel</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // step === 'configure'
  return (
    <View style={{ gap: 8 }}>
      {editingId !== null
        ? <Text style={{ color: c.muted, fontSize: fontSize.xs, fontStyle: 'italic' }}>Editing meal schedule</Text>
        : <TouchableOpacity onPress={() => setStep('pick')}><Text style={{ color: c.accent, fontSize: fontSize.sm }}>← Change food</Text></TouchableOpacity>
      }

      <Text style={[s.fieldLabel, { color: c.muted }]}>Meal slot (optional)</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 4 }}>
        {(['', ...MEAL_ORDER] as const).map(slot => (
          <TouchableOpacity key={slot} onPress={() => setMealSlot(slot as MealSlot | '')}
            style={{ marginRight: 6, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, backgroundColor: mealSlot === slot ? c.accent : c.border }}>
            <Text style={{ color: mealSlot === slot ? '#000' : c.text, fontSize: fontSize.xs }}>
              {slot === '' ? 'Any' : MEAL_LABELS[slot as MealSlot]}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <Text style={[s.fieldLabel, { color: c.muted }]}>Macros (editable)</Text>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        {[['Calories', calories, setCalories], ['Protein (g)', protein, setProtein]].map(([lbl, val, set]) => (
          <View key={lbl as string} style={{ flex: 1, gap: 4 }}>
            <Text style={{ color: c.muted, fontSize: fontSize.xs }}>{lbl as string}</Text>
            <TextInput style={[s.input, { color: c.text, borderColor: c.border, backgroundColor: c.bg }]}
              value={val as string} onChangeText={set as (v: string) => void} keyboardType="decimal-pad" placeholderTextColor={c.muted} />
          </View>
        ))}
      </View>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        {[['Carbs (g)', carbs, setCarbs], ['Fat (g)', fat, setFat]].map(([lbl, val, set]) => (
          <View key={lbl as string} style={{ flex: 1, gap: 4 }}>
            <Text style={{ color: c.muted, fontSize: fontSize.xs }}>{lbl as string}</Text>
            <TextInput style={[s.input, { color: c.text, borderColor: c.border, backgroundColor: c.bg }]}
              value={val as string} onChangeText={set as (v: string) => void} keyboardType="decimal-pad" placeholderTextColor={c.muted} />
          </View>
        ))}
      </View>

      <RecurrenceForm r={recState} c={c} s={s} opts={REC_OPTS_MEAL} />

      <View style={s.actions}>
        <TouchableOpacity onPress={() => { setStep('list'); setEditingId(null); }} style={s.cancelBtn}>
          <Text style={{ color: c.muted, fontSize: fontSize.sm }}>Cancel</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={handleSave} disabled={saving}
          style={[s.saveBtn, { backgroundColor: c.accent, opacity: saving ? 0.5 : 1 }]}>
          <Text style={{ color: '#000', fontWeight: '700', fontSize: fontSize.sm }}>{saving ? 'Saving…' : editingId !== null ? 'Save' : 'Add Meal Event'}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ─── CheckpointTabContent ──────────────────────────────────────────────────────

function CheckpointTabContent({ date, token, checkpoints, c, s, onSaved }: {
  date: string; token: string; checkpoints: GoalCheckpoint[];
  c: Colors; s: ReturnType<typeof makeStyles>; onSaved: () => void;
}) {
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [metric, setMetric] = useState('weight');
  const [value, setValue] = useState('');
  const [targetDate, setTargetDate] = useState(date);
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  function startEdit(cp: GoalCheckpoint) {
    setEditingId(cp.id); setMetric(cp.metric); setValue(String(cp.targetValue));
    setTargetDate(cp.targetDate); setNotes(cp.notes ?? ''); setAdding(false);
  }

  function startAdd() {
    setEditingId(null); setMetric('weight'); setValue(''); setTargetDate(date); setNotes(''); setAdding(true);
  }

  function cancel() { setAdding(false); setEditingId(null); }

  async function handleSave() {
    if (!value || !targetDate) return;
    setSaving(true);
    try {
      const cfg = METRIC_CONFIG[metric] ?? { unit: '' };
      const payload = { metric, targetValue: Number(value), unit: cfg.unit, targetDate, notes: notes.trim() || null };
      if (editingId !== null) await updateGoalCheckpoint(token, editingId, payload);
      else await createGoalCheckpoint(token, payload);
      onSaved(); cancel();
    } catch { Alert.alert('Error', 'Could not save checkpoint.'); } finally { setSaving(false); }
  }

  async function handleDelete(id: number) {
    Alert.alert('Remove checkpoint?', '', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: async () => {
        try { await deleteGoalCheckpoint(token, id); onSaved(); } catch { Alert.alert('Error'); }
      }},
    ]);
  }

  const showForm = adding || editingId !== null;
  const unitLabel = (METRIC_CONFIG[metric] ?? { unit: '' }).unit;

  return (
    <View style={{ gap: 8 }}>
      {checkpoints.length === 0 && !showForm && (
        <Text style={[s.emptyNote, { color: c.muted }]}>No goal checkpoints for this date.</Text>
      )}
      {checkpoints.map(cp => (
        editingId === cp.id ? null : (
          <View key={cp.id} style={[s.listRow, { borderTopColor: c.border }]}>
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={{ color: c.text, fontSize: fontSize.sm }}>
                {METRIC_CONFIG[cp.metric]?.label ?? cp.metric} → {cp.targetValue} {cp.unit}
              </Text>
              {cp.notes && <Text style={{ color: c.muted, fontSize: fontSize.xs }}>{cp.notes}</Text>}
            </View>
            <TouchableOpacity onPress={() => startEdit(cp)} style={{ paddingLeft: 8 }}>
              <Text style={{ color: c.accent, fontSize: fontSize.sm }}>Edit</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => handleDelete(cp.id)} style={{ paddingLeft: 8 }}>
              <Text style={{ color: '#C5896E', fontSize: fontSize.sm }}>✕</Text>
            </TouchableOpacity>
          </View>
        )
      ))}

      {showForm ? (
        <View style={{ gap: 8, paddingTop: 12, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.border }}>
          <Text style={[s.fieldLabel, { color: c.muted }]}>Metric</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 4 }}>
            {ALL_METRICS.map(m => (
              <TouchableOpacity key={m} onPress={() => setMetric(m)}
                style={{ marginRight: 6, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, backgroundColor: metric === m ? c.accent : c.border }}>
                <Text style={{ color: metric === m ? '#000' : c.text, fontSize: fontSize.xs }}>{METRIC_CONFIG[m].label}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          <View style={{ flexDirection: 'row', gap: 8 }}>
            <TextInput style={[s.input, { flex: 2, color: c.text, borderColor: c.border, backgroundColor: c.bg }]}
              value={value} onChangeText={setValue} placeholder={`Target (${unitLabel})`} placeholderTextColor={c.muted} keyboardType="decimal-pad" autoFocus={adding} />
            <View style={[s.input, { flex: 1, justifyContent: 'center', borderColor: c.border, backgroundColor: c.bg }]}>
              <Text style={{ color: c.muted, fontSize: fontSize.sm }}>{unitLabel}</Text>
            </View>
          </View>

          <TextInput style={[s.input, { color: c.text, borderColor: c.border, backgroundColor: c.bg }]}
            value={targetDate} onChangeText={setTargetDate} placeholder="By date (YYYY-MM-DD)" placeholderTextColor={c.muted} keyboardType="numbers-and-punctuation" />
          <TextInput style={[s.input, { color: c.text, borderColor: c.border, backgroundColor: c.bg }]}
            value={notes} onChangeText={setNotes} placeholder="Notes (optional)" placeholderTextColor={c.muted} multiline />

          <View style={s.actions}>
            {editingId !== null && (
              <TouchableOpacity onPress={() => handleDelete(editingId)} style={[s.cancelBtn, { flex: 0, paddingHorizontal: 12 }]}>
                <Text style={{ color: '#C5896E', fontSize: fontSize.sm }}>Delete</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity onPress={cancel} style={s.cancelBtn}>
              <Text style={{ color: c.muted, fontSize: fontSize.sm }}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={handleSave} disabled={saving || !value || !targetDate}
              style={[s.saveBtn, { backgroundColor: c.accent, opacity: (saving || !value || !targetDate) ? 0.5 : 1 }]}>
              <Text style={{ color: '#000', fontWeight: '700', fontSize: fontSize.sm }}>{saving ? 'Saving…' : 'Save'}</Text>
            </TouchableOpacity>
          </View>
        </View>
      ) : (
        <TouchableOpacity onPress={startAdd} style={[s.addBtn, { borderColor: c.accent }]}>
          <Text style={{ color: c.accent, fontSize: fontSize.sm, fontWeight: '600' }}>+ Add checkpoint</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

// ─── NutritionTabContent ───────────────────────────────────────────────────────

function NutritionTabContent({ date, token, nutritionOverride, nutritionScheduleEvents, nutritionSchedules, c, s, onSaved }: {
  date: string; token: string;
  nutritionOverride: DailyNutritionOverride | null; nutritionScheduleEvents: NutritionScheduleEvent[];
  nutritionSchedules: NutritionSchedule[]; c: Colors; s: ReturnType<typeof makeStyles>; onSaved: () => void;
}) {
  const [adding, setAdding] = useState(false);
  const [editingNutSchId, setEditingNutSchId] = useState<number | null>(null);
  const [mode, setMode] = useState<'once' | 'recurring'>('once');
  const [calories, setCalories] = useState('');
  const [protein, setProtein] = useState('');
  const [carbs, setCarbs] = useState('');
  const [fat, setFat] = useState('');
  const [water, setWater] = useState('');
  const [recType, setRecType] = useState<AnyRec>('days_of_week');
  const [dowDays, setDowDays] = useState<number[]>([]);
  const [xInterval, setXInterval] = useState('3');
  const [domType, setDomType] = useState<'specific_dates' | 'nth_weekday'>('specific_dates');
  const [domDates, setDomDates] = useState('1, 15');
  const [domN, setDomN] = useState('1');
  const [domWeekday, setDomWeekday] = useState('0');
  const [startDate, setStartDate] = useState(date);
  const [endDate, setEndDate] = useState('');
  const [saving, setSaving] = useState(false);

  const recState: RecState = { recType, setRecType, dowDays, setDowDays, xInterval, setXInterval,
    domType, setDomType, domDates, setDomDates, domN, setDomN, domWeekday, setDomWeekday,
    startDate, setStartDate, endDate, setEndDate };

  function startEditOverride(ov: DailyNutritionOverride) {
    setMode('once');
    setCalories(ov.calories != null ? String(ov.calories) : '');
    setProtein(ov.proteinG != null ? String(ov.proteinG) : '');
    setCarbs(ov.carbsG != null ? String(ov.carbsG) : '');
    setFat(ov.fatG != null ? String(ov.fatG) : '');
    setWater(ov.waterGoalOz != null ? String(Math.round(ov.waterGoalOz / GLASS_OZ)) : '');
    setAdding(true);
  }

  function startEditNutSch(ev: NutritionScheduleEvent, sch: NutritionSchedule) {
    setEditingNutSchId(sch.id);
    setMode('recurring');
    setCalories(ev.calories != null ? String(ev.calories) : '');
    setProtein(ev.proteinG != null ? String(ev.proteinG) : '');
    setCarbs(ev.carbsG != null ? String(ev.carbsG) : '');
    setFat(ev.fatG != null ? String(ev.fatG) : '');
    setWater(ev.waterGoalOz != null ? String(Math.round(ev.waterGoalOz / GLASS_OZ)) : '');
    const p = parseRecConfig(sch.recurrenceType, sch.recurrenceConfig);
    setRecType(p.recType); setDowDays(p.dowDays); setXInterval(p.xInterval);
    setDomType(p.domType); setDomDates(p.domDates); setDomN(p.domN); setDomWeekday(p.domWeekday);
    setStartDate(sch.startDate); setEndDate(sch.endDate ?? '');
    setAdding(true);
  }

  async function handleSave() {
    setSaving(true);
    try {
      const payload = {
        dayTypeId:   null as number | null,
        calories:    calories !== '' ? Number(calories) : null,
        proteinG:    protein  !== '' ? Number(protein)  : null,
        carbsG:      carbs    !== '' ? Number(carbs)    : null,
        fatG:        fat      !== '' ? Number(fat)      : null,
        waterGoalOz: water    !== '' ? Number(water) * GLASS_OZ : null,
      };
      if (mode === 'once') {
        await upsertDailyNutritionOverride(token, date, payload);
      } else if (editingNutSchId !== null) {
        await updateNutritionSchedule(token, editingNutSchId, {
          ...payload,
          recurrenceType: recType as MealRecurrenceType,
          recurrenceConfig: buildRecConfig(recState),
          startDate, endDate: endDate.trim() || null,
        });
      } else {
        await createNutritionSchedule(token, {
          ...payload,
          recurrenceType: recType as MealRecurrenceType,
          recurrenceConfig: buildRecConfig(recState),
          startDate, endDate: endDate.trim() || null,
        });
      }
      onSaved(); setAdding(false); setEditingNutSchId(null);
    } catch { Alert.alert('Error', 'Could not save nutrition targets.'); } finally { setSaving(false); }
  }

  const hasAny = !!nutritionOverride || nutritionScheduleEvents.length > 0;

  return (
    <View style={{ gap: 8 }}>
      {!hasAny && !adding && (
        <Text style={[s.emptyNote, { color: c.muted }]}>No nutrition targets — using global goals.</Text>
      )}

      {nutritionOverride && (
        <View style={{ backgroundColor: `${c.accent}11`, borderRadius: 10, padding: 12, gap: 4 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <Text style={{ color: c.text, fontSize: fontSize.sm, fontWeight: '600' }}>
              {nutritionOverride.dayTypeName ?? 'This day'}<Text style={{ color: c.muted, fontWeight: '400' }}> — one time</Text>
            </Text>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <TouchableOpacity onPress={() => startEditOverride(nutritionOverride)}>
                <Text style={{ color: c.accent, fontSize: fontSize.sm }}>Edit</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => Alert.alert('Remove override?', '', [
                { text: 'Cancel', style: 'cancel' },
                { text: 'Remove', style: 'destructive', onPress: async () => {
                  try { await deleteDailyNutritionOverride(token, date); onSaved(); } catch { Alert.alert('Error'); }
                }},
              ])}><Text style={{ color: '#C5896E' }}>✕</Text></TouchableOpacity>
            </View>
          </View>
          {nutritionOverride.calories != null && <Text style={{ color: c.muted, fontSize: fontSize.xs }}>{nutritionOverride.calories} kcal</Text>}
          {nutritionOverride.proteinG != null && <Text style={{ color: c.muted, fontSize: fontSize.xs }}>{nutritionOverride.proteinG}g protein</Text>}
          {nutritionOverride.carbsG   != null && <Text style={{ color: c.muted, fontSize: fontSize.xs }}>{nutritionOverride.carbsG}g carbs</Text>}
          {nutritionOverride.fatG     != null && <Text style={{ color: c.muted, fontSize: fontSize.xs }}>{nutritionOverride.fatG}g fat</Text>}
          {nutritionOverride.waterGoalOz != null && <Text style={{ color: c.muted, fontSize: fontSize.xs }}>Water — {Math.round(nutritionOverride.waterGoalOz / GLASS_OZ)} glasses</Text>}
        </View>
      )}

      {nutritionScheduleEvents.map(ev => {
        const sch = nutritionSchedules.find(n => n.id === ev.scheduleId);
        return (
          <View key={ev.scheduleId} style={{ backgroundColor: `${c.accent}11`, borderRadius: 10, padding: 12, gap: 4 }}>
            {ev.dayTypeName && (
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <Text style={{ color: c.text, fontSize: fontSize.sm, fontWeight: '600' }}>
                  {ev.dayTypeName}<Text style={{ color: c.muted, fontWeight: '400' }}> — {ev.recurrenceDescription}</Text>
                </Text>
                {sch && (
                  <View style={{ flexDirection: 'row', gap: 8 }}>
                    <TouchableOpacity onPress={() => startEditNutSch(ev, sch)}>
                      <Text style={{ color: c.accent, fontSize: fontSize.sm }}>Edit</Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => Alert.alert('Remove schedule?', '', [
                      { text: 'Cancel', style: 'cancel' },
                      { text: 'Remove', style: 'destructive', onPress: async () => {
                        try { await deleteNutritionSchedule(token, sch.id); onSaved(); } catch { Alert.alert('Error'); }
                      }},
                    ])}><Text style={{ color: '#C5896E' }}>✕</Text></TouchableOpacity>
                  </View>
                )}
              </View>
            )}
            {!ev.dayTypeName && sch && (
              <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 8 }}>
                <TouchableOpacity onPress={() => startEditNutSch(ev, sch)}>
                  <Text style={{ color: c.accent, fontSize: fontSize.sm }}>Edit</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => Alert.alert('Remove schedule?', '', [
                  { text: 'Cancel', style: 'cancel' },
                  { text: 'Remove', style: 'destructive', onPress: async () => {
                    try { await deleteNutritionSchedule(token, sch.id); onSaved(); } catch { Alert.alert('Error'); }
                  }},
                ])}><Text style={{ color: '#C5896E' }}>✕</Text></TouchableOpacity>
              </View>
            )}
            {ev.calories != null && <Text style={{ color: c.text, fontSize: fontSize.sm, fontWeight: '600' }}>{Math.round(ev.calories)} kcal</Text>}
            {ev.proteinG != null && <Text style={{ color: c.muted, fontSize: fontSize.xs }}>{ev.proteinG}g protein</Text>}
            {ev.carbsG != null && <Text style={{ color: c.muted, fontSize: fontSize.xs }}>{ev.carbsG}g carbs</Text>}
            {ev.fatG != null && <Text style={{ color: c.muted, fontSize: fontSize.xs }}>{ev.fatG}g fat</Text>}
            {ev.waterGoalOz != null && <Text style={{ color: c.muted, fontSize: fontSize.xs }}>Water — {Math.round(ev.waterGoalOz / GLASS_OZ)} glasses</Text>}
          </View>
        );
      })}

      {adding ? (
        <View style={{ gap: 8, paddingTop: 12, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.border }}>
          {editingNutSchId !== null && (
            <Text style={{ color: c.muted, fontSize: fontSize.xs, fontStyle: 'italic' }}>Editing recurring schedule</Text>
          )}
          <View style={{ flexDirection: 'row', gap: 6 }}>
            {(['once', 'recurring'] as const).map(m => (
              <TouchableOpacity key={m} onPress={() => setMode(m)}
                style={{ flex: 1, paddingVertical: 8, borderRadius: 8, alignItems: 'center', backgroundColor: mode === m ? c.accent : c.border }}>
                <Text style={{ color: mode === m ? '#000' : c.text, fontSize: fontSize.xs, fontWeight: '600' }}>
                  {m === 'once' ? 'Just this day' : 'Recurring'}
                </Text>
              </TouchableOpacity>
            ))}
          </View>



          <View style={{ flexDirection: 'row', gap: 8 }}>
            {[['Calories', calories, setCalories], ['Protein (g)', protein, setProtein]].map(([lbl, val, set]) => (
              <View key={lbl as string} style={{ flex: 1, gap: 4 }}>
                <Text style={{ color: c.muted, fontSize: fontSize.xs }}>{lbl as string}</Text>
                <TextInput style={[s.input, { color: c.text, borderColor: c.border, backgroundColor: c.bg }]}
                  value={val as string} onChangeText={set as (v: string) => void} keyboardType="numeric" placeholderTextColor={c.muted} />
              </View>
            ))}
          </View>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            {[['Carbs (g)', carbs, setCarbs], ['Fat (g)', fat, setFat]].map(([lbl, val, set]) => (
              <View key={lbl as string} style={{ flex: 1, gap: 4 }}>
                <Text style={{ color: c.muted, fontSize: fontSize.xs }}>{lbl as string}</Text>
                <TextInput style={[s.input, { color: c.text, borderColor: c.border, backgroundColor: c.bg }]}
                  value={val as string} onChangeText={set as (v: string) => void} keyboardType="numeric" placeholderTextColor={c.muted} />
              </View>
            ))}
          </View>
          <View style={{ gap: 4 }}>
            <Text style={{ color: c.muted, fontSize: fontSize.xs }}>Water (glasses)</Text>
            <TextInput style={[s.input, { color: c.text, borderColor: c.border, backgroundColor: c.bg }]}
              value={water} onChangeText={setWater} keyboardType="numeric" placeholderTextColor={c.muted} />
          </View>

          {mode === 'recurring' && (
            <RecurrenceForm r={recState} c={c} s={s}
              opts={REC_OPTS_MEAL.filter(o => o.value !== 'once')} />
          )}

          <View style={s.actions}>
            <TouchableOpacity onPress={() => { setAdding(false); setEditingNutSchId(null); }} style={s.cancelBtn}>
              <Text style={{ color: c.muted, fontSize: fontSize.sm }}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={handleSave} disabled={saving}
              style={[s.saveBtn, { backgroundColor: c.accent, opacity: saving ? 0.5 : 1 }]}>
              <Text style={{ color: '#000', fontWeight: '700', fontSize: fontSize.sm }}>{saving ? 'Saving…' : 'Save'}</Text>
            </TouchableOpacity>
          </View>
        </View>
      ) : (
        <TouchableOpacity onPress={() => setAdding(true)} style={[s.addBtn, { borderColor: c.accent }]}>
          <Text style={{ color: c.accent, fontSize: fontSize.sm, fontWeight: '600' }}>+ Set nutrition targets</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

// ─── DayModal ─────────────────────────────────────────────────────────────────

type DayModalTab = 'workout' | 'meal' | 'checkpoint' | 'nutrition';

function DayModal({ date, showDatePicker = false, token, routinesList, exercisesList, workoutSchedules, workoutSessions,
  mealSchedules, mealEvents, checkpoints, nutritionOverrides, nutritionScheduleEvents,
  nutritionSchedules, c, s, onClose, onSaved }: {
  date: string; showDatePicker?: boolean; token: string; routinesList: RoutineSummary[]; exercisesList: Exercise[];
  workoutSchedules: WorkoutSchedule[]; workoutSessions: UpcomingSession[];
  mealSchedules: MealSchedule[]; mealEvents: MealScheduleEvent[];
  checkpoints: GoalCheckpoint[]; nutritionOverrides: DailyNutritionOverride[];
  nutritionScheduleEvents: NutritionScheduleEvent[]; nutritionSchedules: NutritionSchedule[];
  c: Colors; s: ReturnType<typeof makeStyles>;
  onClose: () => void; onSaved: () => void;
}) {
  const [tab, setTab] = useState<DayModalTab>('workout');
  const [activeDate, setActiveDate] = useState(date);
  const modalToday = localDateStr();

  const pickerDays = Array.from({ length: 7 }, (_, i) => {
    const d = addDays(modalToday, i - 1);
    const dt = new Date(d + 'T12:00:00');
    const dow = dt.getDay();
    return { dateStr: d, dowLabel: DOW_LABELS[dow === 0 ? 6 : dow - 1], dayNum: dt.getDate(), isToday: d === modalToday };
  });

  const daySessions = workoutSessions.filter(s => s.date === activeDate);
  const dayMeals    = mealEvents.filter(e => e.date === activeDate);
  const dayCps      = checkpoints.filter(cp => cp.targetDate === activeDate);
  const nutOverride = nutritionOverrides.find(o => o.date === activeDate) ?? null;
  const dayNutEvts  = nutritionScheduleEvents.filter(e => e.date === activeDate);
  const nutCount    = (nutOverride ? 1 : 0) + dayNutEvts.length;

  const tabs: { key: DayModalTab; label: string; count?: number }[] = [
    { key: 'workout',    label: 'Workout',   count: daySessions.length || undefined },
    { key: 'meal',       label: 'Meals',     count: dayMeals.length || undefined },
    { key: 'checkpoint', label: 'Goals',     count: dayCps.length || undefined },
    { key: 'nutrition',  label: 'Nutrition', count: nutCount || undefined },
  ];

  return (
    <Modal transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <View style={s.overlay}>
          <View style={[s.sheet, { backgroundColor: c.card, borderColor: c.border, maxHeight: '90%' }]}>
            <View style={s.sheetHeader}>
              <Text style={[s.sheetTitle, { color: c.text }]}>{showDatePicker ? 'Add to Schedule' : fmtDate(activeDate)}</Text>
              <TouchableOpacity onPress={onClose}><Text style={{ color: c.muted, fontSize: 22 }}>×</Text></TouchableOpacity>
            </View>

            {showDatePicker && (
              <View style={{ marginBottom: 8 }}>
                <ScrollView horizontal showsHorizontalScrollIndicator={false}
                  contentContainerStyle={{ gap: 6, paddingBottom: 4 }}>
                  {pickerDays.map(({ dateStr, dowLabel, dayNum, isToday }) => {
                    const isActive = dateStr === activeDate;
                    return (
                      <TouchableOpacity key={dateStr} onPress={() => setActiveDate(dateStr)}
                        style={{ alignItems: 'center', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 10,
                          backgroundColor: isActive ? c.accent : c.border }}>
                        <Text style={{ color: isActive ? '#000' : isToday ? c.accent : c.muted, fontSize: fontSize.xs }}>{dowLabel}</Text>
                        <Text style={{ color: isActive ? '#000' : c.text, fontSize: fontSize.sm, fontWeight: '700' }}>{dayNum}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
                <Text style={{ color: c.muted, fontSize: fontSize.xs, marginTop: 2 }}>{fmtDate(activeDate)}</Text>
              </View>
            )}

            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0 }} contentContainerStyle={{ gap: 6, paddingBottom: 4 }}>
              {tabs.map(({ key, label, count }) => (
                <TouchableOpacity key={key} onPress={() => setTab(key)}
                  style={{ paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20, backgroundColor: tab === key ? c.accent : c.border }}>
                  <Text style={{ color: tab === key ? '#000' : c.text, fontSize: fontSize.sm, fontWeight: tab === key ? '700' : '400' }}>
                    {label}{count != null ? ` (${count})` : ''}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            <ScrollView style={{ flexGrow: 0 }} contentContainerStyle={{ paddingBottom: 16 }} keyboardShouldPersistTaps="handled">
              {tab === 'workout' && (
                <WorkoutTabContent date={activeDate} token={token} routinesList={routinesList} exercisesList={exercisesList}
                  workoutSchedules={workoutSchedules} sessions={daySessions} c={c} s={s} onSaved={onSaved} />
              )}
              {tab === 'meal' && (
                <MealTabContent date={activeDate} token={token} mealSchedules={mealSchedules}
                  events={dayMeals} c={c} s={s} onSaved={onSaved} />
              )}
              {tab === 'checkpoint' && (
                <CheckpointTabContent date={activeDate} token={token} checkpoints={dayCps} c={c} s={s} onSaved={onSaved} />
              )}
              {tab === 'nutrition' && (
                <NutritionTabContent date={activeDate} token={token}
                  nutritionOverride={nutOverride} nutritionScheduleEvents={dayNutEvts}
                  nutritionSchedules={nutritionSchedules} c={c} s={s} onSaved={onSaved} />
              )}
            </ScrollView>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ─── Agenda View ──────────────────────────────────────────────────────────────

function AgendaView({ today, workoutSessions, mealEvents, checkpoints, nutritionOverrides, nutritionScheduleEvents,
  onSelectDate, c }: {
  today: string; workoutSessions: UpcomingSession[]; mealEvents: MealScheduleEvent[];
  checkpoints: GoalCheckpoint[]; nutritionOverrides: DailyNutritionOverride[];
  nutritionScheduleEvents: NutritionScheduleEvent[];
  onSelectDate: (date: string) => void; c: Colors;
}) {
  // today + 13 more days = 14 days total
  const days = Array.from({ length: 14 }, (_, i) => {
    const dateStr = addDays(today, i);
    const d = new Date(dateStr + 'T12:00:00');
    const dow = d.getDay();
    const month = d.toLocaleDateString('en-US', { month: 'short' });
    return {
      dateStr,
      dow: DOW_LABELS[dow === 0 ? 6 : dow - 1],
      dayNum: d.getDate(),
      month,
      isToday: dateStr === today,
      isYesterday: false,
      workouts: workoutSessions.filter(s => s.date === dateStr),
      meals: mealEvents.filter(e => e.date === dateStr),
      checkps: checkpoints.filter(cp => cp.targetDate === dateStr),
      nutOverride: nutritionOverrides.find(o => o.date === dateStr) ?? null,
      nutEvts: nutritionScheduleEvents.filter(e => e.date === dateStr),
    };
  });

  return (
    <View>
      {days.map(({ dateStr, dow, dayNum, month, isToday, isYesterday, workouts, meals, checkps, nutOverride, nutEvts }, idx) => {
        const hasEvents = workouts.length > 0 || meals.length > 0 || checkps.length > 0 || !!nutOverride || nutEvts.length > 0;
        const headerLabel = isYesterday ? 'Yesterday' : isToday ? 'Today' : dow;
        const dateLabel = `${month} ${dayNum}`;
        return (
          <TouchableOpacity key={dateStr} onPress={() => onSelectDate(dateStr)}
            style={{ flexDirection: 'row', paddingVertical: 10, gap: 12,
              borderTopWidth: idx === 0 ? 0 : StyleSheet.hairlineWidth, borderTopColor: c.border }}>
            {/* Date column */}
            <View style={{ width: 54, alignItems: 'center', paddingTop: 2 }}>
              <View style={{ width: 40, height: 40, borderRadius: 4, alignItems: 'center', justifyContent: 'center',
                backgroundColor: isToday ? c.accent : 'transparent' }}>
                <Text style={{ color: isToday ? '#000' : c.muted, fontSize: 9, fontWeight: '600', lineHeight: 12 }}>
                  {headerLabel.toUpperCase()}
                </Text>
                <Text style={{ color: isToday ? '#000' : c.text, fontSize: fontSize.base, fontWeight: '700', lineHeight: 20 }}>
                  {dayNum}
                </Text>
              </View>
              <Text style={{ color: c.muted, fontSize: 9, marginTop: 2 }}>{month}</Text>
            </View>

            {/* Events column */}
            <View style={{ flex: 1, justifyContent: 'center', gap: 5, paddingTop: 2 }}>
              {!hasEvents && (
                <Text style={{ color: c.muted, fontSize: fontSize.xs, fontStyle: 'italic' }}>No events</Text>
              )}
              {workouts.filter(w => !w.isRestDay).map(w => (
                <View key={w.scheduleId} style={{ flexDirection: 'row', alignItems: 'center', gap: 7 }}>
                  <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: c.accent }} />
                  <Text style={{ color: c.accent, fontSize: fontSize.xs, flex: 1 }} numberOfLines={1}>
                    {w.exerciseName ?? w.routineName ?? 'Workout'}
                  </Text>
                </View>
              ))}
              {workouts.some(w => w.isRestDay) && (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7 }}>
                  <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: c.muted }} />
                  <Text style={{ color: c.muted, fontSize: fontSize.xs }}>Rest day</Text>
                </View>
              )}
              {meals.map(m => (
                <View key={`${m.scheduleId}-${m.date}`} style={{ flexDirection: 'row', alignItems: 'center', gap: 7 }}>
                  <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: '#60a5fa' }} />
                  <Text style={{ color: '#60a5fa', fontSize: fontSize.xs, flex: 1 }} numberOfLines={1}>{m.label}</Text>
                </View>
              ))}
              {checkps.map(cp => (
                <View key={cp.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 7 }}>
                  <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: '#34d399' }} />
                  <Text style={{ color: '#34d399', fontSize: fontSize.xs, flex: 1 }} numberOfLines={1}>
                    {METRIC_CONFIG[cp.metric]?.label ?? cp.metric} → {cp.targetValue}
                  </Text>
                </View>
              ))}
              {(nutOverride || nutEvts.length > 0) && (
                <View style={{ gap: 2 }}>
                  {(nutOverride?.dayTypeName || nutEvts[0]?.dayTypeName) && (
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7 }}>
                      <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: '#c084fc' }} />
                      <Text style={{ color: '#c084fc', fontSize: fontSize.xs, flex: 1 }} numberOfLines={1}>
                        {nutOverride?.dayTypeName ?? nutEvts[0]?.dayTypeName}
                      </Text>
                    </View>
                  )}
                  {!(nutOverride?.dayTypeName || nutEvts[0]?.dayTypeName) && (() => {
                    const ev = nutOverride ?? nutEvts[0];
                    const parts = [];
                    if (ev?.calories != null) parts.push(`${Math.round(ev.calories)} kcal`);
                    if (ev?.proteinG != null) parts.push(`${ev.proteinG}g protein`);
                    if (ev?.carbsG != null) parts.push(`${ev.carbsG}g carbs`);
                    if (ev?.fatG != null) parts.push(`${ev.fatG}g fat`);
                    return parts.length > 0 ? parts.map((p, i) => (
                      <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: 7 }}>
                        <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: '#c084fc' }} />
                        <Text style={{ color: '#c084fc', fontSize: fontSize.xs, flex: 1 }}>{p}</Text>
                      </View>
                    )) : (
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7 }}>
                        <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: '#c084fc' }} />
                        <Text style={{ color: '#c084fc', fontSize: fontSize.xs }}>Nutrition</Text>
                      </View>
                    );
                  })()}
                </View>
              )}
            </View>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

// ─── Main component ────────────────────────────────────────────────────────────

export default function SettingsPlanningTab() {
  const c = useColors();
  const s = makeStyles(c);
  const token = useAuthStore(st => st.token)!;
  const today = localDateStr();

  const [workoutSchedules, setWorkoutSchedules] = useState<WorkoutSchedule[]>([]);
  const [workoutSessions, setWorkoutSessions] = useState<UpcomingSession[]>([]);
  const [routinesList, setRoutinesList] = useState<RoutineSummary[]>([]);
  const [exercisesList, setExercisesList] = useState<Exercise[]>([]);
  const [mealSchedules, setMealSchedules] = useState<MealSchedule[]>([]);
  const [mealEvents, setMealEvents] = useState<MealScheduleEvent[]>([]);
  const [checkpoints, setCheckpoints] = useState<GoalCheckpoint[]>([]);
  const [nutritionOverrides, setNutritionOverrides] = useState<DailyNutritionOverride[]>([]);
  const [nutritionScheduleEvents, setNutritionScheduleEvents] = useState<NutritionScheduleEvent[]>([]);
  const [nutritionSchedules, setNutritionSchedules] = useState<NutritionSchedule[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [addModalOpen, setAddModalOpen] = useState(false);

  async function load() {
    try {
      const from = addDays(today, -1);
      const to   = addDays(today, 30);
      const [scheds, sessions, routines, exercises, mScheds, mEvts, chkpts, nutOvrs, nutEvts, nutScheds] = await Promise.all([
        getSchedules(token).catch(e => { console.error('getSchedules error:', e); return []; }),
        getUpcomingSchedule(token, 30).catch(e => { console.error('getUpcomingSchedule error:', e); return []; }),
        getRoutines(token).catch(e => { console.error('getRoutines error:', e); return []; }),
        getExercises(token).catch(e => { console.error('getExercises error:', e); return []; }),
        getMealSchedules(token).catch(e => { console.error('getMealSchedules error:', e); return []; }),
        getMealScheduleUpcoming(token, 30).catch(e => { console.error('getMealScheduleUpcoming error:', e); return []; }),
        getGoalCheckpoints(token).catch(e => { console.error('getGoalCheckpoints error:', e); return []; }),
        getDailyNutritionOverrides(token, from, to).catch(e => { console.error('getDailyNutritionOverrides error:', e); return []; }),
        getNutritionScheduleUpcoming(token, 30).catch(e => { console.error('getNutritionScheduleUpcoming error:', e); return []; }),
        getNutritionSchedules(token).catch(e => { console.error('getNutritionSchedules error:', e); return []; }),
      ]);
      console.log('Planning data loaded:', { sessions: sessions.length, mEvts: mEvts.length, nutEvts: nutEvts.length });
      setWorkoutSchedules(scheds as WorkoutSchedule[]);
      setWorkoutSessions(sessions as UpcomingSession[]);
      setRoutinesList(routines as RoutineSummary[]);
      setExercisesList(exercises as Exercise[]);
      setMealSchedules(mScheds as MealSchedule[]);
      setMealEvents(mEvts as MealScheduleEvent[]);
      setCheckpoints(chkpts as GoalCheckpoint[]);
      setNutritionOverrides(nutOvrs as DailyNutritionOverride[]);
      setNutritionScheduleEvents(nutEvts as NutritionScheduleEvent[]);
      setNutritionSchedules(nutScheds as NutritionSchedule[]);
    } catch (e) { console.error('load error:', e); }
    finally { setLoading(false); }
  }

  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  if (loading) return <ActivityIndicator style={{ marginTop: 40 }} color={c.accent} />;

  return (
    <ScrollView contentContainerStyle={{ padding: 14, gap: 12 }}>

      {/* Calendar card */}
      <View style={[s.card, { backgroundColor: c.card, borderColor: c.border }]}>
        <Text style={[s.sectionTitle, { color: c.text }]}>Planning</Text>
        <AgendaView
          today={today} workoutSessions={workoutSessions} mealEvents={mealEvents}
          checkpoints={checkpoints} nutritionOverrides={nutritionOverrides}
          nutritionScheduleEvents={nutritionScheduleEvents}
          onSelectDate={setSelectedDate} c={c}
        />
        <TouchableOpacity onPress={() => setAddModalOpen(true)} style={[s.addBtn, { borderColor: c.accent, marginTop: 10 }]}>
          <Text style={{ color: c.accent, fontSize: fontSize.sm, fontWeight: '600' }}>+ Add to schedule</Text>
        </TouchableOpacity>
      </View>

      <View style={{ height: 32 }} />

      {selectedDate && (
        <DayModal
          date={selectedDate} token={token} routinesList={routinesList} exercisesList={exercisesList}
          workoutSchedules={workoutSchedules} workoutSessions={workoutSessions}
          mealSchedules={mealSchedules} mealEvents={mealEvents}
          checkpoints={checkpoints} nutritionOverrides={nutritionOverrides}
          nutritionScheduleEvents={nutritionScheduleEvents} nutritionSchedules={nutritionSchedules}
          c={c} s={s}
          onClose={() => setSelectedDate(null)}
          onSaved={() => { load(); }}
        />
      )}

      {addModalOpen && (
        <DayModal
          date={today} showDatePicker token={token} routinesList={routinesList} exercisesList={exercisesList}
          workoutSchedules={workoutSchedules} workoutSessions={workoutSessions}
          mealSchedules={mealSchedules} mealEvents={mealEvents}
          checkpoints={checkpoints} nutritionOverrides={nutritionOverrides}
          nutritionScheduleEvents={nutritionScheduleEvents} nutritionSchedules={nutritionSchedules}
          c={c} s={s}
          onClose={() => setAddModalOpen(false)}
          onSaved={() => { load(); }}
        />
      )}
    </ScrollView>
  );
}

// ─── Styles ────────────────────────────────────────────────────────────────────

function makeStyles(c: Colors) {
  return StyleSheet.create({
    card:        { borderRadius: 14, borderWidth: 1, padding: 16, gap: 12 },
    cardHeader:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    sectionTitle:{ fontSize: fontSize.sm, fontWeight: '600' },
    rowLabel:    { fontSize: fontSize.sm },
    listRow:     { flexDirection: 'row', alignItems: 'center', paddingTop: 10, borderTopWidth: StyleSheet.hairlineWidth },
    addBtn:      { marginTop: 4, borderWidth: 1, borderRadius: 8, paddingVertical: 10, alignItems: 'center' },
    emptyNote:   { fontSize: fontSize.sm, fontStyle: 'italic', textAlign: 'center', paddingVertical: 4 },
    overlay:     { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.5)' },
    sheet:       { borderTopLeftRadius: 20, borderTopRightRadius: 20, borderWidth: 1, padding: 20, gap: 12 },
    sheetHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    sheetTitle:  { fontSize: fontSize.lg, fontWeight: '700' },
    actions:     { flexDirection: 'row', gap: 8, marginTop: 4 },
    cancelBtn:   { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 12 },
    saveBtn:     { flex: 2, alignItems: 'center', justifyContent: 'center', paddingVertical: 12, borderRadius: 10 },
    fieldLabel:  { fontSize: fontSize.sm },
    input:       { borderWidth: 1, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, fontSize: fontSize.sm },
    pickerRow:   { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 14, borderTopWidth: StyleSheet.hairlineWidth },
  });
}
