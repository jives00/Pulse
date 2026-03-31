import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { routinesApi, type RoutineSummary } from '@pulse/api-client';

function formatDate(dateStr: string) {
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export default function RoutinesPage() {
  const navigate = useNavigate();
  const [routines, setRoutines] = useState<RoutineSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState('');
  const [newNotes, setNewNotes] = useState('');
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    routinesApi.getAll()
      .then(setRoutines)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  async function handleCreate() {
    if (!newName.trim()) return;
    setCreating(true);
    try {
      const routine = await routinesApi.create({ name: newName.trim(), notes: newNotes.trim() || undefined });
      navigate(`/workouts/routines/${routine.id}`);
    } catch {
      setCreating(false);
    }
  }

  if (loading) {
    return <div className="text-center text-sm text-slate-500 py-12">Loading…</div>;
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-slate-200">Routines</h1>
        <button
          onClick={() => setShowCreate(true)}
          className="text-sm bg-blue-600 hover:bg-blue-500 text-white px-3 py-1.5 rounded-lg transition-colors"
        >
          + New Routine
        </button>
      </div>

      {/* Routine list */}
      {routines.length === 0 ? (
        <div className="text-center text-sm text-slate-500 py-12">
          No routines yet. Create one to get started.
        </div>
      ) : (
        <div className="space-y-2">
          {routines.map((r) => (
            <button
              key={r.id}
              onClick={() => navigate(`/workouts/routines/${r.id}`)}
              className="w-full text-left bg-slate-800 rounded-lg px-4 py-3 hover:bg-slate-750 transition-colors flex items-center justify-between gap-3"
            >
              <div className="min-w-0">
                <div className="text-base font-medium text-slate-200 truncate">{r.name}</div>
                <div className="text-sm text-slate-500">
                  {r.exerciseCount} exercise{r.exerciseCount !== 1 ? 's' : ''}
                  {r.lastUsedDate ? ` · Last used ${formatDate(r.lastUsedDate)}` : ' · Never used'}
                </div>
              </div>
              <span className="text-slate-600 shrink-0">›</span>
            </button>
          ))}
        </div>
      )}

      {/* Create modal */}
      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60" onClick={() => setShowCreate(false)}>
          <div
            className="bg-slate-800 rounded-t-2xl sm:rounded-2xl w-full sm:max-w-md p-4 space-y-3"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold text-slate-200">New Routine</h2>
              <button onClick={() => setShowCreate(false)} className="text-slate-500 hover:text-slate-300 text-xl leading-none">×</button>
            </div>
            <input
              autoFocus
              type="text"
              placeholder="Routine name"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleCreate(); }}
              className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-blue-500"
            />
            <textarea
              placeholder="Notes (optional)"
              value={newNotes}
              onChange={(e) => setNewNotes(e.target.value)}
              rows={2}
              className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-blue-500 resize-none"
            />
            <div className="flex gap-2 pt-1">
              <button
                onClick={() => setShowCreate(false)}
                className="flex-1 py-2 text-sm text-slate-400 hover:text-slate-200 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleCreate}
                disabled={creating || !newName.trim()}
                className="flex-1 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-sm font-medium rounded-lg py-2 transition-colors"
              >
                {creating ? 'Creating…' : 'Create'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
