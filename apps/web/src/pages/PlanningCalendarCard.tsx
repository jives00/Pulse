import { useState, useEffect, useCallback } from 'react';
import {
  schedulesApi, goalCheckpointsApi, dayTypesApi, mealSchedulesApi, nutritionSchedulesApi,
  GLASS_OZ,
  type UpcomingSession, type WorkoutSchedule, type RoutineSummary, type Exercise,
  type GoalCheckpoint, type DayTypePreset, type DailyNutritionOverride,
  type MealSchedule, type MealScheduleEvent, type MealSlotType, type MealRecurrenceType,
  type NutritionSchedule, type NutritionScheduleEvent,
  type RecurrenceType,
} from '@pulse/api-client';

// ─── Constants ────────────────────────────────────────────────────────────────

const DOW = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

const MEAL_SLOTS: { value: MealSlotType | ''; label: string }[] = [
  { value: '', label: 'Any meal' },
  { value: 'breakfast', label: 'Breakfast' },
  { value: 'lunch', label: 'Lunch' },
  { value: 'dinner', label: 'Dinner' },
  { value: 'snack', label: 'Snack' },
];

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

const inputCls = 'w-full bg-dram-bg border border-slate-600 rounded px-2 py-1.5 text-base text-slate-100 focus:outline-none focus:border-dram-accent';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function todayStr() { return new Date().toISOString().slice(0, 10); }

