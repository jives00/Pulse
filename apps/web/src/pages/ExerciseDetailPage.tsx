import { useState, useEffect, useRef, KeyboardEvent } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { exercisesApi, workoutsApi, type Exercise, type ExerciseStats, type ExerciseHistoryEntry, type ExerciseSet, KG_TO_LBS, secondsToMMSS as _secondsToMMSS, shortDate, formatDate, computePlateau } from '@pulse/api-client';

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

// ─── Quick log ────────────────────────────────────────────────────────────────

function lbsToKg(lbs: number) { return Math.round((lbs / KG_TO_LBS) * 1000) / 1000; }
function fmtWeight(kg: number | null) {
  if (kg == null) return '';
  const lbs = Math.round(kg * KG_TO_LBS * 10) / 10;
  return String(lbs % 1 === 0 ? lbs : lbs.toFixed(1));
}
function secondsToMMSS(sec: number | null): string {
  if (sec == null) return '';
  return _secondsToMMSS(sec);
}
function mmssToSeconds(val: string): number | null {
  const trimmed = val.trim();
  if (!trimmed) return null;
  const parts = trimmed.split(':');
  if (parts.length === 2) {
    const m = parseInt(parts[0], 10);
    const s = parseInt(parts[1], 10);
    if (!isNaN(m) && !isNaN(s)) return m * 60 + s;
  }
  const n = parseInt(trimmed, 10);
  return isNaN(n) ? null : n;
}

const MI_TO_M = 1609.344;
const FT_TO_M = 0.3048;
function fmtDistance(m: number): string {
  const miles = m / MI_TO_M;
  if (miles >= 0.1) return (Math.round(miles * 100) / 100) + ' mi';
  return Math.round(m / FT_TO_M) + ' ft';
}
function metersToMiInput(m: number | null): string {
  if (m == null) return '';
  return String(Math.round((m / MI_TO_M) * 100) / 100);
}
function miInputToMeters(val: string): number | null {
  const n = parseFloat(val.trim());
  if (isNaN(n) || n < 0) return null;
  return Math.round(n * MI_TO_M * 10) / 10;
}

interface QuickSetRowProps {
  set: ExerciseSet;
  index: number;
  workoutId: number;
  weId: number;
  trackedFields: string[];
  onUpdated: (s: ExerciseSet) => void;
  onDeleted: (id: number) => void;
}

