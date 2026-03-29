import { useState, useEffect } from 'react';
import { useAuthStore } from '../store/authStore';
import { useSettingsStore } from '../store/settings';
import type { ColorScheme, SortOption } from '../store/settings';
import { authApi, tagsApi, type DeleteScope, type TagDefinitions } from '@pulse/api-client';

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

const inputCls = 'w-full bg-dram-bg border border-dram-border rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-dram-accent';

// ─── Change username ──────────────────────────────────────────

function ChangeUsername() {
  const { token, setToken } = useAuthStore();
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
        <input
          type="text"
          value={newUsername}
          onChange={(e) => setNewUsername(e.target.value)}
          autoComplete="username"
          className={inputCls}
        />
      </div>
      <div>
        <label className="block text-sm text-gray-400 mb-1">Current password</label>
        <input
          type="password"
          value={currentPassword}
          onChange={(e) => setCurrentPassword(e.target.value)}
          autoComplete="current-password"
          className={inputCls}
        />
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

// ─── Change password ──────────────────────────────────────────

function ChangePassword() {
  const { token, setToken } = useAuthStore();
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
        <input
          type="password"
          value={currentPassword}
          onChange={(e) => setCurrentPassword(e.target.value)}
          autoComplete="current-password"
          className={inputCls}
        />
      </div>
      <div>
        <label className="block text-sm text-gray-400 mb-1">New password</label>
        <input
          type="password"
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
          autoComplete="new-password"
          className={inputCls}
        />
      </div>
      <div>
        <label className="block text-sm text-gray-400 mb-1">Confirm new password</label>
        <input
          type="password"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          autoComplete="new-password"
          className={inputCls}
        />
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

// ─── Tag definitions ──────────────────────────────────────────

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

// ─── Danger zone ──────────────────────────────────────────────

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

function DangerZone() {
  return (
    <div>
      {DELETE_OPTIONS.map((opt) => (
        <DeleteRow key={opt.scope} {...opt} />
      ))}
    </div>
  );
}

// ─── Default sort ─────────────────────────────────────────────

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

// ─── Color scheme ─────────────────────────────────────────────

const THEMES: { id: ColorScheme; label: string; bg: string; card: string; accent: string }[] = [
  { id: 'blue',  label: 'Deep Blue', bg: '#193549', card: '#0d2137', accent: '#D4A843' },
  { id: 'slate', label: 'Slate',     bg: '#0f172a', card: '#1e293b', accent: '#D4A843' },
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
            {/* Mini preview */}
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

// ─── Page ─────────────────────────────────────────────────────

export default function SettingsPage() {
  return (
    <div className="max-w-lg mx-auto px-4 py-6 space-y-6">
      <h1 className="text-xl font-semibold text-white">Settings</h1>

      <Section title="Default Sort">
        <DefaultSortSection />
      </Section>

      <Section title="Tags">
        <TagDefinitionsSection />
      </Section>

      <Section title="Color Scheme">
        <ColorSchemeSection />
      </Section>

      <Section title="Change Username">
        <ChangeUsername />
      </Section>

      <Section title="Change Password">
        <ChangePassword />
      </Section>

      <Section title="Danger Zone">
        <DangerZone />
      </Section>
    </div>
  );
}