function localDateStr(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function addDays(dateStr: string, n: number) {
  const d = new Date(dateStr + 'T12:00:00');
  d.setDate(d.getDate() + n);
  return localDateStr(d);
}

function fmtDisplayDate(dateStr: string) {
  return new Date(dateStr + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
}

function fmtShortDate(dateStr: string) {
  return new Date(dateStr + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

// ─── Recurrence form (shared between workout + meal) ─────────────────────────

type AnyRecurrence = RecurrenceType | MealRecurrenceType;

function RecurrenceFields({
  recType, setRecType,
  dowDays, setDowDays,
  xInterval, setXInterval,
  domType, setDomType,
  domDates, setDomDates,
  domN, setDomN,
  domWeekday, setDomWeekday,
  startDate, setStartDate,
  endDate, setEndDate,
  includOnce = false,
}: {
  recType: AnyRecurrence; setRecType: (v: AnyRecurrence) => void;
  dowDays: number[]; setDowDays: (v: number[]) => void;
  xInterval: string; setXInterval: (v: string) => void;
  domType: 'specific_dates' | 'nth_weekday'; setDomType: (v: 'specific_dates' | 'nth_weekday') => void;
  domDates: string; setDomDates: (v: string) => void;
  domN: string; setDomN: (v: string) => void;
  domWeekday: string; setDomWeekday: (v: string) => void;
  startDate: string; setStartDate: (v: string) => void;
  endDate: string; setEndDate: (v: string) => void;
  includOnce?: boolean;
}) {
  const types: { value: AnyRecurrence; label: string }[] = [
    ...(includOnce ? [{ value: 'once' as AnyRecurrence, label: 'Once' }] : []),
    { value: 'daily',           label: 'Daily' },
    { value: 'every_other_day', label: 'Every other day' },
    { value: 'days_of_week',    label: 'Days of week' },
    { value: 'every_x_days',    label: 'Every X days' },
    { value: 'day_of_month',    label: 'Day of month' },
  ];

  return (
    <div className="space-y-3">
      <div>
        <label className="block text-base text-slate-500 mb-1.5">Repeats</label>
        <div className="flex flex-wrap gap-1.5">
          {types.map(({ value, label }) => (
            <button key={value} type="button" onClick={() => setRecType(value)}
              className={`text-base px-2.5 py-1 rounded-lg transition-colors ${recType === value ? 'bg-dram-accent text-black font-semibold' : 'bg-dram-border text-slate-300 hover:text-slate-100'}`}
            >{label}</button>
          ))}
        </div>
      </div>

      {recType === 'days_of_week' && (
        <div className="flex gap-1.5">
          {DOW.map((lbl, i) => (
            <button key={i} type="button"
              onClick={() => setDowDays(dowDays.includes(i) ? dowDays.filter((d) => d !== i) : [...dowDays, i])}
              className={`flex-1 py-1.5 rounded-lg text-base transition-colors ${dowDays.includes(i) ? 'bg-dram-accent text-black font-semibold' : 'bg-dram-border text-slate-300 hover:text-slate-100'}`}
            >{lbl[0]}</button>
          ))}
        </div>
      )}

      {recType === 'every_x_days' && (
        <div>
          <label className="block text-base text-slate-500 mb-1">Interval (days)</label>
          <input type="number" min="1" value={xInterval} onChange={(e) => setXInterval(e.target.value)} className={inputCls} />
        </div>
      )}

      {recType === 'day_of_month' && (
        <div className="space-y-2">
          <div className="flex gap-2">
            {(['specific_dates', 'nth_weekday'] as const).map((dt) => (
              <button key={dt} type="button" onClick={() => setDomType(dt)}
                className={`flex-1 text-base py-1.5 rounded-lg transition-colors ${domType === dt ? 'bg-dram-accent text-black font-semibold' : 'bg-dram-border text-slate-300 hover:text-slate-100'}`}
              >{dt === 'specific_dates' ? 'Specific dates' : 'Nth weekday'}</button>
            ))}
          </div>
          {domType === 'specific_dates' ? (
            <div>
              <label className="block text-base text-slate-500 mb-1">Dates (e.g. 1, 15)</label>
              <input type="text" value={domDates} onChange={(e) => setDomDates(e.target.value)} className={inputCls} />
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-base text-slate-500 mb-1">Which (1–4)</label>
                <input type="number" min="1" max="4" value={domN} onChange={(e) => setDomN(e.target.value)} className={inputCls} />
              </div>
              <div>
                <label className="block text-base text-slate-500 mb-1">Weekday (0=Mon … 6=Sun)</label>
                <input type="number" min="0" max="6" value={domWeekday} onChange={(e) => setDomWeekday(e.target.value)} className={inputCls} />
              </div>
            </div>
          )}
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-base text-slate-500 mb-1">Start date</label>
          <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className={inputCls} />
        </div>
        <div>
          <label className="block text-base text-slate-500 mb-1">End date (optional)</label>
          <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className={inputCls} />
        </div>
      </div>
    </div>
  );
}

function buildRecurrenceConfig(recType: AnyRecurrence, dowDays: number[], xInterval: string, domType: string, domDates: string, domN: string, domWeekday: string) {
  if (recType === 'once' || recType === 'daily' || recType === 'every_other_day') return {};
  if (recType === 'days_of_week') return { days: dowDays };
  if (recType === 'every_x_days') return { interval: Number(xInterval) || 3 };
  if (recType === 'day_of_month') {
    if (domType === 'specific_dates') return { type: 'specific_dates', dates: domDates.split(',').map((d) => Number(d.trim())).filter((d) => d >= 1 && d <= 31) };
    return { type: 'nth_weekday', n: Number(domN) || 1, weekday: Number(domWeekday) || 0 };
  }
  return {};
}

// ─── Add Workout Modal ────────────────────────────────────────────────────────

function AddWorkoutModal({ defaultDate, routinesList, exercisesList, onClose, onSaved }: {
  defaultDate: string;
  routinesList: RoutineSummary[];
  exercisesList: Exercise[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [scheduleType, setScheduleType] = useState<'routine' | 'exercise' | 'rest'>('routine');
  const [routineId,   setRoutineId]   = useState<number | null>(null);
  const [exerciseId,  setExerciseId]  = useState<number | null>(null);
  const [label,       setLabel]       = useState('');
  const [recType,     setRecType]     = useState<AnyRecurrence>('once');
  const [dowDays,     setDowDays]     = useState<number[]>([]);
  const [xInterval,   setXInterval]   = useState('3');
  const [domType,     setDomType]     = useState<'specific_dates' | 'nth_weekday'>('specific_dates');
  const [domDates,    setDomDates]    = useState('1, 15');
  const [domN,        setDomN]        = useState('1');
  const [domWeekday,  setDomWeekday]  = useState('0');
  const [startDate,   setStartDate]   = useState(defaultDate);
  const [endDate,     setEndDate]     = useState('');
  const [saving,      setSaving]      = useState(false);

  const isRestDay = scheduleType === 'rest';
  const canSave = isRestDay || (scheduleType === 'routine' ? routineId !== null : exerciseId !== null);

  async function handleSave() {
    if (!canSave) return;
    setSaving(true);
    try {
      const apiRecType = (recType === 'once' ? 'days_of_week' : recType) as RecurrenceType;
      const config = recType === 'once'
        ? { days: [new Date(startDate + 'T12:00:00').getDay() === 0 ? 6 : new Date(startDate + 'T12:00:00').getDay() - 1] }
        : buildRecurrenceConfig(recType, dowDays, xInterval, domType, domDates, domN, domWeekday);

      await schedulesApi.create({
        routineId:  isRestDay ? null : (scheduleType === 'routine' ? routineId : null),
        exerciseId: isRestDay ? null : (scheduleType === 'exercise' ? exerciseId : null),
        label: label.trim() || undefined,
        isRestDay,
        recurrenceType: recType === 'once' ? 'days_of_week' : apiRecType,
        recurrenceConfig: config,
        startDate,
        endDate: recType === 'once' ? startDate : (endDate.trim() || null),
      });
      onSaved();
    } catch { /* ignore */ } finally { setSaving(false); }
  }

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        {(['routine', 'exercise', 'rest'] as const).map((t) => (
          <button key={t} type="button" onClick={() => setScheduleType(t)}
            className={`flex-1 text-base py-1.5 rounded-lg transition-colors capitalize ${scheduleType === t ? 'bg-dram-accent text-black font-semibold' : 'bg-dram-border text-slate-300 hover:text-slate-100'}`}
          >{t === 'rest' ? 'Rest day' : t}</button>
        ))}
      </div>

      {scheduleType === 'routine' && (
        <select value={routineId ?? ''} onChange={(e) => setRoutineId(e.target.value ? Number(e.target.value) : null)} className={inputCls}>
          <option value="">Select a routine…</option>
          {routinesList.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
        </select>
      )}
      {scheduleType === 'exercise' && (
        <select value={exerciseId ?? ''} onChange={(e) => setExerciseId(e.target.value ? Number(e.target.value) : null)} className={inputCls}>
          <option value="">Select an exercise…</option>
          {exercisesList.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
        </select>
      )}

      <div>
        <label className="block text-base text-slate-500 mb-1">Label (optional)</label>
        <input type="text" value={label} onChange={(e) => setLabel(e.target.value)} className={inputCls} placeholder="e.g. Morning run" />
      </div>

      <RecurrenceFields
        recType={recType} setRecType={setRecType}
        dowDays={dowDays} setDowDays={setDowDays}
        xInterval={xInterval} setXInterval={setXInterval}
        domType={domType} setDomType={setDomType}
        domDates={domDates} setDomDates={setDomDates}
        domN={domN} setDomN={setDomN}
        domWeekday={domWeekday} setDomWeekday={setDomWeekday}
        startDate={startDate} setStartDate={setStartDate}
        endDate={endDate} setEndDate={setEndDate}
        includOnce
      />

      <div className="flex gap-2 pt-1">
        <button type="button" onClick={onClose} className="flex-1 text-base text-slate-400 hover:text-slate-200 py-2 transition-colors">Cancel</button>
        <button type="button" onClick={handleSave} disabled={saving || !canSave}
          className="flex-[2] bg-dram-accent text-black text-base font-semibold rounded-lg py-2 hover:brightness-110 disabled:opacity-50 transition"
        >{saving ? 'Saving…' : 'Add Workout'}</button>
      </div>
    </div>
  );
}

// ─── Add Meal Schedule Modal ──────────────────────────────────────────────────

function AddMealScheduleForm({ defaultDate, onClose, onSaved }: {
  defaultDate: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [label,      setLabel]      = useState('');
  const [mealSlot,   setMealSlot]   = useState<MealSlotType | ''>('');
  const [recType,    setRecType]    = useState<AnyRecurrence>('once');
  const [dowDays,    setDowDays]    = useState<number[]>([]);
  const [xInterval,  setXInterval]  = useState('3');
  const [domType,    setDomType]    = useState<'specific_dates' | 'nth_weekday'>('specific_dates');
  const [domDates,   setDomDates]   = useState('1, 15');
  const [domN,       setDomN]       = useState('1');
  const [domWeekday, setDomWeekday] = useState('0');
  const [startDate,  setStartDate]  = useState(defaultDate);
  const [endDate,    setEndDate]    = useState('');
  const [saving,     setSaving]     = useState(false);

  async function handleSave() {
    if (!label.trim()) return;
    setSaving(true);
    try {
      await mealSchedulesApi.create({
        mealSlot: mealSlot || null,
        label: label.trim(),
        recurrenceType: recType as MealRecurrenceType,
        recurrenceConfig: buildRecurrenceConfig(recType, dowDays, xInterval, domType, domDates, domN, domWeekday),
        startDate,
        endDate: recType === 'once' ? startDate : (endDate.trim() || null),
      });
      onSaved();
    } catch { /* ignore */ } finally { setSaving(false); }
  }

  return (
    <div className="space-y-4">
      <div>
        <label className="block text-base text-slate-500 mb-1">Label</label>
        <input type="text" value={label} onChange={(e) => setLabel(e.target.value)} className={inputCls} placeholder="e.g. Cheat meal, Fasting, Meal prep" autoFocus />
      </div>

      <div>
        <label className="block text-base text-slate-500 mb-1">Meal slot (optional)</label>
        <select value={mealSlot} onChange={(e) => setMealSlot(e.target.value as MealSlotType | '')} className={inputCls}>
          {MEAL_SLOTS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
        </select>
      </div>

      <RecurrenceFields
        recType={recType} setRecType={setRecType}
        dowDays={dowDays} setDowDays={setDowDays}
        xInterval={xInterval} setXInterval={setXInterval}
        domType={domType} setDomType={setDomType}
        domDates={domDates} setDomDates={setDomDates}
        domN={domN} setDomN={setDomN}
        domWeekday={domWeekday} setDomWeekday={setDomWeekday}
        startDate={startDate} setStartDate={setStartDate}
        endDate={endDate} setEndDate={setEndDate}
        includOnce
      />

      <div className="flex gap-2 pt-1">
        <button type="button" onClick={onClose} className="flex-1 text-base text-slate-400 hover:text-slate-200 py-2 transition-colors">Cancel</button>
        <button type="button" onClick={handleSave} disabled={saving || !label.trim()}
          className="flex-[2] bg-dram-accent text-black text-base font-semibold rounded-lg py-2 hover:brightness-110 disabled:opacity-50 transition"
        >{saving ? 'Saving…' : 'Add Meal Event'}</button>
      </div>
    </div>
  );
}

// ─── Add Checkpoint Modal ─────────────────────────────────────────────────────

function AddCheckpointForm({ defaultDate, onClose, onSaved, editing }: {
  defaultDate: string;
  onClose: () => void;
  onSaved: () => void;
  editing?: GoalCheckpoint;
}) {
  const [metric,  setMetric]  = useState(editing?.metric ?? 'weight');
  const [value,   setValue]   = useState(editing?.targetValue != null ? String(editing.targetValue) : '');
  const [date,    setDate]    = useState(editing?.targetDate ?? defaultDate);
  const [notes,   setNotes]   = useState(editing?.notes ?? '');
  const [saving,  setSaving]  = useState(false);

  const cfg = METRIC_CONFIG[metric];

  async function handleSave() {
    if (!value || !date) return;
    setSaving(true);
    try {
      const payload = { metric, targetValue: Number(value), unit: cfg.unit, targetDate: date, notes: notes.trim() || null };
      if (editing) await goalCheckpointsApi.update(editing.id, payload);
      else         await goalCheckpointsApi.create(payload);
      onSaved();
    } catch { /* ignore */ } finally { setSaving(false); }
  }

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-base text-slate-500 mb-1">Metric</label>
          <select value={metric} onChange={(e) => setMetric(e.target.value)} className={inputCls}>
            {ALL_METRICS.map((m) => <option key={m} value={m}>{METRIC_CONFIG[m].label}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-base text-slate-500 mb-1">Target ({cfg.unit})</label>
          <input type="number" min="0" step="0.1" value={value} onChange={(e) => setValue(e.target.value)} className={inputCls} />
        </div>
      </div>
      <div>
        <label className="block text-base text-slate-500 mb-1">By date</label>
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={inputCls} />
      </div>
      <div>
        <label className="block text-base text-slate-500 mb-1">Notes (optional)</label>
        <input type="text" value={notes} onChange={(e) => setNotes(e.target.value)} className={inputCls} placeholder="e.g. Interim goal for summer" />
      </div>
      <div className="flex gap-2 pt-1">
        <button type="button" onClick={onClose} className="flex-1 text-base text-slate-400 hover:text-slate-200 py-2 transition-colors">Cancel</button>
        <button type="button" onClick={handleSave} disabled={saving || !value || !date}
          className="flex-[2] bg-dram-accent text-black text-base font-semibold rounded-lg py-2 hover:brightness-110 disabled:opacity-50 transition"
        >{saving ? 'Saving…' : editing ? 'Save Changes' : 'Add Checkpoint'}</button>
      </div>
    </div>
  );
}

// ─── Nutrition Override Form ──────────────────────────────────────────────────

function NutritionOverrideForm({ date, existing, presets, onClose, onSaved }: {
  date: string;
  existing: DailyNutritionOverride | null;
  presets: DayTypePreset[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [mode,      setMode]      = useState<'once' | 'recurring'>('once');
  const [dayTypeId, setDayTypeId] = useState<number | ''>(existing?.dayTypeId ?? '');
  const [calories,  setCalories]  = useState(existing?.calories != null ? String(existing.calories) : '');
  const [protein,   setProtein]   = useState(existing?.proteinG != null ? String(existing.proteinG) : '');
  const [carbs,     setCarbs]     = useState(existing?.carbsG   != null ? String(existing.carbsG)   : '');
  const [fat,       setFat]       = useState(existing?.fatG     != null ? String(existing.fatG)     : '');
  const [water,     setWater]     = useState(existing?.waterGoalOz != null ? String(Math.round(existing.waterGoalOz / GLASS_OZ)) : '');
  const [saving,    setSaving]    = useState(false);

  // Recurrence state (for recurring mode)
  const [recType,     setRecType]     = useState<MealRecurrenceType>('days_of_week');
  const [dowDays,     setDowDays]     = useState<number[]>([]);
  const [xInterval,   setXInterval]   = useState('2');
  const [domType,     setDomType]     = useState<'specific_dates' | 'nth_weekday'>('specific_dates');
  const [domDates,    setDomDates]    = useState('');
  const [domN,        setDomN]        = useState('1');
  const [domWeekday,  setDomWeekday]  = useState('0');
  const [startDate,   setStartDate]   = useState(date);
  const [endDate,     setEndDate]     = useState('');

  function applyPreset(id: number | '') {
    setDayTypeId(id);
    if (!id) return;
    const p = presets.find((p) => p.id === id);
    if (!p) return;
    if (p.calories  != null) setCalories(String(p.calories));
    if (p.proteinG  != null) setProtein(String(p.proteinG));
    if (p.carbsG    != null) setCarbs(String(p.carbsG));
    if (p.fatG      != null) setFat(String(p.fatG));
    if (p.waterGoalOz != null) setWater(String(Math.round(p.waterGoalOz / GLASS_OZ)));
  }

  const macroPayload = () => ({
    dayTypeId:   dayTypeId || null,
    calories:    calories  !== '' ? Number(calories)  : null,
    proteinG:    protein   !== '' ? Number(protein)   : null,
    carbsG:      carbs     !== '' ? Number(carbs)     : null,
    fatG:        fat       !== '' ? Number(fat)       : null,
    waterGoalOz: water     !== '' ? Number(water) * GLASS_OZ : null,
  });

  async function handleSave() {
    setSaving(true);
    try {
      if (mode === 'once') {
        await dayTypesApi.upsertOverride(date, macroPayload());
      } else {
        const cfg = buildRecurrenceConfig(recType, dowDays, xInterval, domType, domDates, domN, domWeekday);
        await nutritionSchedulesApi.create({
          ...macroPayload(),
          recurrenceType:   recType,
          recurrenceConfig: cfg,
          startDate,
          endDate: endDate || null,
        });
      }
      onSaved();
    } catch { /* ignore */ } finally { setSaving(false); }
  }

  async function handleDelete() {
    setSaving(true);
    try { await dayTypesApi.deleteOverride(date); onSaved(); }
    catch { /* ignore */ } finally { setSaving(false); }
  }

  const macroFields: [string, string, (v: string) => void][] = [
    ['Calories', calories, setCalories],
    ['Protein (g)', protein, setProtein],
    ['Carbs (g)', carbs, setCarbs],
    ['Fat (g)', fat, setFat],
    ['Water (glasses)', water, setWater],
  ];

  return (
    <div className="space-y-3">
      {/* Mode toggle */}
      <div className="flex gap-1.5">
        {(['once', 'recurring'] as const).map((m) => (
          <button key={m} type="button" onClick={() => setMode(m)}
            className={`flex-1 text-base py-1.5 rounded-lg transition-colors capitalize ${mode === m ? 'bg-dram-accent text-black font-semibold' : 'bg-dram-border text-slate-300 hover:text-slate-100'}`}
          >{m === 'once' ? 'Just this day' : 'Recurring'}</button>
        ))}
      </div>

      {presets.length > 0 && (
        <div>
          <label className="block text-base text-slate-500 mb-1">Apply preset</label>
          <select value={dayTypeId} onChange={(e) => applyPreset(e.target.value ? Number(e.target.value) : '')} className={inputCls}>
            <option value="">Custom…</option>
            {presets.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </div>
      )}

      <div className="grid grid-cols-2 gap-2">
        {macroFields.map(([lbl, val, setter]) => (
          <div key={lbl}>
            <label className="block text-base text-slate-500 mb-1">{lbl}</label>
            <input type="number" min="0" value={val} onChange={(e) => setter(e.target.value)} className={inputCls} />
          </div>
        ))}
      </div>

      {mode === 'recurring' && (
        <RecurrenceFields
          recType={recType} setRecType={setRecType as (v: any) => void}
          dowDays={dowDays} setDowDays={setDowDays}
          xInterval={xInterval} setXInterval={setXInterval}
          domType={domType} setDomType={setDomType}
          domDates={domDates} setDomDates={setDomDates}
          domN={domN} setDomN={setDomN}
          domWeekday={domWeekday} setDomWeekday={setDomWeekday}
          startDate={startDate} setStartDate={setStartDate}
          endDate={endDate} setEndDate={setEndDate}
          includOnce={false}
        />
      )}

      <div className="flex gap-2 pt-1">
        {existing && mode === 'once' && (
          <button type="button" onClick={handleDelete} disabled={saving} className="flex-1 text-base text-red-400 hover:text-red-300 py-2 transition-colors">Remove</button>
        )}
        <button type="button" onClick={onClose} className="flex-1 text-base text-slate-400 hover:text-slate-200 py-2 transition-colors">Cancel</button>
        <button type="button" onClick={handleSave} disabled={saving}
          className="flex-[2] bg-dram-accent text-black text-base font-semibold rounded-lg py-2 hover:brightness-110 disabled:opacity-50 transition"
        >{saving ? 'Saving…' : 'Save'}</button>
      </div>
    </div>
  );
}

// ─── Day Modal ────────────────────────────────────────────────────────────────

type DayModalTab = 'workout' | 'meal' | 'checkpoint' | 'nutrition';

function DayModal({
  date,
  workoutEvents,
  mealEvents,
  checkpoints,
  nutritionOverride,
  nutritionScheduleEvents,
  nutritionSchedules,
  presets,
  routinesList,
  exercisesList,
  workoutSchedules,
  mealSchedules,
  onClose,
  onSaved,
}: {
  date: string;
  workoutEvents: UpcomingSession[];
  mealEvents: MealScheduleEvent[];
  checkpoints: GoalCheckpoint[];
  nutritionOverride: DailyNutritionOverride | null;
  nutritionScheduleEvents: NutritionScheduleEvent[];
  nutritionSchedules: NutritionSchedule[];
  presets: DayTypePreset[];
  routinesList: RoutineSummary[];
  exercisesList: Exercise[];
  workoutSchedules: WorkoutSchedule[];
  mealSchedules: MealSchedule[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [tab,          setTab]          = useState<DayModalTab>('workout');
  const [adding,       setAdding]       = useState(false);
  const [editCheckpoint, setEditCheckpoint] = useState<GoalCheckpoint | null>(null);

  const dayCheckpoints = checkpoints.filter((c) => c.targetDate === date);
  const hasOverride    = nutritionOverride != null;

  async function deleteSchedule(id: number) {
    if (!confirm('Remove this schedule?')) return;
    try { await schedulesApi.delete(id); onSaved(); } catch { /* ignore */ }
  }

  async function deleteMealSchedule(id: number) {
    if (!confirm('Remove this meal event?')) return;
    try { await mealSchedulesApi.delete(id); onSaved(); } catch { /* ignore */ }
  }

  async function deleteCheckpoint(id: number) {
    if (!confirm('Remove this checkpoint?')) return;
    try { await goalCheckpointsApi.delete(id); onSaved(); } catch { /* ignore */ }
  }

  async function deleteNutritionSchedule(id: number) {
    if (!confirm('Remove this recurring nutrition schedule?')) return;
    try { await nutritionSchedulesApi.delete(id); onSaved(); } catch { /* ignore */ }
  }

  const nutritionCount = (nutritionOverride ? 1 : 0) + nutritionScheduleEvents.length;

  const tabs: { key: DayModalTab; label: string; count?: number }[] = [
    { key: 'workout',    label: 'Workout',    count: workoutEvents.length || undefined },
    { key: 'meal',       label: 'Meals',      count: mealEvents.length || undefined },
    { key: 'checkpoint', label: 'Goals',      count: dayCheckpoints.length || undefined },
    { key: 'nutrition',  label: 'Nutrition',  count: nutritionCount || undefined },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60" onClick={onClose}>
      <div
        className="bg-dram-card border border-slate-600 rounded-t-2xl sm:rounded-2xl w-full sm:max-w-lg mx-4 max-h-[90vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-5 pb-3 shrink-0">
          <div>
            <p className="text-base text-slate-500 uppercase tracking-wide">{fmtDisplayDate(date)}</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-200 text-xl leading-none">×</button>
        </div>

        {/* Tab bar */}
        <div className="flex gap-1 px-5 pb-3 shrink-0 border-b border-slate-600">
          {tabs.map(({ key, label, count }) => (
            <button key={key} onClick={() => { setTab(key); setAdding(false); setEditCheckpoint(null); }}
              className={`flex-1 text-base py-1.5 rounded-lg transition-colors relative ${tab === key ? 'bg-dram-accent text-black font-semibold' : 'bg-dram-border text-slate-300 hover:text-slate-100'}`}
            >
              {label}
              {count != null && (
                <span className={`absolute -top-1 -right-1 w-4 h-4 rounded-full text-[10px] font-bold flex items-center justify-center ${tab === key ? 'bg-black/20 text-black' : 'bg-dram-accent text-black'}`}>{count}</span>
              )}
            </button>
          ))}
        </div>

        {/* Tab content */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">

          {/* WORKOUT TAB */}
          {tab === 'workout' && (
            <>
              {workoutEvents.length === 0 && !adding && (
                <p className="text-base text-slate-500">No workout scheduled.</p>
              )}
              {workoutEvents.map((ev) => {
                const sch = workoutSchedules.find((s) => s.id === ev.scheduleId);
                return (
                  <div key={ev.scheduleId} className="flex items-center gap-3 py-2 border-b border-slate-600 last:border-0">
                    <div className="flex-1 min-w-0">
                      <p className="text-base text-slate-200">
                        {ev.isRestDay ? 'Rest day' : (ev.exerciseName ?? ev.routineName ?? 'Workout')}
                      </p>
                      {sch && <p className="text-base text-slate-500">{sch.recurrenceDescription}</p>}
                    </div>
                    <span className={`text-base px-2 py-0.5 rounded-full font-medium ${ev.status === 'completed' ? 'bg-green-500/20 text-green-400' : ev.status === 'skipped' ? 'bg-red-500/20 text-red-400' : 'bg-dram-accent/20 text-dram-accent'}`}>
                      {ev.status}
                    </span>
                    {sch && (
                      <button onClick={() => deleteSchedule(sch.id)} className="text-slate-500 hover:text-red-400 text-base px-1 transition-colors">✕</button>
                    )}
                  </div>
                );
              })}
              {adding ? (
                <AddWorkoutModal
                  defaultDate={date}
                  routinesList={routinesList}
                  exercisesList={exercisesList}
                  onClose={() => setAdding(false)}
                  onSaved={() => { setAdding(false); onSaved(); }}
                />
              ) : (
                <button onClick={() => setAdding(true)} className="w-full border border-dram-accent text-dram-accent text-base font-semibold rounded-lg py-2 hover:brightness-110 transition">
                  + Add workout
                </button>
              )}
            </>
          )}

          {/* MEAL TAB */}
          {tab === 'meal' && (
            <>
              {mealEvents.length === 0 && !adding && (
                <p className="text-base text-slate-500">No meal events scheduled.</p>
              )}
              {mealEvents.map((ev) => {
                const sch = mealSchedules.find((s) => s.id === ev.scheduleId);
                return (
                  <div key={`${ev.scheduleId}-${ev.date}`} className="flex items-center gap-3 py-2 border-b border-slate-600 last:border-0">
                    <div className="flex-1 min-w-0">
                      <p className="text-base text-slate-200">{ev.label}</p>
                      {ev.mealSlot && <p className="text-base text-slate-500 capitalize">{ev.mealSlot}</p>}
                      {sch && <p className="text-base text-slate-600">{sch.recurrenceDescription}</p>}
                    </div>
                    {sch && (
                      <button onClick={() => deleteMealSchedule(sch.id)} className="text-slate-500 hover:text-red-400 text-base px-1 transition-colors">✕</button>
                    )}
                  </div>
                );
              })}
              {adding ? (
                <AddMealScheduleForm
                  defaultDate={date}
                  onClose={() => setAdding(false)}
                  onSaved={() => { setAdding(false); onSaved(); }}
                />
              ) : (
                <button onClick={() => setAdding(true)} className="w-full border border-dram-accent text-dram-accent text-base font-semibold rounded-lg py-2 hover:brightness-110 transition">
                  + Add meal event
                </button>
              )}
            </>
          )}

          {/* CHECKPOINT TAB */}
          {tab === 'checkpoint' && (
            <>
              {dayCheckpoints.length === 0 && !adding && !editCheckpoint && (
                <p className="text-base text-slate-500">No goal checkpoints for this date.</p>
              )}
              {dayCheckpoints.map((cp) => (
                editCheckpoint?.id === cp.id ? (
                  <AddCheckpointForm
                    key={cp.id}
                    defaultDate={date}
                    editing={cp}
                    onClose={() => setEditCheckpoint(null)}
                    onSaved={() => { setEditCheckpoint(null); onSaved(); }}
                  />
                ) : (
                  <div key={cp.id} className="flex items-center gap-3 py-2 border-b border-slate-600 last:border-0">
                    <div className="flex-1 min-w-0">
                      <p className="text-base text-slate-200">
                        {METRIC_CONFIG[cp.metric]?.label ?? cp.metric} → {cp.targetValue} {cp.unit}
                      </p>
                      {cp.notes && <p className="text-base text-slate-500">{cp.notes}</p>}
                    </div>
                    <button onClick={() => setEditCheckpoint(cp)} className="text-base text-dram-accent hover:brightness-110 px-1">Edit</button>
                    <button onClick={() => deleteCheckpoint(cp.id)} className="text-slate-500 hover:text-red-400 text-base px-1 transition-colors">✕</button>
                  </div>
                )
              ))}
              {!editCheckpoint && (
                adding ? (
                  <AddCheckpointForm
                    defaultDate={date}
                    onClose={() => setAdding(false)}
                    onSaved={() => { setAdding(false); onSaved(); }}
                  />
                ) : (
                  <button onClick={() => setAdding(true)} className="w-full border border-dram-accent text-dram-accent text-base font-semibold rounded-lg py-2 hover:brightness-110 transition">
                    + Add checkpoint
                  </button>
                )
              )}
            </>
          )}

          {/* NUTRITION TAB */}
          {tab === 'nutrition' && (
            <>
              {/* One-time override for this day */}
              {nutritionOverride && !adding && (
                <div className="bg-dram-bg/50 rounded-lg p-3 space-y-1.5">
                  <div className="flex items-center justify-between">
                    <p className="text-base font-medium text-slate-200">
                      {nutritionOverride.dayTypeName ?? 'This day'}
                      <span className="ml-2 text-base text-slate-500 font-normal">— one time</span>
                    </p>
                    <button onClick={() => dayTypesApi.deleteOverride(date).then(onSaved)} className="text-slate-500 hover:text-red-400 text-base px-1 transition-colors">✕</button>
                  </div>
                  {nutritionOverride.calories    != null && <p className="text-base text-slate-300">Calories — {nutritionOverride.calories} kcal</p>}
                  {nutritionOverride.proteinG    != null && <p className="text-base text-slate-300">Protein — {nutritionOverride.proteinG}g</p>}
                  {nutritionOverride.carbsG      != null && <p className="text-base text-slate-300">Carbs — {nutritionOverride.carbsG}g</p>}
                  {nutritionOverride.fatG        != null && <p className="text-base text-slate-300">Fat — {nutritionOverride.fatG}g</p>}
                  {nutritionOverride.waterGoalOz != null && <p className="text-base text-slate-300">Water — {Math.round(nutritionOverride.waterGoalOz / GLASS_OZ)} glasses</p>}
                </div>
              )}

              {/* Recurring nutrition schedules active on this day */}
              {nutritionScheduleEvents.map((ev) => {
                const sch = nutritionSchedules.find((s) => s.id === ev.scheduleId);
                return (
                  <div key={ev.scheduleId} className="bg-dram-bg/50 rounded-lg p-3 space-y-1.5">
                    <div className="flex items-center justify-between">
                      <p className="text-base font-medium text-slate-200">
                        {ev.dayTypeName ?? 'Custom targets'}
                        <span className="ml-2 text-base text-slate-500 font-normal">— {ev.recurrenceDescription}</span>
                      </p>
                      {sch && <button onClick={() => deleteNutritionSchedule(sch.id)} className="text-slate-500 hover:text-red-400 text-base px-1 transition-colors">✕</button>}
                    </div>
                    {ev.calories    != null && <p className="text-base text-slate-300">Calories — {ev.calories} kcal</p>}
                    {ev.proteinG    != null && <p className="text-base text-slate-300">Protein — {ev.proteinG}g</p>}
                    {ev.carbsG      != null && <p className="text-base text-slate-300">Carbs — {ev.carbsG}g</p>}
                    {ev.fatG        != null && <p className="text-base text-slate-300">Fat — {ev.fatG}g</p>}
                    {ev.waterGoalOz != null && <p className="text-base text-slate-300">Water — {Math.round(ev.waterGoalOz / GLASS_OZ)} glasses</p>}
                  </div>
                );
              })}

              {nutritionCount === 0 && !adding && (
                <p className="text-base text-slate-500">No nutrition targets for this day — using global goals.</p>
              )}

              {adding ? (
                <NutritionOverrideForm
                  date={date}
                  existing={nutritionOverride}
                  presets={presets}
                  onClose={() => setAdding(false)}
                  onSaved={() => { setAdding(false); onSaved(); }}
                />
              ) : (
                <button onClick={() => setAdding(true)} className="w-full border border-dram-accent text-dram-accent text-base font-semibold rounded-lg py-2 hover:brightness-110 transition">
                  + Set nutrition targets
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Calendar Grid ────────────────────────────────────────────────────────────

function DayCell({
  dateStr,
  isToday,
  isOutsideMonth,
  workoutEvents,
  mealEvents,
  checkpoints,
  hasOverride,
  onClick,
}: {
  dateStr: string | null;
  isToday: boolean;
  isOutsideMonth: boolean;
  workoutEvents: UpcomingSession[];
  mealEvents: MealScheduleEvent[];
  checkpoints: GoalCheckpoint[];
  hasOverride: boolean;
  onClick: () => void;
}) {
  if (!dateStr) {
    return <div className="min-h-[70px] bg-dram-bg/20 border-r border-b border-slate-600" />;
  }

  const dayNum = Number(dateStr.slice(8));
  const hasWorkout = workoutEvents.some((e) => !e.isRestDay);
  const isRestDay  = workoutEvents.some((e) => e.isRestDay);
  const hasMeal    = mealEvents.length > 0;
  const hasGoal    = checkpoints.length > 0;

  return (
    <button
      onClick={onClick}
      className={`min-h-[70px] border-r border-b border-slate-600 p-1.5 text-left flex flex-col gap-1 transition-colors w-full
        ${isToday ? 'bg-dram-accent/20' : 'bg-transparent hover:bg-dram-card/60'}
        ${isOutsideMonth ? 'opacity-40' : ''}`}
    >
      <span className={`text-base font-medium leading-none ${isToday ? 'text-dram-accent' : 'text-slate-300'}`}>
        {dayNum}
      </span>

      {/* Event dots */}
      <div className="flex flex-wrap gap-0.5 mt-auto">
        {hasWorkout && (
          <span className="w-1.5 h-1.5 rounded-full bg-dram-accent" title="Workout" />
        )}
        {isRestDay && (
          <span className="w-1.5 h-1.5 rounded-full bg-slate-500" title="Rest day" />
        )}
        {hasMeal && (
          <span className="w-1.5 h-1.5 rounded-full bg-blue-400" title="Meal event" />
        )}
        {hasGoal && (
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" title="Goal checkpoint" />
        )}
        {hasOverride && (
          <span className="w-1.5 h-1.5 rounded-full bg-purple-400" title="Custom nutrition" />
        )}
      </div>

      {/* First event label (compact) */}
      {(hasWorkout || isRestDay || hasMeal) && (
        <span className="text-sm text-slate-300 leading-tight truncate w-full font-medium">
          {isRestDay && !hasWorkout ? 'Rest' : (workoutEvents.find((e) => !e.isRestDay)?.exerciseName ?? workoutEvents.find((e) => !e.isRestDay)?.routineName ?? (hasMeal ? mealEvents[0].label : ''))}
        </span>
      )}
    </button>
  );
}

// ─── Main Calendar Card ───────────────────────────────────────────────────────

export default function PlanningCalendarCard({
  routinesList,
  exercisesList,
}: {
  routinesList: RoutineSummary[];
  exercisesList: Exercise[];
}) {
  const today = todayStr();

  // Calendar state
  const [monthStart, setMonthStart] = useState(() => {
    const d = new Date(today + 'T12:00:00');
    d.setDate(1);
    return localDateStr(d);
  });
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  // Data
  const [upcomingSessions,   setUpcomingSessions]   = useState<UpcomingSession[]>([]);
  const [workoutSchedules,   setWorkoutSchedules]   = useState<WorkoutSchedule[]>([]);
  const [mealEvents,         setMealEvents]         = useState<MealScheduleEvent[]>([]);
  const [mealSchedules,      setMealSchedules]      = useState<MealSchedule[]>([]);
  const [checkpoints,             setCheckpoints]             = useState<GoalCheckpoint[]>([]);
  const [nutritionOverrides,      setNutritionOverrides]      = useState<DailyNutritionOverride[]>([]);
  const [nutritionScheduleEvents, setNutritionScheduleEvents] = useState<NutritionScheduleEvent[]>([]);
  const [nutritionSchedules,      setNutritionSchedules]      = useState<NutritionSchedule[]>([]);
  const [dayTypePresets,          setDayTypePresets]          = useState<DayTypePreset[]>([]);
  const [loading,                 setLoading]                 = useState(true);

  const load = useCallback(async () => {
    try {
      const [sessions, wScheds, mEvts, mScheds, cps, presets, nScheds, nSchedEvts] = await Promise.all([
        schedulesApi.getUpcoming(60).catch(() => []),
        schedulesApi.getAll().catch(() => []),
        mealSchedulesApi.getUpcoming(60).catch(() => []),
        mealSchedulesApi.getAll().catch(() => []),
        goalCheckpointsApi.getAll().catch(() => []),
        dayTypesApi.getPresets().catch(() => []),
        nutritionSchedulesApi.getAll().catch(() => []),
        nutritionSchedulesApi.getUpcoming(60).catch(() => []),
      ]);
      setUpcomingSessions(sessions as UpcomingSession[]);
      setWorkoutSchedules(wScheds as WorkoutSchedule[]);
      setMealEvents(mEvts as MealScheduleEvent[]);
      setMealSchedules(mScheds as MealSchedule[]);
      setCheckpoints(cps as GoalCheckpoint[]);
      setDayTypePresets(presets as DayTypePreset[]);
      setNutritionSchedules(nScheds as NutritionSchedule[]);
      setNutritionScheduleEvents(nSchedEvts as NutritionScheduleEvent[]);

      // Load one-time overrides for ±2 months
      const from = addDays(today, -7);
      const to   = addDays(today, 60);
      const overrides = await dayTypesApi.getOverrides(from, to).catch(() => []);
      setNutritionOverrides(overrides as DailyNutritionOverride[]);
    } finally { setLoading(false); }
  }, [today]);

  useEffect(() => { load(); }, [load]);

  // Build calendar grid (full weeks covering the visible month + overflow)
  const calendarDays = (() => {
    const start = new Date(monthStart + 'T12:00:00');
    // Find Monday of the week containing the 1st
    const dow = start.getDay(); // 0=Sun
    const mondayOffset = dow === 0 ? -6 : 1 - dow;
    const gridStart = new Date(start);
    gridStart.setDate(start.getDate() + mondayOffset);

    // Show 5 weeks (35 days) always
    const days: (string | null)[] = [];
    for (let i = 0; i < 35; i++) {
      const d = new Date(gridStart);
      d.setDate(gridStart.getDate() + i);
      days.push(localDateStr(d));
    }
    return days;
  })();

  const monthYear = new Date(monthStart + 'T12:00:00').toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

  function shiftMonth(delta: number) {
    const d = new Date(monthStart + 'T12:00:00');
    d.setMonth(d.getMonth() + delta);
    d.setDate(1);
    setMonthStart(localDateStr(d));
  }

  const currentMonth = monthStart.slice(0, 7);

  function getEventsForDate(date: string) {
    return {
      workoutEvents:          upcomingSessions.filter((e) => e.date === date),
      mealEvents:             mealEvents.filter((e) => e.date === date),
      checkpoints:            checkpoints.filter((c) => c.targetDate === date),
      nutritionOverride:      nutritionOverrides.find((o) => o.date === date) ?? null,
      nutritionScheduleEvents: nutritionScheduleEvents.filter((e) => e.date === date),
    };
  }

  const selectedEvents = selectedDate ? getEventsForDate(selectedDate) : null;

  return (
    <>
      <div className="bg-dram-card border border-slate-600 overflow-hidden">
        {/* Gold top bar */}
        <div className="h-[3px] bg-dram-accent" />

        <div className="p-5">
          {/* Header */}
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div style={{ width: 14, height: 2, background: '#D4A843' }} />
              <h2 className="text-base font-semibold uppercase tracking-wider text-white">Calendar</h2>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={() => shiftMonth(-1)} className="text-slate-400 hover:text-slate-200 w-6 text-center">‹</button>
              <span className="text-base text-slate-300 min-w-[130px] text-center">{monthYear}</span>
              <button onClick={() => shiftMonth(1)} className="text-slate-400 hover:text-slate-200 w-6 text-center">›</button>
            </div>
          </div>

          {/* Legend */}
          <div className="flex gap-4 mb-3 flex-wrap">
            {[
              { color: 'bg-dram-accent', label: 'Workout' },
              { color: 'bg-slate-500',   label: 'Rest' },
              { color: 'bg-blue-400',    label: 'Meal event' },
              { color: 'bg-emerald-400', label: 'Goal checkpoint' },
              { color: 'bg-purple-400',  label: 'Custom nutrition' },
            ].map(({ color, label }) => (
              <div key={label} className="flex items-center gap-1.5">
                <span className={`w-2 h-2 rounded-full ${color}`} />
                <span className="text-base text-slate-500">{label}</span>
              </div>
            ))}
          </div>

          {/* DOW headers */}
          <div className="grid grid-cols-7 border-b border-slate-600 mb-0">
            {DOW.map((d) => (
              <div key={d} className="text-base text-slate-500 text-center py-1">{d}</div>
            ))}
          </div>

          {/* Calendar grid */}
          {loading ? (
            <div className="h-[350px] flex items-center justify-center text-slate-500 text-base">Loading…</div>
          ) : (
            <div className="grid grid-cols-7 border-l border-t border-slate-600">
              {calendarDays.map((dateStr, i) => {
                if (!dateStr) return <DayCell key={i} dateStr={null} isToday={false} isOutsideMonth={false} workoutEvents={[]} mealEvents={[]} checkpoints={[]} hasOverride={false} onClick={() => {}} />;
                const { workoutEvents, mealEvents: me, checkpoints: cp, nutritionOverride, nutritionScheduleEvents: nse } = getEventsForDate(dateStr);
                return (
                  <DayCell
                    key={dateStr}
                    dateStr={dateStr}
                    isToday={dateStr === today}
                    isOutsideMonth={dateStr.slice(0, 7) !== currentMonth}
                    workoutEvents={workoutEvents}
                    mealEvents={me}
                    checkpoints={cp}
                    hasOverride={nutritionOverride != null || nse.length > 0}
                    onClick={() => setSelectedDate(dateStr)}
                  />
                );
              })}
            </div>
          )}

          {/* Upcoming goal checkpoints list */}
          {checkpoints.length > 0 && (
            <div className="mt-4 pt-4 border-t border-slate-600">
              <p className="text-base font-semibold text-slate-500 uppercase tracking-wide mb-2">Goal Checkpoints</p>
              <div className="space-y-1">
                {checkpoints
                  .filter((c) => c.targetDate >= today)
                  .sort((a, b) => a.targetDate.localeCompare(b.targetDate))
                  .slice(0, 6)
                  .map((c) => (
                    <div key={c.id} className="flex items-center justify-between text-base">
                      <span className="text-slate-300">
                        {METRIC_CONFIG[c.metric]?.label ?? c.metric} → {c.targetValue} {c.unit}
                        {c.notes && <span className="text-slate-500 ml-1">· {c.notes}</span>}
                      </span>
                      <span className="text-slate-500 ml-3 shrink-0">{fmtShortDate(c.targetDate)}</span>
                    </div>
                  ))
                }
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Day modal */}
      {selectedDate && selectedEvents && (
        <DayModal
          date={selectedDate}
          workoutEvents={selectedEvents.workoutEvents}
          mealEvents={selectedEvents.mealEvents}
          checkpoints={selectedEvents.checkpoints}
          nutritionOverride={selectedEvents.nutritionOverride}
          nutritionScheduleEvents={selectedEvents.nutritionScheduleEvents}
          nutritionSchedules={nutritionSchedules}
          presets={dayTypePresets}
          routinesList={routinesList}
          exercisesList={exercisesList}
          workoutSchedules={workoutSchedules}
          mealSchedules={mealSchedules}
          onClose={() => setSelectedDate(null)}
          onSaved={() => { load(); }}
        />
      )}
    </>
  );
}
