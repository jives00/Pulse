import { useState, useEffect, KeyboardEvent } from 'react';
import { Link } from 'react-router-dom';
import { exercisesApi, type Exercise } from '@pulse/api-client';

const EXERCISE_TYPES = ['weight', 'bodyweight', 'cardio', 'duration'] as const;

interface FormState {
  name: string;
  category: string;
  customCategory: string;
  exerciseType: string;
  musclesPrimary: string[];
  musclesSecondary: string[];
  instructions: string;
  mediaUrl: string;
}

const EMPTY_FORM: FormState = {
  name: '', category: '', customCategory: '', exerciseType: 'weight',
  musclesPrimary: [], musclesSecondary: [], instructions: '', mediaUrl: '',
};

// ── Tag chip input ────────────────────────────────────────────────────────────

function TagInput({ label, tags, onChange }: { label: string; tags: string[]; onChange: (v: string[]) => void }) {
  const [input, setInput] = useState('');

  function commit() {
    const val = input.trim();
    if (val && !tags.includes(val)) onChange([...tags, val]);
    setInput('');
  }

  function onKey(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); commit(); }
    if (e.key === 'Backspace' && !input && tags.length) onChange(tags.slice(0, -1));
  }

  return (
    <div className="space-y-1.5">
      <label className="text-xs font-semibold text-dram-accent/50 uppercase tracking-wide">{label}</label>
      <div className="flex flex-wrap gap-1.5 bg-dram-bg border border-dram-border rounded-lg px-2 py-1.5 min-h-[38px]">
        {tags.map((t) => (
          <span key={t} className="flex items-center gap-1 text-xs bg-dram-accent/15 text-dram-accent rounded-full px-2 py-0.5">
            {t}
            <button type="button" onClick={() => onChange(tags.filter((x) => x !== t))} className="text-dram-accent/50 hover:text-dram-accent leading-none">×</button>
          </span>
        ))}
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={onKey}
          onBlur={commit}
          placeholder={tags.length === 0 ? 'Type and press Enter…' : ''}
          className="flex-1 min-w-[120px] bg-transparent text-sm text-dram-accent placeholder:text-dram-accent/30 focus:outline-none"
        />
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function ExercisesPage() {
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterCat, setFilterCat] = useState('');

  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [useCustomCat, setUseCustomCat] = useState(false);
  const [saving, setSaving] = useState(false);

  function loadAll(params?: { search?: string; category?: string }) {
    return exercisesApi.getAll(params).then(setExercises);
  }

  useEffect(() => {
    Promise.all([exercisesApi.getAll(), exercisesApi.getCategories()])
      .then(([exs, cats]) => { setExercises(exs); setCategories(cats); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (loading) return;
    loadAll({ search: search || undefined, category: filterCat || undefined });
  }, [search, filterCat]);

  function openCreate() {
    setEditingId(null);
    setForm({ ...EMPTY_FORM, category: categories[0] ?? '' });
    setUseCustomCat(false);
    setShowForm(true);
  }

  function openEdit(ex: Exercise) {
    setEditingId(ex.id);
    setForm({
      name: ex.name,
      category: ex.category,
      customCategory: '',
      exerciseType: ex.exerciseType,
      musclesPrimary: ex.musclesPrimary ?? [],
      musclesSecondary: ex.musclesSecondary ?? [],
      instructions: ex.instructions ?? '',
      mediaUrl: ex.mediaUrl ?? '',
    });
    setUseCustomCat(!categories.includes(ex.category));
    setShowForm(true);
  }

  function closeForm() {
    setShowForm(false);
    setEditingId(null);
    setForm(EMPTY_FORM);
    setUseCustomCat(false);
  }

  async function handleSave() {
    const finalCategory = useCustomCat ? form.customCategory.trim() : form.category;
    if (!form.name.trim() || !finalCategory || !form.exerciseType) return;
    setSaving(true);
    try {
      const payload = {
        name: form.name.trim(),
        category: finalCategory,
        exerciseType: form.exerciseType,
        musclesPrimary: form.musclesPrimary,
        musclesSecondary: form.musclesSecondary,
        instructions: form.instructions.trim() || null,
        mediaUrl: form.mediaUrl.trim() || null,
      };
      if (editingId != null) {
        const updated = await exercisesApi.update(editingId, payload);
        setExercises((prev) => prev.map((e) => (e.id === editingId ? { ...e, ...updated } : e)));
        if (!categories.includes(finalCategory)) setCategories((prev) => [...prev, finalCategory].sort());
      } else {
        const created = await exercisesApi.createCustom({
          name: payload.name, category: payload.category, exerciseType: payload.exerciseType,
        });
        setExercises((prev) => [...prev, created]);
        if (!categories.includes(finalCategory)) setCategories((prev) => [...prev, finalCategory].sort());
      }
      closeForm();
    } catch {
      // keep form open
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(ex: Exercise) {
    if (!confirm(`Delete "${ex.name}"? This cannot be undone.`)) return;
    try {
      await exercisesApi.deleteCustom(ex.id);
      setExercises((prev) => prev.filter((e) => e.id !== ex.id));
    } catch { /* ignore */ }
  }

  const filtered = exercises.filter((ex) => {
    const matchSearch = !search || ex.name.toLowerCase().includes(search.toLowerCase());
    const matchCat = !filterCat || ex.category === filterCat;
    return matchSearch && matchCat;
  });

  if (loading) return <div className="text-center text-sm text-dram-accent/60 py-12">Loading…</div>;

  return (
    <div className="max-w-3xl mx-auto px-4 py-6 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-dram-accent">Exercises</h1>
        <button
          onClick={openCreate}
          className="text-sm bg-dram-accent hover:opacity-90 text-dram-bg px-3 py-1.5 rounded-lg transition-opacity font-medium"
        >
          + New Exercise
        </button>
      </div>

      {/* Search + category filters */}
      <div className="space-y-2">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search exercises…"
          className="w-full bg-dram-card border border-dram-border rounded-lg px-3 py-2 text-sm text-dram-accent placeholder:text-dram-accent/40 focus:outline-none focus:border-dram-accent/50"
        />
        <div className="flex flex-wrap gap-1.5">
          <button
            onClick={() => setFilterCat('')}
            className={`text-xs px-3 py-1 rounded-full border transition-colors ${
              !filterCat ? 'bg-dram-accent text-dram-bg border-dram-accent font-semibold'
                : 'text-dram-accent/60 border-dram-border hover:border-dram-accent/40'
            }`}
          >
            All
          </button>
          {categories.map((cat) => (
            <button
              key={cat}
              onClick={() => setFilterCat(filterCat === cat ? '' : cat)}
              className={`text-xs px-3 py-1 rounded-full border transition-colors ${
                filterCat === cat ? 'bg-dram-accent text-dram-bg border-dram-accent font-semibold'
                  : 'text-dram-accent/60 border-dram-border hover:border-dram-accent/40'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      {/* Exercise list */}
      {filtered.length === 0 ? (
        <div className="text-center text-sm text-dram-accent/40 py-12">No exercises found.</div>
      ) : (
        <div className="space-y-1">
          {filtered.map((ex) => (
            <div key={ex.id} className="flex items-center gap-3 bg-dram-card border border-dram-border rounded-lg px-4 py-3">
              <div className="flex-1 min-w-0">
                <Link to={`/workouts/exercises/${ex.id}`} className="text-sm font-medium text-dram-accent hover:underline">
                  {ex.name}
                </Link>
                <p className="text-xs text-dram-accent/50 mt-0.5">{ex.category} · {ex.exerciseType}</p>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                <button onClick={() => openEdit(ex)} className="text-xs text-dram-accent/60 hover:text-dram-accent transition-colors">
                  Edit
                </button>
                {ex.isCustom && (
                  <button onClick={() => handleDelete(ex)} className="text-xs text-red-400 hover:text-red-300 transition-colors">
                    Delete
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create / Edit modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={closeForm}>
          <div
            className="bg-dram-card border border-dram-border rounded-xl w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto p-6 space-y-5"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-base font-semibold text-dram-accent">
              {editingId != null ? 'Edit Exercise' : 'New Exercise'}
            </h2>

            {/* Name */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-dram-accent/50 uppercase tracking-wide">Name</label>
              <input
                autoFocus
                type="text"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="Exercise name"
                className="w-full bg-dram-bg border border-dram-border rounded-lg px-3 py-2 text-sm text-dram-accent placeholder:text-dram-accent/30 focus:outline-none focus:border-dram-accent/50"
              />
            </div>

            {/* Category */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-dram-accent/50 uppercase tracking-wide">Category</label>
              {!useCustomCat && (
                <div className="flex flex-wrap gap-1.5">
                  {categories.map((cat) => (
                    <button
                      key={cat}
                      onClick={() => setForm((f) => ({ ...f, category: cat }))}
                      className={`text-xs px-3 py-1 rounded-full border transition-colors ${
                        form.category === cat ? 'bg-dram-accent text-dram-bg border-dram-accent font-semibold'
                          : 'text-dram-accent/60 border-dram-border hover:border-dram-accent/40'
                      }`}
                    >
                      {cat}
                    </button>
                  ))}
                </div>
              )}
              {useCustomCat && (
                <input
                  type="text"
                  value={form.customCategory}
                  onChange={(e) => setForm((f) => ({ ...f, customCategory: e.target.value }))}
                  placeholder="New category name"
                  className="w-full bg-dram-bg border border-dram-border rounded-lg px-3 py-2 text-sm text-dram-accent placeholder:text-dram-accent/30 focus:outline-none focus:border-dram-accent/50"
                />
              )}
              <button onClick={() => setUseCustomCat((v) => !v)} className="text-xs text-dram-accent/50 hover:text-dram-accent transition-colors">
                {useCustomCat ? '← Pick existing' : '+ New category'}
              </button>
            </div>

            {/* Type */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-dram-accent/50 uppercase tracking-wide">Type</label>
              <div className="flex flex-wrap gap-1.5">
                {EXERCISE_TYPES.map((t) => (
                  <button
                    key={t}
                    onClick={() => setForm((f) => ({ ...f, exerciseType: t }))}
                    className={`text-xs px-3 py-1 rounded-full border transition-colors ${
                      form.exerciseType === t ? 'bg-dram-accent text-dram-bg border-dram-accent font-semibold'
                        : 'text-dram-accent/60 border-dram-border hover:border-dram-accent/40'
                    }`}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </div>

            {/* Primary muscles */}
            <TagInput
              label="Primary Muscles"
              tags={form.musclesPrimary}
              onChange={(v) => setForm((f) => ({ ...f, musclesPrimary: v }))}
            />

            {/* Secondary muscles */}
            <TagInput
              label="Secondary Muscles"
              tags={form.musclesSecondary}
              onChange={(v) => setForm((f) => ({ ...f, musclesSecondary: v }))}
            />

            {/* Instructions */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-dram-accent/50 uppercase tracking-wide">Instructions</label>
              <textarea
                value={form.instructions}
                onChange={(e) => setForm((f) => ({ ...f, instructions: e.target.value }))}
                placeholder="Step-by-step instructions…"
                rows={4}
                className="w-full bg-dram-bg border border-dram-border rounded-lg px-3 py-2 text-sm text-dram-accent placeholder:text-dram-accent/30 focus:outline-none focus:border-dram-accent/50 resize-none"
              />
            </div>

            {/* Demo URL */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-dram-accent/50 uppercase tracking-wide">Demo URL</label>
              <input
                type="text"
                value={form.mediaUrl}
                onChange={(e) => setForm((f) => ({ ...f, mediaUrl: e.target.value }))}
                placeholder="YouTube link, GIF, or image URL"
                className="w-full bg-dram-bg border border-dram-border rounded-lg px-3 py-2 text-sm text-dram-accent placeholder:text-dram-accent/30 focus:outline-none focus:border-dram-accent/50"
              />
            </div>

            <div className="flex justify-end gap-3 pt-1">
              <button onClick={closeForm} className="text-sm text-dram-accent/50 hover:text-dram-accent transition-colors">
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={saving || !form.name.trim() || (!useCustomCat ? !form.category : !form.customCategory.trim())}
                className="text-sm bg-dram-accent hover:opacity-90 disabled:opacity-40 text-dram-bg px-4 py-1.5 rounded-lg transition-opacity font-medium"
              >
                {saving ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
