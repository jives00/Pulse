import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { exercisesApi, type Exercise } from '@pulse/api-client';
import { useSettingsStore } from '../store/settings';
import Spinner from '../components/Spinner';

const EXERCISE_TYPES = ['weight', 'bodyweight', 'cardio', 'duration'] as const;


interface FormState {
  name: string;
  category: string;
  customCategory: string;
  exerciseType: string;
  trackedFields: string[];
}

const EMPTY_FORM: FormState = {
  name: '', category: '', customCategory: '', exerciseType: 'weight',
  trackedFields: ['reps', 'weight'],
};

const CATEGORY_EMOJI: Record<string, string> = {
  chest: '🫁', back: '🦾', shoulders: '💪', arms: '💪',
  legs: '🦵', glutes: '🍑', core: '⚡', cardio: '🏃',
  olympic: '🥇', plyometrics: '🦘', stretching: '🧘',
};

// ── Exercise card ─────────────────────────────────────────────────────────────

function ExerciseCard({ exercise }: { exercise: Exercise }) {
  const imgSrc = exercise.coverImageUrl ?? null;
  const emoji = CATEGORY_EMOJI[exercise.category.toLowerCase()] ?? '🏋️';

  return (
    <div className="bg-dram-card rounded-xl overflow-hidden border border-dram-border hover:border-dram-accent/50 transition group">
      {/* Image / placeholder */}
      <Link to={`/workouts/exercises/${exercise.id}`} className="block">
        <div className="aspect-square bg-dram-bg relative overflow-hidden">
          {imgSrc ? (
            <img
              src={imgSrc}
              alt={exercise.name}
              loading="lazy"
              className="w-full h-full object-cover group-hover:scale-105 transition duration-300"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <span className="text-4xl opacity-30">{emoji}</span>
            </div>
          )}
        </div>
      </Link>

      {/* Info */}
      <div className="p-3">
        <Link
          to={`/workouts/exercises/${exercise.id}`}
          className="font-semibold text-white text-sm leading-snug line-clamp-2 hover:text-dram-accent transition-colors block"
        >
          {exercise.name}
        </Link>
        <p className="text-gray-500 text-xs mt-0.5 capitalize">{exercise.category} · {exercise.exerciseType}</p>
        <div className="flex flex-wrap gap-1 mt-2">
          {exercise.musclesPrimary?.slice(0, 2).map((m) => (
            <span key={m} className="text-xs border border-dram-accent/40 text-dram-accent rounded-full px-2 py-0.5 capitalize">
              {m}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function ExercisesPage() {
  const { defaultExerciseSort } = useSettingsStore();
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterCat, setFilterCat] = useState('');

  const [showForm, setShowForm] = useState(false);
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

  useEffect(() => {
    if (!showForm) return;
    const handler = (e: globalThis.KeyboardEvent) => { if (e.key === 'Escape') closeForm(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [showForm]);

  function openCreate() {
    setForm({ ...EMPTY_FORM, category: categories[0] ?? '' });
    setUseCustomCat(false);
    setShowForm(true);
  }

  function closeForm() {
    setShowForm(false);
    setForm(EMPTY_FORM);
    setUseCustomCat(false);
  }

  async function handleSave() {
    const finalCategory = useCustomCat ? form.customCategory.trim() : form.category;
    if (!form.name.trim() || !finalCategory || !form.exerciseType) return;
    setSaving(true);
    try {
      const created = await exercisesApi.createCustom({
        name: form.name.trim(), category: finalCategory, exerciseType: form.exerciseType,
      });
      setExercises((prev) => [...prev, created]);
      if (!categories.includes(finalCategory)) setCategories((prev) => [...prev, finalCategory].sort());
      closeForm();
    } catch {
      // keep form open
    } finally {
      setSaving(false);
    }
  }

  const filtered = exercises
    .filter((ex) => {
      const matchSearch = !search || ex.name.toLowerCase().includes(search.toLowerCase());
      const matchCat = !filterCat || ex.category === filterCat;
      return matchSearch && matchCat;
    })
    .sort((a, b) =>
      defaultExerciseSort === 'name' ? a.name.localeCompare(b.name) : a.id - b.id
    );

  return (
    <div className="flex flex-col h-full overflow-hidden bg-dram-bg text-white">
      {/* Toolbar */}
      <div className="px-6 pt-5 pb-4 border-b border-dram-border flex-shrink-0">
        <div className="flex items-center gap-3 mb-3">
          <input
            type="text"
            placeholder="🔍 Search exercises…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="flex-1 bg-dram-card border border-dram-border rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-dram-accent"
          />
          <button
            onClick={openCreate}
            className="bg-dram-accent text-black font-semibold px-4 py-2 rounded-lg text-sm hover:brightness-110 transition flex-shrink-0"
          >
            + New Exercise
          </button>
        </div>
        <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-hide">
          <button
            onClick={() => setFilterCat('')}
            className={`whitespace-nowrap px-3 py-1.5 rounded-lg text-sm border transition ${
              !filterCat
                ? 'border-dram-accent text-dram-accent bg-dram-accent/10'
                : 'border-dram-border text-gray-400 hover:border-gray-600 hover:text-gray-200'
            }`}
          >
            All
          </button>
          {categories.map((cat) => (
            <button
              key={cat}
              onClick={() => setFilterCat(filterCat === cat ? '' : cat)}
              className={`whitespace-nowrap px-3 py-1.5 rounded-lg text-sm border transition ${
                filterCat === cat
                  ? 'border-dram-accent text-dram-accent bg-dram-accent/10'
                  : 'border-dram-border text-gray-400 hover:border-gray-600 hover:text-gray-200'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      {/* Grid */}
      <div className="flex-1 overflow-y-auto p-6">
        {loading ? (
          <div className="flex justify-center mt-16"><Spinner size={10} /></div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center mt-20 text-gray-600">
            <span className="text-5xl mb-3">🏋️</span>
            <p className="text-lg">No exercises found.</p>
          </div>
        ) : (
          <div className="grid gap-4 grid-cols-2 md:grid-cols-3 lg:grid-cols-5">
            {filtered.map((ex) => (
              <ExerciseCard key={ex.id} exercise={ex} />
            ))}
          </div>
        )}
      </div>

      {/* Create / Edit modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={closeForm}>
          <div
            className="bg-dram-card border border-dram-border rounded-xl w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto p-6 space-y-5"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-base font-semibold text-dram-accent">New Exercise</h2>

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
                    onClick={() => setForm((f) => ({ ...f, exerciseType: t, trackedFields: defaultTrackedFields(t) }))}
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

            {/* Tracked fields */}
            <div className="space-y-2">
              <label className="text-xs font-semibold text-dram-accent/50 uppercase tracking-wide">Track Per Set</label>
              <div className="flex flex-wrap gap-2">
                {TRACKED_FIELD_OPTIONS.map(({ key, label }) => {
                  const checked = form.trackedFields.includes(key);
                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setForm((f) => ({
                        ...f,
                        trackedFields: checked
                          ? f.trackedFields.filter((x) => x !== key)
                          : [...f.trackedFields, key],
                      }))}
                      className={`text-xs px-3 py-1 rounded-full border transition-colors ${
                        checked
                          ? 'bg-dram-accent text-dram-bg border-dram-accent font-semibold'
                          : 'text-dram-accent/60 border-dram-border hover:border-dram-accent/40'
                      }`}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
              <p className="text-xs text-gray-500">Defaults set by type. Toggle to mix (e.g. stairs = Duration + Reps).</p>
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
