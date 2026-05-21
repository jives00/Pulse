import { useState, useEffect } from 'react';
import { useAuthStore } from '../store/authStore';
import { useSettingsStore } from '../store/settings';
import type { ColorScheme, SortOption, ExerciseSortOption } from '../store/settings';
import {
  authApi, tagsApi, goalsApi, measurementsApi, profileApi, routinesApi, exercisesApi, userGoalsApi,
  GLASS_OZ, apiClient,
  type DeleteScope, type TagDefinitions, type MeasurementGoal,
  type UserProfile, type ActivityLevel, type RoutineSummary, type RoutineGoal, type UserGoal, type Exercise,
  type GoalMetricType, type GoalSourceType,
} from '@pulse/api-client';
import PlanningCalendarCard from './PlanningCalendarCard';

// ─── Shared primitives ────────────────────────────────────────

const inputCls = 'w-full bg-dram-bg border border-dram-border rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-dram-accent';

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-dram-card border border-dram-border p-5 space-y-4">
      <h2 className="text-sm font-semibold text-gray-300 uppercase tracking-wide">{title}</h2>
      {children}
    </div>
  );
}

function StatusMsg({ error, success }: { error?: string; success?: string }) {
  if (error) return <p className="text-sm text-red-400">{error}</p>;
  if (success) return <p className="text-sm text-emerald-400">{success}</p>;
  return null;
}

// ─── Tab bar ──────────────────────────────────────────────────

type Tab = 'options' | 'goals' | 'planning' | 'user' | 'delete' | 'export';

const TABS: { id: Tab; label: string }[] = [
  { id: 'options',  label: 'Options' },
  { id: 'goals',    label: 'Goals' },
  { id: 'planning', label: 'Planning' },
  { id: 'user',     label: 'User' },
  { id: 'delete',   label: 'Delete Data' },
  { id: 'export',   label: 'Export' },
];

// ─── Options tab ──────────────────────────────────────────────

const SORT_OPTIONS: { value: SortOption; label: string }[] = [
  { value: 'created_at',    label: 'Date added' },
  { value: 'name',          label: 'Name (A–Z)' },
  { value: 'recently_made', label: 'Recently made' },
  { value: 'prep_time',     label: 'Prep time' },
  { value: 'random',        label: 'Random' },
];

