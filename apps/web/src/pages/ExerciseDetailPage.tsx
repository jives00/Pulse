import { useState, useEffect, KeyboardEvent } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { exercisesApi, type Exercise, type ExerciseStats, type ExerciseHistoryEntry, KG_TO_LBS, shortDate, formatDate, computePlateau } from '@pulse/api-client';

function kgToLbs(kg: number) {
  return Math.round(kg * KG_TO_LBS * 10) / 10;
}

function fmtLbs(kg: number | null) {
  if (kg == null) return '—';
  const lbs = kgToLbs(kg);
  return `${lbs % 1 === 0 ? lbs : lbs.toFixed(1)} lbs`;
}

const METRICS = [
  { key: 'heaviest_weight', label: 'Heaviest Weight' },
  { key: 'one_rep_max',     label: 'Est. 1RM' },
  { key: 'best_set_volume', label: 'Best Set Vol' },
  { key: 'session_volume',  label: 'Session Vol' },
  { key: 'total_reps',      label: 'Total Reps' },
] as const;

type MetricKey = typeof METRICS[number]['key'];

// ─── Personal best tiles ──────────────────────────────────────────────────────

function PBTile({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="bg-slate-800 p-3 flex flex-col gap-0.5">
      <div className="text-sm text-slate-400">{label}</div>
      <div className="text-base font-semibold text-slate-100">{value}</div>
      {sub && <div className="text-sm text-slate-400">{sub}</div>}
    </div>
  );
}

// ─── Summary tab ─────────────────────────────────────────────────────────────

