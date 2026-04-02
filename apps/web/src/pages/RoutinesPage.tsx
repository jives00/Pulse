import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { routinesApi, type RoutineSummary } from '@pulse/api-client';
import Spinner from '../components/Spinner';

function formatDate(dateStr: string) {
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

// ── Routine card ──────────────────────────────────────────────────────────────

function RoutineCard({ routine, onClick }: { routine: RoutineSummary; onClick: () => void }) {
  return (
    <div
      onClick={onClick}
      className="bg-dram-card rounded-xl overflow-hidden border border-dram-border hover:border-dram-accent/50 transition cursor-pointer group"
    >
      {/* Stat block — stands in for a photo */}
      <div className="aspect-square bg-dram-bg flex flex-col items-center justify-center gap-1 group-hover:bg-dram-border/20 transition">
        <span className="text-4xl font-bold text-dram-accent leading-none">
          {routine.exerciseCount}
        </span>
        <span className="text-xs text-gray-500 uppercase tracking-wide">
          exercise{routine.exerciseCount !== 1 ? 's' : ''}
        </span>
        {routine.notes && (
          <p className="text-xs text-gray-600 mt-2 px-3 text-center line-clamp-2 italic">
            {routine.notes}
          </p>
        )}
      </div>

      {/* Info */}
      <div className="p-3">
        <p className="font-semibold text-white text-sm leading-snug line-clamp-2">{routine.name}</p>
        <p className="text-gray-500 text-xs mt-0.5">
          {routine.lastUsedDate ? `Last used ${formatDate(routine.lastUsedDate)}` : 'Never used'}
        </p>
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

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

  return (
    <div className="flex flex-col h-full overflow-hidden bg-dram-bg text-white">
      {/* Toolbar */}
      <div className="px-6 pt-5 pb-4 border-b border-dram-border flex-shrink-0 flex items-center gap-3">
        <span className="text-base font-semibold text-dram-accent flex-1">Routines</span>
        <button
          onClick={() => setShowCreate(true)}
          className="bg-dram-accent text-black font-semibold px-4 py-2 rounded-lg text-sm hover:brightness-110 transition flex-shrink-0"
        >
          + New Routine
        </button>
      </div>

      {/* Grid */}
      <div className="flex-1 overflow-y-auto p-6">
        {loading ? (
          <div className="flex justify-center mt-16"><Spinner size={10} /></div>
        ) : routines.length === 0 ? (
          <div className="flex flex-col items-center mt-20 text-gray-600">
            <span className="text-5xl mb-3">📋</span>
            <p className="text-lg">No routines yet.</p>
            <p className="text-sm mt-1">
              <button onClick={() => setShowCreate(true)} className="text-dram-accent hover:underline">
                Create your first routine
              </button>
            </p>
          </div>
        ) : (
          <div className="grid gap-4 grid-cols-2 md:grid-cols-3 lg:grid-cols-5">
            {routines.map((r) => (
              <RoutineCard
                key={r.id}
                routine={r}
                onClick={() => navigate(`/workouts/routines/${r.id}`)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Create modal */}
      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60" onClick={() => setShowCreate(false)}>
          <div
            className="bg-dram-card border border-dram-border rounded-t-2xl sm:rounded-2xl w-full sm:max-w-md mx-4 p-5 space-y-3"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold text-dram-accent">New Routine</h2>
              <button onClick={() => setShowCreate(false)} className="text-dram-accent/50 hover:text-dram-accent text-xl leading-none">×</button>
            </div>
            <input
              autoFocus
              type="text"
              placeholder="Routine name"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleCreate(); }}
              className="w-full bg-dram-bg border border-dram-border rounded-lg px-3 py-2 text-sm text-dram-accent placeholder:text-dram-accent/30 focus:outline-none focus:border-dram-accent/50"
            />
            <textarea
              placeholder="Notes (optional)"
              value={newNotes}
              onChange={(e) => setNewNotes(e.target.value)}
              rows={2}
              className="w-full bg-dram-bg border border-dram-border rounded-lg px-3 py-2 text-sm text-dram-accent placeholder:text-dram-accent/30 focus:outline-none focus:border-dram-accent/50 resize-none"
            />
            <div className="flex gap-2 pt-1">
              <button
                onClick={() => setShowCreate(false)}
                className="flex-1 py-2 text-sm text-dram-accent/50 hover:text-dram-accent transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleCreate}
                disabled={creating || !newName.trim()}
                className="flex-1 bg-dram-accent hover:opacity-90 disabled:opacity-40 text-dram-bg text-sm font-medium rounded-lg py-2 transition-opacity"
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