function QuickSetRow({ set, index, workoutId, weId, trackedFields, onUpdated, onDeleted }: QuickSetRowProps) {
  const trackWeight   = trackedFields.includes('weight');
  const trackReps     = trackedFields.includes('reps');
  const trackDuration = trackedFields.includes('duration');
  const trackDistance = trackedFields.includes('distance');
  const trackSteps    = trackedFields.includes('steps');

  const [reps,     setReps]     = useState(String(set.reps ?? ''));
  const [weight,   setWeight]   = useState(fmtWeight(set.weightKg));
  const [duration, setDuration] = useState(secondsToMMSS(set.durationSeconds));
  const [distance, setDistance] = useState(metersToMiInput(set.distanceMeters));
  const [steps,    setSteps]    = useState(String((set as any).steps ?? ''));
  const [saving,   setSaving]   = useState(false);

  async function handleBlur() {
    if (saving) return;
    const newReps    = trackReps     && reps     !== '' ? Number(reps)     : null;
    const newWtLbs   = trackWeight   && weight   !== '' ? Number(weight)   : null;
    const newWtKg    = newWtLbs != null ? lbsToKg(newWtLbs) : null;
    const newDurSec  = trackDuration ? mmssToSeconds(duration) : null;
    const newDistM   = trackDistance ? miInputToMeters(distance) : null;
    const newSteps   = trackSteps    && steps    !== '' ? Number(steps)    : null;

    const unchanged =
      newReps    === set.reps &&
      newWtKg    === set.weightKg &&
      newDurSec  === set.durationSeconds &&
      newDistM   === set.distanceMeters &&
      newSteps   === ((set as any).steps ?? null);
    if (unchanged) return;

    setSaving(true);
    try {
      await workoutsApi.updateSet(workoutId, weId, set.id, {
        reps: newReps, weightKg: newWtKg, durationSeconds: newDurSec, distanceMeters: newDistM, steps: newSteps,
      } as any);
      onUpdated({ ...set, reps: newReps, weightKg: newWtKg, durationSeconds: newDurSec, distanceMeters: newDistM, steps: newSteps } as any);
    } catch {
      setReps(String(set.reps ?? ''));
      setWeight(fmtWeight(set.weightKg));
      setDuration(secondsToMMSS(set.durationSeconds));
      setDistance(metersToMiInput(set.distanceMeters));
      setSteps(String((set as any).steps ?? ''));
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    try {
      await workoutsApi.deleteSet(workoutId, weId, set.id);
      onDeleted(set.id);
    } catch { /* ignore */ }
  }

  const inputCls = 'w-full bg-dram-bg border border-dram-border rounded px-2 py-1.5 text-sm text-white text-center focus:outline-none focus:border-dram-accent';
  const colFlags = [trackWeight, trackReps, trackDuration, trackDistance, trackSteps];

  return (
    <div className={`grid gap-2 items-center text-sm ${saving ? 'opacity-60' : ''}`}
      style={{ gridTemplateColumns: `1.5rem ${colFlags.filter(Boolean).map(() => '1fr').join(' ')} 1.5rem` }}
    >
      <span className="text-slate-500 text-center">{index + 1}</span>
      {trackWeight && (
        <input type="number" min={0} step={2.5} placeholder="lbs" value={weight}
          onChange={(e) => setWeight(e.target.value)} onBlur={handleBlur} className={inputCls} />
      )}
      {trackReps && (
        <input type="number" min={0} placeholder="reps" value={reps}
          onChange={(e) => setReps(e.target.value)} onBlur={handleBlur} className={inputCls} />
      )}
      {trackDuration && (
        <input type="text" placeholder="m:ss" value={duration}
          onChange={(e) => setDuration(e.target.value)} onBlur={handleBlur} className={inputCls} />
      )}
      {trackDistance && (
        <input type="number" min={0} step={0.01} placeholder="mi" value={distance}
          onChange={(e) => setDistance(e.target.value)} onBlur={handleBlur} className={inputCls} />
      )}
      {trackSteps && (
        <input type="number" min={0} placeholder="steps" value={steps}
          onChange={(e) => setSteps(e.target.value)} onBlur={handleBlur} className={inputCls} />
      )}
      <button onClick={handleDelete} className="text-slate-600 hover:text-red-400 transition-colors text-center leading-none">×</button>
    </div>
  );
}

interface QuickLogState {
  workoutId: number;
  weId: number;
  sets: ExerciseSet[];
}

interface QuickLogPanelProps {
  exercise: Exercise;
  lastSets: ExerciseSet[];
  state: QuickLogState;
  onSetsChange: (sets: ExerciseSet[]) => void;
  onFinish: () => void;
  onDiscard: () => void;
  finishing: boolean;
}

function QuickLogPanel({ exercise, lastSets, state, onSetsChange, onFinish, onDiscard, finishing }: QuickLogPanelProps) {
  const [addingSet, setAddingSet] = useState(false);
  const trackedFields = exercise.trackedFields?.length ? exercise.trackedFields : ['reps', 'weight'];

  async function handleAddSet() {
    setAddingSet(true);
    try {
      const newSet = await workoutsApi.addSet(state.workoutId, state.weId, {});
      onSetsChange([...state.sets, newSet]);
    } catch { /* ignore */ } finally {
      setAddingSet(false);
    }
  }

  function updateSet(updated: ExerciseSet) {
    onSetsChange(state.sets.map((s) => s.id === updated.id ? updated : s));
  }

  function deleteSet(id: number) {
    onSetsChange(state.sets.filter((s) => s.id !== id));
  }

  const trackWeight   = trackedFields.includes('weight');
  const trackReps     = trackedFields.includes('reps');
  const trackDuration = trackedFields.includes('duration');
  const trackDistance = trackedFields.includes('distance');
  const trackSteps    = trackedFields.includes('steps');
  const colFlags = [trackWeight, trackReps, trackDuration, trackDistance, trackSteps];

  return (
    <div className="bg-dram-accent/5 border border-dram-accent/30 p-4 space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-dram-accent uppercase tracking-wider">Quick Log</span>
          <span className="text-sm text-slate-400">{state.sets.length} set{state.sets.length !== 1 ? 's' : ''}</span>
        </div>
        <button onClick={onDiscard} className="text-sm text-slate-500 hover:text-red-400 transition-colors">Discard</button>
      </div>

      {/* Last session reference */}
      {lastSets.length > 0 && (
        <div className="text-sm text-slate-500">
          Last session: {lastSets.slice(0, 3).map((s, i) => {
            const parts: string[] = [];
            if (s.weightKg != null) parts.push(fmtWeight(s.weightKg) + ' lbs');
            if (s.reps != null) parts.push(s.reps + ' reps');
            if ((s as any).steps != null) parts.push((s as any).steps + ' stairs');
            if (s.durationSeconds != null) parts.push(secondsToMMSS(s.durationSeconds));
            if (s.distanceMeters != null) parts.push(fmtDistance(s.distanceMeters));
            return <span key={i}>{i > 0 ? ' · ' : ''}{parts.join(' × ')}</span>;
          })}
          {lastSets.length > 3 && <span> +{lastSets.length - 3} more</span>}
        </div>
      )}

      {/* Column headers */}
      {state.sets.length > 0 && (
        <div className="grid gap-2 text-sm text-slate-500"
          style={{ gridTemplateColumns: `1.5rem ${colFlags.filter(Boolean).map(() => '1fr').join(' ')} 1.5rem` }}
        >
          <span />
          {trackWeight   && <span className="text-center">lbs</span>}
          {trackReps     && <span className="text-center">reps</span>}
          {trackDuration && <span className="text-center">m:ss</span>}
          {trackDistance && <span className="text-center">mi</span>}
          {trackSteps    && <span className="text-center">steps</span>}
          <span />
        </div>
      )}

      {/* Set rows */}
      <div className="space-y-2">
        {state.sets.map((s, i) => (
          <QuickSetRow
            key={s.id}
            set={s}
            index={i}
            workoutId={state.workoutId}
            weId={state.weId}
            trackedFields={trackedFields}
            onUpdated={updateSet}
            onDeleted={deleteSet}
          />
        ))}
      </div>

      {/* Actions */}
      <div className="flex gap-2 pt-1">
        <button
          onClick={handleAddSet}
          disabled={addingSet}
          className="flex-1 border border-dram-border text-slate-300 hover:border-slate-500 hover:text-white text-sm py-1.5 rounded-lg transition-colors disabled:opacity-40"
        >
          {addingSet ? '…' : '+ Add Set'}
        </button>
        <button
          onClick={onFinish}
          disabled={finishing}
          className="flex-1 bg-dram-accent hover:brightness-110 disabled:opacity-40 text-black text-sm font-semibold py-1.5 rounded-lg transition-colors"
        >
          {finishing ? 'Saving…' : 'Finish'}
        </button>
      </div>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

const EXERCISE_TYPE_LABELS: Record<string, string> = {
  weight:     'Strength / Weight',
  bodyweight: 'Bodyweight',
  cardio:     'Cardio',
  duration:   'Duration',
};

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
  const [quickLog, setQuickLog] = useState<QuickLogState | null>(null);
  const [quickLogLastSets, setQuickLogLastSets] = useState<ExerciseSet[]>([]);
  const [startingQuickLog, setStartingQuickLog] = useState(false);
  const [finishingQuickLog, setFinishingQuickLog] = useState(false);
  const [historyKey, setHistoryKey] = useState(0);
  const [lastSessionEntry, setLastSessionEntry] = useState<ExerciseHistoryEntry | null>(null);

  // Inline name editing
  const [editingName, setEditingName] = useState(false);
  const [name, setName] = useState('');
  const nameRef = useRef<HTMLInputElement>(null);

  // Inline notes editing
  const [editingNotes, setEditingNotes] = useState(false);
  const [notes, setNotes] = useState('');
  const notesRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => { if (editingName) nameRef.current?.focus(); }, [editingName]);
  useEffect(() => { if (editingNotes) notesRef.current?.focus(); }, [editingNotes]);

  useEffect(() => {
    if (!id) return;
    const numId = Number(id);
    Promise.all([
      exercisesApi.getOne(numId),
      exercisesApi.getStats(numId, 'heaviest_weight'),
      exercisesApi.getCategories(),
      exercisesApi.getHistory(numId, { limit: 1 }),
    ])
      .then(([ex, st, cats, hist]) => {
        setExercise(ex);
        setStats(st);
        setHwProgressSeries(st.progressSeries);
        setCategories(cats);
        setName(ex.name);
        setNotes(ex.notes ?? '');
        setLastSessionEntry(hist[0] ?? null);
      })
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
      navigate('/workouts');
    } catch {
      setDeleting(false);
    }
  }

  async function saveName() {
    if (!exercise) return;
    setEditingName(false);
    const trimmed = name.trim();
    if (!trimmed || trimmed === exercise.name) { setName(exercise.name); return; }
    try {
      const updated = await exercisesApi.update(exercise.id, { name: trimmed });
      setExercise(updated);
    } catch { setName(exercise.name); }
  }

  async function saveExerciseType(newType: string) {
    if (!exercise) return;
    try {
      const updated = await exercisesApi.update(exercise.id, { exerciseType: newType });
      setExercise(updated);
    } catch { /* ignore */ }
  }

  async function saveNotes() {
    if (!exercise) return;
    setEditingNotes(false);
    const trimmed = notes.trim();
    if (trimmed === (exercise.notes ?? '')) { setNotes(exercise.notes ?? ''); return; }
    try {
      const updated = await exercisesApi.update(exercise.id, { notes: trimmed || null });
      setExercise(updated);
    } catch { setNotes(exercise.notes ?? ''); }
  }

  async function startQuickLog() {
    if (!exercise) return;
    setStartingQuickLog(true);
    try {
      const history = await exercisesApi.getHistory(exercise.id, { limit: 1 });
      const lastSets = history[0]?.sets ?? [];
      const workout = await workoutsApi.create({ name: `Quick: ${exercise.name}` });
      const we = await workoutsApi.addExercise(workout.id, exercise.id);
      const initialSets = await Promise.all([
        workoutsApi.addSet(workout.id, we.id, {}),
        workoutsApi.addSet(workout.id, we.id, {}),
        workoutsApi.addSet(workout.id, we.id, {}),
      ]);
      setQuickLogLastSets(lastSets as unknown as ExerciseSet[]);
      setQuickLog({ workoutId: workout.id, weId: we.id, sets: initialSets });
    } catch { /* ignore */ } finally {
      setStartingQuickLog(false);
    }
  }

  async function finishQuickLog() {
    if (!quickLog || !id) return;
    setFinishingQuickLog(true);
    try {
      const emptySets = quickLog.sets.filter(
        (s) => s.reps === null && s.weightKg === null && s.durationSeconds === null && s.distanceMeters === null && (s as any).steps == null
      );
      await Promise.all(emptySets.map((s) => workoutsApi.deleteSet(quickLog.workoutId, quickLog.weId, s.id)));
      await workoutsApi.update(quickLog.workoutId, { completed: true });
      setQuickLog(null);
      setHistoryKey((k) => k + 1);
      const st = await exercisesApi.getStats(Number(id), metric);
      setStats(st);
      if (metric === 'heaviest_weight') setHwProgressSeries(st.progressSeries);
    } catch { /* ignore */ } finally {
      setFinishingQuickLog(false);
    }
  }

  async function discardQuickLog() {
    if (!quickLog) return;
    if (!window.confirm('Discard this session? All logged sets will be lost.')) return;
    try { await workoutsApi.delete(quickLog.workoutId); } catch { /* ignore */ }
    setQuickLog(null);
  }

  if (loading) {
    return <div className="text-center text-sm text-slate-500 py-12">Loading…</div>;
  }
  if (!exercise) return null;

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="flex-shrink-0 px-6 pt-5 pb-4 border-b border-dram-border flex items-start gap-3">
        <button onClick={() => navigate(-1)} className="text-slate-500 hover:text-slate-300 transition-colors shrink-0 mt-1">←</button>

        <div className="flex-1 min-w-0">
          {/* Inline name */}
          {editingName ? (
            <input
              ref={nameRef}
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onBlur={saveName}
              onKeyDown={(e) => { if (e.key === 'Enter') saveName(); if (e.key === 'Escape') { setEditingName(false); setName(exercise.name); } }}
              className="w-full bg-transparent text-xl font-semibold text-slate-200 focus:outline-none border-b border-slate-600"
            />
          ) : (
            <button onClick={() => setEditingName(true)} className="text-left text-xl font-semibold text-slate-200 hover:text-white transition-colors w-full truncate">
              {exercise.name}
            </button>
          )}

          {/* Exercise type dropdown */}
          <div className="flex items-center gap-2 mt-0.5">
            <select
              value={exercise.exerciseType}
              onChange={(e) => saveExerciseType(e.target.value)}
              className="text-sm bg-transparent text-dram-muted border-none focus:outline-none cursor-pointer hover:text-slate-200 transition-colors"
            >
              {Object.entries(EXERCISE_TYPE_LABELS).map(([val, label]) => (
                <option key={val} value={val}>{label}</option>
              ))}
            </select>
          </div>

          {/* Last session stats */}
          {(() => {
            if (!lastSessionEntry || lastSessionEntry.sets.length === 0) return null;
            const sets = lastSessionEntry.sets;
            const tf = exercise.trackedFields ?? ['reps', 'weight'];
            let primary: string | null = null;
            let secondary: string | null = null;
            if (tf.includes('steps')) {
              const totalSteps = sets.reduce((sum, s) => sum + ((s as any).steps ?? 0), 0);
              const totalDur = sets.reduce((sum, s) => sum + (s.durationSeconds ?? 0), 0);
              primary = totalSteps > 0 ? `${totalSteps.toLocaleString()} steps` : null;
              secondary = totalDur > 0 ? secondsToMMSS(totalDur) : null;
            } else if (tf.includes('distance')) {
              const totalDist = sets.reduce((sum, s) => sum + (s.distanceMeters ?? 0), 0);
              const totalDur = sets.reduce((sum, s) => sum + (s.durationSeconds ?? 0), 0);
              primary = totalDist > 0 ? fmtDistance(totalDist) : null;
              secondary = totalDur > 0 ? secondsToMMSS(totalDur) : null;
            } else if (tf.includes('duration')) {
              const totalDur = sets.reduce((sum, s) => sum + (s.durationSeconds ?? 0), 0);
              primary = totalDur > 0 ? secondsToMMSS(totalDur) : null;
            } else {
              const weightsKg = sets.filter((s) => s.weightKg != null).map((s) => s.weightKg!);
              const maxKg = weightsKg.length ? Math.max(...weightsKg) : null;
              const totalVolKg = sets.reduce((sum, s) => sum + ((s.weightKg ?? 0) * (s.reps ?? 0)), 0);
              primary = maxKg != null ? fmtLbs(maxKg) : null;
              secondary = totalVolKg > 0 ? `${Math.round(totalVolKg * KG_TO_LBS).toLocaleString()} lbs vol` : null;
            }
            if (!primary && !secondary) return null;
            return (
              <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 mt-1.5 text-sm text-slate-400">
                <span>Last session:</span>
                {primary && <span>{primary}</span>}
                {secondary && <><span className="text-slate-600">·</span><span>{secondary}</span></>}
              </div>
            );
          })()}

          {/* Inline notes */}
          {editingNotes ? (
            <textarea
              ref={notesRef}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              onBlur={saveNotes}
              onKeyDown={(e) => { if (e.key === 'Escape') { setEditingNotes(false); setNotes(exercise.notes ?? ''); } }}
              rows={2}
              placeholder="Add notes…"
              className="w-full mt-1 bg-transparent text-sm text-slate-300 focus:outline-none border-b border-slate-600 resize-none"
            />
          ) : (
            <button onClick={() => setEditingNotes(true)} className="text-left text-sm mt-1 w-full transition-colors">
              {notes
                ? <span className="text-slate-400 hover:text-slate-200">{notes}</span>
                : <span className="text-slate-600 hover:text-slate-400 italic">Add notes…</span>}
            </button>
          )}
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-2 shrink-0">
          {!quickLog && (
            <button
              onClick={startQuickLog}
              disabled={startingQuickLog}
              className="bg-dram-accent hover:brightness-110 disabled:opacity-50 text-black font-semibold rounded-lg px-4 py-2 text-sm transition-colors"
            >
              {startingQuickLog ? '…' : 'Quick Log'}
            </button>
          )}
          <button
            onClick={() => setShowEdit(true)}
            className="border border-dram-border text-slate-300 hover:text-white rounded-lg px-3 py-2 text-sm transition-colors"
          >
            Edit
          </button>
          <button
            onClick={handleDelete}
            disabled={deleting}
            className="border border-dram-border text-slate-300 hover:text-red-400 hover:border-red-900/40 rounded-lg px-3 py-2 text-sm disabled:opacity-50 transition-colors"
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

          {/* Right column — Quick Log + Summary + History */}
          <div className="p-6 space-y-6 lg:overflow-y-auto">
            {/* Quick log panel */}
            {quickLog && exercise && (
              <QuickLogPanel
                exercise={exercise}
                lastSets={quickLogLastSets}
                state={quickLog}
                onSetsChange={(sets) => setQuickLog((q) => q ? { ...q, sets } : q)}
                onFinish={finishQuickLog}
                onDiscard={discardQuickLog}
                finishing={finishingQuickLog}
              />
            )}

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
              <HistoryTab key={historyKey} exerciseId={Number(id)} />
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