function DefaultSortSection() {
  const { defaultSort, setDefaultSort } = useSettingsStore();
  return (
    <div className="flex flex-wrap gap-2">
      {SORT_OPTIONS.map(({ value, label }) => (
        <button
          key={value}
          onClick={() => setDefaultSort(value)}
          className={`px-3 py-1.5 rounded-lg text-sm border transition ${
            defaultSort === value
              ? 'border-dram-accent text-dram-accent bg-dram-accent/10 font-medium'
              : 'border-dram-border text-gray-400 hover:border-gray-500 hover:text-white'
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

const EXERCISE_SORT_OPTIONS: { value: ExerciseSortOption; label: string }[] = [
  { value: 'name',       label: 'Name (A–Z)' },
  { value: 'created_at', label: 'Date added' },
];

function DefaultExerciseSortSection() {
  const { defaultExerciseSort, setDefaultExerciseSort } = useSettingsStore();
  return (
    <div className="flex flex-wrap gap-2">
      {EXERCISE_SORT_OPTIONS.map(({ value, label }) => (
        <button
          key={value}
          onClick={() => setDefaultExerciseSort(value)}
          className={`px-3 py-1.5 rounded-lg text-sm border transition ${
            defaultExerciseSort === value
              ? 'border-dram-accent text-dram-accent bg-dram-accent/10 font-medium'
              : 'border-dram-border text-gray-400 hover:border-gray-500 hover:text-white'
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

const TAG_CATEGORIES: { key: keyof TagDefinitions; label: string }[] = [
  { key: 'health',   label: 'Health' },
  { key: 'cuisine',  label: 'Cuisine' },
  { key: 'category', label: 'Category' },
];

function TagDefinitionsSection() {
  const [defs, setDefs] = useState<TagDefinitions | null>(null);
  const [newTag, setNewTag] = useState<Record<string, string>>({ health: '', cuisine: '', category: '' });
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState('');

  useEffect(() => {
    tagsApi.getDefinitions().then(setDefs).catch(() => {});
  }, []);

  async function handleSave(updated: TagDefinitions) {
    setSaving(true);
    setSuccess('');
    try {
      await tagsApi.saveDefinitions(updated);
      setDefs(updated);
      setSuccess('Saved.');
      setTimeout(() => setSuccess(''), 2000);
    } catch {
      // ignore
    } finally {
      setSaving(false);
    }
  }

  function addTag(cat: keyof TagDefinitions) {
    const val = newTag[cat].trim();
    if (!val || !defs) return;
    if (defs[cat].some((t) => t.toLowerCase() === val.toLowerCase())) return;
    const updated = { ...defs, [cat]: [...defs[cat], val] };
    setNewTag((p) => ({ ...p, [cat]: '' }));
    handleSave(updated);
  }

  function removeTag(cat: keyof TagDefinitions, tag: string) {
    if (!defs) return;
    handleSave({ ...defs, [cat]: defs[cat].filter((t) => t !== tag) });
  }

  if (!defs) return <p className="text-sm text-gray-500">Loading…</p>;

  return (
    <div className="space-y-5">
      {TAG_CATEGORIES.map(({ key, label }) => (
        <div key={key}>
          <p className="text-sm font-medium text-gray-300 mb-2">{label}</p>
          <div className="flex flex-wrap gap-1.5 mb-2">
            {defs[key].map((tag) => (
              <span
                key={tag}
                className="flex items-center gap-1 text-sm border border-dram-accent/40 text-dram-accent rounded-full px-2.5 py-0.5 capitalize"
              >
                {tag}
                <button
                  type="button"
                  onClick={() => removeTag(key, tag)}
                  className="hover:text-white leading-none"
                  disabled={saving}
                >
                  ✕
                </button>
              </span>
            ))}
            {defs[key].length === 0 && (
              <span className="text-sm text-gray-600 italic">No tags yet</span>
            )}
          </div>
          <div className="flex gap-2">
            <input
              type="text"
              placeholder={`Add ${label.toLowerCase()} tag…`}
              value={newTag[key]}
              onChange={(e) => setNewTag((p) => ({ ...p, [key]: e.target.value }))}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addTag(key); } }}
              className={inputCls}
            />
            <button
              type="button"
              onClick={() => addTag(key)}
              disabled={saving || !newTag[key].trim()}
              className="text-sm text-dram-accent px-3 border border-dram-border rounded-lg hover:border-dram-accent disabled:opacity-40 transition"
            >
              Add
            </button>
          </div>
        </div>
      ))}
      {success && <p className="text-sm text-emerald-400">{success}</p>}
    </div>
  );
}

const THEMES: { id: ColorScheme; label: string; bg: string; card: string; accent: string }[] = [
  { id: 'blue',     label: 'Deep Blue', bg: '#193549', card: '#0d2137', accent: '#D4A843' },
  { id: 'slate',    label: 'Slate',     bg: '#0f172a', card: '#1e293b', accent: '#D4A843' },
  { id: 'sand',     label: 'Sand',      bg: '#785a3c', card: '#5a4128', accent: '#D4A843' },
  { id: 'midnight', label: 'Midnight',  bg: '#161c2e', card: '#1f2942', accent: '#D4A843' },
  { id: 'tide',     label: 'Tide',      bg: '#162132', card: '#1f2c40', accent: '#D4A843' },
  { id: 'graphite', label: 'Graphite',  bg: '#1c1d22', card: '#262830', accent: '#D4A843' },
];

function ColorSchemeSection() {
  const { colorScheme, setColorScheme } = useSettingsStore();
  return (
    <div className="flex gap-4 flex-wrap">
      {THEMES.map(({ id, label, bg, card, accent }) => {
        const active = colorScheme === id;
        return (
          <button
            key={id}
            onClick={() => setColorScheme(id)}
            className={`flex flex-col items-center gap-2 p-3 rounded-xl border-2 transition ${
              active ? 'border-dram-accent' : 'border-dram-border hover:border-gray-500'
            }`}
          >
            <div className="w-16 h-12 rounded-lg overflow-hidden flex" style={{ backgroundColor: bg }}>
              <div className="w-5 h-full" style={{ backgroundColor: card }} />
              <div className="flex-1 flex items-end p-1">
                <div className="w-full h-1.5 rounded-full" style={{ backgroundColor: accent }} />
              </div>
            </div>
            <span className="text-sm text-gray-300">{label}</span>
            {active && <span className="text-sm text-dram-accent font-medium">Active</span>}
          </button>
        );
      })}
    </div>
  );
}

function OptionsTab() {
  return (
    <div className="space-y-4">
      <Section title="Color Scheme">
        <ColorSchemeSection />
      </Section>
      <Section title="Default Sort (Recipes)">
        <DefaultSortSection />
      </Section>
      <Section title="Default Sort (Exercises)">
        <DefaultExerciseSortSection />
      </Section>
      <Section title="Tags">
        <TagDefinitionsSection />
      </Section>
    </div>
  );
}

// ─── User Goals (custom goals) ────────────────────────────────

type MetricGroup = { label: string; metrics: GoalMetricType[] };

const METRIC_GROUPS: MetricGroup[] = [
  { label: 'Strength', metrics: ['exercise_max_weight', 'exercise_max_reps', 'exercise_session_volume', 'exercise_weekly_volume', 'exercise_session_reps', 'exercise_weekly_reps'] },
  { label: 'Cardio',   metrics: ['exercise_session_distance', 'exercise_weekly_distance', 'exercise_session_duration', 'exercise_weekly_duration'] },
  { label: 'Steps',    metrics: ['exercise_session_steps', 'exercise_weekly_steps'] },
  { label: 'Frequency',metrics: ['exercise_weekly_sessions'] },
  { label: 'Pedometer',metrics: ['daily_steps_avg', 'weekly_steps_total'] },
  { label: 'Body',     metrics: ['body_measurement'] },
  { label: 'Nutrition',metrics: ['nutrition_daily_avg'] },
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
  { key: 'calories', label: 'Calories', unit: 'kcal' },
  { key: 'protein',  label: 'Protein',  unit: 'g'    },
  { key: 'carbs',    label: 'Carbs',    unit: 'g'    },
  { key: 'fat',      label: 'Fat',      unit: 'g'    },
  { key: 'water',    label: 'Water',    unit: 'glasses' },
];

function UserGoalForm({
  initial,
  exercisesList,
  routinesList,
  onClose,
  onSaved,
}: {
  initial?: UserGoal;
  exercisesList: Exercise[];
  routinesList: RoutineSummary[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name,        setName]        = useState(initial?.name        ?? '');
  const [metricType,  setMetricType]  = useState<GoalMetricType>(initial?.metricType ?? 'exercise_max_weight');
  const [sourceType,  setSourceType]  = useState<GoalSourceType>(initial?.sourceType ?? 'exercise');
  const [sourceId,    setSourceId]    = useState<number | ''>(initial?.sourceId ?? '');
  const [sourceKey,   setSourceKey]   = useState(initial?.sourceKey   ?? '');
  const [targetValue, setTargetValue] = useState(initial?.targetValue != null ? String(initial.targetValue) : '');
  const [unit,        setUnit]        = useState(initial?.unit        ?? 'lbs');
  const [targetDate,  setTargetDate]  = useState(initial?.targetDate  ?? '');
  const [saving,      setSaving]      = useState(false);

  function applyMetric(m: GoalMetricType) {
    setMetricType(m);
    const st = METRIC_SOURCE_TYPE[m];
    setSourceType(st);
    setSourceId('');
    setSourceKey('');
    const defUnit = METRIC_DEFAULT_UNIT[m];
    if (defUnit) setUnit(defUnit);
  }

  function applySourceKey(key: string) {
    setSourceKey(key);
    if (metricType === 'body_measurement') {
      const opt = MEASUREMENT_KEY_OPTIONS.find((o) => o.key === key);
      if (opt) setUnit(opt.unit);
    } else if (metricType === 'nutrition_daily_avg') {
      const opt = NUTRITION_KEY_OPTIONS.find((o) => o.key === key);
      if (opt) setUnit(opt.unit);
    }
  }

  const requiredField = METRIC_REQUIRED_FIELD[metricType];
  const compatibleExercises = requiredField
    ? exercisesList.filter((e) => e.trackedFields?.includes(requiredField))
    : exercisesList;

  const canPickRoutine = ['exercise_session_volume', 'exercise_weekly_volume', 'exercise_weekly_sessions'].includes(metricType);

  async function handleSave() {
    if (!name || !targetValue) return;
    setSaving(true);
    try {
      const payload = {
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
        await userGoalsApi.update(initial.id, payload);
      } else {
        await userGoalsApi.create(payload);
      }
      onSaved();
    } catch { } finally { setSaving(false); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onClose}>
      <div className="bg-dram-card border border-dram-border rounded-xl w-full max-w-md mx-4 p-5 space-y-4" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-base font-semibold uppercase tracking-wider text-dram-accent">{initial ? 'Edit Goal' : 'Add Goal'}</h3>

        <div>
          <label className="block text-sm text-gray-400 mb-1">Goal name</label>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Deadlift 300 lbs" className={inputCls} />
        </div>

        <div>
          <label className="block text-sm text-gray-400 mb-1">Metric</label>
          <select value={metricType} onChange={(e) => applyMetric(e.target.value as GoalMetricType)} className={inputCls}>
            {METRIC_GROUPS.map((g) => (
              <optgroup key={g.label} label={g.label}>
                {g.metrics.map((m) => (
                  <option key={m} value={m}>{METRIC_LABELS[m]}</option>
                ))}
              </optgroup>
            ))}
          </select>
        </div>

        {(sourceType === 'exercise' || (canPickRoutine && sourceType === 'routine')) && (
          <div className="space-y-2">
            {canPickRoutine && (
              <div className="flex gap-1.5">
                {(['exercise', 'routine'] as GoalSourceType[]).map((t) => (
                  <button key={t} type="button" onClick={() => { setSourceType(t); setSourceId(''); }}
                    className={`flex-1 text-sm py-1 rounded-lg transition-colors capitalize ${(sourceType as string) === t ? 'bg-dram-accent text-black font-semibold' : 'bg-dram-border text-gray-300 hover:text-gray-100'}`}
                  >{t}</button>
                ))}
              </div>
            )}
            <div>
              <label className="block text-sm text-gray-400 mb-1">{(sourceType as string) === 'routine' ? 'Routine' : 'Exercise'}</label>
              <select value={sourceId} onChange={(e) => setSourceId(e.target.value ? Number(e.target.value) : '')} className={inputCls}>
                <option value="">Select…</option>
                {(sourceType as string) === 'routine'
                  ? routinesList.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)
                  : compatibleExercises.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)
                }
              </select>
            </div>
          </div>
        )}

        {sourceType === 'measurement' && (
          <div>
            <label className="block text-sm text-gray-400 mb-1">Measurement</label>
            <select value={sourceKey} onChange={(e) => applySourceKey(e.target.value)} className={inputCls}>
              <option value="">Select…</option>
              {MEASUREMENT_KEY_OPTIONS.map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}
            </select>
          </div>
        )}

        {sourceType === 'nutrition' && (
          <div>
            <label className="block text-sm text-gray-400 mb-1">Nutrient</label>
            <select value={sourceKey} onChange={(e) => applySourceKey(e.target.value)} className={inputCls}>
              <option value="">Select…</option>
              {NUTRITION_KEY_OPTIONS.map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}
            </select>
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm text-gray-400 mb-1">Target value</label>
            <div className="flex gap-1.5">
              <input type="number" min="0" value={targetValue} onChange={(e) => setTargetValue(e.target.value)} className={inputCls} />
              <input value={unit} onChange={(e) => setUnit(e.target.value)} className={`${inputCls} w-20 text-center`} title="Unit" />
            </div>
          </div>
          <div>
            <label className="block text-sm text-gray-400 mb-1">Target date (optional)</label>
            <input type="date" value={targetDate} onChange={(e) => setTargetDate(e.target.value)} className={inputCls} />
          </div>
        </div>

        <div className="flex gap-2 pt-1">
          <button onClick={onClose} className="flex-1 text-sm text-gray-400 hover:text-gray-200 py-2 transition-colors">Cancel</button>
          <button onClick={handleSave} disabled={saving || !name || !targetValue}
            className="flex-[2] bg-dram-accent text-black text-sm font-semibold rounded-lg py-2 hover:brightness-110 disabled:opacity-50 transition"
          >{saving ? 'Saving…' : initial ? 'Save changes' : 'Add goal'}</button>
        </div>
      </div>
    </div>
  );
}

function UserGoalRows({
  goals, onEdit, onDelete,
}: {
  goals: UserGoal[];
  onEdit: (g: UserGoal) => void;
  onDelete: (id: number) => void;
}) {
  if (!goals.length) return null;
  return (
    <div className="mt-3 pt-3 border-t border-dram-border/50 space-y-0">
      {goals.map((g) => {
        const dateStr = g.targetDate
          ? 'by ' + new Date(g.targetDate + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
          : null;
        return (
          <div key={g.id} className="flex items-start justify-between gap-2 py-1.5 border-b border-dram-border/50 last:border-0">
            <div className="min-w-0 flex-1">
              <button onClick={() => onEdit(g)} className="text-sm font-medium text-gray-100 hover:text-dram-accent transition-colors truncate text-left w-full">
                {g.name}
              </button>
              <p className="text-sm text-gray-500">
                {g.targetValue.toLocaleString()} {g.unit}
                {g.sourceName ? ` · ${g.sourceName}` : ''}
                {dateStr ? ` · ${dateStr}` : ''}
              </p>
            </div>
            <button onClick={() => onDelete(g.id)} className="text-xs text-gray-500 hover:text-red-400 transition-colors px-1 shrink-0">✕</button>
          </div>
        );
      })}
    </div>
  );
}

// ─── Goals tab ────────────────────────────────────────────────

const METRIC_CONFIG: Record<string, { label: string; unit: string }> = {
  weight:      { label: 'Weight',      unit: 'lbs' },
  waist:       { label: 'Waist',       unit: 'in'  },
  bicep:       { label: 'Bicep',       unit: 'in'  },
  chest:       { label: 'Chest',       unit: 'in'  },
  hips:        { label: 'Hips',        unit: 'in'  },
  body_fat:    { label: 'Body Fat',    unit: '%'   },
  bmi:         { label: 'BMI',         unit: ''    },
  muscle_mass: { label: 'Muscle Mass', unit: 'lbs' },
  water_pct:   { label: 'Hydration',   unit: '%'   },
};
const DISPLAYED_METRICS = ['weight', 'waist', 'bicep', 'bmi', 'body_fat', 'muscle_mass', 'water_pct'];

function GoalsTab() {
  const [loading, setLoading] = useState(true);

  // Daily nutrition goals
  const [calories, setCalories] = useState('');
  const [carbsG, setCarbsG] = useState('');
  const [proteinG, setProteinG] = useState('');
  const [fatG, setFatG] = useState('');
  const [waterGlasses, setWaterGlasses] = useState('');

  // Weekly nutrition goals
  const [wkCalories, setWkCalories] = useState('');
  const [wkCarbsG, setWkCarbsG] = useState('');
  const [wkProteinG, setWkProteinG] = useState('');
  const [wkFatG, setWkFatG] = useState('');

  // Exercise goals
  const [volume, setVolume] = useState('');
  const [workoutCount, setWorkoutCount] = useState('');
  const [minutesPerWeek, setMinutesPerWeek] = useState('');

  // Per-routine goals
  const [routines, setRoutines] = useState<RoutineSummary[]>([]);
  const [routineGoalInputs, setRoutineGoalInputs] = useState<Record<number, string>>({});

  // Body measurement goals
  const [mGoals, setMGoals] = useState<Record<string, { value: string; date: string }>>(() => {
    const init: Record<string, { value: string; date: string }> = {};
    for (const key of DISPLAYED_METRICS) init[key] = { value: '', date: '' };
    return init;
  });

  // Custom user goals
  const [userGoals, setUserGoals] = useState<UserGoal[]>([]);
  const [allExercises, setAllExercises] = useState<Exercise[]>([]);
  const [editingGoal, setEditingGoal] = useState<UserGoal | null>(null);
  const [addingGoal, setAddingGoal] = useState(false);

  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    Promise.all([
      goalsApi.getSummary(),
      goalsApi.getExercise(),
      measurementsApi.getGoals(),
      routinesApi.getAll(),
      routinesApi.getAllGoals(),
      userGoalsApi.getAll(),
      exercisesApi.getAll(),
    ]).then(([summary, exGoals, mGoalsData, rList, rGoals, uGoals, exs]) => {
      // Daily nutrition from legacy system
      const nutGoals = summary?.nutrition.goals;
      setCalories(String(nutGoals?.calories ?? ''));
      setCarbsG(String(nutGoals?.carbsG ?? ''));
      setProteinG(String(nutGoals?.proteinG ?? ''));
      setFatG(String(nutGoals?.fatG ?? ''));
      if (nutGoals?.waterGoalOz != null) {
        setWaterGlasses(String(Math.round(nutGoals.waterGoalOz / GLASS_OZ)));
      }

      // Weekly nutrition from legacy system
      setWkCalories(String(nutGoals?.weeklyCalories ?? ''));
      setWkProteinG(String(nutGoals?.weeklyProteinG ?? ''));
      setWkCarbsG(String(nutGoals?.weeklyCarbsG ?? ''));
      setWkFatG(String(nutGoals?.weeklyFatG ?? ''));

      // Exercise goals from legacy system
      setWorkoutCount(String(exGoals?.workoutsPerWeek ?? ''));
      setMinutesPerWeek(String(exGoals?.minutesPerWeek ?? ''));
      setVolume(String(exGoals?.volumeLbsPerWeek ?? ''));

      // Body measurement goals
      setMGoals((prev) => {
        const updated = { ...prev };
        for (const key of DISPLAYED_METRICS) {
          const g = (mGoalsData as Record<string, MeasurementGoal>)[key];
          updated[key] = { value: g ? String(g.targetValue) : '', date: g?.targetDate ?? '' };
        }
        return updated;
      });

      // Routines and per-routine goals
      setRoutines(rList as RoutineSummary[]);
      const goalsMap: Record<number, string> = {};
      for (const g of (rGoals as RoutineGoal[])) goalsMap[g.routineId] = String(g.targetPerWeek);
      setRoutineGoalInputs(goalsMap);

      // Custom user goals
      setUserGoals(uGoals as UserGoal[]);
      setAllExercises(exs as Exercise[]);
    }).catch(() => {}).finally(() => setLoading(false));
  }, []);

  async function handleSave() {
    setSaving(true);
    setError('');
    setSuccess('');
    try {
      await Promise.all([
        calories && carbsG && proteinG && fatG
          ? goalsApi.saveNutrition({
              calories: Number(calories),
              carbsG: Number(carbsG),
              proteinG: Number(proteinG),
              fatG: Number(fatG),
              waterGoalOz: waterGlasses !== '' ? Number(waterGlasses) * GLASS_OZ : undefined,
            })
          : Promise.resolve(),
        (wkCalories || wkProteinG || wkCarbsG || wkFatG)
          ? goalsApi.saveWeeklyNutrition({
              weeklyCalories: wkCalories !== '' ? Number(wkCalories) : null,
              weeklyProteinG: wkProteinG !== '' ? Number(wkProteinG) : null,
              weeklyCarbsG: wkCarbsG !== '' ? Number(wkCarbsG) : null,
              weeklyFatG: wkFatG !== '' ? Number(wkFatG) : null,
            })
          : Promise.resolve(),
        goalsApi.saveExercise({
          workoutsPerWeek: workoutCount !== '' ? Number(workoutCount) : null,
          minutesPerWeek: minutesPerWeek !== '' ? Number(minutesPerWeek) : null,
          volumeLbsPerWeek: volume !== '' ? Number(volume) : null,
        }),
        ...DISPLAYED_METRICS.map((key) => {
          const { value, date } = mGoals[key];
          if (!value) return Promise.resolve();
          const cfg = METRIC_CONFIG[key];
          return measurementsApi.setGoal(key, {
            targetValue: Number(value),
            unit: cfg.unit,
            targetDate: date || null,
          });
        }),
        ...routines.map((r) => {
          const val = routineGoalInputs[r.id];
          if (val && Number(val) > 0) return routinesApi.setGoal(r.id, Number(val));
          if (!val || val === '') return routinesApi.deleteGoal(r.id).catch(() => {});
          return Promise.resolve();
        }),
      ]);
      setSuccess('Goals saved.');
      setTimeout(() => setSuccess(''), 3000);
    } catch {
      setError('Failed to save goals.');
    } finally {
      setSaving(false);
    }
  }

  async function deleteUserGoal(id: number) {
    if (!confirm('Remove this goal?')) return;
    try {
      await userGoalsApi.delete(id);
      setUserGoals((prev) => prev.filter((g) => g.id !== id));
    } catch { }
  }

  async function onUserGoalSaved() {
    setAddingGoal(false);
    setEditingGoal(null);
    const uGoals = await userGoalsApi.getAll();
    setUserGoals(uGoals);
  }

  const bodyGoals = userGoals.filter((g) => g.category === 'body');
  const nutritionGoals = userGoals.filter((g) => g.category === 'nutrition');
  const exerciseGoals = userGoals.filter((g) => g.category === 'exercise');

  if (loading) return <p className="text-sm text-gray-500">Loading…</p>;

  return (
    <div className="space-y-4">
      <Section title="Nutrition (daily)">
        <div className="grid grid-cols-2 gap-3">
          {([
            ['Calories (kcal)', calories, setCalories],
            ['Carbs (g)',       carbsG,   setCarbsG],
            ['Protein (g)',     proteinG, setProteinG],
            ['Fat (g)',         fatG,     setFatG],
          ] as [string, string, (v: string) => void][]).map(([label, val, setter]) => (
            <div key={label}>
              <label className="block text-sm text-gray-400 mb-1">{label}</label>
              <input type="number" min="0" value={val} onChange={(e) => setter(e.target.value)} className={inputCls} />
            </div>
          ))}
          <div>
            <label className="block text-sm text-gray-400 mb-1">Water (glasses/day)</label>
            <input type="number" min="0" value={waterGlasses} onChange={(e) => setWaterGlasses(e.target.value)} className={inputCls} placeholder="e.g. 8" />
          </div>
        </div>
      </Section>

      <Section title="Nutrition (weekly)" >
        <p className="text-xs text-gray-500 mb-3">Leave blank to auto-calculate as daily × 7</p>
        <div className="grid grid-cols-2 gap-3">
          {([
            ['Calories (kcal)', wkCalories, setWkCalories],
            ['Protein (g)',     wkProteinG, setWkProteinG],
            ['Carbs (g)',       wkCarbsG,   setWkCarbsG],
            ['Fat (g)',         wkFatG,     setWkFatG],
          ] as [string, string, (v: string) => void][]).map(([label, val, setter]) => (
            <div key={label}>
              <label className="block text-sm text-gray-400 mb-1">{label}</label>
              <input type="number" min="0" value={val} onChange={(e) => setter(e.target.value)} className={inputCls} />
            </div>
          ))}
        </div>
      </Section>

      <Section title="Workouts (per week)">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm text-gray-400 mb-1">Workouts</label>
            <input type="number" min="0" value={workoutCount} onChange={(e) => setWorkoutCount(e.target.value)} className={inputCls} />
          </div>
          <div>
            <label className="block text-sm text-gray-400 mb-1">Minutes</label>
            <input type="number" min="0" value={minutesPerWeek} onChange={(e) => setMinutesPerWeek(e.target.value)} className={inputCls} placeholder="e.g. 300" />
          </div>
          <div>
            <label className="block text-sm text-gray-400 mb-1">Volume (lbs)</label>
            <input type="number" min="0" value={volume} onChange={(e) => setVolume(e.target.value)} className={inputCls} placeholder="e.g. 10000" />
          </div>
        </div>
      </Section>

      {routines.length > 0 && (
        <Section title="Per-Routine Goals (sessions per week)">
          <div className="grid grid-cols-2 gap-3">
            {routines.map((r) => (
              <div key={r.id}>
                <label className="block text-sm text-gray-400 mb-1">{r.name}</label>
                <input
                  type="number" min="0" max="14"
                  value={routineGoalInputs[r.id] ?? ''}
                  onChange={(e) => setRoutineGoalInputs((prev) => ({ ...prev, [r.id]: e.target.value }))}
                  className={inputCls}
                  placeholder="e.g. 3"
                />
              </div>
            ))}
          </div>
        </Section>
      )}

      <Section title="Body Measurements">
        <div className="space-y-4">
          {DISPLAYED_METRICS.map((key) => {
            const cfg = METRIC_CONFIG[key];
            const g = mGoals[key];
            return (
              <div key={key}>
                <p className="text-sm font-medium text-gray-300 mb-2">
                  {cfg.label} <span className="text-gray-500 font-normal">({cfg.unit})</span>
                </p>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm text-gray-500 mb-1">Target</label>
                    <input
                      type="number" min="0" step="0.1"
                      value={g.value}
                      onChange={(e) => setMGoals((prev) => ({ ...prev, [key]: { ...prev[key], value: e.target.value } }))}
                      className={inputCls}
                    />
                  </div>
                  <div>
                    <label className="block text-sm text-gray-500 mb-1">By date</label>
                    <input
                      type="date"
                      value={g.date}
                      onChange={(e) => setMGoals((prev) => ({ ...prev, [key]: { ...prev[key], date: e.target.value } }))}
                      className={inputCls}
                    />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </Section>

      <Section title="Custom Goals">
        <div>
          <button
            onClick={() => setAddingGoal(true)}
            className="text-xs text-dram-accent hover:text-dram-accent/80 border border-dram-accent hover:border-dram-accent/80 rounded px-2.5 py-1 transition"
          >
            + Add goal
          </button>
          {bodyGoals.length > 0 && (
            <div className="mt-4">
              <p className="text-xs font-semibold text-gray-400 uppercase mb-2">Body</p>
              <UserGoalRows goals={bodyGoals} onEdit={setEditingGoal} onDelete={deleteUserGoal} />
            </div>
          )}
          {nutritionGoals.length > 0 && (
            <div className="mt-3">
              <p className="text-xs font-semibold text-gray-400 uppercase mb-2">Nutrition</p>
              <UserGoalRows goals={nutritionGoals} onEdit={setEditingGoal} onDelete={deleteUserGoal} />
            </div>
          )}
          {exerciseGoals.length > 0 && (
            <div className="mt-3">
              <p className="text-xs font-semibold text-gray-400 uppercase mb-2">Exercise</p>
              <UserGoalRows goals={exerciseGoals} onEdit={setEditingGoal} onDelete={deleteUserGoal} />
            </div>
          )}
        </div>
      </Section>

      <div className="pt-1">
        <StatusMsg error={error} success={success} />
        <button
          onClick={handleSave}
          disabled={saving}
          className="mt-2 bg-dram-accent text-black font-semibold px-5 py-2 rounded-lg text-sm hover:brightness-110 disabled:opacity-40 transition"
        >
          {saving ? 'Saving…' : 'Save Goals'}
        </button>
      </div>

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
    </div>
  );
}

// ─── User tab ─────────────────────────────────────────────────

const ACTIVITY_OPTIONS: { value: ActivityLevel; label: string; description: string }[] = [
  { value: 'sedentary',         label: 'Sedentary',          description: 'Little or no exercise' },
  { value: 'lightly_active',    label: 'Lightly Active',     description: 'Light exercise 1–3 days/wk' },
  { value: 'moderately_active', label: 'Moderately Active',  description: 'Moderate exercise 3–5 days/wk' },
  { value: 'very_active',       label: 'Very Active',        description: 'Hard exercise 6–7 days/wk' },
];

function ProfileSection() {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [heightFt, setHeightFt] = useState('');
  const [heightIn, setHeightIn] = useState('');
  const [sex, setSex] = useState<'male' | 'female' | ''>('');
  const [dob, setDob] = useState('');
  const [activityLevel, setActivityLevel] = useState<ActivityLevel>('sedentary');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    profileApi.get().then((p) => {
      setProfile(p);
      if (p.heightCm) {
        const totalIn = p.heightCm / 2.54;
        setHeightFt(String(Math.floor(totalIn / 12)));
        setHeightIn(String(Math.round(totalIn % 12)));
      }
      if (p.sex) setSex(p.sex);
      if (p.dob) setDob(p.dob);
      setActivityLevel(p.activityLevel);
    }).catch(() => {});
  }, []);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setSuccess('');
    setSaving(true);
    try {
      const totalInches = (Number(heightFt) * 12) + Number(heightIn);
      const heightCm = totalInches > 0 ? Math.round(totalInches * 2.54 * 10) / 10 : null;
      await profileApi.update({
        heightCm,
        sex: sex || null,
        dob: dob || null,
        activityLevel,
      });
      setSuccess('Profile saved.');
      setTimeout(() => setSuccess(''), 3000);
    } catch {
      setError('Failed to save profile.');
    } finally {
      setSaving(false);
    }
  }

  if (!profile) return <p className="text-sm text-gray-500">Loading…</p>;

  return (
    <form onSubmit={handleSave} className="space-y-4">
      {/* Height */}
      <div>
        <label className="block text-sm text-gray-400 mb-1">Height</label>
        <div className="flex gap-2 items-center">
          <input
            type="number" min="0" max="9" placeholder="ft"
            value={heightFt}
            onChange={(e) => setHeightFt(e.target.value)}
            className={`${inputCls} w-20`}
          />
          <span className="text-sm text-gray-500">ft</span>
          <input
            type="number" min="0" max="11" placeholder="in"
            value={heightIn}
            onChange={(e) => setHeightIn(e.target.value)}
            className={`${inputCls} w-20`}
          />
          <span className="text-sm text-gray-500">in</span>
        </div>
      </div>

      {/* Sex */}
      <div>
        <label className="block text-sm text-gray-400 mb-1">Sex</label>
        <div className="flex gap-2">
          {(['male', 'female'] as const).map((s) => (
            <button
              key={s} type="button"
              onClick={() => setSex(s)}
              className={`px-4 py-1.5 rounded-lg text-sm border transition capitalize ${
                sex === s
                  ? 'border-dram-accent text-dram-accent bg-dram-accent/10 font-medium'
                  : 'border-dram-border text-gray-400 hover:border-gray-500 hover:text-white'
              }`}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      {/* Date of birth */}
      <div>
        <label className="block text-sm text-gray-400 mb-1">Date of birth</label>
        <input
          type="date" value={dob}
          onChange={(e) => setDob(e.target.value)}
          className={inputCls}
        />
      </div>

      {/* Activity level */}
      <div>
        <label className="block text-sm text-gray-400 mb-2">Activity level</label>
        <div className="space-y-1.5">
          {ACTIVITY_OPTIONS.map(({ value, label, description }) => (
            <button
              key={value} type="button"
              onClick={() => setActivityLevel(value)}
              className={`w-full text-left px-3 py-2 rounded-lg text-sm border transition ${
                activityLevel === value
                  ? 'border-dram-accent text-dram-accent bg-dram-accent/10'
                  : 'border-dram-border text-gray-400 hover:border-gray-500 hover:text-white'
              }`}
            >
              <span className="font-medium">{label}</span>
              <span className="ml-2 text-sm opacity-70">{description}</span>
            </button>
          ))}
        </div>
      </div>

      <StatusMsg error={error} success={success} />
      <button
        type="submit" disabled={saving}
        className="bg-dram-accent text-black font-semibold px-4 py-2 rounded-lg text-sm hover:brightness-110 disabled:opacity-40 transition"
      >
        {saving ? 'Saving…' : 'Save profile'}
      </button>
    </form>
  );
}

function ChangeUsername() {
  const { setToken } = useAuthStore();
  const [newUsername, setNewUsername] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!newUsername.trim() || !currentPassword) return;
    setSaving(true);
    setError('');
    setSuccess('');
    try {
      const { token: newToken } = await authApi.changeUsername({ newUsername: newUsername.trim(), currentPassword });
      setToken(newToken);
      setSuccess('Username updated.');
      setNewUsername('');
      setCurrentPassword('');
    } catch (err: any) {
      setError(err.message || 'Failed to update username.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div>
        <label className="block text-sm text-gray-400 mb-1">New username</label>
        <input type="text" value={newUsername} onChange={(e) => setNewUsername(e.target.value)} autoComplete="username" className={inputCls} />
      </div>
      <div>
        <label className="block text-sm text-gray-400 mb-1">Current password</label>
        <input type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} autoComplete="current-password" className={inputCls} />
      </div>
      <StatusMsg error={error} success={success} />
      <button
        type="submit"
        disabled={saving || !newUsername.trim() || !currentPassword}
        className="bg-dram-accent text-black font-semibold px-4 py-2 rounded-lg text-sm hover:brightness-110 disabled:opacity-40 transition"
      >
        {saving ? 'Saving…' : 'Update username'}
      </button>
    </form>
  );
}

function ChangePassword() {
  const { setToken } = useAuthStore();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!currentPassword || !newPassword) return;
    if (newPassword !== confirmPassword) {
      setError('New passwords do not match.');
      return;
    }
    setSaving(true);
    setError('');
    setSuccess('');
    try {
      const { token: newToken } = await authApi.changePassword({ currentPassword, newPassword });
      setToken(newToken);
      setSuccess('Password updated.');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err: any) {
      setError(err.message || 'Failed to update password.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div>
        <label className="block text-sm text-gray-400 mb-1">Current password</label>
        <input type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} autoComplete="current-password" className={inputCls} />
      </div>
      <div>
        <label className="block text-sm text-gray-400 mb-1">New password</label>
        <input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} autoComplete="new-password" className={inputCls} />
      </div>
      <div>
        <label className="block text-sm text-gray-400 mb-1">Confirm new password</label>
        <input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} autoComplete="new-password" className={inputCls} />
      </div>
      <StatusMsg error={error} success={success} />
      <button
        type="submit"
        disabled={saving || !currentPassword || !newPassword || !confirmPassword}
        className="bg-dram-accent text-black font-semibold px-4 py-2 rounded-lg text-sm hover:brightness-110 disabled:opacity-40 transition"
      >
        {saving ? 'Saving…' : 'Update password'}
      </button>
    </form>
  );
}

function UserTab() {
  return (
    <div className="space-y-4">
      <Section title="Profile">
        <ProfileSection />
      </Section>
      <Section title="Change Username">
        <ChangeUsername />
      </Section>
      <Section title="Change Password">
        <ChangePassword />
      </Section>
    </div>
  );
}

// ─── Delete Data tab ──────────────────────────────────────────

const DELETE_OPTIONS: { scope: DeleteScope; label: string; description: string }[] = [
  { scope: 'recipes',  label: 'Delete all recipes',  description: 'Removes all food and drink recipes, including their cook history.' },
  { scope: 'history',  label: 'Delete all history',  description: 'Removes all food log entries, recipe cook log, and water log.' },
  { scope: 'workouts', label: 'Delete all workouts', description: 'Removes all workout sessions and logged sets.' },
  { scope: 'goals',    label: 'Delete all goals',    description: 'Removes all nutrition and exercise goals.' },
  { scope: 'links',    label: 'Delete all links',    description: 'Removes all saved recipe links.' },
];

function DeleteRow({ scope, label, description }: { scope: DeleteScope; label: string; description: string }) {
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [success, setSuccess] = useState('');
  const [error, setError] = useState('');

  async function handleDelete() {
    setDeleting(true);
    setError('');
    try {
      await authApi.deleteData(scope);
      setSuccess('Deleted.');
      setConfirming(false);
    } catch (err: any) {
      setError(err.message || 'Failed.');
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="py-3 border-b border-dram-border last:border-0">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-sm text-gray-300">{label}</p>
          <p className="text-sm text-gray-500 mt-0.5">{description}</p>
          <StatusMsg error={error} success={success} />
        </div>
        <div className="shrink-0">
          {!confirming ? (
            <button
              onClick={() => setConfirming(true)}
              className="px-3 py-1.5 rounded-lg text-sm font-medium border border-red-800 text-red-400 hover:bg-red-900/30 transition"
            >
              Delete…
            </button>
          ) : (
            <div className="flex items-center gap-2">
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="px-3 py-1.5 rounded-lg text-sm font-semibold bg-red-700 hover:bg-red-600 text-white disabled:opacity-50 transition"
              >
                {deleting ? 'Deleting…' : 'Confirm'}
              </button>
              <button
                onClick={() => setConfirming(false)}
                className="text-sm text-gray-500 hover:text-gray-300 transition"
              >
                Cancel
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function DeleteDataTab() {
  return (
    <Section title="Danger Zone">
      {DELETE_OPTIONS.map((opt) => (
        <DeleteRow key={opt.scope} {...opt} />
      ))}
    </Section>
  );
}

// ─── Export tab ───────────────────────────────────────────────

function dateStr(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function ExportTab() {
  const defaultEnd = new Date();
  const defaultStart = new Date();
  defaultStart.setMonth(defaultStart.getMonth() - 3);

  const [startDate, setStartDate] = useState(dateStr(defaultStart));
  const [endDate, setEndDate] = useState(dateStr(defaultEnd));
  const [exporting, setExporting] = useState(false);

  async function handleExport() {
    setExporting(true);
    try {
      const res = await apiClient.get('/export/excel', {
        params: { start: startDate, end: endDate },
        responseType: 'blob',
      });
      const url = URL.createObjectURL(res.data as Blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `pulse-export-${startDate}-${endDate}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      // ignore
    } finally {
      setExporting(false);
    }
  }

  return (
    <Section title="Download All Data">
      <p className="text-sm text-dram-muted">
        Exports your food log, TDEE breakdown, workout log, body measurements, and water log as a single Excel file with separate sheets.
      </p>
      <div className="flex flex-wrap gap-4 items-end">
        <div className="flex flex-col gap-1">
          <label className="text-sm text-gray-400">Start date</label>
          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className={inputCls + ' w-40 [color-scheme:dark]'}
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-sm text-gray-400">End date</label>
          <input
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            className={inputCls + ' w-40 [color-scheme:dark]'}
          />
        </div>
        <button
          onClick={handleExport}
          disabled={exporting || !startDate || !endDate}
          className="px-4 py-2 rounded-lg text-sm font-semibold bg-dram-accent text-black hover:brightness-110 transition disabled:opacity-40"
        >
          {exporting ? 'Exporting…' : '↓ Download'}
        </button>
      </div>
    </Section>
  );
}

// ─── Page ─────────────────────────────────────────────────────

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState<Tab>('options');
  const [planRoutines, setPlanRoutines] = useState<RoutineSummary[]>([]);
  const [planExercises, setPlanExercises] = useState<Exercise[]>([]);

  useEffect(() => {
    if (activeTab !== 'planning') return;
    routinesApi.getAll().then(r => setPlanRoutines(r)).catch(() => {});
    exercisesApi.getAll().then(e => setPlanExercises(e)).catch(() => {});
  }, [activeTab]);

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Toolbar */}
      <div className="flex-shrink-0 px-6 pt-5 pb-0 border-b border-dram-border">
        <h1 className="text-xl font-semibold text-slate-200">Settings</h1>

        {/* Tab bar */}
        <div className="flex gap-1 mt-3">
          {TABS.map(({ id, label }) => (
            <button
              key={id}
              onClick={() => setActiveTab(id)}
              className={`px-4 py-2 text-sm font-medium transition border-b-2 -mb-px ${
                activeTab === id
                  ? 'border-dram-accent text-dram-accent'
                  : 'border-transparent text-dram-muted hover:text-slate-200'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className={`flex-1 overflow-y-auto px-6 py-6 ${activeTab !== 'planning' ? 'max-w-2xl' : ''}`}>
        {activeTab === 'options' && <OptionsTab />}
        {activeTab === 'goals'   && <GoalsTab />}
        {activeTab === 'planning' && <PlanningCalendarCard routinesList={planRoutines} exercisesList={planExercises} />}
        {activeTab === 'user'    && <UserTab />}
        {activeTab === 'delete'  && <DeleteDataTab />}
        {activeTab === 'export'  && <ExportTab />}
      </div>
    </div>
  );
}
