import { useState, useEffect, KeyboardEvent } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { exercisesApi, type Exercise, type ExerciseStats, type ExerciseHistoryEntry } from '@pulse/api-client';

const KG_TO_LBS = 2.20462;

function kgToLbs(kg: number) {
  return Math.round(kg * KG_TO_LBS * 10) / 10;
}

function fmtLbs(kg: number | null) {
  if (kg == null) return '—';
  const lbs = kgToLbs(kg);
  return `${lbs % 1 === 0 ? lbs : lbs.toFixed(1)} lbs`;
}

function shortDate(dateStr: string) {
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function formatDate(dateStr: string) {
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
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
    <div className="bg-slate-800 rounded-lg p-3 flex flex-col gap-0.5">
      <div className="text-sm text-slate-400">{label}</div>
      <div className="text-base font-semibold text-slate-100">{value}</div>
      {sub && <div className="text-sm text-slate-400">{sub}</div>}
    </div>
  );
}

// ─── Summary tab ─────────────────────────────────────────────────────────────

function SummaryTab({ stats, metric, onMetricChange }: {
  stats: ExerciseStats;
  metric: MetricKey;
  onMetricChange: (m: MetricKey) => void;
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
        <div className="bg-slate-800 rounded-lg overflow-hidden">
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
            className={`shrink-0 text-xs px-3 py-1.5 rounded-full transition-colors ${
              metric === m.key ? 'bg-blue-600 text-white' : 'bg-slate-800 text-slate-400 hover:text-slate-200'
            }`}
          >
            {m.label}
          </button>
        ))}
      </div>

      {/* Progress chart */}
      {chartData.length > 0 ? (
        <div className="bg-slate-800 rounded-lg p-3">
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
        <div key={`${entry.workoutId}-${i}`} className="bg-slate-800 rounded-lg overflow-hidden">
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
              <div className="text-xs text-slate-500">No sets recorded</div>
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
        <div className="bg-slate-800 rounded-lg p-4">
          <div className="text-xs text-slate-500 mb-3">Demo</div>
          <MediaEmbed url={exercise.mediaUrl} />
        </div>
      )}

      {/* Muscle diagram */}
      {(exercise.muscleImageUrl || primary.length > 0 || secondary.length > 0) && (
        <div className="bg-slate-800 rounded-lg p-4">
          <div className="text-xs text-slate-500 mb-3">Muscle Groups</div>
          {exercise.muscleImageUrl ? (
            <img
              src={exercise.muscleImageUrl}
              alt="Muscle groups"
              className="w-full rounded-lg object-contain max-h-80"
            />
          ) : (
            <div className="flex items-center justify-center bg-slate-900 rounded-lg h-40 border border-slate-700">
              <div className="text-center space-y-1">
                <div className="text-3xl">💪</div>
                <div className="text-xs text-slate-500">
                  {[...primary, ...secondary.map((m) => `${m} (sec)`)].join(' · ')}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Muscles */}
      <div className="bg-slate-800 rounded-lg p-4 space-y-3">
        <div>
          <div className="text-xs text-slate-500 mb-1.5">Primary Muscles</div>
          {primary.length > 0 ? (
            <div className="flex flex-wrap gap-1.5">
              {primary.map((m) => (
                <span key={m} className="px-2.5 py-1 text-xs font-medium bg-blue-600/20 text-blue-300 rounded-full">{m}</span>
              ))}
            </div>
          ) : (
            <span className="text-sm text-slate-500">—</span>
          )}
        </div>
        {secondary.length > 0 && (
          <div>
            <div className="text-xs text-slate-500 mb-1.5">Secondary Muscles</div>
            <div className="flex flex-wrap gap-1.5">
              {secondary.map((m) => (
                <span key={m} className="px-2.5 py-1 text-xs font-medium bg-slate-700 text-slate-400 rounded-full border border-slate-600">{m}</span>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Instructions */}
      <div className="bg-slate-800 rounded-lg p-4">
        <div className="text-xs text-slate-500 mb-2">Instructions</div>
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

interface EditForm {
  name: string;
  category: string;
  customCategory: string;
  exerciseType: string;
  musclesPrimary: string[];
  musclesSecondary: string[];
  instructions: string;
  mediaUrl: string;
  coverImageUrl: string;
  muscleImageUrl: string;
  notes: string;
  trackWeight: boolean;
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
      <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">{label}</label>
      <div className="flex flex-wrap gap-1.5 bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5 min-h-[38px]">
        {tags.map((t) => (
          <span key={t} className="flex items-center gap-1 text-xs bg-blue-600/20 text-blue-300 rounded-full px-2 py-0.5">
            {t}
            <button type="button" onClick={() => onChange(tags.filter((x) => x !== t))} className="text-blue-300/50 hover:text-blue-300 leading-none">×</button>
          </span>
        ))}
        <input
          type="text" value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={onKey} onBlur={commit}
          placeholder={tags.length === 0 ? 'Type and press Enter…' : ''}
          className="flex-1 min-w-[120px] bg-transparent text-sm text-slate-300 placeholder:text-slate-600 focus:outline-none"
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
  const [form, setForm] = useState<EditForm>({
    name: exercise.name,
    category: exercise.category,
    customCategory: '',
    exerciseType: exercise.exerciseType,
    musclesPrimary: exercise.musclesPrimary ?? [],
    musclesSecondary: exercise.musclesSecondary ?? [],
    instructions: exercise.instructions ?? '',
    mediaUrl: exercise.mediaUrl ?? '',
    coverImageUrl: exercise.coverImageUrl ?? '',
    muscleImageUrl: exercise.muscleImageUrl ?? '',
    notes: exercise.notes ?? '',
    trackWeight: exercise.trackWeight ?? true,
  });
  const [useCustomCat, setUseCustomCat] = useState(!categories.includes(exercise.category));
  const [saving, setSaving] = useState(false);

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
        mediaUrl: form.mediaUrl.trim() || null,
        coverImageUrl: form.coverImageUrl.trim() || null,
        muscleImageUrl: form.muscleImageUrl.trim() || null,
        notes: form.notes.trim() || null,
        trackWeight: form.trackWeight,
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
        className="bg-slate-800 border border-slate-700 rounded-xl w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto p-6 space-y-5"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-base font-semibold text-slate-200">Edit Exercise</h2>

        <div className="space-y-1.5">
          <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Name</label>
          <input autoFocus type="text" value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-blue-500"
          />
        </div>

        <div className="space-y-1.5">
          <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Category</label>
          {!useCustomCat && (
            <div className="flex flex-wrap gap-1.5">
              {categories.map((cat) => (
                <button key={cat} onClick={() => setForm((f) => ({ ...f, category: cat }))}
                  className={`text-xs px-3 py-1 rounded-full border transition-colors ${
                    form.category === cat ? 'bg-blue-600 text-white border-blue-600 font-semibold' : 'text-slate-400 border-slate-600 hover:border-slate-400'
                  }`}
                >{cat}</button>
              ))}
            </div>
          )}
          {useCustomCat && (
            <input type="text" value={form.customCategory}
              onChange={(e) => setForm((f) => ({ ...f, customCategory: e.target.value }))}
              placeholder="New category name"
              className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-blue-500"
            />
          )}
          <button onClick={() => setUseCustomCat((v) => !v)} className="text-xs text-slate-500 hover:text-slate-300 transition-colors">
            {useCustomCat ? '← Pick existing' : '+ New category'}
          </button>
        </div>

        <div className="space-y-1.5">
          <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Type</label>
          <div className="flex flex-wrap gap-1.5">
            {EXERCISE_TYPES.map((t) => (
              <button key={t} onClick={() => setForm((f) => ({ ...f, exerciseType: t }))}
                className={`text-xs px-3 py-1 rounded-full border transition-colors ${
                  form.exerciseType === t ? 'bg-blue-600 text-white border-blue-600 font-semibold' : 'text-slate-400 border-slate-600 hover:border-slate-400'
                }`}
              >{t}</button>
            ))}
          </div>
        </div>

        <div className="flex items-center justify-between">
          <div>
            <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Track Weight</div>
            <div className="text-xs text-slate-600 mt-0.5">Uncheck for cardio/bodyweight-only exercises</div>
          </div>
          <button
            type="button"
            onClick={() => setForm((f) => ({ ...f, trackWeight: !f.trackWeight }))}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${form.trackWeight ? 'bg-blue-600' : 'bg-slate-600'}`}
          >
            <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${form.trackWeight ? 'translate-x-6' : 'translate-x-1'}`} />
          </button>
        </div>

        <TagInput label="Primary Muscles" tags={form.musclesPrimary} onChange={(v) => setForm((f) => ({ ...f, musclesPrimary: v }))} />
        <TagInput label="Secondary Muscles" tags={form.musclesSecondary} onChange={(v) => setForm((f) => ({ ...f, musclesSecondary: v }))} />

        <div className="space-y-1.5">
          <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Instructions</label>
          <textarea value={form.instructions}
            onChange={(e) => setForm((f) => ({ ...f, instructions: e.target.value }))}
            rows={4}
            className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-blue-500 resize-none"
          />
        </div>

        <div className="space-y-1.5">
          <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Cover Image URL</label>
          <input type="text" value={form.coverImageUrl}
            onChange={(e) => setForm((f) => ({ ...f, coverImageUrl: e.target.value }))}
            placeholder="Static image URL (JPG, PNG, WebP…)"
            className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-blue-500"
          />
        </div>

        <div className="space-y-1.5">
          <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">How-To Media URL</label>
          <input type="text" value={form.mediaUrl}
            onChange={(e) => setForm((f) => ({ ...f, mediaUrl: e.target.value }))}
            placeholder="YouTube link, GIF, or image URL"
            className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-blue-500"
          />
        </div>

        <div className="space-y-1.5">
          <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Muscle Diagram URL</label>
          <input type="text" value={form.muscleImageUrl}
            onChange={(e) => setForm((f) => ({ ...f, muscleImageUrl: e.target.value }))}
            placeholder="Image URL showing muscle groups"
            className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-blue-500"
          />
        </div>

        <div className="space-y-1.5">
          <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Notes</label>
          <textarea value={form.notes}
            onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
            rows={3}
            placeholder="Personal notes…"
            className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-blue-500 resize-none"
          />
        </div>

        <div className="flex justify-end gap-3 pt-1">
          <button onClick={onClose} className="text-sm text-slate-500 hover:text-slate-300 transition-colors">Cancel</button>
          <button
            onClick={handleSave}
            disabled={saving || !form.name.trim() || (!useCustomCat ? !form.category : !form.customCategory.trim())}
            className="text-sm bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white px-4 py-1.5 rounded-lg transition font-medium"
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

type Tab = 'summary' | 'history' | 'howto';

export default function ExerciseDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [exercise, setExercise] = useState<Exercise | null>(null);
  const [stats, setStats] = useState<ExerciseStats | null>(null);
  const [tab, setTab] = useState<Tab>('summary');
  const [metric, setMetric] = useState<MetricKey>('heaviest_weight');
  const [loading, setLoading] = useState(true);
  const [loadingStats, setLoadingStats] = useState(false);
  const [showEdit, setShowEdit] = useState(false);
  const [categories, setCategories] = useState<string[]>([]);

  useEffect(() => {
    if (!id) return;
    const numId = Number(id);
    Promise.all([
      exercisesApi.getOne(numId),
      exercisesApi.getStats(numId, 'heaviest_weight'),
      exercisesApi.getCategories(),
    ])
      .then(([ex, st, cats]) => { setExercise(ex); setStats(st); setCategories(cats); })
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

  if (loading) {
    return <div className="text-center text-sm text-slate-500 py-12">Loading…</div>;
  }
  if (!exercise) return null;

  const tabCls = (t: Tab) =>
    `flex-1 text-sm py-2.5 font-medium transition-colors border-b-2 ${
      tab === t ? 'border-blue-500 text-blue-400' : 'border-transparent text-slate-500 hover:text-slate-300'
    }`;

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 space-y-4">
      {/* Header */}
      <div className="flex items-start gap-3">
        <button
          onClick={() => navigate(-1)}
          className="text-slate-500 hover:text-slate-300 transition-colors mt-0.5 shrink-0"
        >
          ←
        </button>
        <div className="flex-1 min-w-0">
          <h1 className="text-xl font-semibold text-slate-200 truncate">{exercise.name}</h1>
          <div className="text-sm text-slate-500 capitalize">{exercise.category} · {exercise.exerciseType}</div>
        </div>
        <button
          onClick={() => setShowEdit(true)}
          className="text-sm text-blue-400 hover:text-blue-300 transition-colors shrink-0 mt-0.5"
        >
          Edit
        </button>
      </div>

      {/* Tab bar */}
      <div className="flex border-b border-slate-700 -mb-2">
        <button className={tabCls('summary')} onClick={() => setTab('summary')}>Summary</button>
        <button className={tabCls('history')} onClick={() => setTab('history')}>History</button>
        <button className={tabCls('howto')} onClick={() => setTab('howto')}>How To</button>
      </div>

      {/* Notes */}
      {exercise.notes && (
        <div className="bg-slate-800 rounded-lg px-4 py-3">
          <div className="text-xs text-slate-500 mb-1">Notes</div>
          <p className="text-sm text-slate-300 whitespace-pre-wrap leading-relaxed">{exercise.notes}</p>
        </div>
      )}

      {/* Tab content */}
      {tab === 'summary' && (
        stats
          ? <SummaryTab stats={stats} metric={metric} onMetricChange={handleMetricChange} />
          : <div className="text-center text-sm text-slate-500 py-8">{loadingStats ? 'Loading…' : 'No data yet'}</div>
      )}
      {tab === 'history' && <HistoryTab exerciseId={Number(id)} />}
      {tab === 'howto' && <HowToTab exercise={exercise} />}

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
