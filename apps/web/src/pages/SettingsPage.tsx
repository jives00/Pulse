import { useState, useEffect } from 'react';
import { useAuthStore } from '../store/authStore';
import { useSettingsStore } from '../store/settings';
import type { ColorScheme, SortOption, ExerciseSortOption } from '../store/settings';
import {
  authApi, tagsApi, goalsApi, measurementsApi, GLASS_OZ,
  type DeleteScope, type TagDefinitions, type ExerciseGoals, type MeasurementGoal,
} from '@pulse/api-client';

// ─── Shared primitives ────────────────────────────────────────

const inputCls = 'w-full bg-dram-bg border border-dram-border rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-dram-accent';

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-dram-card border border-dram-border rounded-xl p-5 space-y-4">
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

type Tab = 'options' | 'goals' | 'user' | 'delete';

const TABS: { id: Tab; label: string }[] = [
  { id: 'options', label: 'Options' },
  { id: 'goals',   label: 'Goals' },
  { id: 'user',    label: 'User' },
  { id: 'delete',  label: 'Delete Data' },
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
  { id: 'blue',  label: 'Deep Blue', bg: '#193549', card: '#0d2137', accent: '#D4A843' },
  { id: 'slate', label: 'Slate',     bg: '#0f172a', card: '#1e293b', accent: '#D4A843' },
  { id: 'sand',  label: 'Sand',      bg: '#785a3c', card: '#5a4128', accent: '#D4A843' },
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

// ─── Goals tab ────────────────────────────────────────────────

const METRIC_CONFIG: Record<string, { label: string; unit: string }> = {
  weight:   { label: 'Weight',   unit: 'lbs' },
  waist:    { label: 'Waist',    unit: 'in'  },
  bicep:    { label: 'Bicep',    unit: 'in'  },
  chest:    { label: 'Chest',    unit: 'in'  },
  hips:     { label: 'Hips',     unit: 'in'  },
  body_fat: { label: 'Body Fat', unit: '%'   },
};
const DISPLAYED_METRICS = ['weight', 'waist', 'bicep'];

function GoalsTab() {
  const [loading, setLoading] = useState(true);

  // Nutrition goals
  const [calories, setCalories] = useState('');
  const [carbsG, setCarbsG] = useState('');
  const [proteinG, setProteinG] = useState('');
  const [fatG, setFatG] = useState('');
  const [waterGlasses, setWaterGlasses] = useState('');

  // Exercise goals
  const [exGoals, setExGoals] = useState<ExerciseGoals | null>(null);
  const [volume, setVolume] = useState('');
  const [workoutCount, setWorkoutCount] = useState('');

  // Body measurement goals
  const [mGoals, setMGoals] = useState<Record<string, { value: string; date: string }>>(() => {
    const init: Record<string, { value: string; date: string }> = {};
    for (const key of DISPLAYED_METRICS) init[key] = { value: '', date: '' };
    return init;
  });

  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    Promise.all([
      goalsApi.getSummary(),
      goalsApi.getExercise(),
      measurementsApi.getGoals(),
    ]).then(([summary, ex, mGoalsData]) => {
      const n = summary.nutrition.goals;
      if (n) {
        setCalories(String(n.calories ?? ''));
        setCarbsG(String(n.carbsG ?? ''));
        setProteinG(String(n.proteinG ?? ''));
        setFatG(String(n.fatG ?? ''));
        if (n.waterGoalOz != null) {
          setWaterGlasses(String(Math.round(n.waterGoalOz / GLASS_OZ)));
        }
      }
      setExGoals(ex);
      setVolume(String(ex.volumeLbsPerWeek ?? ''));
      setWorkoutCount(String(ex.workoutsPerWeek ?? ''));
      setMGoals((prev) => {
        const updated = { ...prev };
        for (const key of DISPLAYED_METRICS) {
          const g = (mGoalsData as Record<string, MeasurementGoal>)[key];
          updated[key] = { value: g ? String(g.targetValue) : '', date: g?.targetDate ?? '' };
        }
        return updated;
      });
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
        goalsApi.saveExercise({
          workoutsPerWeek: workoutCount !== '' ? Number(workoutCount) : null,
          minutesPerWeek: exGoals?.minutesPerWeek ?? null,
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
      ]);
      setSuccess('Goals saved.');
      setTimeout(() => setSuccess(''), 3000);
    } catch {
      setError('Failed to save goals.');
    } finally {
      setSaving(false);
    }
  }

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

      <Section title="Workouts (per week)">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm text-gray-400 mb-1">Workouts</label>
            <input type="number" min="0" value={workoutCount} onChange={(e) => setWorkoutCount(e.target.value)} className={inputCls} />
          </div>
          <div>
            <label className="block text-sm text-gray-400 mb-1">Volume (lbs)</label>
            <input type="number" min="0" value={volume} onChange={(e) => setVolume(e.target.value)} className={inputCls} placeholder="e.g. 10000" />
          </div>
        </div>
      </Section>

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
                    <label className="block text-xs text-gray-500 mb-1">Target</label>
                    <input
                      type="number" min="0" step="0.1"
                      value={g.value}
                      onChange={(e) => setMGoals((prev) => ({ ...prev, [key]: { ...prev[key], value: e.target.value } }))}
                      className={inputCls}
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">By date</label>
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
      </Section>
    </div>
  );
}

// ─── User tab ─────────────────────────────────────────────────

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

// ─── Page ─────────────────────────────────────────────────────

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState<Tab>('options');

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

      <div className="flex-1 overflow-y-auto px-6 py-6 max-w-2xl">
        {activeTab === 'options' && <OptionsTab />}
        {activeTab === 'goals'   && <GoalsTab />}
        {activeTab === 'user'    && <UserTab />}
        {activeTab === 'delete'  && <DeleteDataTab />}
      </div>
    </div>
  );
}
