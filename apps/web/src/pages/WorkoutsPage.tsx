import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { workoutsApi, type WorkoutSummary } from '@pulse/api-client';

function formatDate(dateStr: string) {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

export default function WorkoutsPage() {
  const navigate = useNavigate();

  const [workouts, setWorkouts] = useState<WorkoutSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  useEffect(() => {
    workoutsApi.getAll({ limit: 50 })
      .then(setWorkouts)
      .catch(() => {/* ignore */})
      .finally(() => setLoading(false));
  }, []);

  async function handleStart() {
    setStarting(true);
    try {
      const workout = await workoutsApi.create();
      navigate(`/workouts/${workout.id}`);
    } catch {
      setStarting(false);
    }
  }

  async function handleDelete(e: React.MouseEvent, id: number) {
    e.stopPropagation();
    if (!confirm('Delete this workout?')) return;
    setDeletingId(id);
    try {
      await workoutsApi.delete(id);
      setWorkouts((prev) => prev.filter((w) => w.id !== id));
    } catch {
      // ignore
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-semibold text-slate-200">Workouts</h1>
        <button
          onClick={handleStart}
          disabled={starting}
          className="bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-medium rounded-lg px-4 py-2 text-sm transition-colors"
        >
          {starting ? 'Starting…' : '+ Start Workout'}
        </button>
      </div>

      {loading && (
        <div className="text-center text-sm text-slate-500 py-12">Loading…</div>
      )}

      {!loading && workouts.length === 0 && (
        <div className="text-center text-sm text-slate-500 py-12">
          No workouts yet. Start your first one!
        </div>
      )}

      {!loading && workouts.length > 0 && (
        <div className="space-y-2">
          {workouts.map((w) => (
            <div
              key={w.id}
              onClick={() => navigate(`/workouts/${w.id}`)}
              className="bg-slate-800 rounded-lg px-4 py-3 flex items-center gap-3 cursor-pointer hover:bg-slate-700/80 transition-colors"
            >
              <div className="flex-1 min-w-0">
                <div className="text-base font-medium text-slate-200">
                  {w.name ?? formatDate(w.workoutDate)}
                </div>
                {w.name && (
                  <div className="text-sm text-slate-500">{formatDate(w.workoutDate)}</div>
                )}
                <div className="text-sm text-slate-400 mt-0.5">
                  {w.exerciseCount} exercise{w.exerciseCount !== 1 ? 's' : ''}
                  {' · '}
                  {w.setCount} set{w.setCount !== 1 ? 's' : ''}
                  {w.durationMinutes != null && ` · ${w.durationMinutes} min`}
                </div>
              </div>
              <button
                onClick={(e) => handleDelete(e, w.id)}
                disabled={deletingId === w.id}
                className="text-slate-600 hover:text-red-400 transition-colors text-lg leading-none shrink-0 disabled:opacity-50"
                title="Delete workout"
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
