import { useState, useEffect } from 'react';
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
      <div className="text-xs text-slate-500">{label}</div>
      <div className="text-base font-semibold text-slate-100">{value}</div>
      {sub && <div className="text-xs text-slate-500">{sub}</div>}
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
            <span className="text-sm font-medium text-slate-300">Set Records</span>
          </div>
          <div className="divide-y divide-slate-700/50">
            <div className="grid grid-cols-2 px-3 py-1.5">
              <span className="text-xs text-slate-500">Reps</span>
              <span className="text-xs text-slate-500">Best Weight</span>
            </div>
            {stats.setRecords.map((r) => (
              <div key={r.reps} className="grid grid-cols-2 px-3 py-1.5">
                <span className="text-sm text-slate-300">{r.reps}</span>
                <span className="text-sm text-slate-200">{fmtLbs(r.weightKg)}</span>
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
          <div className="text-xs text-slate-500 mb-2">{selectedMetricLabel} over time</div>
          <ResponsiveContainer width="100%" height={180}>
            <LineChart data={chartData} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
              <XAxis
                dataKey="date"
                tick={{ fontSize: 10, fill: '#94a3b8' }}
                tickFormatter={shortDate}
                minTickGap={40}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                tick={{ fontSize: 10, fill: '#94a3b8' }}
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
            <div className="text-sm font-medium text-slate-300">{formatDate(entry.workoutDate)}</div>
            {entry.workoutName && (
              <div className="text-xs text-slate-500">{entry.workoutName}</div>
            )}
          </div>
          <div className="px-3 py-2 space-y-1">
            {entry.sets.length > 0 ? (
              <>
                <div className="grid grid-cols-3 text-xs text-slate-500 mb-1">
                  <span>Set</span>
                  <span>Weight</span>
                  <span>Reps</span>
                </div>
                {entry.sets.map((s) => (
                  <div key={s.setNumber} className="grid grid-cols-3 text-sm">
                    <span className="text-slate-500">{s.setNumber}</span>
                    <span className="text-slate-300">
                      {s.weightKg != null ? fmtLbs(s.weightKg) : s.durationSeconds != null ? `${s.durationSeconds}s` : '—'}
                    </span>
                    <span className="text-slate-300">
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

  useEffect(() => {
    if (!id) return;
    const numId = Number(id);
    Promise.all([
      exercisesApi.getOne(numId),
      exercisesApi.getStats(numId, 'heaviest_weight'),
    ])
      .then(([ex, st]) => { setExercise(ex); setStats(st); })
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
          <div className="text-sm text-slate-500">{exercise.category} · {exercise.exerciseType}</div>
        </div>
      </div>

      {/* Tab bar */}
      <div className="flex border-b border-slate-700 -mb-2">
        <button className={tabCls('summary')} onClick={() => setTab('summary')}>Summary</button>
        <button className={tabCls('history')} onClick={() => setTab('history')}>History</button>
        <button className={tabCls('howto')} onClick={() => setTab('howto')}>How To</button>
      </div>

      {/* Tab content */}
      {tab === 'summary' && (
        stats
          ? <SummaryTab stats={stats} metric={metric} onMetricChange={handleMetricChange} />
          : <div className="text-center text-sm text-slate-500 py-8">{loadingStats ? 'Loading…' : 'No data yet'}</div>
      )}
      {tab === 'history' && <HistoryTab exerciseId={Number(id)} />}
      {tab === 'howto' && <HowToTab exercise={exercise} />}
    </div>
  );
}
