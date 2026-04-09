import { useState, useEffect, KeyboardEvent } from 'react';
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
  musclesPrimary: string[];
  musclesSecondary: string[];
  instructions: string;
  /** URL input field value (used for upload; not saved directly) */
  coverImageUrlInput: string;
  /** URL input field value (used for upload; not saved directly) */
  mediaUrlInput: string;
  /** URL input field value (used for upload; not saved directly) */
  muscleImageUrlInput: string;
  /** Raw stored value: S3 key or YouTube/legacy URL — sent on save */
  coverImageKey: string;
  mediaKey: string;
  muscleImageKey: string;
  notes: string;
  trackWeight: boolean;
}

const EMPTY_FORM: FormState = {
  name: '', category: '', customCategory: '', exerciseType: 'weight',
  musclesPrimary: [], musclesSecondary: [], instructions: '',
  coverImageUrlInput: '', mediaUrlInput: '', muscleImageUrlInput: '',
  coverImageKey: '', mediaKey: '', muscleImageKey: '',
  notes: '', trackWeight: true,
};

const CATEGORY_EMOJI: Record<string, string> = {
  chest: '🫁', back: '🦾', shoulders: '💪', arms: '💪',
  legs: '🦵', glutes: '🍑', core: '⚡', cardio: '🏃',
  olympic: '🥇', plyometrics: '🦘', stretching: '🧘',
};

// ── Exercise card ─────────────────────────────────────────────────────────────

