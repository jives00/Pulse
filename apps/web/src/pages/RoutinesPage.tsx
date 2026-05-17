import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { routinesApi, workoutsApi, type RoutineSummary, type WorkoutDetail } from '@pulse/api-client';
import Spinner from '../components/Spinner';

function formatDate(dateStr: string) {
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

// ── Routine card ──────────────────────────────────────────────────────────────

function RoutineCard({
  routine,
  onClick,
  onImageUpdated,
}: {
  routine: RoutineSummary;
  onClick: () => void;
  onImageUpdated: (id: number, url: string) => void;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  async function handleImageClick(e: React.MouseEvent) {
    e.stopPropagation();
    fileInputRef.current?.click();
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const { uploadUrl, key } = await routinesApi.getPhotoUploadUrl(routine.id, file.type);
      await fetch(uploadUrl, { method: 'PUT', body: file, headers: { 'Content-Type': file.type } });
      await routinesApi.update(routine.id, { coverImageKey: key });
      // Build a temporary object URL for immediate preview
      onImageUpdated(routine.id, URL.createObjectURL(file));
    } catch {
      // silent — image just won't update
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  return (
    <div
      onClick={onClick}
      className="bg-dram-card rounded-xl overflow-hidden border border-dram-border hover:border-dram-accent/50 transition cursor-pointer group"
    >
      {/* Image / stat area */}
      <div
        className="aspect-square bg-dram-bg relative overflow-hidden group/img"
        onClick={handleImageClick}
      >
        {routine.coverImageUrl ? (
          <img
            src={routine.coverImageUrl}
            alt={routine.name}
            className="w-full h-full object-cover group-hover:opacity-80 transition"
          />
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center gap-1 group-hover:bg-dram-border/20 transition">
            <span className="text-4xl font-bold text-dram-accent leading-none">
              {routine.exerciseCount}
            </span>
            <span className="text-sm text-gray-500 uppercase tracking-wide">
              exercise{routine.exerciseCount !== 1 ? 's' : ''}
            </span>
          </div>
        )}

        {/* Upload overlay */}
        <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover/img:opacity-100 transition bg-black/40 pointer-events-none">
          {uploading ? (
            <Spinner size={6} />
          ) : (
            <span className="text-white text-sm font-medium">Change photo</span>
          )}
        </div>

        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={handleFileChange}
          onClick={(e) => e.stopPropagation()}
        />
      </div>

      {/* Info */}
      <div className="p-3">
        <p className="font-semibold text-white text-sm leading-snug line-clamp-2">{routine.name}</p>
        <div className="flex items-center gap-2 mt-0.5">
          <p className="text-slate-400 text-sm">
            {routine.lastUsedDate ? `Last used ${formatDate(routine.lastUsedDate)}` : 'Never used'}
          </p>
          {routine.lastVolumeLbs != null && (
            <p className="text-slate-400 text-sm">· {routine.lastVolumeLbs.toLocaleString()} lbs</p>
          )}
        </div>
        <div className="flex items-center gap-2 mt-1.5">
          <span className="text-dram-accent text-sm font-medium">
            {routine.exerciseCount} exercise{routine.exerciseCount !== 1 ? 's' : ''}
          </span>
          {routine.notes && (
            <span className="text-slate-400 text-sm line-clamp-1 flex-1">{routine.notes}</span>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function RoutinesPage() {
  const navigate = useNavigate();
  const [routines, setRoutines] = useState<RoutineSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeWorkout, setActiveWorkout] = useState<WorkoutDetail | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState('');
  const [newNotes, setNewNotes] = useState('');
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    Promise.all([
      routinesApi.getAll(),
      workoutsApi.getActive().catch(() => null),
    ]).then(([rs, active]) => {
      setRoutines(rs);
      setActiveWorkout(active);
    }).catch(() => {}).finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!showCreate) return;
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') setShowCreate(false); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [showCreate]);

  function handleImageUpdated(id: number, previewUrl: string) {
    setRoutines((prev) =>
      prev.map((r) => r.id === id ? { ...r, coverImageUrl: previewUrl } : r)
    );
  }

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
        <h1 className="text-xl font-semibold text-slate-200 flex-1">Routines</h1>
        <button
          onClick={() => setShowCreate(true)}
          className="bg-dram-accent text-black font-semibold px-4 py-2 rounded-lg text-sm hover:brightness-110 transition flex-shrink-0"
        >
          + New Routine
        </button>
      </div>

      {/* Active workout banner */}
      {activeWorkout && (
        <div className="mx-6 mt-4 flex-shrink-0 bg-dram-accent/10 border border-dram-accent/40 rounded-xl px-4 py-3 flex items-center gap-3">
          <span className="text-dram-accent text-lg">⏱</span>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-dram-accent truncate">
              {activeWorkout.routineName ?? activeWorkout.name ?? 'Workout in progress'}
            </p>
            <p className="text-sm text-dram-muted mt-0.5">
              {activeWorkout.exercises.length} exercise{activeWorkout.exercises.length !== 1 ? 's' : ''} logged
            </p>
          </div>
          <button
            onClick={() => navigate(`/workouts/${activeWorkout.id}`)}
            className="bg-dram-accent text-black text-sm font-semibold px-4 py-2 rounded-lg hover:brightness-110 transition flex-shrink-0"
          >
            Resume →
          </button>
        </div>
      )}

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
                onImageUpdated={handleImageUpdated}
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
