import { useState, useEffect } from 'react';
import { useAuthStore } from '../store/authStore';
import { useSettingsStore } from '../store/settings';
import type { ColorScheme, SortOption, ExerciseSortOption } from '../store/settings';
import { useFeaturesStore } from '../store/featuresStore';
import { useFeatures } from '../components/FeatureGate';
import {
  authApi, tagsApi, nutritionTargetsApi, profileApi,
  GLASS_OZ, apiClient,
  TOP_LEVEL_FEATURES, subFeatures,
  type DeleteScope, type TagDefinitions,
  type UserProfile, type ActivityLevel,
  type FeatureKey,
} from '@pulse/api-client';

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

function Toggle({ checked, onChange, disabled }: { checked: boolean; onChange: () => void; disabled?: boolean }) {
  return (
    <input
      type="checkbox"
      checked={checked}
      onChange={onChange}
      disabled={disabled}
      className="w-4 h-4 flex-shrink-0 accent-dram-accent disabled:opacity-40"
    />
  );
}

// ─── Tab bar ──────────────────────────────────────────────────

type Tab = 'features' | 'options' | 'goals' | 'user' | 'delete' | 'export';

const TABS: { id: Tab; label: string }[] = [
  { id: 'features', label: 'Features' },
  { id: 'options',  label: 'Options' },
  { id: 'goals',    label: 'Targets' },
  { id: 'user',     label: 'User' },
  { id: 'delete',   label: 'Delete Data' },
  { id: 'export',   label: 'Export' },
];

// ─── Features tab ─────────────────────────────────────────────

function FeatureRow({ featureKey, label, description, indent, disabled }: {
  featureKey: FeatureKey; label: string; description: string; indent?: boolean; disabled?: boolean;
}) {
  const features = useFeatures();
  const setFeature = useFeaturesStore((s) => s.setFeature);
  return (
    <div className={`flex items-start justify-between gap-4 py-2.5 ${indent ? 'pl-6' : ''}`}>
      <div className="min-w-0">
        <p className="text-sm text-gray-300">{label}</p>
        <p className="text-sm text-gray-500 mt-0.5">{description}</p>
      </div>
      <div className="shrink-0 pt-0.5">
        <Toggle
          checked={features[featureKey]}
          disabled={disabled}
          onChange={() => setFeature(featureKey, !features[featureKey])}
        />
      </div>
    </div>
  );
}

function FeaturesTab() {
  const features = useFeatures();
  return (
    <div className="space-y-4">
      <Section title="Feature Modules">
        <p className="text-sm text-gray-500">
          Turning this off hides its pages and dashboard cards. Your data is kept and comes back if you turn it on again.
        </p>
        <div className="divide-y divide-dram-border">
          {TOP_LEVEL_FEATURES.map((entry) => (
            <div key={entry.key}>
              <FeatureRow featureKey={entry.key} label={entry.label} description={entry.description} />
              {subFeatures(entry.key).map((sub) => (
                <FeatureRow
                  key={sub.key}
                  featureKey={sub.key}
                  label={sub.label}
                  description={sub.description}
                  indent
                  disabled={!features[entry.key]}
                />
              ))}
            </div>
          ))}
        </div>
      </Section>
    </div>
  );
}

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
  { id: 'trakt',    label: 'Trakt',     bg: '#24262e', card: '#323440', accent: '#D4A843' },
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

// ─── Goals tab (nutrition targets only) ──────────────────────