function ExerciseCard({
  exercise, onEdit, onDelete,
}: {
  exercise: Exercise;
  onEdit: () => void;
  onDelete: () => void;
}) {
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
        <div className="flex items-center justify-between mt-2">
          <div className="flex flex-wrap gap-1">
            {exercise.musclesPrimary?.slice(0, 2).map((m) => (
              <span key={m} className="text-xs border border-dram-accent/40 text-dram-accent rounded-full px-2 py-0.5 capitalize">
                {m}
              </span>
            ))}
          </div>
          <div className="flex items-center gap-2 shrink-0 ml-1">
            <button onClick={onEdit} className="text-xs text-dram-accent/60 hover:text-dram-accent transition-colors">
              Edit
            </button>
            <button onClick={onDelete} className="text-xs text-red-400 hover:text-red-300 transition-colors">
              Delete
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

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
  const { defaultExerciseSort } = useSettingsStore();
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
  const [uploadingField, setUploadingField] = useState<'cover' | 'media' | 'muscle' | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);

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
    setEditingId(null);
    setForm({ ...EMPTY_FORM, category: categories[0] ?? '' });
    setUseCustomCat(false);
    setShowForm(true);
  }

  async function openEdit(ex: Exercise) {
    setEditingId(ex.id);
    setShowForm(true);
    // Fetch full detail to ensure instructions/media keys/notes are populated
    try {
      const full = await exercisesApi.getOne(ex.id);
      setForm({
        name: full.name,
        category: full.category,
        customCategory: '',
        exerciseType: full.exerciseType,
        musclesPrimary: full.musclesPrimary ?? [],
        musclesSecondary: full.musclesSecondary ?? [],
        instructions: full.instructions ?? '',
        coverImageUrlInput: '',
        mediaUrlInput: '',
        muscleImageUrlInput: '',
        coverImageKey: full.coverImageKey ?? '',
        mediaKey: full.mediaKey ?? '',
        muscleImageKey: full.muscleImageKey ?? '',
        notes: full.notes ?? '',
        trackWeight: full.trackWeight ?? true,
      });
      setUseCustomCat(!categories.includes(full.category));
    } catch {
      // fall back to list data
      setForm({
        name: ex.name,
        category: ex.category,
        customCategory: '',
        exerciseType: ex.exerciseType,
        musclesPrimary: ex.musclesPrimary ?? [],
        musclesSecondary: ex.musclesSecondary ?? [],
        instructions: ex.instructions ?? '',
        coverImageUrlInput: '',
        mediaUrlInput: '',
        muscleImageUrlInput: '',
        coverImageKey: ex.coverImageKey ?? '',
        mediaKey: ex.mediaKey ?? '',
        muscleImageKey: ex.muscleImageKey ?? '',
        notes: ex.notes ?? '',
        trackWeight: ex.trackWeight ?? true,
      });
      setUseCustomCat(!categories.includes(ex.category));
    }
  }

  function closeForm() {
    setShowForm(false);
    setEditingId(null);
    setForm(EMPTY_FORM);
    setUseCustomCat(false);
    setUploadError(null);
  }

  async function uploadFromUrl(field: 'cover' | 'media' | 'muscle') {
    if (!editingId) return;
    const url = field === 'cover' ? form.coverImageUrlInput : field === 'media' ? form.mediaUrlInput : form.muscleImageUrlInput;
    if (!url.trim()) return;
    setUploadingField(field);
    setUploadError(null);
    try {
      let result: { key: string };
      if (field === 'cover') result = await exercisesApi.uploadCoverImageFromUrl(editingId, url.trim());
      else if (field === 'media') result = await exercisesApi.uploadMediaFromUrl(editingId, url.trim());
      else result = await exercisesApi.uploadMuscleImageFromUrl(editingId, url.trim());
      setForm((f) => ({
        ...f,
        ...(field === 'cover' ? { coverImageKey: result.key, coverImageUrlInput: '' } : {}),
        ...(field === 'media' ? { mediaKey: result.key, mediaUrlInput: '' } : {}),
        ...(field === 'muscle' ? { muscleImageKey: result.key, muscleImageUrlInput: '' } : {}),
      }));
    } catch {
      setUploadError('Upload failed — check the URL and try again.');
    } finally {
      setUploadingField(null);
    }
  }

  async function uploadFromFile(field: 'cover' | 'media' | 'muscle', file: File) {
    if (!editingId) return;
    setUploadingField(field);
    setUploadError(null);
    try {
      let result: { uploadUrl: string; key: string };
      if (field === 'cover') result = await exercisesApi.getCoverImageUploadUrl(editingId, file.type || 'image/jpeg');
      else if (field === 'media') result = await exercisesApi.getMediaUploadUrl(editingId, file.type || 'image/jpeg');
      else result = await exercisesApi.getMuscleImageUploadUrl(editingId, file.type || 'image/jpeg');
      await fetch(result.uploadUrl, { method: 'PUT', body: file, headers: { 'Content-Type': file.type } });
      setForm((f) => ({
        ...f,
        ...(field === 'cover' ? { coverImageKey: result.key } : {}),
        ...(field === 'media' ? { mediaKey: result.key } : {}),
        ...(field === 'muscle' ? { muscleImageKey: result.key } : {}),
      }));
    } catch {
      setUploadError('Upload failed — please try again.');
    } finally {
      setUploadingField(null);
    }
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
        mediaUrl: form.mediaKey.trim() || null,
        coverImageUrl: form.coverImageKey.trim() || null,
        muscleImageUrl: form.muscleImageKey.trim() || null,
        notes: form.notes.trim() || null,
        trackWeight: form.trackWeight,
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
              <ExerciseCard
                key={ex.id}
                exercise={ex}
                onEdit={() => openEdit(ex)}
                onDelete={() => handleDelete(ex)}
              />
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

            {/* Track weight toggle */}
            <div className="flex items-center justify-between">
              <div>
                <div className="text-xs font-semibold text-dram-accent/50 uppercase tracking-wide">Track Weight</div>
                <div className="text-xs text-gray-500 mt-0.5">Uncheck for cardio/bodyweight-only exercises</div>
              </div>
              <button
                type="button"
                onClick={() => setForm((f) => ({ ...f, trackWeight: !f.trackWeight }))}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${form.trackWeight ? 'bg-dram-accent' : 'bg-gray-600'}`}
              >
                <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${form.trackWeight ? 'translate-x-6' : 'translate-x-1'}`} />
              </button>
            </div>

            <TagInput
              label="Primary Muscles"
              tags={form.musclesPrimary}
              onChange={(v) => setForm((f) => ({ ...f, musclesPrimary: v }))}
            />

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

            {/* Cover Image */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-dram-accent/50 uppercase tracking-wide">Cover Image</label>
              {form.coverImageKey && (
                <div className="flex items-center gap-2 text-xs text-dram-accent/60">
                  <span className="truncate max-w-[280px]">{form.coverImageKey}</span>
                  <button type="button" onClick={() => setForm((f) => ({ ...f, coverImageKey: '' }))} className="text-red-400 hover:text-red-300 shrink-0">Remove</button>
                </div>
              )}
              {editingId != null && (
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={form.coverImageUrlInput}
                    onChange={(e) => setForm((f) => ({ ...f, coverImageUrlInput: e.target.value }))}
                    placeholder="Paste image URL to upload to S3…"
                    className="flex-1 bg-dram-bg border border-dram-border rounded-lg px-3 py-2 text-sm text-dram-accent placeholder:text-dram-accent/30 focus:outline-none focus:border-dram-accent/50"
                    onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); uploadFromUrl('cover'); } }}
                  />
                  <button
                    type="button"
                    disabled={!form.coverImageUrlInput.trim() || uploadingField === 'cover'}
                    onClick={() => uploadFromUrl('cover')}
                    className="text-sm bg-dram-accent hover:opacity-90 disabled:opacity-40 text-dram-bg px-3 py-1.5 rounded-lg transition-opacity font-medium shrink-0"
                  >
                    {uploadingField === 'cover' ? '…' : 'Upload'}
                  </button>
                  <label className="text-sm text-dram-accent/60 hover:text-dram-accent cursor-pointer flex items-center transition-colors shrink-0">
                    File
                    <input type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadFromFile('cover', f); e.target.value = ''; }} />
                  </label>
                </div>
              )}
            </div>

            {/* How-To Media */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-dram-accent/50 uppercase tracking-wide">How-To Media</label>
              {form.mediaKey && (
                <div className="flex items-center gap-2 text-xs text-dram-accent/60">
                  <span className="truncate max-w-[280px]">{form.mediaKey}</span>
                  <button type="button" onClick={() => setForm((f) => ({ ...f, mediaKey: '' }))} className="text-red-400 hover:text-red-300 shrink-0">Remove</button>
                </div>
              )}
              {editingId != null && (
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={form.mediaUrlInput}
                    onChange={(e) => setForm((f) => ({ ...f, mediaUrlInput: e.target.value }))}
                    placeholder="YouTube link, GIF, or image URL…"
                    className="flex-1 bg-dram-bg border border-dram-border rounded-lg px-3 py-2 text-sm text-dram-accent placeholder:text-dram-accent/30 focus:outline-none focus:border-dram-accent/50"
                    onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); uploadFromUrl('media'); } }}
                  />
                  <button
                    type="button"
                    disabled={!form.mediaUrlInput.trim() || uploadingField === 'media'}
                    onClick={() => uploadFromUrl('media')}
                    className="text-sm bg-dram-accent hover:opacity-90 disabled:opacity-40 text-dram-bg px-3 py-1.5 rounded-lg transition-opacity font-medium shrink-0"
                  >
                    {uploadingField === 'media' ? '…' : 'Upload'}
                  </button>
                  <label className="text-sm text-dram-accent/60 hover:text-dram-accent cursor-pointer flex items-center transition-colors shrink-0">
                    File
                    <input type="file" accept="image/*,video/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadFromFile('media', f); e.target.value = ''; }} />
                  </label>
                </div>
              )}
            </div>

            {/* Muscle Diagram */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-dram-accent/50 uppercase tracking-wide">Muscle Diagram</label>
              {form.muscleImageKey && (
                <div className="flex items-center gap-2 text-xs text-dram-accent/60">
                  <span className="truncate max-w-[280px]">{form.muscleImageKey}</span>
                  <button type="button" onClick={() => setForm((f) => ({ ...f, muscleImageKey: '' }))} className="text-red-400 hover:text-red-300 shrink-0">Remove</button>
                </div>
              )}
              {editingId != null && (
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={form.muscleImageUrlInput}
                    onChange={(e) => setForm((f) => ({ ...f, muscleImageUrlInput: e.target.value }))}
                    placeholder="Paste muscle diagram image URL…"
                    className="flex-1 bg-dram-bg border border-dram-border rounded-lg px-3 py-2 text-sm text-dram-accent placeholder:text-dram-accent/30 focus:outline-none focus:border-dram-accent/50"
                    onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); uploadFromUrl('muscle'); } }}
                  />
                  <button
                    type="button"
                    disabled={!form.muscleImageUrlInput.trim() || uploadingField === 'muscle'}
                    onClick={() => uploadFromUrl('muscle')}
                    className="text-sm bg-dram-accent hover:opacity-90 disabled:opacity-40 text-dram-bg px-3 py-1.5 rounded-lg transition-opacity font-medium shrink-0"
                  >
                    {uploadingField === 'muscle' ? '…' : 'Upload'}
                  </button>
                  <label className="text-sm text-dram-accent/60 hover:text-dram-accent cursor-pointer flex items-center transition-colors shrink-0">
                    File
                    <input type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadFromFile('muscle', f); e.target.value = ''; }} />
                  </label>
                </div>
              )}
            </div>
            {uploadError && <p className="text-xs text-red-400">{uploadError}</p>}

            {/* Notes */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-dram-accent/50 uppercase tracking-wide">Notes</label>
              <textarea
                value={form.notes}
                onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                placeholder="Personal notes about this exercise…"
                rows={3}
                className="w-full bg-dram-bg border border-dram-border rounded-lg px-3 py-2 text-sm text-dram-accent placeholder:text-dram-accent/30 focus:outline-none focus:border-dram-accent/50 resize-none"
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
