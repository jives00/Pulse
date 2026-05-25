import { useState, useEffect, useCallback } from 'react';
import {
  schedulesApi, goalCheckpointsApi, dayTypesApi, mealSchedulesApi, nutritionSchedulesApi,
  foodsApi, recipesApi,
  GLASS_OZ,
  type UpcomingSession, type WorkoutSchedule, type RoutineSummary, type Exercise,
  type GoalCheckpoint, type DayTypePreset, type DailyNutritionOverride,
  type MealSchedule, type MealScheduleEvent, type MealSlotType, type MealRecurrenceType,
  type NutritionSchedule, type NutritionScheduleEvent,
  type RecurrenceType, type Food, type Recipe,
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

function todayStr() {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

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
  cycleItems, setCycleItems,
  cycleItemType, setCycleItemType,
  cycleItemId, setCycleItemId,
  cycleDays, setCycleDays,
  restFrequency, setRestFrequency,
  alwaysRestWeekends, setAlwaysRestWeekends,
  exercisesList,
  routinesList,
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
  cycleItems?: { type: 'exercise' | 'routine'; id: number }[]; setCycleItems?: (v: { type: 'exercise' | 'routine'; id: number }[]) => void;
  cycleItemType?: 'exercise' | 'routine'; setCycleItemType?: (v: 'exercise' | 'routine') => void;
  cycleItemId?: number | null; setCycleItemId?: (v: number | null) => void;
  cycleDays?: number[]; setCycleDays?: (v: number[]) => void;
  restFrequency?: string; setRestFrequency?: (v: string) => void;
  alwaysRestWeekends?: boolean; setAlwaysRestWeekends?: (v: boolean) => void;
  exercisesList?: Exercise[];
  routinesList?: RoutineSummary[];
}) {
  const types: { value: AnyRecurrence; label: string }[] = [
    ...(includOnce ? [{ value: 'once' as AnyRecurrence, label: 'Once' }] : []),
    { value: 'daily',           label: 'Daily' },
    { value: 'every_other_day', label: 'Every other day' },
    { value: 'days_of_week',    label: 'Days of week' },
    { value: 'every_x_days',    label: 'Every X days' },
    { value: 'day_of_month',    label: 'Day of month' },
    { value: 'custom_cycle',    label: 'Custom cycle' },
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

      {recType === 'custom_cycle' && cycleItems && setCycleItems && cycleItemType !== undefined && setCycleItemType && cycleItemId !== undefined && setCycleItemId && cycleDays && setCycleDays && restFrequency && setRestFrequency && alwaysRestWeekends !== undefined && setAlwaysRestWeekends && exercisesList && routinesList ? (() => {
        const items = cycleItems;
        const setItems = setCycleItems;
        const itemType = cycleItemType;
        const setItemType = setCycleItemType;
        const itemId = cycleItemId;
        const setItemId = setCycleItemId;
        const days = cycleDays;
        const setDays = setCycleDays;
        const freq = restFrequency;
        const setFreq = setRestFrequency;
        const weekends = alwaysRestWeekends;
        const setWeekends = setAlwaysRestWeekends;
        return (
        <div className="space-y-3">
          <div>
            <label className="block text-base text-slate-500 mb-1.5">Rotation items</label>
            <div className="space-y-1 mb-2">
              {items.map((item, idx) => {
                const name = item.type === 'exercise'
                  ? exercisesList.find(e => e.id === item.id)?.name
                  : routinesList.find(r => r.id === item.id)?.name;
                return (
                  <div key={idx} className="flex items-center gap-2 bg-dram-bg/50 rounded px-2 py-1">
                    <span className="text-xs text-slate-400">{item.type === 'routine' ? 'R' : 'E'}</span>
                    <span className="text-sm text-slate-300 flex-1">{idx + 1}. {name || `${item.type} ${item.id}`}</span>
                    <button type="button" onClick={() => setItems(items.filter((_, i) => i !== idx))}
                      className="text-slate-500 hover:text-red-400 text-sm px-1 transition-colors">✕</button>
                  </div>
                );
              })}
            </div>
            <div className="space-y-2 mb-2">
              <div className="flex gap-2">
                {(['exercise', 'routine'] as const).map(t => (
                  <button key={t} type="button" onClick={() => { setItemType(t); setItemId(null); }}
                    className={`flex-1 px-2.5 py-1 rounded text-sm transition-colors ${itemType === t ? 'bg-dram-accent text-black font-semibold' : 'bg-dram-border text-slate-300 hover:text-slate-100'}`}
                  >{t === 'routine' ? 'Routine' : 'Exercise'}</button>
                ))}
              </div>
              {itemType === 'exercise' ? (
                <select value={itemId ?? ''} onChange={(e) => {
                  const id = Number(e.target.value);
                  if (id && !items.some(item => item.type === 'exercise' && item.id === id)) {
                    setItems([...items, { type: 'exercise', id }]);
                    setItemId(null);
                  }
                }} className={inputCls} defaultValue="">
                  <option value="">+ Add exercise…</option>
                  {exercisesList.map(ex => (
                    <option key={ex.id} value={ex.id} disabled={items.some(item => item.type === 'exercise' && item.id === ex.id)}>
                      {ex.name}
                    </option>
                  ))}
                </select>
              ) : (
                <select value={itemId ?? ''} onChange={(e) => {
                  const id = Number(e.target.value);
                  if (id && !items.some(item => item.type === 'routine' && item.id === id)) {
                    setItems([...items, { type: 'routine', id }]);
                    setItemId(null);
                  }
                }} className={inputCls} defaultValue="">
                  <option value="">+ Add routine…</option>
                  {routinesList.map(r => (
                    <option key={r.id} value={r.id} disabled={items.some(item => item.type === 'routine' && item.id === r.id)}>
                      {r.name}
                    </option>
                  ))}
                </select>
              )}
            </div>
          </div>

          <div>
            <label className="block text-base text-slate-500 mb-1.5">Workout days</label>
            <div className="flex gap-1 flex-wrap">
              {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((day, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => setDays(days.includes(idx) ? days.filter((d: number) => d !== idx) : [...days, idx])}
                  className={`px-2.5 py-1 rounded text-xs transition-colors ${
                    days.includes(idx)
                      ? 'bg-dram-accent text-black font-semibold'
                      : 'bg-dram-border text-slate-300 hover:text-slate-100'
                  }`}
                >
                  {day}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 mt-3">
            <div>
              <label className="block text-base text-slate-500 mb-1">Rest after N items</label>
              <input type="number" min="1" value={freq || '3'} onChange={(e) => setFreq(e.target.value)} className={inputCls} />
            </div>
            <div className="flex items-end">
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={weekends || false} onChange={(e) => setWeekends(e.target.checked)} className="w-4 h-4" />
                <span className="text-sm text-slate-300">Always rest weekends</span>
              </label>
            </div>
          </div>
        </div>
        );
      })() : null}

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

  // Custom cycle state - stores items as { type: 'exercise'|'routine', id: number }
  const [cycleItems,         setCycleItems]         = useState<{ type: 'exercise' | 'routine'; id: number }[]>([]);
  const [cycleItemType,      setCycleItemType]      = useState<'exercise' | 'routine'>('exercise');
  const [cycleItemId,        setCycleItemId]        = useState<number | null>(null);
  const [cycleDays,          setCycleDays]          = useState<number[]>([0, 1, 2, 4]); // Mon, Tue, Wed, Fri
  const [restFrequency,      setRestFrequency]      = useState('3');
  const [alwaysRestWeekends, setAlwaysRestWeekends] = useState(false);

  const isRestDay = scheduleType === 'rest';
  const isCustomCycle = recType === 'custom_cycle';
  const canSave = isRestDay || isCustomCycle || (scheduleType === 'routine' ? routineId !== null : exerciseId !== null);

  async function handleSave() {
    if (!canSave) return;
    if (isCustomCycle && cycleItems.length === 0) return;
    setSaving(true);
    try {
      const apiRecType = (recType === 'once' ? 'days_of_week' : recType) as RecurrenceType;
      const config = recType === 'once'
        ? { days: [new Date(startDate + 'T12:00:00').getDay() === 0 ? 6 : new Date(startDate + 'T12:00:00').getDay() - 1] }
        : recType === 'custom_cycle'
        ? { items: cycleItems, days: cycleDays, restFrequency: Number(restFrequency) || 1, alwaysRestWeekends }
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
        cycleItems={cycleItems} setCycleItems={setCycleItems}
        cycleItemType={cycleItemType} setCycleItemType={setCycleItemType}
        cycleItemId={cycleItemId} setCycleItemId={setCycleItemId}
        cycleDays={cycleDays} setCycleDays={setCycleDays}
        restFrequency={restFrequency} setRestFrequency={setRestFrequency}
        alwaysRestWeekends={alwaysRestWeekends} setAlwaysRestWeekends={setAlwaysRestWeekends}
        exercisesList={exercisesList}
        routinesList={routinesList}
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
  const [mode, setMode]             = useState<'pick' | 'configure'>('pick');
  const [foodTab, setFoodTab]       = useState<'food' | 'recipe' | 'custom'>('food');
  const [search, setSearch]         = useState('');
  const [foodResults, setFoodResults] = useState<Food[]>([]);
  const [recipeResults, setRecipeResults] = useState<Recipe[]>([]);
  const [searching, setSearching]   = useState(false);

  // Selected food
  const [selectedFood, setSelectedFood] = useState<Food | null>(null);
  const [selectedServingId, setSelectedServingId] = useState<number | null>(null);
  const [quantity, setQuantity]     = useState('1');

  // Selected recipe
  const [selectedRecipe, setSelectedRecipe] = useState<Recipe | null>(null);
  const [recipeServings, setRecipeServings] = useState('1');

  // Custom label
  const [label,      setLabel]      = useState('');

  // Macros (editable)
  const [calories,   setCalories]   = useState('');
  const [protein,    setProtein]    = useState('');
  const [carbs,      setCarbs]      = useState('');
  const [fat,        setFat]        = useState('');

  // Recurrence
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

  // Custom cycle state for nutrition
  const [cycleItems,         setCycleItems]         = useState<any[]>([]);
  const [cycleItemType,      setCycleItemType]      = useState<any>('food');
  const [cycleItemId,        setCycleItemId]        = useState<number | null>(null);
  const [cycleDays,          setCycleDays]          = useState<number[]>([0, 1, 2, 4]);
  const [restFrequency,      setRestFrequency]      = useState('3');
  const [alwaysRestWeekends, setAlwaysRestWeekends] = useState(false);

  // Search foods/recipes
  useEffect(() => {
    const timer = setTimeout(async () => {
      if (!search.trim()) { setFoodResults([]); setRecipeResults([]); return; }
      setSearching(true);
      try {
        if (foodTab === 'food') {
          setFoodResults(await foodsApi.search(search, 20));
        } else {
          setRecipeResults(await recipesApi.getAll({ search, type: 'food', limit: 30 }));
        }
      } finally { setSearching(false); }
    }, 400);
    return () => clearTimeout(timer);
  }, [search, foodTab]);

  // Set default serving and compute macros when food selected
  useEffect(() => {
    if (selectedFood && selectedServingId) {
      const def = selectedFood.servingSizes.find(s => s.isDefault) ?? selectedFood.servingSizes[0];
      setSelectedServingId(def?.id ?? null);
      const ss = def;
      const qty = Number(quantity) || 1;
      const factor = (ss.grams * qty) / 100;
      setCalories(String(Math.round(selectedFood.nutrition.calories * factor * 100) / 100));
      setProtein(String(Math.round(selectedFood.nutrition.protein * factor * 100) / 100));
      setCarbs(String(Math.round(selectedFood.nutrition.carbs * factor * 100) / 100));
      setFat(String(Math.round(selectedFood.nutrition.fat * factor * 100) / 100));
    }
  }, [selectedFood]);

  // Recompute macros when quantity changes
  useEffect(() => {
    if (selectedFood && selectedServingId && quantity) {
      const ss = selectedFood.servingSizes.find(s => s.id === selectedServingId);
      if (ss) {
        const qty = Number(quantity) || 1;
        const factor = (ss.grams * qty) / 100;
        setCalories(String(Math.round(selectedFood.nutrition.calories * factor * 100) / 100));
        setProtein(String(Math.round(selectedFood.nutrition.protein * factor * 100) / 100));
        setCarbs(String(Math.round(selectedFood.nutrition.carbs * factor * 100) / 100));
        setFat(String(Math.round(selectedFood.nutrition.fat * factor * 100) / 100));
      }
    }
  }, [quantity, selectedServingId, selectedFood]);

  // Compute macros for recipe when selected
  useEffect(() => {
    if (selectedRecipe && recipeServings) {
      const totalServings = selectedRecipe.servings || 1;
      const factor = Number(recipeServings) / totalServings;
      setCalories(String(Math.round(Number(selectedRecipe.calories) * factor * 100) / 100));
      setProtein(String(Math.round(Number(selectedRecipe.protein_g) * factor * 100) / 100));
      setCarbs(String(Math.round(Number(selectedRecipe.carbs_g) * factor * 100) / 100));
      setFat(String(Math.round(Number(selectedRecipe.fat_g) * factor * 100) / 100));
    }
  }, [selectedRecipe, recipeServings]);

  async function handleSave() {
    setSaving(true);
    try {
      const foodId = foodTab === 'food' ? selectedFood?.id : null;
      const servingSizeId = foodTab === 'food' ? selectedServingId : null;
      const quantityNum = foodTab === 'food' ? Number(quantity) || 1 : null;
      const recipeId = foodTab === 'recipe' ? selectedRecipe?.id : null;
      const recipeServingsNum = foodTab === 'recipe' ? Number(recipeServings) || 1 : null;
      const labelText = foodTab === 'custom' ? label.trim() : (selectedFood?.name || selectedRecipe?.name || label.trim());

      const caloriesNum = calories.trim() ? Number(calories) : null;
      const proteinNum = protein.trim() ? Number(protein) : null;
      const carbsNum = carbs.trim() ? Number(carbs) : null;
      const fatNum = fat.trim() ? Number(fat) : null;

      await mealSchedulesApi.create({
        mealSlot: mealSlot || null,
        label: labelText,
        foodId,
        servingSizeId,
        quantity: quantityNum,
        recipeId,
        recipeServings: recipeServingsNum,
        calories: caloriesNum,
        proteinG: proteinNum,
        carbsG: carbsNum,
        fatG: fatNum,
        recurrenceType: recType as MealRecurrenceType,
        recurrenceConfig: buildRecurrenceConfig(recType, dowDays, xInterval, domType, domDates, domN, domWeekday),
        startDate,
        endDate: recType === 'once' ? startDate : (endDate.trim() || null),
      });
      onSaved();
    } catch { /* ignore */ } finally { setSaving(false); }
  }

  if (mode === 'pick') {
    return (
      <div className="space-y-4">
        <div className="flex gap-2">
          {(['food', 'recipe', 'custom'] as const).map(t => (
            <button key={t}
              onClick={() => { setFoodTab(t); setSearch(''); setSelectedFood(null); setSelectedRecipe(null); }}
              className={`flex-1 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors
                ${foodTab === t ? 'bg-dram-accent text-black' : 'bg-dram-border text-slate-300 hover:text-slate-100'}`}>
              {t === 'food' ? 'Food' : t === 'recipe' ? 'Recipe' : 'Custom'}
            </button>
          ))}
        </div>

        {foodTab !== 'custom' && (
          <>
            <input
              className={inputCls}
              placeholder={foodTab === 'food' ? 'Search foods…' : 'Search recipes…'}
              value={search}
              onChange={e => { setSearch(e.target.value); setSelectedFood(null); setSelectedRecipe(null); }}
              autoFocus
            />

            {!selectedFood && !selectedRecipe && (
              <div className="max-h-52 overflow-y-auto space-y-1">
                {searching && <p className="text-xs text-slate-500 text-center py-3">Searching…</p>}
                {!searching && !search.trim() && <p className="text-xs text-slate-500 text-center py-3">Type to search</p>}
                {foodTab === 'food' && !searching && foodResults.map(f => {
                  const def = f.servingSizes.find(s => s.isDefault) ?? f.servingSizes[0];
                  const cal = def ? Math.round(f.nutrition.calories * def.grams / 100) : null;
                  return (
                    <button key={f.id} onClick={() => setSelectedFood(f)}
                      className="w-full text-left px-3 py-2 rounded hover:bg-white/5 flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-sm text-slate-200 truncate">{f.name}</p>
                        {f.brand && <p className="text-xs text-slate-500 truncate">{f.brand}</p>}
                      </div>
                      {cal != null && <span className="text-xs text-slate-400 shrink-0">{cal} kcal</span>}
                    </button>
                  );
                })}
                {foodTab === 'recipe' && !searching && recipeResults.map(r => (
                  <button key={r.id} onClick={() => setSelectedRecipe(r)}
                    className="w-full text-left px-3 py-2 rounded hover:bg-white/5 flex items-center justify-between gap-2">
                    <p className="text-sm text-slate-200 truncate">{r.name}</p>
                    {r.calories != null && <span className="text-xs text-slate-400 shrink-0">{Math.round(Number(r.calories))} kcal</span>}
                  </button>
                ))}
              </div>
            )}

            {selectedFood && (
              <div className="space-y-3">
                <button onClick={() => setSelectedFood(null)} className="text-xs text-dram-accent hover:opacity-75">← Back</button>
                <div>
                  <label className="block text-xs text-slate-500 mb-1">Serving</label>
                  <select value={selectedServingId ?? ''} onChange={e => setSelectedServingId(Number(e.target.value))}
                    className={inputCls}>
                    {selectedFood.servingSizes.map(s => (
                      <option key={s.id} value={s.id}>{s.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-slate-500 mb-1">Quantity</label>
                  <input type="number" min="0.1" step="0.1" value={quantity} onChange={e => setQuantity(e.target.value)} className={inputCls} />
                </div>
                <button onClick={() => setMode('configure')} className="w-full bg-dram-accent text-black text-sm font-semibold rounded-lg py-2 hover:brightness-110">
                  Next
                </button>
              </div>
            )}

            {selectedRecipe && (
              <div className="space-y-3">
                <button onClick={() => setSelectedRecipe(null)} className="text-xs text-dram-accent hover:opacity-75">← Back</button>
                <div>
                  <label className="block text-xs text-slate-500 mb-1">Servings</label>
                  <input type="number" min="0.1" step="0.1" value={recipeServings} onChange={e => setRecipeServings(e.target.value)} className={inputCls} />
                </div>
                <button onClick={() => setMode('configure')} className="w-full bg-dram-accent text-black text-sm font-semibold rounded-lg py-2 hover:brightness-110">
                  Next
                </button>
              </div>
            )}
          </>
        )}

        {foodTab === 'custom' && (
          <>
            <input type="text" value={label} onChange={e => setLabel(e.target.value)} className={inputCls} placeholder="e.g. Cheat meal, Fasting" autoFocus />
            <button onClick={() => setMode('configure')} disabled={!label.trim()} className="w-full bg-dram-accent text-black text-sm font-semibold rounded-lg py-2 hover:brightness-110 disabled:opacity-50">
              Next
            </button>
          </>
        )}

        <button type="button" onClick={onClose} className="w-full text-base text-slate-400 hover:text-slate-200 py-2 transition-colors">
          Cancel
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <button onClick={() => setMode('pick')} className="text-xs text-dram-accent hover:opacity-75">← Change food</button>

      <div>
        <label className="block text-base text-slate-500 mb-1">Meal slot (optional)</label>
        <select value={mealSlot} onChange={e => setMealSlot(e.target.value as MealSlotType | '')} className={inputCls}>
          {MEAL_SLOTS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
        </select>
      </div>

      {/* Macros */}
      <div>
        <label className="block text-base text-slate-500 mb-2">Macros (editable)</label>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="block text-xs text-slate-500 mb-1">Calories</label>
            <input type="number" min="0" step="0.1" value={calories} onChange={e => setCalories(e.target.value)} className={inputCls} />
          </div>
          <div>
            <label className="block text-xs text-slate-500 mb-1">Protein (g)</label>
            <input type="number" min="0" step="0.1" value={protein} onChange={e => setProtein(e.target.value)} className={inputCls} />
          </div>
          <div>
            <label className="block text-xs text-slate-500 mb-1">Carbs (g)</label>
            <input type="number" min="0" step="0.1" value={carbs} onChange={e => setCarbs(e.target.value)} className={inputCls} />
          </div>
          <div>
            <label className="block text-xs text-slate-500 mb-1">Fat (g)</label>
            <input type="number" min="0" step="0.1" value={fat} onChange={e => setFat(e.target.value)} className={inputCls} />
          </div>
        </div>
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
        cycleItems={cycleItems} setCycleItems={setCycleItems}
        cycleItemType={cycleItemType} setCycleItemType={setCycleItemType}
        cycleItemId={cycleItemId} setCycleItemId={setCycleItemId}
        cycleDays={cycleDays} setCycleDays={setCycleDays}
        restFrequency={restFrequency} setRestFrequency={setRestFrequency}
        alwaysRestWeekends={alwaysRestWeekends} setAlwaysRestWeekends={setAlwaysRestWeekends}
        exercisesList={foodResults as any} routinesList={recipeResults as any}
      />

      <div className="flex gap-2 pt-1">
        <button type="button" onClick={onClose} className="flex-1 text-base text-slate-400 hover:text-slate-200 py-2 transition-colors">Cancel</button>
        <button type="button" onClick={handleSave} disabled={saving}
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

  // Custom cycle state for nutrition
  const [cycleItems,         setCycleItems]         = useState<any[]>([]);
  const [cycleItemType,      setCycleItemType]      = useState<any>('food');
  const [cycleItemId,        setCycleItemId]        = useState<number | null>(null);
  const [cycleDays,          setCycleDays]          = useState<number[]>([0, 1, 2, 4]);
  const [restFrequency,      setRestFrequency]      = useState('3');
  const [alwaysRestWeekends, setAlwaysRestWeekends] = useState(false);

  // For nutrition custom cycles, fetch available foods/recipes for the item picker
  const [foodsList,          setFoodsList]          = useState<any[]>([]);
  const [recipesList,        setRecipesList]        = useState<any[]>([]);

  useEffect(() => {
    const load = async () => {
      try {
        setFoodsList(await foodsApi.listCustom());
        setRecipesList(await recipesApi.getAll({ type: 'food', limit: 100 }));
      } catch { /* ignore */ }
    };
    load();
  }, []);

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
        const cfg = recType === 'custom_cycle'
          ? { items: cycleItems, days: cycleDays, restFrequency: Number(restFrequency) || 1, alwaysRestWeekends }
          : buildRecurrenceConfig(recType, dowDays, xInterval, domType, domDates, domN, domWeekday);
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
          cycleItems={cycleItems} setCycleItems={setCycleItems}
          cycleItemType={cycleItemType} setCycleItemType={setCycleItemType}
          cycleItemId={cycleItemId} setCycleItemId={setCycleItemId}
          cycleDays={cycleDays} setCycleDays={setCycleDays}
          restFrequency={restFrequency} setRestFrequency={setRestFrequency}
          alwaysRestWeekends={alwaysRestWeekends} setAlwaysRestWeekends={setAlwaysRestWeekends}
          exercisesList={foodsList as any} routinesList={recipesList as any}
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
                    <span className={`text-base px-2 py-0.5 rounded-full font-medium ${ev.status === 'completed' ? 'bg-green-500/20 text-green-400' : ev.status === 'skipped' ? 'bg-red-500/20 text-red-400' : 'text-dram-accent'}`}>
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

// ─── Main Planning Board Card ─────────────────────────────────────────────────

export default function PlanningCalendarCard({
  routinesList,
  exercisesList,
}: {
  routinesList: RoutineSummary[];
  exercisesList: Exercise[];
}) {
  const today = todayStr();

  // Calendar state
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
        mealSchedulesApi.getUpcoming(90).catch(() => []),
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

      // Load nutrition overrides
      const from = addDays(today, -7);
      const to   = addDays(today, 60);
      const overrides = await dayTypesApi.getOverrides(from, to).catch(() => []);
      setNutritionOverrides(overrides as DailyNutritionOverride[]);
    } finally { setLoading(false); }
  }, [today]);

  useEffect(() => { load(); }, [load]);

  // Build kanban board: today and next 6 days (7 days total)
  const kanbanDays = (() => {
    const days: string[] = [];
    for (let i = 0; i <= 6; i++) {
      days.push(addDays(today, i));
    }
    return days;
  })();

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
      <div className="bg-dram-card border border-slate-600 overflow-hidden flex flex-col">
        <div className="p-5 flex-1 flex flex-col">
          {loading ? (
            <div className="flex items-center justify-center text-slate-500 text-base h-96">Loading…</div>
          ) : (
            <div className="flex gap-3 pb-4">
              {kanbanDays.map((dateStr) => {
                const { workoutEvents, mealEvents: me, checkpoints: cp, nutritionOverride, nutritionScheduleEvents: nse } = getEventsForDate(dateStr);
                const date = new Date(dateStr + 'T12:00:00');
                const dow = date.toLocaleDateString('en-US', { weekday: 'short' });
                const dayNum = date.getDate();
                const isToday = dateStr === today;
                const isYesterday = dateStr === addDays(today, -1);

                return (
                  <div
                    key={dateStr}
                    className={`flex-1 min-h-[420px] rounded-lg border flex flex-col ${isToday ? 'border-dram-accent/50 bg-dram-accent/10' : 'border-slate-600 bg-dram-bg/50'}`}
                  >
                    {/* Header */}
                    <div className="p-3 border-b border-slate-600 flex items-start justify-between gap-2">
                      <button
                        onClick={() => setSelectedDate(dateStr)}
                        className="flex-1 hover:opacity-70 transition-opacity text-left"
                      >
                        <div className="text-xs text-slate-500 uppercase">{dow}</div>
                        <div className={`text-lg font-semibold ${isToday ? 'text-dram-accent' : 'text-slate-300'}`}>
                          {dayNum}{isYesterday && <span className="text-xs ml-1 text-slate-500">(yesterday)</span>}
                          {isToday && <span className="text-xs ml-1 text-dram-accent">(today)</span>}
                        </div>
                      </button>
                      <button
                        onClick={() => setSelectedDate(dateStr)}
                        className="shrink-0 text-dram-accent hover:text-dram-accent/70 transition-colors text-xl leading-none"
                        title="Add event"
                      >
                        +
                      </button>
                    </div>

                    {/* Content */}
                    <div className="flex-1 p-3 space-y-3 overflow-y-auto">
                      {/* Workouts */}
                      {workoutEvents.length > 0 && (
                        <div>
                          <div className="text-sm font-semibold text-slate-400 uppercase mb-1.5">Workouts</div>
                          <div className="space-y-1">
                            {workoutEvents.map((e) => (
                              <div key={e.scheduleId} className="text-sm text-dram-accent rounded px-2 py-1">
                                {e.isRestDay ? 'Rest day' : (e.exerciseName ?? e.routineName ?? 'Workout')}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Meals */}
                      {me.length > 0 && (
                        <div>
                          <div className="text-sm font-semibold text-slate-400 uppercase mb-1.5">Meals</div>
                          <div className="space-y-1">
                            {me.map((e) => (
                              <div key={`${e.scheduleId}-${e.date}`} className="space-y-0.5">
                                <div className="text-sm text-blue-400">{e.label}</div>
                                {e.calories != null && (
                                  <div className="text-sm text-dram-accent space-y-0">
                                    <div>{Math.round(e.calories)} kcal</div>
                                    <div>{e.proteinG?.toFixed(0)}g protein</div>
                                    <div>{e.carbsG?.toFixed(0)}g carbs</div>
                                    <div>{e.fatG?.toFixed(0)}g fat</div>
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Goal checkpoints */}
                      {cp.length > 0 && (
                        <div>
                          <div className="text-sm font-semibold text-slate-400 uppercase mb-1.5">Goals</div>
                          <div className="space-y-1">
                            {cp.map((c) => (
                              <div key={c.id} className="text-sm text-emerald-400 rounded px-2 py-1">
                                {METRIC_CONFIG[c.metric]?.label ?? c.metric} → {c.targetValue} {c.unit}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Nutrition override */}
                      {(nutritionOverride || nse.length > 0) && (
                        <div>
                          <div className="text-sm font-semibold text-slate-400 uppercase mb-1.5">Nutrition</div>
                          <div className="space-y-1">
                            {nutritionOverride && (
                              <div className="space-y-0.5">
                                <div className="text-sm text-purple-400 rounded px-2 py-1">
                                  {nutritionOverride.dayTypeName ?? 'Custom targets'}
                                </div>
                                {nutritionOverride.calories != null && (
                                  <div className="text-sm text-dram-accent space-y-0 px-2">
                                    <div>{Math.round(nutritionOverride.calories)} kcal</div>
                                    <div>{nutritionOverride.proteinG?.toFixed(0)}g protein</div>
                                    <div>{nutritionOverride.carbsG?.toFixed(0)}g carbs</div>
                                    <div>{nutritionOverride.fatG?.toFixed(0)}g fat</div>
                                  </div>
                                )}
                              </div>
                            )}
                            {nse.map((e) => (
                              <div key={e.scheduleId} className="space-y-0.5">
                                {e.recurrenceDescription && (
                                  <div className="text-sm text-purple-400 rounded px-2 py-1">
                                    {e.recurrenceDescription}
                                  </div>
                                )}
                                {e.calories != null && (
                                  <div className="text-sm text-dram-accent space-y-0 px-2">
                                    <div>{Math.round(e.calories)} kcal</div>
                                    <div>{e.proteinG?.toFixed(0)}g protein</div>
                                    <div>{e.carbsG?.toFixed(0)}g carbs</div>
                                    <div>{e.fatG?.toFixed(0)}g fat</div>
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
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