function GoalsTab() {
  const [loading, setLoading] = useState(true);

  const [calories, setCalories] = useState('');
  const [carbsG, setCarbsG] = useState('');
  const [proteinG, setProteinG] = useState('');
  const [fatG, setFatG] = useState('');
  const [waterGlasses, setWaterGlasses] = useState('');

  const [wkCalories, setWkCalories] = useState('');
  const [wkCarbsG, setWkCarbsG] = useState('');
  const [wkProteinG, setWkProteinG] = useState('');
  const [wkFatG, setWkFatG] = useState('');

  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    nutritionTargetsApi.get().then((t) => {
      setCalories(String(t.calories ?? ''));
      setCarbsG(String(t.carbsG ?? ''));
      setProteinG(String(t.proteinG ?? ''));
      setFatG(String(t.fatG ?? ''));
      if (t.waterGoalOz != null) setWaterGlasses(String(Math.round(t.waterGoalOz / GLASS_OZ)));
      setWkCalories(String(t.weeklyCalories ?? ''));
      setWkProteinG(String(t.weeklyProteinG ?? ''));
      setWkCarbsG(String(t.weeklyCarbsG ?? ''));
      setWkFatG(String(t.weeklyFatG ?? ''));
    }).catch(() => {}).finally(() => setLoading(false));
  }, []);

  async function handleSave() {
    setSaving(true);
    setError('');
    setSuccess('');
    try {
      await Promise.all([
        calories && carbsG && proteinG && fatG
          ? nutritionTargetsApi.save({
              calories: Number(calories),
              carbsG: Number(carbsG),
              proteinG: Number(proteinG),
              fatG: Number(fatG),
              waterGoalOz: waterGlasses !== '' ? Number(waterGlasses) * GLASS_OZ : undefined,
            })
          : Promise.resolve(),
        (wkCalories || wkProteinG || wkCarbsG || wkFatG)
          ? nutritionTargetsApi.saveWeekly({
              weeklyCalories: wkCalories !== '' ? Number(wkCalories) : null,
              weeklyProteinG: wkProteinG !== '' ? Number(wkProteinG) : null,
              weeklyCarbsG: wkCarbsG !== '' ? Number(wkCarbsG) : null,
              weeklyFatG: wkFatG !== '' ? Number(wkFatG) : null,
            })
          : Promise.resolve(),
      ]);
      setSuccess('Saved.');
      setTimeout(() => setSuccess(''), 3000);
    } catch {
      setError('Failed to save.');
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

      <Section title="Nutrition (weekly)">
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

      <div className="pt-1">
        <StatusMsg error={error} success={success} />
        <button
          onClick={handleSave}
          disabled={saving}
          className="mt-2 bg-dram-accent text-black font-semibold px-5 py-2 rounded-lg text-sm hover:brightness-110 disabled:opacity-40 transition"
        >
          {saving ? 'Saving…' : 'Save'}
        </button>
      </div>
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

const DELETE_OPTIONS: { scope: DeleteScope; label: string; description: string; requires: FeatureKey }[] = [
  { scope: 'recipes',  label: 'Delete all recipes',  description: 'Removes all food and drink recipes, including their cook history.', requires: 'recipes' },
  { scope: 'history',  label: 'Delete all history',  description: 'Removes all food log entries, recipe cook log, and water log.', requires: 'nutrition' },
  { scope: 'workouts', label: 'Delete all workouts', description: 'Removes all workout sessions and logged sets.', requires: 'exercise' },
  { scope: 'goals',    label: 'Delete all goals',    description: 'Removes all nutrition and exercise goals.', requires: 'goals' },
  { scope: 'links',    label: 'Delete all links',    description: 'Removes all saved recipe links.', requires: 'links' },
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
  const features = useFeatures();
  return (
    <Section title="Danger Zone">
      {DELETE_OPTIONS.filter((opt) => features[opt.requires]).map(({ requires, ...opt }) => (
        <DeleteRow key={opt.scope} {...opt} />
      ))}
    </Section>
  );
}

// ─── Export tab ───────────────────────────────────────────────

function dateStr(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

const EXPORT_SHEETS: { requires: FeatureKey; label: string }[] = [
  { requires: 'nutrition', label: 'food log' },
  { requires: 'nutrition', label: 'TDEE breakdown' },
  { requires: 'exercise',  label: 'workout log' },
  { requires: 'body',      label: 'body measurements' },
  { requires: 'nutrition', label: 'water log' },
];

function ExportTab() {
  const features = useFeatures();
  const sheets = EXPORT_SHEETS.filter((s) => features[s.requires]).map((s) => s.label);
  const sheetList = sheets.length > 1
    ? `${sheets.slice(0, -1).join(', ')}, and ${sheets[sheets.length - 1]}`
    : sheets[0] ?? 'data';

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
        Exports your {sheetList} as a single Excel file with separate sheets.
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
  const features = useFeatures();
  const tabs = TABS.filter((t) => t.id !== 'goals' || features.nutrition);
  // Disabling a module while its tab is open would otherwise leave an empty pane.
  const currentTab = tabs.some((t) => t.id === activeTab) ? activeTab : 'options';

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Toolbar */}
      <div className="flex-shrink-0 px-6 pt-5 pb-0 border-b border-dram-border">
        <h1 className="text-xl font-semibold text-slate-200">Settings</h1>

        {/* Tab bar */}
        <div className="flex gap-1 mt-3">
          {tabs.map(({ id, label }) => (
            <button
              key={id}
              onClick={() => setActiveTab(id)}
              className={`px-4 py-2 text-sm font-medium transition border-b-2 -mb-px ${
                currentTab === id
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
        {currentTab === 'features' && <FeaturesTab />}
        {currentTab === 'options'  && <OptionsTab />}
        {currentTab === 'goals'    && <GoalsTab />}
        {currentTab === 'user'     && <UserTab />}
        {currentTab === 'delete'   && <DeleteDataTab />}
        {currentTab === 'export'   && <ExportTab />}
      </div>
    </div>
  );
}