function SummaryTab({ stats, metric, onMetricChange, plateauDetected }: {
  stats: ExerciseStats;
  metric: MetricKey;
  onMetricChange: (m: MetricKey) => void;
  plateauDetected: boolean;
}) {
  const pb = stats.personalBests;

  const chartData = stats.progressSeries.map((p) => ({
    date: p.date,
    // For total_reps metric, value is already in reps (no kg conversion needed)
    value: metric === 'total_reps' ? p.value : kgToLbs(p.value),
  }));

  const selectedMetricLabel = METRICS.find((m) => m.key === metric)?.label ?? '';
  const yUnit = metric === 'total_reps' ? 'reps' : 'lbs';

  return (
    <div className="space-y-4">
      {/* Personal bests */}
      <div className="grid grid-cols-2 gap-2">
        <PBTile
          label="Heaviest Weight"
          value={fmtLbs(pb.heaviestWeightKg)}
          sub={pb.heaviestWeightReps != null ? `@ ${pb.heaviestWeightReps} reps` : undefined}
        />
        <PBTile label="Est. 1 Rep Max" value={fmtLbs(pb.estimatedOneRepMaxKg)} />
        <PBTile label="Best Set Volume" value={fmtLbs(pb.bestSetVolumeKg)} />
        <PBTile label="Best Session Vol" value={fmtLbs(pb.bestSessionVolumeKg)} />
      </div>

      {/* Set records */}
      {stats.setRecords.length > 0 && (
        <div className="bg-slate-800 overflow-hidden">
          <div className="px-3 py-2 border-b border-slate-700">
            <span className="text-base font-medium text-slate-200">Set Records</span>
          </div>
          <div className="divide-y divide-slate-700/50">
            <div className="grid grid-cols-2 px-3 py-1.5">
              <span className="text-sm text-slate-400">Reps</span>
              <span className="text-sm text-slate-400">Best Weight</span>
            </div>
            {stats.setRecords.map((r) => (
              <div key={r.reps} className="grid grid-cols-2 px-3 py-1.5">
                <span className="text-sm text-slate-200">{r.reps}</span>
                <span className="text-sm text-slate-100">{fmtLbs(r.weightKg)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Metric selector */}
      <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-hide">
        {METRICS.map((m) => (
          <button
            key={m.key}
            onClick={() => onMetricChange(m.key)}
            className={`shrink-0 text-sm px-3 py-1.5 rounded-full transition-colors ${
              metric === m.key ? 'bg-blue-600 text-white' : 'bg-slate-800 text-slate-400 hover:text-slate-200'
            }`}
          >
            {m.label}
          </button>
        ))}
      </div>

      {/* Progress chart */}
      {chartData.length > 0 ? (
        <div className="bg-slate-800 p-3">
          <div className="text-sm text-slate-400 mb-2">{selectedMetricLabel} over time</div>
          <ResponsiveContainer width="100%" height={180}>
            <LineChart data={chartData} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
              <XAxis
                dataKey="date"
                tick={{ fontSize: 12, fill: '#cbd5e1' }}
                tickFormatter={shortDate}
                minTickGap={40}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                tick={{ fontSize: 12, fill: '#cbd5e1' }}
                tickFormatter={(v) => `${Math.round(v)}`}
                axisLine={false}
                tickLine={false}
                width={36}
              />
              <Tooltip
                contentStyle={{ background: '#1e293b', border: 'none', borderRadius: 8, fontSize: 12 }}
                labelFormatter={(l) => shortDate(String(l))}
                formatter={(v: number) => [`${v.toFixed(1)} ${yUnit}`, selectedMetricLabel]}
              />
              <Line
                type="monotone"
                dataKey="value"
                stroke="#3b82f6"
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <div className="text-center text-sm text-slate-500 py-6">No data yet</div>
      )}
      {plateauDetected && (
        <div className="rounded-lg border px-3 py-2.5" style={{ borderColor: 'rgba(250,204,21,0.3)', backgroundColor: 'rgba(250,204,21,0.06)' }}>
          <div className="text-sm font-semibold uppercase tracking-wide mb-1" style={{ color: '#facc15' }}>Plateau detected</div>
          <div className="text-sm" style={{ color: 'rgba(250,204,21,0.75)' }}>No weight increase in 3 sessions — try adding a rep or increasing by 2.5 lbs</div>
        </div>
      )}
    </div>
  );
}

// ─── History tab ──────────────────────────────────────────────────────────────

function HistoryTab({ exerciseId }: { exerciseId: number }) {
  const [entries, setEntries] = useState<ExerciseHistoryEntry[]>([]);
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(false);

  async function loadMore(off: number) {
    setLoading(true);
    try {
      const page = await exercisesApi.getHistory(exerciseId, { limit: 20, offset: off });
      setEntries((prev) => off === 0 ? page : [...prev, ...page]);
      setHasMore(page.length === 20);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadMore(0); }, [exerciseId]);

  if (!loading && entries.length === 0) {
    return <div className="text-center text-sm text-slate-500 py-12">No history yet</div>;
  }

  return (
    <div className="space-y-3">
      {entries.map((entry, i) => (
        <div key={`${entry.workoutId}-${i}`} className="bg-slate-800 overflow-hidden">
          <div className="px-3 py-2 border-b border-slate-700">
            <div className="text-base font-medium text-slate-200">{formatDate(entry.workoutDate)}</div>
            {entry.workoutName && (
              <div className="text-sm text-slate-400">{entry.workoutName}</div>
            )}
          </div>
          <div className="px-3 py-2 space-y-1">
            {entry.sets.length > 0 ? (
              <>
                <div className="grid grid-cols-3 text-sm text-slate-400 mb-1">
                  <span>Set</span>
                  <span>Weight</span>
                  <span>Reps</span>
                </div>
                {entry.sets.map((s) => (
                  <div key={s.setNumber} className="grid grid-cols-3 text-sm">
                    <span className="text-slate-400">{s.setNumber}</span>
                    <span className="text-slate-200">
                      {s.weightKg != null ? fmtLbs(s.weightKg) : s.durationSeconds != null ? `${s.durationSeconds}s` : '—'}
                    </span>
                    <span className="text-slate-200">
                      {s.reps != null ? `${s.reps}` : s.distanceMeters != null ? `${s.distanceMeters}m` : '—'}
                    </span>
                  </div>
                ))}
              </>
            ) : (
              <div className="text-sm text-slate-500">No sets recorded</div>
            )}
          </div>
        </div>
      ))}
      {loading && <div className="text-center text-sm text-slate-500 py-4">Loading…</div>}
      {!loading && hasMore && (
        <button
          onClick={() => { const next = offset + 20; setOffset(next); loadMore(next); }}
          className="w-full py-2 text-sm text-blue-400 hover:text-blue-300 transition-colors"
        >
          Load more
        </button>
      )}
    </div>
  );
}

// ─── How To tab ───────────────────────────────────────────────────────────────

function getYouTubeEmbedUrl(url: string): string | null {
  try {
    const u = new URL(url);
    if (u.hostname === 'youtu.be') {
      return `https://www.youtube.com/embed${u.pathname}`;
    }
    if (u.hostname.includes('youtube.com') && u.searchParams.get('v')) {
      return `https://www.youtube.com/embed/${u.searchParams.get('v')}`;
    }
  } catch { /* invalid URL */ }
  return null;
}

function MediaEmbed({ url }: { url: string }) {
  const embedUrl = getYouTubeEmbedUrl(url);
  if (embedUrl) {
    return (
      <div className="relative w-full" style={{ paddingBottom: '56.25%' }}>
        <iframe
          src={embedUrl}
          className="absolute inset-0 w-full h-full rounded-lg"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
        />
      </div>
    );
  }
  return (
    <img
      src={url}
      alt="Exercise demo"
      className="w-full rounded-lg object-contain max-h-80"
    />
  );
}

function HowToTab({ exercise }: { exercise: Exercise }) {
  const primary = Array.isArray(exercise.musclesPrimary) ? exercise.musclesPrimary : [];
  const secondary = Array.isArray(exercise.musclesSecondary) ? exercise.musclesSecondary : [];

  return (
    <div className="space-y-4">
      {/* Demo media */}
      {exercise.mediaUrl && (
        <div className="bg-slate-800 p-4">
          <div className="text-sm text-slate-500 mb-3">Demo</div>
          <MediaEmbed url={exercise.mediaUrl} />
        </div>
      )}

      {/* Muscle diagram */}
      {exercise.muscleImageUrl && (
        <div className="bg-slate-800 p-4">
          <div className="text-sm text-slate-500 mb-3">Muscle Groups</div>
          <img
            src={exercise.muscleImageUrl}
            alt="Muscle groups"
            className="w-full rounded-lg object-contain max-h-80"
          />
        </div>
      )}

      {/* Muscles */}
      <div className="bg-slate-800 p-4 space-y-3">
        <div>
          <div className="text-sm text-slate-500 mb-1.5">Primary Muscles</div>
          {primary.length > 0 ? (
            <div className="flex flex-wrap gap-1.5">
              {primary.map((m) => (
                <span key={m} className="px-2.5 py-1 text-sm font-medium bg-blue-600/20 text-blue-300 rounded-full">{m}</span>
              ))}
            </div>
          ) : (
            <span className="text-sm text-slate-500">—</span>
          )}
        </div>
        {secondary.length > 0 && (
          <div>
            <div className="text-sm text-slate-500 mb-1.5">Secondary Muscles</div>
            <div className="flex flex-wrap gap-1.5">
              {secondary.map((m) => (
                <span key={m} className="px-2.5 py-1 text-sm font-medium bg-slate-700 text-slate-400 rounded-full border border-slate-600">{m}</span>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Instructions */}
      <div className="bg-slate-800 p-4">
        <div className="text-sm text-slate-500 mb-2">Instructions</div>
        {exercise.instructions ? (
          <p className="text-sm text-slate-300 whitespace-pre-wrap leading-relaxed">{exercise.instructions}</p>
        ) : (
          <div className="text-sm text-slate-500">No instructions available.</div>
        )}
      </div>
    </div>
  );
}

// ─── Edit modal ───────────────────────────────────────────────────────────────

const EXERCISE_TYPES = ['weight', 'bodyweight', 'cardio', 'duration'] as const;

const TRACKED_FIELD_OPTIONS = [
  { key: 'reps',     label: 'Reps' },
  { key: 'weight',   label: 'Weight (lbs)' },
  { key: 'duration', label: 'Duration (min:sec)' },
  { key: 'distance', label: 'Distance' },
] as const;

function defaultTrackedFields(exerciseType: string): string[] {
  switch (exerciseType) {
    case 'cardio':     return ['duration', 'distance'];
    case 'duration':   return ['duration'];
    case 'bodyweight': return ['reps'];
    default:           return ['reps', 'weight'];
  }
}

interface EditForm {
  name: string;
  category: string;
  customCategory: string;
  exerciseType: string;
  musclesPrimary: string[];
  musclesSecondary: string[];
  instructions: string;
  /** URL input field value (for upload; not saved directly) */
  coverImageUrlInput: string;
  mediaUrlInput: string;
  muscleImageUrlInput: string;
  /** Raw stored value: S3 key or YouTube/legacy URL — sent on save */
  coverImageKey: string;
  mediaKey: string;
  muscleImageKey: string;
  notes: string;
  trackedFields: string[];
}

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
      <label className="text-sm font-semibold text-gray-400 uppercase tracking-wide">{label}</label>
      <div className="flex flex-wrap gap-1.5 bg-dram-card border border-dram-border rounded-lg px-2 py-1.5 min-h-[38px]">
        {tags.map((t) => (
          <span key={t} className="flex items-center gap-1 text-sm bg-dram-accent/15 text-dram-accent rounded-full px-2 py-0.5">
            {t}
            <button type="button" onClick={() => onChange(tags.filter((x) => x !== t))} className="text-dram-accent/50 hover:text-dram-accent leading-none">×</button>
          </span>
        ))}
        <input
          type="text" value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={onKey} onBlur={commit}
          placeholder={tags.length === 0 ? 'Type and press Enter…' : ''}
          className="flex-1 min-w-[120px] bg-transparent text-sm text-white placeholder:text-gray-600 focus:outline-none"
        />
      </div>
    </div>
  );
}

function EditModal({ exercise, categories, onSave, onClose }: {
  exercise: Exercise;
  categories: string[];
  onSave: (updated: Exercise) => void;
  onClose: () => void;
}) {
  useEffect(() => {
    const handler = (e: globalThis.KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  const [form, setForm] = useState<EditForm>({
    name: exercise.name,
    category: exercise.category,
    customCategory: '',
    exerciseType: exercise.exerciseType,
    musclesPrimary: exercise.musclesPrimary ?? [],
    musclesSecondary: exercise.musclesSecondary ?? [],
    instructions: exercise.instructions ?? '',
    coverImageUrlInput: '',
    mediaUrlInput: '',
    muscleImageUrlInput: '',
    coverImageKey: exercise.coverImageKey ?? '',
    mediaKey: exercise.mediaKey ?? '',
    muscleImageKey: exercise.muscleImageKey ?? '',
    notes: exercise.notes ?? '',
    trackedFields: exercise.trackedFields ?? defaultTrackedFields(exercise.exerciseType),
  });
  const [useCustomCat, setUseCustomCat] = useState(!categories.includes(exercise.category));
  const [saving, setSaving] = useState(false);
  const [uploadingField, setUploadingField] = useState<'cover' | 'media' | 'muscle' | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);

  async function uploadFromUrl(field: 'cover' | 'media' | 'muscle') {
    const url = field === 'cover' ? form.coverImageUrlInput : field === 'media' ? form.mediaUrlInput : form.muscleImageUrlInput;
    if (!url.trim()) return;
    setUploadingField(field);
    setUploadError(null);
    try {
      let result: { key: string };
      if (field === 'cover') result = await exercisesApi.uploadCoverImageFromUrl(exercise.id, url.trim());
      else if (field === 'media') result = await exercisesApi.uploadMediaFromUrl(exercise.id, url.trim());
      else result = await exercisesApi.uploadMuscleImageFromUrl(exercise.id, url.trim());
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
    setUploadingField(field);
    setUploadError(null);
    try {
      let result: { uploadUrl: string; key: string };
      if (field === 'cover') result = await exercisesApi.getCoverImageUploadUrl(exercise.id, file.type || 'image/jpeg');
      else if (field === 'media') result = await exercisesApi.getMediaUploadUrl(exercise.id, file.type || 'image/jpeg');
      else result = await exercisesApi.getMuscleImageUploadUrl(exercise.id, file.type || 'image/jpeg');
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
      const updated = await exercisesApi.update(exercise.id, {
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
        trackedFields: form.trackedFields,
      });
      onSave(updated);
    } catch {
      // keep open
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onClose}>
      <div
        className="bg-dram-card border border-dram-border rounded-xl w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto p-6 space-y-5"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-base font-semibold text-white">Edit Exercise</h2>

        <div className="space-y-1.5">
          <label className="text-sm font-semibold text-gray-400 uppercase tracking-wide">Name</label>
          <input autoFocus type="text" value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            className="w-full bg-dram-card border border-dram-border rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-dram-accent"
          />
        </div>

        <div className="space-y-1.5">
          <label className="text-sm font-semibold text-gray-400 uppercase tracking-wide">Category</label>
          {!useCustomCat && (
            <div className="flex flex-wrap gap-1.5">
              {categories.map((cat) => (
                <button key={cat} onClick={() => setForm((f) => ({ ...f, category: cat }))}
                  className={`text-sm px-3 py-1 rounded-lg border transition-colors ${
                    form.category === cat ? 'border-dram-accent text-dram-accent bg-dram-accent/10' : 'border-dram-border text-gray-400 hover:border-gray-600 hover:text-gray-200'
                  }`}
                >{cat}</button>
              ))}
            </div>
          )}
          {useCustomCat && (
            <input type="text" value={form.customCategory}
              onChange={(e) => setForm((f) => ({ ...f, customCategory: e.target.value }))}
              placeholder="New category name"
              className="w-full bg-dram-card border border-dram-border rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-dram-accent"
            />
          )}
          <button onClick={() => setUseCustomCat((v) => !v)} className="text-sm text-dram-accent hover:brightness-110 transition-colors">
            {useCustomCat ? '← Pick existing' : '+ New category'}
          </button>
        </div>

        <div className="space-y-1.5">
          <label className="text-sm font-semibold text-gray-400 uppercase tracking-wide">Type</label>
          <div className="flex flex-wrap gap-1.5">
            {EXERCISE_TYPES.map((t) => (
              <button key={t} onClick={() => setForm((f) => ({ ...f, exerciseType: t, trackedFields: defaultTrackedFields(t) }))}
                className={`text-sm px-3 py-1 rounded-lg border transition-colors ${
                  form.exerciseType === t ? 'border-dram-accent text-dram-accent bg-dram-accent/10' : 'border-dram-border text-gray-400 hover:border-gray-600 hover:text-gray-200'
                }`}
              >{t}</button>
            ))}
          </div>
        </div>

        <div className="space-y-2">
          <label className="text-sm font-semibold text-gray-400 uppercase tracking-wide">Track Per Set</label>
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
                  className={`text-sm px-3 py-1 rounded-lg border transition-colors ${
                    checked
                      ? 'border-dram-accent text-dram-accent bg-dram-accent/10'
                      : 'border-dram-border text-gray-400 hover:border-gray-600 hover:text-gray-200'
                  }`}
                >
                  {label}
                </button>
              );
            })}
          </div>
          <p className="text-sm text-gray-500">Defaults set by type. Toggle to mix (e.g. stairs = Duration + Reps).</p>
        </div>

        <TagInput label="Primary Muscles" tags={form.musclesPrimary} onChange={(v) => setForm((f) => ({ ...f, musclesPrimary: v }))} />
        <TagInput label="Secondary Muscles" tags={form.musclesSecondary} onChange={(v) => setForm((f) => ({ ...f, musclesSecondary: v }))} />

        <div className="space-y-1.5">
          <label className="text-sm font-semibold text-gray-400 uppercase tracking-wide">Instructions</label>
          <textarea value={form.instructions}
            onChange={(e) => setForm((f) => ({ ...f, instructions: e.target.value }))}
            rows={4}
            className="w-full bg-dram-card border border-dram-border rounded-lg px-3 py-2 text-sm text-white placeholder:text-gray-600 focus:outline-none focus:border-dram-accent resize-none"
          />
        </div>

        {/* Cover Image */}
        <div className="space-y-1.5">
          <label className="text-sm font-semibold text-gray-400 uppercase tracking-wide">Cover Image</label>
          {form.coverImageKey && (
            <div className="flex items-center gap-2 text-sm text-gray-400">
              <span className="truncate max-w-[280px]">{form.coverImageKey}</span>
              <button type="button" onClick={() => setForm((f) => ({ ...f, coverImageKey: '' }))} className="text-red-400 hover:text-red-300 shrink-0">Remove</button>
            </div>
          )}
          <div className="flex gap-2">
            <input
              type="text"
              value={form.coverImageUrlInput}
              onChange={(e) => setForm((f) => ({ ...f, coverImageUrlInput: e.target.value }))}
              placeholder="Paste image URL to upload to S3…"
              className="flex-1 bg-dram-card border border-dram-border rounded-lg px-3 py-2 text-sm text-white placeholder:text-gray-600 focus:outline-none focus:border-dram-accent"
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); uploadFromUrl('cover'); } }}
            />
            <button
              type="button"
              disabled={!form.coverImageUrlInput.trim() || uploadingField === 'cover'}
              onClick={() => uploadFromUrl('cover')}
              className="text-sm bg-dram-accent hover:brightness-110 disabled:opacity-40 text-black px-3 py-1.5 rounded-lg transition font-semibold shrink-0"
            >
              {uploadingField === 'cover' ? '…' : 'Upload'}
            </button>
            <label className="text-sm text-gray-400 hover:text-white cursor-pointer flex items-center transition-colors shrink-0">
              File
              <input type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadFromFile('cover', f); e.target.value = ''; }} />
            </label>
          </div>
        </div>

        {/* How-To Media */}
        <div className="space-y-1.5">
          <label className="text-sm font-semibold text-gray-400 uppercase tracking-wide">How-To Media</label>
          {form.mediaKey && (
            <div className="flex items-center gap-2 text-sm text-gray-400">
              <span className="truncate max-w-[280px]">{form.mediaKey}</span>
              <button type="button" onClick={() => setForm((f) => ({ ...f, mediaKey: '' }))} className="text-red-400 hover:text-red-300 shrink-0">Remove</button>
            </div>
          )}
          <div className="flex gap-2">
            <input
              type="text"
              value={form.mediaUrlInput}
              onChange={(e) => setForm((f) => ({ ...f, mediaUrlInput: e.target.value }))}
              placeholder="YouTube link, GIF, or image URL…"
              className="flex-1 bg-dram-card border border-dram-border rounded-lg px-3 py-2 text-sm text-white placeholder:text-gray-600 focus:outline-none focus:border-dram-accent"
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); uploadFromUrl('media'); } }}
            />
            <button
              type="button"
              disabled={!form.mediaUrlInput.trim() || uploadingField === 'media'}
              onClick={() => uploadFromUrl('media')}
              className="text-sm bg-dram-accent hover:brightness-110 disabled:opacity-40 text-black px-3 py-1.5 rounded-lg transition font-semibold shrink-0"
            >
              {uploadingField === 'media' ? '…' : 'Upload'}
            </button>
            <label className="text-sm text-gray-400 hover:text-white cursor-pointer flex items-center transition-colors shrink-0">
              File
              <input type="file" accept="image/*,video/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadFromFile('media', f); e.target.value = ''; }} />
            </label>
          </div>
        </div>

        {/* Muscle Diagram */}
        <div className="space-y-1.5">
          <label className="text-sm font-semibold text-gray-400 uppercase tracking-wide">Muscle Diagram</label>
          {form.muscleImageKey && (
            <div className="flex items-center gap-2 text-sm text-gray-400">
              <span className="truncate max-w-[280px]">{form.muscleImageKey}</span>
              <button type="button" onClick={() => setForm((f) => ({ ...f, muscleImageKey: '' }))} className="text-red-400 hover:text-red-300 shrink-0">Remove</button>
            </div>
          )}
          <div className="flex gap-2">
            <input
              type="text"
              value={form.muscleImageUrlInput}
              onChange={(e) => setForm((f) => ({ ...f, muscleImageUrlInput: e.target.value }))}
              placeholder="Paste muscle diagram image URL…"
              className="flex-1 bg-dram-card border border-dram-border rounded-lg px-3 py-2 text-sm text-white placeholder:text-gray-600 focus:outline-none focus:border-dram-accent"
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); uploadFromUrl('muscle'); } }}
            />
            <button
              type="button"
              disabled={!form.muscleImageUrlInput.trim() || uploadingField === 'muscle'}
              onClick={() => uploadFromUrl('muscle')}
              className="text-sm bg-dram-accent hover:brightness-110 disabled:opacity-40 text-black px-3 py-1.5 rounded-lg transition font-semibold shrink-0"
            >
              {uploadingField === 'muscle' ? '…' : 'Upload'}
            </button>
            <label className="text-sm text-gray-400 hover:text-white cursor-pointer flex items-center transition-colors shrink-0">
              File
              <input type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadFromFile('muscle', f); e.target.value = ''; }} />
            </label>
          </div>
        </div>
        {uploadError && <p className="text-sm text-red-400">{uploadError}</p>}

        <div className="space-y-1.5">
          <label className="text-sm font-semibold text-gray-400 uppercase tracking-wide">Notes</label>
          <textarea value={form.notes}
            onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
            rows={3}
            placeholder="Personal notes…"
            className="w-full bg-dram-card border border-dram-border rounded-lg px-3 py-2 text-sm text-white placeholder:text-gray-600 focus:outline-none focus:border-dram-accent resize-none"
          />
        </div>

        <div className="flex justify-end gap-3 pt-1">
          <button onClick={onClose} className="text-sm text-gray-400 hover:text-white transition-colors">Cancel</button>
          <button
            onClick={handleSave}
            disabled={saving || !form.name.trim() || (!useCustomCat ? !form.category : !form.customCategory.trim())}
            className="text-sm bg-dram-accent hover:brightness-110 disabled:opacity-40 text-black px-4 py-1.5 rounded-lg transition font-semibold"
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function ExerciseDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [exercise, setExercise] = useState<Exercise | null>(null);
  const [stats, setStats] = useState<ExerciseStats | null>(null);
  const [hwProgressSeries, setHwProgressSeries] = useState<Array<{ date: string; value: number }>>([]);
  const [metric, setMetric] = useState<MetricKey>('heaviest_weight');
  const [loading, setLoading] = useState(true);
  const [loadingStats, setLoadingStats] = useState(false);
  const [showEdit, setShowEdit] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [categories, setCategories] = useState<string[]>([]);

  useEffect(() => {
    if (!id) return;
    const numId = Number(id);
    Promise.all([
      exercisesApi.getOne(numId),
      exercisesApi.getStats(numId, 'heaviest_weight'),
      exercisesApi.getCategories(),
    ])
      .then(([ex, st, cats]) => { setExercise(ex); setStats(st); setHwProgressSeries(st.progressSeries); setCategories(cats); })
      .catch(() => navigate('/workouts'))
      .finally(() => setLoading(false));
  }, [id]);

  async function handleMetricChange(m: MetricKey) {
    setMetric(m);
    if (!id) return;
    setLoadingStats(true);
    try {
      const st = await exercisesApi.getStats(Number(id), m);
      setStats(st);
    } catch {
      // ignore
    } finally {
      setLoadingStats(false);
    }
  }

  async function handleDelete() {
    if (!exercise) return;
    if (!window.confirm(`Delete "${exercise.name}"? This cannot be undone.`)) return;
    setDeleting(true);
    try {
      await exercisesApi.deleteCustom(exercise.id);
      navigate('/workouts?tab=exercises');
    } catch {
      setDeleting(false);
    }
  }

  if (loading) {
    return <div className="text-center text-sm text-slate-500 py-12">Loading…</div>;
  }
  if (!exercise) return null;

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="px-6 pt-5 pb-4 border-b border-dram-border flex-shrink-0 flex items-center gap-3">
        <button
          onClick={() => navigate(-1)}
          className="text-slate-500 hover:text-slate-300 transition-colors shrink-0"
        >
          ←
        </button>
        <div className="flex-1 min-w-0">
          <h1 className="text-xl font-semibold text-slate-200 truncate">{exercise.name}</h1>
          <div className="text-sm text-slate-500 capitalize">{exercise.category} · {exercise.exerciseType}</div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={() => setShowEdit(true)}
            className="text-sm text-gray-400 hover:text-white border border-dram-border rounded-lg px-3 py-1 transition-colors"
          >
            Edit
          </button>
          <button
            onClick={handleDelete}
            disabled={deleting}
            className="text-sm text-red-400 hover:text-red-300 border border-red-900/40 rounded-lg px-3 py-1 disabled:opacity-50 transition-colors"
          >
            {deleting ? '…' : 'Delete'}
          </button>
        </div>
      </div>

      {/* 2-column body */}
      <div className="flex-1 overflow-y-auto">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-0 h-full">
          {/* Left column — How To content */}
          <div className="p-6 space-y-4 lg:border-r lg:border-dram-border lg:overflow-y-auto">
            {/* Notes */}
            {exercise.notes && (
              <div className="bg-slate-800 px-4 py-3">
                <div className="text-sm text-slate-500 mb-1">Notes</div>
                <p className="text-sm text-slate-300 whitespace-pre-wrap leading-relaxed">{exercise.notes}</p>
              </div>
            )}

            <HowToTab exercise={exercise} />
          </div>

          {/* Right column — Summary + History */}
          <div className="p-6 space-y-6 lg:overflow-y-auto">
            {/* Summary */}
            <div>
              <div className="text-sm font-semibold text-slate-500 uppercase tracking-wide mb-3">Summary</div>
              {stats
                ? <SummaryTab stats={stats} metric={metric} onMetricChange={handleMetricChange} plateauDetected={computePlateau(hwProgressSeries)} />
                : <div className="text-center text-sm text-slate-500 py-8">{loadingStats ? 'Loading…' : 'No data yet'}</div>
              }
            </div>

            {/* History */}
            <div>
              <div className="text-sm font-semibold text-slate-500 uppercase tracking-wide mb-3">History</div>
              <HistoryTab exerciseId={Number(id)} />
            </div>
          </div>
        </div>
      </div>

      {/* Edit modal */}
      {showEdit && (
        <EditModal
          exercise={exercise}
          categories={categories}
          onSave={(updated) => { setExercise(updated); setShowEdit(false); }}
          onClose={() => setShowEdit(false)}
        />
      )}
    </div>
  );
}
